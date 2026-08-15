const DEFAULT_QUESTIONS = [
  {category:"General Knowledge",id:"q001",question:"Which planet is known as the Red Planet?",options:["Jupiter","Mars","Venus","Saturn"],correctAnswer:1},
  {category:"General Knowledge",id:"q002",question:"What is the capital city of Australia?",options:["Sydney","Melbourne","Canberra","Perth"],correctAnswer:2},
  {category:"General Knowledge",id:"q003",question:"Who wrote the play Romeo and Juliet?",options:["Charles Dickens","William Shakespeare","Jane Austen","Mark Twain"],correctAnswer:1},
  {category:"General Knowledge",id:"q004",question:"How many continents are there on Earth?",options:["5","6","7","8"],correctAnswer:2},
  {category:"General Knowledge",id:"q005",question:"Which animal is known as the fastest land animal?",options:["Cheetah","Lion","Horse","Leopard"],correctAnswer:0},
  {category:"General Knowledge",id:"q006",question:"What is the largest ocean on Earth?",options:["Atlantic Ocean","Indian Ocean","Arctic Ocean","Pacific Ocean"],correctAnswer:3},
  {category:"General Knowledge",id:"q007",question:"Which gas do plants absorb from the atmosphere?",options:["Oxygen","Carbon dioxide","Hydrogen","Nitrogen"],correctAnswer:1},
  {category:"General Knowledge",id:"q008",question:"Which sport is played at Wimbledon?",options:["Golf","Tennis","Cricket","Rugby"],correctAnswer:1},
  {category:"General Knowledge",id:"q009",question:"Which company created the iPhone?",options:["Samsung","Microsoft","Apple","Sony"],correctAnswer:2},
  {category:"General Knowledge",id:"q010",question:"Which movie features the character Simba?",options:["Frozen","The Lion King","Toy Story","Moana"],correctAnswer:1}
];

const STORAGE_KEY = "quizNightQuestionBankV1";
let questions = loadQuestions();

const state = {
  screen: "homeScreen",
  teamCount: 2,
  teams: [],
  questionCount: 10,
  quizQuestions: [],
  currentIndex: 0,
  currentTeam: 0,
  selectedWrong: new Set(),
  answered: false,
  editingQuestionId: null,
  soundOn: true,
  categoryPool: {},
  completedCategories: new Set(),
  currentCategory: null,
  failedTeams: new Set()
};

const $ = id => document.getElementById(id);

function loadQuestions(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return structuredClone(DEFAULT_QUESTIONS);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length
      ? parsed.map(q=>({
          ...q,
          category: String(q.category || "General Knowledge")
            .trim()
            .replace(/^["']|["']$/g,"") || "General Knowledge"
        }))
      : structuredClone(DEFAULT_QUESTIONS);
  }catch{
    return structuredClone(DEFAULT_QUESTIONS);
  }
}
function saveQuestions(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(questions));
}
function uid(){
  return "q" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}
function shuffle(arr){
  return [...arr].sort(()=>Math.random()-.5);
}
function showScreen(id){
  document.querySelectorAll(".screen").forEach(screen=>screen.classList.remove("active"));
  const nextScreen=$(id);
  if(!nextScreen) return;

  nextScreen.classList.add("active");
  state.screen=id;

  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
  nextScreen.scrollTop=0;

  nextScreen.querySelectorAll("*").forEach(el=>{
    if(el.scrollTop) el.scrollTop=0;
  });

  hideAnswerOverlay();
}
function hideToast(){
  const t = $("toast");
  t.classList.remove("show");
}

