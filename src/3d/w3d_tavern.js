/* 선술집: 판돈 없는 5장 카드 대결. 하루 10판 무료, 이기면 상금·지면 손해 없음(사행성 제거). 정산은 저장 성공 시 확정. */
const TAVERN_DAILY_HANDS = 10, TAVERN_WIN_PRIZE = 20, TAVERN_TIE_PRIZE = 5;
// 예전 저장의 판돈 있는 판(10·20·30)은 예전 규칙으로 정산합니다.
function tavernPayout(stake, outcome) { return stake > 0 ? (outcome > 0 ? stake * 2 : outcome === 0 ? stake : 0) : (outcome > 0 ? TAVERN_WIN_PRIZE : outcome === 0 ? TAVERN_TIE_PRIZE : 0); }
const POKER_NAMES = ['하이 카드','원 페어','투 페어','트리플','스트레이트','플러시','풀 하우스','포 카드','스트레이트 플러시'];
function pokerRank(hand) {
  const values = hand.map(c => c % 13 + 2).sort((a,b)=>b-a);
  const groups = [...new Set(values)].map(v=>[values.filter(n=>n===v).length,v]).sort((a,b)=>b[0]-a[0]||b[1]-a[1]);
  const flush = hand.every(c=>Math.floor(c/13)===Math.floor(hand[0]/13));
  const unique = [...new Set(values)];
  const straight = unique.length===5 ? (values[0]-values[4]===4 ? values[0] : values.join(',')==='14,5,4,3,2' ? 5 : 0) : 0;
  if (straight && flush) return [8,straight];
  if (groups[0][0]===4) return [7,groups[0][1],groups[1][1]];
  if (groups[0][0]===3 && groups[1][0]===2) return [6,groups[0][1],groups[1][1]];
  if (flush) return [5,...values];
  if (straight) return [4,straight];
  if (groups[0][0]===3) return [3,...groups.map(g=>g[1])];
  if (groups[0][0]===2 && groups[1][0]===2) return [2,...groups.map(g=>g[1])];
  if (groups[0][0]===2) return [1,...groups.map(g=>g[1])];
  return [0,...values];
}
function pokerCompare(a,b) { const x=pokerRank(a),y=pokerRank(b); for(let i=0;i<x.length;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]); return 0; }
function tavernValidCards(cards, count) {
 return Array.isArray(cards) && cards.length===count && cards.every(c=>Number.isInteger(c)&&c>=0&&c<52) && new Set(cards).size===count;
}
function tavernValidRound(r) {
 if (!r || typeof r!=='object' || !['draw','result'].includes(r.phase) || ![0,10,20,30].includes(r.stake) || !tavernValidCards(r.player,5) || !tavernValidCards(r.dealer,5)) return false;
 if (new Set([...r.player,...r.dealer]).size!==10) return false;
 if (r.phase==='draw') {
  if (!tavernValidCards(r.deck,42) || new Set([...r.player,...r.dealer,...r.deck]).size!==52) return false;
  // 구버전의 누락된 선택 배열은 카드와 덱이 온전할 때만 복구합니다.
  if (r.held == null) r.held=[false,false,false,false,false];
  return Array.isArray(r.held) && r.held.length===5 && r.held.every(v=>typeof v==='boolean');
 }
 const outcome=pokerCompare(r.player,r.dealer), payout=tavernPayout(r.stake,outcome);
 return r.outcome===outcome && r.payout===payout && Array.isArray(r.deck) && r.deck.length===0;
}
function tavernState() {
 if (!G.tavern || typeof G.tavern!=='object' || Array.isArray(G.tavern)) G.tavern={version:1,round:null,played:0};
 if (G.tavern.round != null && !tavernValidRound(G.tavern.round)) { G.tavern.damagedRound={record:G.tavern.round}; G.tavern.round=null; }
 G.tavern.version=1; G.tavern.played=Number.isFinite(G.tavern.played)?Math.max(0,Math.floor(G.tavern.played)):0;
 return G.tavern;
}
const tavernPanel=document.createElement('section');
tavernPanel.id='tavernPanel'; tavernPanel.hidden=true; tavernPanel.setAttribute('role','dialog'); tavernPanel.setAttribute('aria-modal','true'); tavernPanel.setAttribute('aria-label','해적 선술집 카드 대결');document.body.appendChild(tavernPanel);
const tavernStyle=document.createElement('style');tavernStyle.textContent=`
#tavernPanel{position:fixed;inset:0;z-index:90;overflow:auto;box-sizing:border-box;padding:20px 12px;background:#172e28;color:#fff4d6;font:16px/1.5 sans-serif}#tavernPanel[hidden]{display:none}#tavernTable{max-width:650px;margin:auto}#tavernPanel h2{margin:8px 0}#tavernPanel button,#tavernPanel select{min-height:44px;padding:9px 12px;border:2px solid #bb9859;border-radius:10px;background:#fff1c7;color:#302a20;font:inherit}#tavernPanel button:disabled{opacity:.5}.pokerHand{display:flex;gap:6px;margin:14px 0}.pokerCard{flex:1;min-width:0;padding:16px 2px!important;font-size:clamp(16px,5vw,28px)!important;background:#fff9e8!important}.pokerCard:disabled{opacity:1!important}.pokerCard.red{color:#b93235!important}.pokerCard[aria-pressed=true]{transform:translateY(-7px);outline:3px solid #79dfb0}.pokerActions{display:flex;gap:8px;flex-wrap:wrap}#tavernPanel :focus-visible{outline:3px solid #8ee9c7;outline-offset:3px}#tavernNotice{min-height:24px;color:#ffe49b}
`;document.head.appendChild(tavernStyle);
const tavernEntry=document.createElement('section');tavernEntry.innerHTML='<h3>🍺 해적 선술집</h3><p>마을 확장 후 하루 10판, 돈을 걸지 않는 카드 대결. 이기면 상금!</p><button type="button" id="tavernOpen">선술집 카드 대결</button>';
document.getElementById('storagePanel').before(tavernEntry);document.getElementById('tavernOpen').onclick=tavernOpen;
function tavernBusy(){return !tavernPanel.hidden;}
function tavernRestore(){tavernState();tavernPanel.hidden=true;}
function tavernOpen(){
 if(expeditionBusy()||!expeditionPanel.hidden)return;
 clearMovementInput();tavernPanel.hidden=false;tavernRender();
}
function tavernClose(){tavernPanel.hidden=true;clearMovementInput();document.getElementById('tavernOpen').focus();}
function tavernTransaction(change){
 const focusCard=document.activeElement?.dataset.card;
 const old=JSON.parse(JSON.stringify(tavernState())),money=G.money;
 change();
 if(save()){tavernRender();if(focusCard!==undefined)tavernPanel.querySelector(`[data-card="${focusCard}"]`)?.focus();return true;}
 G.tavern=old;G.money=money;tavernRender();document.getElementById('tavernNotice').textContent=storageState.conflict?storageState.error:'저장 실패로 이번 동작을 취소했습니다. 진행을 백업하거나 저장을 다시 시도하세요.';return false;
}
// 이용 제한: 하루 10판 (판돈이 없어 잃을 것은 없지만, 오래 붙잡는 흐름은 막음)
function tavernToday(){const d=new Date();return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;}
function tavernLimitReason(){
 const t=tavernState();
 if(t.dayKey!==tavernToday()){t.dayKey=tavernToday();t.dayPlayed=0;}
 if((t.dayPlayed||0)>=TAVERN_DAILY_HANDS)return `오늘은 ${TAVERN_DAILY_HANDS}판을 모두 했습니다. 내일 다시 오세요. 마을로 돌아가 쉬어 가요 🌙`;
 return '';
}
function tavernTodayLeft(){tavernLimitReason();return Math.max(0,TAVERN_DAILY_HANDS-(tavernState().dayPlayed||0));}
function tavernDeal(){
 const t=tavernState(),stake=0;
 if(tavernLimitReason())return false;
 if(t.damagedRound||storageState.conflict||!unlocked.has('expand1')||raidOn||expeditionBusy()||t.round?.phase==='draw')return false;
 return tavernTransaction(()=>{
  const deck=Array.from({length:52},(_,i)=>i);
  for(let i=51;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  G.money-=stake;t.round={phase:'draw',stake,player:deck.splice(0,5),dealer:deck.splice(0,5),deck,held:[false,false,false,false,false]};
 });
}
function tavernHold(index){const r=tavernState().round;if(r?.phase!=='draw'||!Number.isInteger(index)||index<0||index>4)return false;return tavernTransaction(()=>{r.held[index]=!r.held[index];});}
function tavernShowdown(){
 const t=tavernState(),r=t.round;if(r?.phase!=='draw')return false;
 return tavernTransaction(()=>{
  r.player=r.player.map((c,i)=>r.held[i]?c:r.deck.shift());
  // 딜러도 페어 이상은 보존하고 나머지를 한 번 교환합니다.
  const counts={};for(const c of r.dealer)counts[c%13]=(counts[c%13]||0)+1;
  if(pokerRank(r.dealer)[0]<4)r.dealer=r.dealer.map(c=>counts[c%13]>=2?c:r.deck.shift());
  r.outcome=pokerCompare(r.player,r.dealer);r.payout=tavernPayout(r.stake,r.outcome);
  G.money+=r.payout;r.phase='result';r.deck=[];t.played++;
  t.dayPlayed=(t.dayPlayed||0)+1;
 });
}
function tavernCards(cards,interactive=false){return cards.map((c,i)=>{
 const suit=['♠','♥','♦','♣'][Math.floor(c/13)],v=c%13+2,label=({11:'J',12:'Q',13:'K',14:'A'})[v]||v;
 return `<button type="button" class="pokerCard ${suit==='♥'||suit==='♦'?'red':''}" ${interactive?`data-card="${i}" aria-pressed="${tavernState().round.held[i]}" aria-label="${label}${suit} ${tavernState().round.held[i]?'유지':'교환'}"`:'disabled'}>${label}${suit}</button>`;
}).join('');}
function tavernRender(){
 const t=tavernState(),r=t.round,active=r?.phase==='draw',ready=unlocked.has('expand1')&&!raidOn&&!t.damagedRound&&!storageState.conflict;
 tavernPanel.innerHTML=`<div id="tavernTable"><h2>🍺 해적 선술집 카드 대결</h2><p>돈을 걸지 않는 무료 카드 대결입니다. 져도 아무것도 잃지 않습니다. 현금 결제·환전은 없습니다.</p><p>5장을 받고 유지할 카드를 눌러 선택한 뒤 나머지를 한 번 교환합니다. 딜러보다 높은 족보면 상금 $${TAVERN_WIN_PRIZE}, 무승부면 $${TAVERN_TIE_PRIZE}을 받습니다. 하루 ${TAVERN_DAILY_HANDS}판까지 할 수 있어요.</p><p>선술집에서는 마을 생산·습격·임금 시간이 멈춥니다. 중간에 나가도 패는 보관됩니다.</p><p>보유 $${Math.floor(G.money)} · 오늘 남은 판 ${tavernTodayLeft()}/${TAVERN_DAILY_HANDS} · 완료 ${t.played}판</p>${r?`<h3>해적 딜러</h3><div class="pokerHand">${active?'<span>🂠 🂠 🂠 🂠 🂠</span>':tavernCards(r.dealer)}</div><h3>내 패 ${active?'· 위로 올린 카드 유지':''}</h3><div class="pokerHand">${tavernCards(r.player,active)}</div><p>${active?'유지할 카드를 선택하세요. 선택하지 않은 카드는 교환합니다.':`${r.outcome>0?'승리':r.outcome===0?'무승부':'패배'} · 내 패 ${POKER_NAMES[pokerRank(r.player)[0]]} / 딜러 ${POKER_NAMES[pokerRank(r.dealer)[0]]} · 지급 $${r.payout} (정산 완료)`}</p>`:''}${t.damagedRound?'<p role="alert">포커 기록 일부를 읽지 못해 해당 판을 보관했습니다. 마을 재화·시설·선원은 유지되며 추가 차감·보상은 없습니다. 백업 후 이 판만 종료할 수 있습니다.</p><button id="tavernDiscardDamaged">손상된 포커판만 종료</button>':''}${storageState.conflict?'<button id="tavernReload">최신 저장 불러오기</button>':''}<div class="pokerActions">${active?'<button id="tavernDraw">교환하고 승부</button>':`<button id="tavernDeal" ${!ready?'disabled':''}>한 판 시작 (무료)</button>`}<button id="tavernClose">마을 메뉴로</button><button id="tavernBackup">진행 백업</button></div><p id="tavernNotice" role="status">${storageState.conflict?storageState.error:!unlocked.has('expand1')?'첫 뗏목 확장 후 선술집이 열립니다.':raidOn?'습격을 끝낸 뒤 새 판을 시작하세요.':''}</p><details><summary>족보 순서 보기</summary><p>${[...POKER_NAMES].reverse().join(' → ')}. 같은 족보는 높은 숫자와 남은 카드로 비교하며 A는 가장 높고 A·2·3·4·5에서도 사용합니다.</p></details></div>`;
 tavernPanel.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>tavernHold(+b.dataset.card));
 if(active)document.getElementById('tavernDraw').onclick=tavernShowdown;
 else {
  const deal=document.getElementById('tavernDeal');
  deal.onclick=()=>tavernDeal();
  {const why=tavernLimitReason();if(why){deal.disabled=true;document.getElementById('tavernNotice').textContent=why;}}
 }
 if(t.damagedRound) document.getElementById('tavernDiscardDamaged').onclick=()=>tavernTransaction(()=>{delete t.damagedRound;});
 if(storageState.conflict) document.getElementById('tavernReload').onclick=()=>{if(reloadLatestStorage())tavernOpen();};
 document.getElementById('tavernClose').onclick=tavernClose;document.getElementById('tavernBackup').onclick=exportSave;
 tavernPanel.querySelector('button:not(:disabled),select')?.focus();
}
window.addEventListener('keydown',e=>{
 if(!tavernBusy()||e.ctrlKey||e.metaKey)return;
 if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();tavernClose();return;}
 if(e.key==='Tab'){
  const list=[...tavernPanel.querySelectorAll('button:not(:disabled),select,summary')],first=list[0],last=list[list.length-1];
  if(!tavernPanel.contains(document.activeElement)||(!e.shiftKey&&document.activeElement===last)){e.preventDefault();first?.focus();}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}
 }else if(['q','w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))e.stopImmediatePropagation();
},true);
