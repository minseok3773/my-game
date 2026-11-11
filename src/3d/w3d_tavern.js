/* 선술집: 가상 재화만 사용하는 5장 드로 포커. 차감과 정산은 저장 성공 시 확정. */
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
function tavernState() {
 if (!G.tavern || typeof G.tavern!=='object' || Array.isArray(G.tavern)) G.tavern={version:1,round:null,played:0};
 G.tavern.version=1; G.tavern.played=Number.isFinite(G.tavern.played)?Math.max(0,Math.floor(G.tavern.played)):0;
 return G.tavern;
}
const tavernPanel=document.createElement('section');
tavernPanel.id='tavernPanel'; tavernPanel.hidden=true; tavernPanel.setAttribute('role','dialog'); tavernPanel.setAttribute('aria-modal','true'); tavernPanel.setAttribute('aria-label','해적 선술집 포커');document.body.appendChild(tavernPanel);
const tavernStyle=document.createElement('style');tavernStyle.textContent=`
#tavernPanel{position:fixed;inset:0;z-index:90;overflow:auto;box-sizing:border-box;padding:20px 12px;background:#172e28;color:#fff4d6;font:16px/1.5 sans-serif}#tavernPanel[hidden]{display:none}#tavernTable{max-width:650px;margin:auto}#tavernPanel h2{margin:8px 0}#tavernPanel button,#tavernPanel select{min-height:44px;padding:9px 12px;border:2px solid #bb9859;border-radius:10px;background:#fff1c7;color:#302a20;font:inherit}#tavernPanel button:disabled{opacity:.5}.pokerHand{display:flex;gap:6px;margin:14px 0}.pokerCard{flex:1;min-width:0;padding:16px 2px!important;font-size:clamp(16px,5vw,28px)!important;background:#fff9e8!important}.pokerCard:disabled{opacity:1!important}.pokerCard.red{color:#b93235!important}.pokerCard[aria-pressed=true]{transform:translateY(-7px);outline:3px solid #79dfb0}.pokerActions{display:flex;gap:8px;flex-wrap:wrap}#tavernPanel :focus-visible{outline:3px solid #8ee9c7;outline-offset:3px}#tavernNotice{min-height:24px;color:#ffe49b}
`;document.head.appendChild(tavernStyle);
const tavernEntry=document.createElement('section');tavernEntry.innerHTML='<h3>🍺 해적 선술집</h3><p>마을 확장 후 가상 돈 $10~30으로 즐기는 짧은 포커 한 판.</p><button type="button" id="tavernOpen">선술집 포커</button>';
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
 G.tavern=old;G.money=money;tavernRender();document.getElementById('tavernNotice').textContent='저장 실패로 이번 동작을 취소했습니다. 진행을 백업하거나 저장을 다시 시도하세요.';return false;
}
function tavernDeal(stake){
 const t=tavernState();
 if(!unlocked.has('expand1')||raidOn||expeditionBusy()||t.round?.phase==='draw'||![10,20,30].includes(stake)||G.money<stake)return false;
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
  r.outcome=pokerCompare(r.player,r.dealer);r.payout=r.outcome>0?r.stake*2:r.outcome===0?r.stake:0;
  G.money+=r.payout;r.phase='result';r.deck=[];t.played++;
 });
}
function tavernCards(cards,interactive=false){return cards.map((c,i)=>{
 const suit=['♠','♥','♦','♣'][Math.floor(c/13)],v=c%13+2,label=({11:'J',12:'Q',13:'K',14:'A'})[v]||v;
 return `<button type="button" class="pokerCard ${suit==='♥'||suit==='♦'?'red':''}" ${interactive?`data-card="${i}" aria-pressed="${tavernState().round.held[i]}" aria-label="${label}${suit} ${tavernState().round.held[i]?'유지':'교환'}"`:'disabled'}>${label}${suit}</button>`;
}).join('');}
function tavernRender(){
 const t=tavernState(),r=t.round,active=r?.phase==='draw',ready=unlocked.has('expand1')&&!raidOn;
 tavernPanel.innerHTML=`<div id="tavernTable"><h2>🍺 해적 선술집 포커</h2><p>게임에서 번 가상 돈만 사용합니다. 현금 결제·환전은 없습니다.</p><p>5장을 받고 유지할 카드를 눌러 선택한 뒤 나머지를 한 번 교환합니다. 딜러보다 높은 족보면 판돈의 2배, 무승부면 판돈을 돌려받습니다. 패배하면 판돈을 잃습니다.</p><p>선술집에서는 마을 생산·습격·임금 시간이 멈춥니다. 중간에 나가도 패와 판돈은 보관됩니다.</p><p>보유 $${Math.floor(G.money)} · 완료 ${t.played}판</p>${r?`<h3>해적 딜러</h3><div class="pokerHand">${active?'<span>🂠 🂠 🂠 🂠 🂠</span>':tavernCards(r.dealer)}</div><h3>내 패 ${active?'· 위로 올린 카드 유지':''}</h3><div class="pokerHand">${tavernCards(r.player,active)}</div><p>${active?'유지할 카드를 선택하세요. 선택하지 않은 카드는 교환합니다.':`${r.outcome>0?'승리':r.outcome===0?'무승부':'패배'} · 내 패 ${POKER_NAMES[pokerRank(r.player)[0]]} / 딜러 ${POKER_NAMES[pokerRank(r.dealer)[0]]} · 지급 $${r.payout} (정산 완료)`}</p>`:''}<div class="pokerActions">${active?'<button id="tavernDraw">교환하고 승부</button>':`<label>판돈 <select id="tavernStake"><option>10</option><option>20</option><option>30</option></select></label><button id="tavernDeal" ${!ready||G.money<10?'disabled':''}>한 판 시작</button>`}<button id="tavernClose">마을 메뉴로</button><button id="tavernBackup">진행 백업</button></div><p id="tavernNotice" role="status">${!unlocked.has('expand1')?'첫 뗏목 확장 후 선술집이 열립니다.':raidOn?'습격을 끝낸 뒤 새 판을 시작하세요.':''}</p><details><summary>족보 순서 보기</summary><p>${[...POKER_NAMES].reverse().join(' → ')}. 같은 족보는 높은 숫자와 남은 카드로 비교하며 A는 가장 높고 A·2·3·4·5에서도 사용합니다.</p></details></div>`;
 tavernPanel.querySelectorAll('[data-card]').forEach(b=>b.onclick=()=>tavernHold(+b.dataset.card));
 if(active)document.getElementById('tavernDraw').onclick=tavernShowdown;
 else {
  const stake=document.getElementById('tavernStake'),deal=document.getElementById('tavernDeal');
  deal.onclick=()=>tavernDeal(+stake.value);
  stake.onchange=()=>{deal.disabled=!ready||G.money<+stake.value;if(ready)document.getElementById('tavernNotice').textContent=G.money<+stake.value?'선택한 판돈보다 보유 자금이 적습니다.':'';};
 }
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