function toast(message){
  const t = $("toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(hideToast, 2200);
}
$("toast").onclick=hideToast;

function playTone(kind="click"){
  if(!state.soundOn) return;

  const AudioContext=window.AudioContext || window.webkitAudioContext;
  if(!AudioContext) return;

  const ctx=new AudioContext();
  const now=ctx.currentTime;

  const cues={
    correct:{notes:[523.25,659.25,783.99,1046.50],type:"sine",duration:.9,volume:.05,stagger:.08},
    wrong:{notes:[293.66,246.94,196.00],type:"triangle",duration:.7,volume:.042,stagger:.07},
    steal:{notes:[392.00,493.88,587.33],type:"sine",duration:.5,volume:.04,stagger:.07},
    start:{notes:[329.63,415.30,493.88,659.25],type:"triangle",duration:.8,volume:.045,stagger:.09},
    winner:{notes:[392.00,493.88,587.33,783.99,987.77],type:"sine",duration:1.1,volume:.06,stagger:.09},
    click:{notes:[440],type:"sine",duration:.2,volume:.022,stagger:0}
  };

  const cue=cues[kind]||cues.click;
  const master=ctx.createGain();
  master.gain.value=cue.volume;
  master.connect(ctx.destination);

  cue.notes.forEach((frequency,index)=>{
    const start=now+index*cue.stagger;
    const osc=ctx.createOscillator();
    const gain=ctx.createGain();

    osc.type=cue.type;
    osc.frequency.setValueAtTime(frequency,start);
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(1,start+.025);
    gain.gain.exponentialRampToValueAtTime(.0001,start+cue.duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start+cue.duration+.03);
  });
}

function buildCategoryPool(){
  state.categoryPool={};
  questions.forEach(question=>{
    const category=(question.category||"General Knowledge").trim() || "General Knowledge";
    if(!state.categoryPool[category]) state.categoryPool[category]=[];
    state.categoryPool[category].push(question);
  });
}

function getAvailableCategories(){
  return Object.keys(state.categoryPool)
    .filter(category=>{
      const remaining=state.categoryPool[category]||[];
      return remaining.length>0 && !state.completedCategories.has(category);
    })
    .sort((a,b)=>a.localeCompare(b));
}

function categoryIcon(category){
  const name=category.toLowerCase();
  if(name.includes("sport")) return "🏆";
  if(name.includes("science")) return "⚗️";
  if(name.includes("history")) return "🏛️";
  if(name.includes("geograph")) return "🌍";
  if(name.includes("music")) return "🎵";
  if(name.includes("film")||name.includes("movie")||name.includes("entertain")) return "🎬";
  if(name.includes("tech")) return "⚡";
  if(name.includes("pop")) return "✨";
  return "✦";
}

function showCategorySelection(){
  const categories=getAvailableCategories();

  if(categories.length===0){
    showResults();
    return;
  }

  const grid=$("categoryGrid");
  grid.replaceChildren();

  categories.forEach((category,index)=>{
    const remaining=state.categoryPool[category].length;

    const card=document.createElement("button");
    card.type="button";
    card.className="category-card";
    card.dataset.index=String(index);

    const icon=document.createElement("span");
    icon.className="category-icon";
    icon.textContent=categoryIcon(category);

    const name=document.createElement("span");
    name.className="category-name";
    name.textContent=category;

    const meta=document.createElement("span");
    meta.className="category-meta";
    meta.textContent=`${remaining} remaining ${remaining===1?"question":"questions"}`;

    const arrow=document.createElement("span");
    arrow.className="category-arrow";
    arrow.textContent="→";

    card.append(icon,name,meta,arrow);
    card.addEventListener("click",()=>startCategoryRound(categories[index]));
    grid.appendChild(card);
  });

  const completed=state.completedCategories.size;
  $("categoryProgress").textContent=completed
    ? `${completed} ${completed===1?"category":"categories"} completed · ${categories.length} remaining`
    : `${categories.length} ${categories.length===1?"category":"categories"} available`;

  showScreen("categoryScreen");
}
function startCategoryRound(category){
  const pool=state.categoryPool[category]||[];
  if(!pool.length){
    toast("No questions remain in this category.");
    return;
  }

  state.currentCategory=category;
  state.quizQuestions=shuffle(pool);
  state.currentIndex=0;
  state.selectedWrong=new Set();
  state.failedTeams=new Set();
  state.answered=false;
  state.wrongPhase=false;

  playTone("start");
  showScreen("quizScreen");
  renderQuestion();
}

function renderTeamInputs(){
  const wrap = $("teamInputs");
  const current = [...wrap.querySelectorAll("input")].map(i=>i.value);
  wrap.innerHTML = "";
  for(let i=0;i<state.teamCount;i++){
    const row = document.createElement("div");
    row.className="team-row";
    row.innerHTML = `<div class="team-index">${i+1}</div><input class="text-input team-name" maxlength="24" aria-label="Team ${i+1} name" placeholder="Team ${i+1}" value="${(current[i]||`Team ${i+1}`).replace(/"/g,"&quot;")}">`;
    wrap.appendChild(row);
  }
}
function renderQuestionCounts(){
  const wrap=$("questionCounts");
  const choices=[5,10,15,20,questions.length];
  wrap.innerHTML="";
  [...new Set(choices.filter(n=>n>0))].forEach(n=>{
    const b=document.createElement("button");
    b.className="count-btn"+(state.questionCount===n?" active":"");
    b.textContent=n===questions.length?`ALL (${n})`:n;
    b.onclick=()=>{state.questionCount=n;renderQuestionCounts();};
    wrap.appendChild(b);
  });
}
function collectTeams(){
  const names=[...document.querySelectorAll(".team-name")].map((i,idx)=>i.value.trim()||`Team ${idx+1}`);
  state.teams=names.map(name=>({name,score:0}));
}
function beginQuiz(){
  collectTeams();
  if(questions.length<1){
    toast("Add at least one question first.");
    return;
  }

  buildCategoryPool();
  state.completedCategories=new Set();
  state.currentCategory=null;
  state.quizQuestions=[];
  state.currentIndex=0;
  state.currentTeam=0;
  state.selectedWrong=new Set();
  state.failedTeams=new Set();
  state.answered=false;
  state.wrongPhase=false;

  showCategorySelection();
}
function renderScoreboard(){
  const wrap=$("scoreboardList");
  wrap.innerHTML="";
  state.teams.forEach((team,i)=>{
    const row=document.createElement("div");
    row.className="score-row"+(i===state.currentTeam?" active":"");
    row.innerHTML=`<span class="score-chip"></span><span class="score-name">${escapeHtml(team.name)}</span><strong class="score-val">${team.score}</strong>`;
    wrap.appendChild(row);
  });
}
function renderQuestion(preserveAttempts=false){
  hideToast();
  hideAnswerOverlay();
  closeStealModal();
  closeStealModal();
  $("stealPanel").hidden=true;
  $("stealOpenBtn").hidden=true;
  state.wrongPhase=false;

  const q=state.quizQuestions[state.currentIndex];

  if(!preserveAttempts){
    state.selectedWrong=new Set();
    state.failedTeams=new Set();
  }

  state.answered=false;

  $("questionCounter").textContent=`${(state.currentCategory||"GENERAL KNOWLEDGE").toUpperCase()} · QUESTION ${state.currentIndex+1} / ${state.quizQuestions.length}`;
  $("progressBar").style.width=`${((state.currentIndex)/Math.max(1,state.quizQuestions.length))*100}%`;
  $("turnTeam").textContent=state.teams[state.currentTeam].name.toUpperCase();
  $("turnScore").textContent=`${state.teams[state.currentTeam].score} POINTS`;
  $("questionCategory").textContent=(q.category||state.currentCategory||"General Knowledge").toUpperCase();
  $("questionText").textContent=q.question;
  $("feedback").innerHTML=preserveAttempts
    ? `<div class="feedback-badge wrong">QUESTION PASSED TO ${escapeHtml(state.teams[state.currentTeam].name.toUpperCase())}</div>`
    : "";
  $("nextQuestionBtn").classList.remove("show");
  $("skipQuestionBtn").hidden=false;
  $("questionCard").classList.remove("correct-state","wrong-state");

  const grid=$("answersGrid");
  grid.innerHTML="";

  q.options.forEach((opt,idx)=>{
    const b=document.createElement("button");
    b.className="answer-btn";
    b.dataset.index=idx;
    b.innerHTML=`<span class="answer-letter">${String.fromCharCode(65+idx)}</span><span class="answer-text">${escapeHtml(opt)}</span>`;
    b.disabled=state.selectedWrong.has(idx);
    if(b.disabled) b.classList.add("wrong");
    b.onclick=()=>selectAnswer(idx,b);
    grid.appendChild(b);
  });

  renderScoreboard();
}
function hideAnswerOverlay(){
  const overlay=$("answerOverlay");
  if(!overlay) return;
  overlay.hidden=true;
  overlay.classList.remove("correct","wrong");
  $("answerOverlaySecondary").hidden=true;
  $("answerOverlaySkip").hidden=true;
}
function showAnswerOverlay(type,message,primaryLabel,primaryAction,secondaryLabel=null,secondaryAction=null,skipLabel=null,skipAction=null){
  const overlay=$("answerOverlay");
  if(!overlay) return;

  overlay.classList.remove("correct","wrong");
  void overlay.offsetWidth;
  overlay.classList.add(type);

  $("answerOverlayIcon").textContent=type==="correct"?"✓":"×";
  $("answerOverlayLabel").textContent=type==="correct"?"CORRECT!":"You fucked Up !";
  $("answerOverlayMessage").textContent=message;

  const primary=$("answerOverlayAction");
  const secondary=$("answerOverlaySecondary");
  const skip=$("answerOverlaySkip");

  primary.textContent=primaryLabel;
  primary.onclick=primaryAction;

  if(secondaryLabel && secondaryAction){
    secondary.hidden=false;
    secondary.textContent=secondaryLabel;
    secondary.onclick=secondaryAction;
  }else secondary.hidden=true;

  if(skipLabel && skipAction){
    skip.hidden=false;
    skip.textContent=skipLabel;
    skip.onclick=skipAction;
  }else skip.hidden=true;

  overlay.hidden=false;
}
function closeStealModal(){
  const modal=$("stealModal");
  if(modal) modal.hidden=true;
}

function openStealModal(){
  const modal=$("stealModal");
  const grid=$("stealModalGrid");
  if(!modal || !grid) return;

  const eligible=state.teams.filter((team,index)=>
    index!==state.currentTeam && !state.failedTeams.has(index)
  );

  const title=modal.querySelector(".steal-kicker");
  const heading=modal.querySelector("#stealModalTitle");
  const description=modal.querySelector(".steal-modal-header p");
  if(title) title.textContent="PASS IT TO ANOTHER TEAM";
  if(heading) heading.textContent="Give another team a chance";
  if(description) description.textContent="Choose a team to give the next attempt to.";

  grid.replaceChildren();

  if(!eligible.length){
    const empty=document.createElement("div");
    empty.className="steal-no-teams";
    empty.textContent="No other teams are available for this question.";
    grid.appendChild(empty);
    modal.hidden=false;
    return;
  }

  state.teams.forEach((team,index)=>{
    if(index===state.currentTeam || state.failedTeams.has(index)) return;

    const button=document.createElement("button");
    button.type="button";
    button.className="steal-modal-team";

    const name=document.createElement("span");
    name.className="steal-modal-team-name";
    name.textContent=team.name;

    const meta=document.createElement("span");
    meta.className="steal-modal-team-meta";
    meta.textContent="Give this team the next attempt";

    const arrow=document.createElement("span");
    arrow.className="steal-modal-team-arrow";
    arrow.textContent="→";

    button.append(name,meta,arrow);
    button.addEventListener("click",()=>passQuestionToTeam(index));
    grid.appendChild(button);
  });

  modal.hidden=false;
}
function openSteal(){
  if(state.answered) return;

  hideAnswerOverlay();
  state.wrongPhase=true;

  $("stealOpenBtn").hidden=true;
  $("feedback").innerHTML=`<div class="feedback-badge wrong">✕ ${escapeHtml(state.teams[state.currentTeam].name.toUpperCase())} MISSED</div>`;

  openStealModal();
  playTone("steal");
}
function passQuestionToTeam(teamIndex){
  if(state.answered) return;
  if(teamIndex===state.currentTeam || state.failedTeams.has(teamIndex)) return;

  const previousTeam=state.currentTeam;
  const nextTeam=state.teams[teamIndex];

  // The current team has already failed this question and is no longer eligible.
  state.failedTeams.add(previousTeam);

  state.currentTeam=teamIndex;
  state.answered=false;
  state.wrongPhase=false;

  closeStealModal();
  $("stealPanel").hidden=true;

  playTone("steal");
  toast(`Question passed to ${nextTeam.name}.`);

  // Keep the same question and all previously eliminated answers.
  renderQuestion(true);
}
function selectAnswer(index,button){
  if(state.answered || button.disabled) return;

  const q=state.quizQuestions[state.currentIndex];

  if(index!==q.correctAnswer){
    state.selectedWrong.add(index);
    state.failedTeams.add(state.currentTeam);
    button.disabled=true;
    button.classList.add("wrong");
    $("questionCard").classList.remove("wrong-state");
    void $("questionCard").offsetWidth;
    $("questionCard").classList.add("wrong-state");

    playTone("wrong");

    showAnswerOverlay(
      "wrong",
      "That answer is out. Keep trying with the remaining choices, or pass the question to another team.",
      "KEEP TRYING",
      ()=>hideAnswerOverlay(),
      "PASS IT TO ANOTHER TEAM",
      openSteal,
      "SKIP QUESTION",
      skipQuestion
    );
    return;
  }

  state.answered=true;
  state.wrongPhase=false;

  button.classList.add("correct");
  [...document.querySelectorAll(".answer-btn")].forEach(b=>b.disabled=true);

  state.teams[state.currentTeam].score++;
  $("questionCard").classList.add("correct-state");
  $("feedback").innerHTML=`<div class="feedback-badge correct"><span class="checkmark">✓</span> CORRECT!</div>`;
  $("nextQuestionBtn").classList.add("show");
  $("skipQuestionBtn").hidden=true;
  $("stealOpenBtn").hidden=true;
  $("progressBar").style.width=`${((state.currentIndex+1)/state.quizQuestions.length)*100}%`;

  const scoreRows=[...document.querySelectorAll(".score-row")];
  scoreRows[state.currentTeam]?.classList.add("score-pop");
  if(scoreRows[state.currentTeam]){
    scoreRows[state.currentTeam].querySelector(".score-val").textContent=state.teams[state.currentTeam].score;
  }
  $("turnScore").textContent=`${state.teams[state.currentTeam].score} POINTS`;

  playTone("correct");
  confettiBurst(90);

  showAnswerOverlay(
    "correct",
    `${escapeHtml(state.teams[state.currentTeam].name)} gets the point.`,
    "NEXT QUESTION →",
    nextQuestion
  );
}
function skipQuestion(){
  hideToast();
  hideAnswerOverlay();
  closeStealModal();
  $("stealPanel").hidden=true;
  $("stealOpenBtn").hidden=true;
  state.answered=true;
  state.wrongPhase=false;

  if(state.currentIndex>=state.quizQuestions.length-1){
    if(state.currentCategory){
      state.completedCategories.add(state.currentCategory);
      state.categoryPool[state.currentCategory]=[];
    }
    state.currentCategory=null;
    state.quizQuestions=[];
    state.currentIndex=0;
    showCategorySelection();
    return;
  }

  state.currentIndex++;
  state.currentTeam=(state.currentTeam+1)%state.teams.length;
  state.failedTeams=new Set();
  renderQuestion(false);
}

function nextQuestion(){
  if(!state.answered) return;

  hideToast();
  hideAnswerOverlay();
  $("stealPanel").hidden=true;
  $("stealOpenBtn").hidden=true;

  if(state.currentIndex>=state.quizQuestions.length-1){
    // This category is complete. Remove its remaining pool and return
    // to category selection before starting the next round.
    if(state.currentCategory){
      state.completedCategories.add(state.currentCategory);
      state.categoryPool[state.currentCategory]=[];
    }
    state.currentCategory=null;
    state.quizQuestions=[];
    state.currentIndex=0;

    showCategorySelection();
    return;
  }

  state.currentIndex++;
  state.currentTeam=(state.currentTeam+1)%state.teams.length;
  state.failedTeams=new Set();
  renderQuestion(false);
}
function showResults(){
  const ranking=[...state.teams].sort((a,b)=>b.score-a.score);
  const top=ranking[0];
  const tied=ranking.filter(t=>t.score===top.score);
  $("resultsSubtitle").textContent=tied.length>1
    ? `It's a tie at the top — host, it's your call.`
    : `${top.name} finished on top.`;
  $("resultsList").innerHTML=ranking.map((t,i)=>`
    <div class="results-row">
      <div class="results-rank">${String(i+1).padStart(2,"0")}</div>
      <div><div class="results-team">${escapeHtml(t.name)}</div><div class="bank-meta">${t.score===1?"1 point":`${t.score} points`}</div></div>
      <div class="results-points">${t.score}</div>
    </div>`).join("");
  $("winnerChoices").innerHTML=state.teams.map((t,i)=>
    `<button class="winner-choice" data-team="${i}">${escapeHtml(t.name)} — ${t.score} ${t.score===1?"point":"points"}</button>`
  ).join("");
  document.querySelectorAll(".winner-choice").forEach(btn=>btn.onclick=()=>declareWinner(Number(btn.dataset.team)));
  showScreen("resultsScreen");
}
function declareWinner(teamIndex){
  const team=state.teams[teamIndex];
  $("winnerName").textContent=team.name.toUpperCase();
  $("winnerScore").textContent=`${team.score} ${team.score===1?"POINT":"POINTS"}`;
  showScreen("winnerScreen");
  playTone("start");
  confettiBurst(220);
}
function renderBank(){
  $("bankCount").textContent=`${questions.length} question${questions.length===1?"":"s"}`;
  const list=$("questionBankList");
  list.innerHTML="";

  questions.forEach((q,idx)=>{
    const item=document.createElement("div");
    item.className="bank-item";

    const number=document.createElement("div");
    number.className="bank-num";
    number.textContent=String(idx+1).padStart(2,"0");

    const content=document.createElement("div");

    const question=document.createElement("div");
    question.className="bank-q";
    question.textContent=q.question;

    const meta=document.createElement("div");
    meta.className="bank-meta";
    meta.textContent=`${q.category || "General Knowledge"} · Answer: ${q.options[q.correctAnswer]}`;

    content.append(question,meta);

    const del=document.createElement("button");
    del.className="delete-btn";
    del.dataset.id=q.id;
    del.textContent="DELETE";
    del.type="button";

    item.append(number,content,del);
    list.appendChild(item);
  });

  list.querySelectorAll(".delete-btn").forEach(btn=>{
    btn.onclick=()=>deleteQuestion(btn.dataset.id);
  });
}
function openQuestionModal(){
  state.editingQuestionId=null;
  $("modalTitle").textContent="Add a question";
  $("questionForm").reset();
  $("correctInput").value="0";
  $("modalBackdrop").hidden=false;
}
function closeQuestionModal(){ $("modalBackdrop").hidden=true; }
function deleteQuestion(id){
  const q=questions.find(x=>x.id===id);
  if(!q) return;
  if(!confirm(`Delete this question?\n\n"${q.question}"`)) return;
  questions=questions.filter(x=>x.id!==id);
  saveQuestions();
  renderBank();
  toast("Question deleted");
}
function exportQuestions(){
  const blob=new Blob([JSON.stringify(questions,null,2)],{type:"application/json"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download="quiz-night-question-bank.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Question bank exported");
}
function importQuestions(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const incoming=JSON.parse(reader.result);
      if(!Array.isArray(incoming)) throw new Error();
      const valid=incoming.every(q=>q && typeof q.question==="string" && Array.isArray(q.options) && q.options.length===4 && Number.isInteger(q.correctAnswer));
      if(!valid) throw new Error();
      if(!confirm("Replace the current question bank with this file?")) return;
      questions=incoming.map(q=>({
        ...q,
        id:q.id||uid(),
        category:String(q.category||"General Knowledge").trim().replace(/^["']|["']$/g,"")||"General Knowledge"
      }));
      saveQuestions();
      renderBank();
      renderQuestionCounts();
      toast(`Imported ${questions.length} questions`);
    }catch{
      toast("That JSON file is not a valid question bank.");
    }
  };
  reader.readAsText(file);
}
function resetQuestions(){
  if(!confirm("Reset the question bank to the original 10 questions? Your custom questions will be removed.")) return;
  questions=structuredClone(DEFAULT_QUESTIONS);
  saveQuestions();
  renderBank();
  renderQuestionCounts();
  toast("Question bank reset");
}
function setupTeamControls(){
  $("teamMinus").onclick=()=>{if(state.teamCount>2){state.teamCount--; $("teamCount").textContent=state.teamCount; renderTeamInputs();}};
  $("teamPlus").onclick=()=>{if(state.teamCount<6){state.teamCount++; $("teamCount").textContent=state.teamCount; renderTeamInputs();}};
}
function goHome(){
  if((state.screen==="quizScreen"||state.screen==="categoryScreen") && !confirm("Exit the current quiz? Your current game will be lost.")) return;
  state.categoryPool={};
  state.completedCategories=new Set();
  state.currentCategory=null;
  showScreen("homeScreen");
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
function initParticles(){
  const field=$("particleField");
  for(let i=0;i<34;i++){
    const p=document.createElement("div");
    p.className="particle";
    p.style.left=Math.random()*100+"%";
    p.style.top=Math.random()*100+"%";
    p.style.animationDelay=(Math.random()*8)+"s";
    p.style.animationDuration=(7+Math.random()*7)+"s";
    field.appendChild(p);
  }
}
function confettiBurst(count){
  const canvas=$("confettiCanvas");
  if(!canvas) return;
  const ctx=canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width || window.innerWidth);
  const h = Math.max(1, rect.height || window.innerHeight);
  canvas.width=w*devicePixelRatio; canvas.height=h*devicePixelRatio;
  ctx.scale(devicePixelRatio,devicePixelRatio);
  const palette=["#ff4fd8","#7b61ff","#46dfff","#43e6a6","#ffd86a","#ffffff"];
  const pieces=Array.from({length:count},()=>({
    x:w/2+(Math.random()-.5)*140,
    y:h*.3+(Math.random()-.5)*60,
    vx:(Math.random()-.5)*12,
    vy:Math.random()*-10-4,
    g:.22+Math.random()*.2,
    s:4+Math.random()*7,
    r:Math.random()*Math.PI,
    vr:(Math.random()-.5)*.35,
    color:palette[Math.floor(Math.random()*palette.length)],
    life:90+Math.random()*50
  }));
  let frame=0;
  function draw(){
    frame++;
    ctx.clearRect(0,0,w,h);
    pieces.forEach(p=>{
      p.x+=p.vx; p.y+=p.vy; p.vy+=p.g; p.r+=p.vr; p.life--;
      ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.r); ctx.fillStyle=p.color;
      ctx.fillRect(-p.s/2,-p.s/3,p.s,p.s*.65); ctx.restore();
    });
    if(frame<150) requestAnimationFrame(draw);
    else ctx.clearRect(0,0,w,h);
  }
  requestAnimationFrame(draw);
}
function toggleFullscreen(){
  if(!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

$("startQuizBtn").onclick=()=>{state.teamCount=2;$("teamCount").textContent="2";renderTeamInputs();renderQuestionCounts();showScreen("setupScreen");};
$("questionBankBtn").onclick=()=>{renderBank();showScreen("questionBankScreen");};
$("settingsBtn").onclick=()=>toast("Use the sound and fullscreen controls in the top-right. Questions are saved automatically in your browser.");
$("homeBtn").onclick=goHome;
$("beginShowBtn").onclick=beginQuiz;
$("nextQuestionBtn").onclick=nextQuestion;
$("skipQuestionBtn").onclick=skipQuestion;
$("quizExitBtn").onclick=goHome;
$("closeStealModalBtn").onclick=()=>{
  closeStealModal();
  state.wrongPhase=false;
};
$("playAgainBtn").onclick=()=>{renderTeamInputs();renderQuestionCounts();showScreen("setupScreen");};
$("soundBtn").onclick=()=>{state.soundOn=!state.soundOn;$("soundBtn").textContent=state.soundOn?"🔊":"🔇";toast(state.soundOn?"Sound on":"Sound muted");};
$("fullscreenBtn").onclick=toggleFullscreen;
$("addQuestionBtn").onclick=openQuestionModal;
$("closeModalBtn").onclick=closeQuestionModal;
$("cancelModalBtn").onclick=closeQuestionModal;
$("exportBtn").onclick=exportQuestions;
$("importBtn").onclick=()=>$("importFile").click();
$("importFile").onchange=e=>{if(e.target.files[0]) importQuestions(e.target.files[0]); e.target.value="";};
$("resetBankBtn").onclick=resetQuestions;
$("questionForm").onsubmit=e=>{
  e.preventDefault();
  const q={
    id:uid(),
    question:$("qTextInput").value.trim(),
    options:[$("qAInput").value.trim(),$("qBInput").value.trim(),$("qCInput").value.trim(),$("qDInput").value.trim()],
    correctAnswer:Number($("correctInput").value)
  };
  if(!q.question || q.options.some(v=>!v)){toast("Please complete every field.");return;}
  questions.push(q); saveQuestions(); renderBank(); renderQuestionCounts(); closeQuestionModal(); toast("Question added");
};
document.querySelectorAll("[data-home]").forEach(btn=>btn.onclick=goHome);

setupTeamControls();
renderTeamInputs();
renderQuestionCounts();
initParticles();
renderBank();
