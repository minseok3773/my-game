/* 원정은 마을 시계를 멈추는 직접 조작 항해입니다. 모든 전이는 동일 저장에 기록합니다. */
const expeditionKeys = new Set();
let expeditionPointer = null, expeditionSaveClock = 0;
function expeditionState() {
  if (!G.expedition || typeof G.expedition !== 'object') G.expedition = {};
  const e = G.expedition;
  e.version = 1; e.phase = ['idle','exploring','result'].includes(e.phase) ? e.phase : 'idle';
  if (!e.draft || typeof e.draft !== 'object') e.draft = {food:1,water:1,crew:0}; e.completed = Number.isFinite(e.completed) ? Math.max(0,Math.floor(e.completed)) : 0;
  if (!e.rewards || typeof e.rewards !== 'object') e.rewards = {kelp:false,medic:false,compass:false}; e.specialty = Number.isFinite(e.specialty) ? Math.max(0,Math.min(20,e.specialty)) : 0;
  return e;
}
function expeditionBusy() { return !!G && ['exploring','result'].includes(G.expedition?.phase); }
function expeditionReady() { return unlocked.has('expand1') && unlocked.has('water') && (G.defended || 0) >= 5; }
function expeditionWorkerAvailable(w) { const e=G.expedition; return !(e?.rewards?.medic && e.medicEnabled !== false && w === workers.find(o=>o.hp>0)); }
function expeditionHeroBonus() { return G.expedition?.rewards?.compass ? 1.2 : 1; }
function expeditionVillageTick(dt) {
  const e = expeditionState();
  if (e.rewards.kelp) {
    e.production = (e.production || 0) + dt;
    if (e.production >= 12 && e.specialty < 20 && G.st.fishing.pile > 0 && G.st.water.pile > 0 && !isBroken('fishing') && !isBroken('water')) {
      G.st.fishing.pile--; G.st.water.pile--; e.specialty++; e.production = 0;
    }
  }
  if (e.rewards.medic && e.medicEnabled !== false && workers.length && !raidOn) {
    // 첫 생존 선원이 생산·운반 대신 의무 담당을 맡습니다. 전투에는 계속 참가합니다.
    const medic = workers.find(w=>w.hp>0); if(medic){medic.expeditionRole='medic';medic.job=null;medic.repairing=null;medic.vx=medic.vy=0;medic.moving=false;}
    for(const w of workers) if(w!==medic) delete w.expeditionRole;
    for (const w of workers) w.hp = Math.min(crewHpMax(),w.hp + dt);
  }
}
function expeditionCustomerSale(d,s,customer) {
  const e = expeditionState();
  if (e.rewards.kelp && e.specialty > 0 && ['fishShop','diner'].includes(d.id)) {
    e.specialty--; s.cash += 18; earn(18); customer.expeditionRation = true; G.stats.expeditionRationsSold=(G.stats.expeditionRationsSold||0)+1; toast('🥬 손님이 보존식 추가 구매 · 가게 수금 +$18');
  }
}
const expeditionStyle = document.createElement('style');
expeditionStyle.textContent = `
#expeditionBtn{position:fixed;right:10px;bottom:calc(194px + env(safe-area-inset-bottom,0px));z-index:7;max-width:min(220px,65vw);padding:9px 12px;border:2px solid #49654d;border-radius:13px;background:#fff5d5;color:#294934;font:bold 13px/1.3 sans-serif;min-height:44px}
#expeditionPanel{position:fixed;inset:0;z-index:80;background:#133b49;color:#fff9e6;padding:max(12px,env(safe-area-inset-top)) 12px max(12px,env(safe-area-inset-bottom));overflow:auto;box-sizing:border-box;touch-action:pan-y}
#expeditionPanel[hidden]{display:none}#expeditionContent{max-width:640px;margin:auto}#expeditionPanel h2{margin:8px 0;font-size:22px}#expeditionPanel p{line-height:1.45;font-size:14px;margin:9px 0}#expeditionPanel button,#expeditionPanel select{min-height:44px;max-width:100%;padding:8px 12px;border:2px solid #c0d9b3;border-radius:10px;background:#fff4ce;color:#294934;font:16px sans-serif}#expeditionPanel button:disabled{opacity:.5}#expeditionPanel label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:10px 0}#expeditionPanel .expRow{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}#expeditionCanvas{width:100%;height:auto;aspect-ratio:1;display:block;border:2px solid #e4d4a5;border-radius:12px;touch-action:none;background:#439ba8;box-sizing:border-box}#expeditionStatus{min-height:42px;font-weight:bold}#expeditionPanel :focus-visible{outline:3px solid #ffe97f;outline-offset:3px}
@media(max-height:500px){#expeditionCanvas{width:min(100%,430px);margin:auto}#expeditionPanel p{margin:4px 0}}
`;
document.head.appendChild(expeditionStyle);
const expeditionButton = document.createElement('button'); expeditionButton.id='expeditionBtn'; expeditionButton.type='button'; expeditionButton.textContent='🏝 다음 목표 · 첫 원정'; document.body.appendChild(expeditionButton);
const expeditionPanel = document.createElement('section'); expeditionPanel.id='expeditionPanel'; expeditionPanel.hidden=true; expeditionPanel.setAttribute('role','dialog'); expeditionPanel.setAttribute('aria-modal','true'); expeditionPanel.setAttribute('aria-label','섬 원정'); document.body.appendChild(expeditionPanel);
function expeditionInit() { expeditionButton.onclick=expeditionOpen; expeditionRestore(); }
function expeditionRestore() {
  expeditionKeys.clear(); expeditionPointer=null; expeditionSaveClock=0;
  const e=expeditionState();
  if (e.phase!=='idle' && !e.run) e.phase='idle';
  if (e.phase!=='idle') { document.getElementById('helpPanel').hidden=true; paused=false; clearMovementInput(); }
  expeditionPanel.hidden=e.phase==='idle';
  if (e.phase!=='idle') expeditionRenderPanel();
  expeditionRefreshButton();
}
function expeditionRefreshButton() {
  const e=expeditionState();
  expeditionButton.textContent=e.phase==='idle' ? (expeditionReady() ? `🏝 원정 ${e.completed+1} · 출항 준비` : '🏝 다음 목표 · 식량·물과 첫 원정') : '🏝 원정 계속';
}
function expeditionOpen() {
  if (!G || !workers) return;
  clearMovementInput(); expeditionPanel.hidden=false; expeditionRenderPanel();
  expeditionPanel.querySelector('button,select')?.focus();
}
function expeditionClose() { expeditionPanel.hidden=true; expeditionKeys.clear(); expeditionPointer=null; clearMovementInput(); expeditionButton.focus(); }
function expeditionRenderPanel() {
  const e=expeditionState();
  if(e.phase==='exploring'){ expeditionRenderExplore(); return; }
  if(e.phase==='result'){ expeditionRenderResult(); return; }
  const maxCrew=Math.max(0,Math.min(3,workers.length-2));
  e.draft.food=Math.max(1,Math.min(3,+e.draft.food||1));e.draft.water=Math.max(1,Math.min(3,+e.draft.water||1));e.draft.crew=Math.max(0,Math.min(maxCrew,+e.draft.crew||0));
  const options=(n,v,start=1)=>Array.from({length:n-start+1},(_,i)=>`<option value="${i+start}" ${v===i+start?'selected':''}>${i+start}</option>`).join('');
  expeditionPanel.innerHTML=`<div id="expeditionContent"><h2>🏝 ${e.completed+1}번째 섬 원정</h2><p>식량과 물을 준비해 첫 원정을 떠나자! 마을을 확장하고 해적을 5회 막으면 안전 항로가 열립니다.</p><p id="expeditionRequirements">${unlocked.has('expand1')?'✅':'⬜'} 첫 뗏목 확장 · ${unlocked.has('water')?'✅':'⬜'} 정수기 건설 · 방어 ${Math.min(5,G.defended||0)}/5 ${G.expeditionWon?'(항로 보상 $200 획득)':''}</p><p>출항 시 선장과 동행 선원은 마을을 떠납니다. 준비 화면과 원정 동안 마을 생산·손님 거래·수금·수리·모집·훈련·급여·습격 시계는 모두 정지합니다. 복귀 후 같은 시점부터 재개하며 습격 중에는 떠날 수 없습니다.</p><label>식량 꾸러미 · 개당 $20<select id="expeditionFood">${options(3,e.draft.food)}</select></label><label>물통 · 개당 $15<select id="expeditionWater">${options(3,e.draft.water)}</select></label><label>동행 선원 · 보급비 $10/명<select id="expeditionCrew">${options(maxCrew,e.draft.crew,0)}</select></label><p id="expeditionCost"></p><p>동행 1명마다 구조·회수 범위 +12, 위험 피해 -3. 최소 2명은 마을에 남깁니다. 원정 실패에도 선원은 모두 돌아오며 마을은 유지됩니다.</p><p id="expeditionRewardGuide">${expeditionRewardGuide()}</p>${e.rewards.medic?`<button id="expeditionMedic">${e.medicEnabled===false?'의무병 배치 (생산 1명 감소)':'의무병 생산 복귀'}</button>`:''}<div class="expRow"><button id="expeditionDepart">출항</button><button id="expeditionClose">마을로</button></div><p id="expeditionNotice" role="status"></p></div>`;
  const refresh=()=>{
    e.draft={food:+document.getElementById('expeditionFood').value,water:+document.getElementById('expeditionWater').value,crew:+document.getElementById('expeditionCrew').value};
    document.getElementById('expeditionCost').textContent=`비용 $${e.draft.food*20+e.draft.water*15+e.draft.crew*10} / 보유 $${Math.floor(G.money)} · 남는 선원 ${workers.length-e.draft.crew}명 · 원정 체력 ${60+e.draft.food*20} · 활동 시간 ${60+e.draft.water*30}초`;
    document.getElementById('expeditionDepart').disabled=!expeditionReady()||raidOn||!isHeroAvailable()||workers.length<2||G.money<e.draft.food*20+e.draft.water*15+e.draft.crew*10;
    document.getElementById('expeditionNotice').textContent=raidOn?'습격을 끝낸 뒤 출항할 수 있습니다.':!isHeroAvailable()?'선장이 회복된 뒤 출항할 수 있습니다.':!expeditionReady()?'확장·정수기·5회 방어 조건을 달성하세요.':workers.length<2?'마을에 남을 일꾼을 최소 2명 충원하세요.':G.money<e.draft.food*20+e.draft.water*15+e.draft.crew*10?'원정 물자를 살 자금이 부족합니다.':'';
  };
  for(const id of ['expeditionFood','expeditionWater','expeditionCrew']) document.getElementById(id).onchange=()=>{refresh();save();};
  if(e.rewards.medic) document.getElementById('expeditionMedic').onclick=()=>{const old=e.medicEnabled;e.medicEnabled=old===false;if(!save())e.medicEnabled=old;expeditionRenderPanel();};
  document.getElementById('expeditionDepart').onclick=expeditionDepart; document.getElementById('expeditionClose').onclick=expeditionClose; refresh();
}
function expeditionRewardGuide(){
 const e=expeditionState();
 return `다음 성공 보상: ${!e.rewards.kelp?'해초 보존식 제조법':!e.rewards.medic?'선원 의무 담당':!e.rewards.compass?'선장 탐험 나침반':'보존식 5개와 $120'}. ${e.rewards.kelp?`보존식 ${e.specialty}/20개 · 생선+물 각 1개로 12초에 1개 제조, 생선 가게·식당 손님이 함께 구매하면 $18 추가 수금. `:''}${e.rewards.medic?(e.medicEnabled===false?'의무병 비활성 · 전원 생산 중. ':'첫 생존 일꾼이 의무병: 생산·운반·수금 1명 감소, 전투 참가, 비전투 중 전원 초당 1 추가 회복. ')+ '준비 화면에서 생산 복귀/재배치 가능. ':''}${e.rewards.compass?'나침반으로 선장 공격력 +20%.':''}`;
}
function expeditionDepart(){
 const e=expeditionState(),d=e.draft,cost=d.food*20+d.water*15+d.crew*10;
 if(e.phase!=='idle'||workers.length<2||!expeditionReady()||raidOn||!isHeroAvailable()||![d.food,d.water,d.crew].every(Number.isInteger)||d.food<1||d.food>3||d.water<1||d.water>3||d.crew<0||d.crew>3||G.money<cost||d.crew>Math.max(0,workers.length-2))return false;
 const before=JSON.parse(JSON.stringify(e)),money=G.money,party=workers.splice(workers.length-d.crew,d.crew);
 G.money-=cost;e.phase='exploring';e.run={id:(e.sequence||0)+1,x:50,y:450,hp:60+d.food*20,maxHp:60+d.food*20,time:60+d.water*30,party:party.map(w=>({...w,job:null})),rescued:[],collected:[],hazards:[],nextHazard:2,elapsed:0,seed:0};e.sequence=e.run.id;e.result=null;
 if(!save()){workers.push(...party);G.money=money;G.expedition=before;expeditionRenderPanel();document.getElementById('expeditionNotice').textContent='저장 실패로 출항을 취소했습니다. 메뉴에서 저장을 복구하세요.';return false;}
 expeditionKeys.clear();expeditionPointer=null;expeditionRenderExplore();return true;
}
const EXP_SURVIVORS=[{x:125,y:130},{x:385,y:110}];
const EXP_CRATES=[{x:110,y:300},{x:285,y:240},{x:405,y:365}];
function expeditionRenderExplore(){
 expeditionPanel.innerHTML='<div id="expeditionContent"><h2>🏝 잊힌 해초섬</h2><p>드래그 또는 방향키/WASD로 이동 · 생존자 2명과 자원 3개에 다가가 구조·회수하고 왼쪽 아래 배로 귀환하세요. 붉은 원은 곧 공격받는 범위입니다.</p><p id="expeditionStatus" role="status"></p><canvas id="expeditionCanvas" width="500" height="500" tabindex="0" aria-label="섬 탐험 이동 영역"></canvas><div class="expRow"><button id="expeditionRetreat">즉시 철수 (보상 없음)</button><button id="expeditionSave">진행 저장</button><button id="expeditionBackup">진행 백업</button></div><p id="expeditionSaveStatus" role="status">마을 시계 정지 · 원정 진행은 자동 저장됩니다.</p></div>';
 const canvas=document.getElementById('expeditionCanvas');
 canvas.onpointerdown=ev=>{ev.preventDefault();canvas.setPointerCapture(ev.pointerId);expeditionPointer={sx:ev.clientX,sy:ev.clientY,x:ev.clientX,y:ev.clientY};canvas.focus();};
 canvas.onpointermove=ev=>{if(expeditionPointer){expeditionPointer.x=ev.clientX;expeditionPointer.y=ev.clientY;}};
 canvas.onpointerup=canvas.onpointercancel=()=>{expeditionPointer=null;};
 document.getElementById('expeditionBackup').onclick=exportSave;
 document.getElementById('expeditionRetreat').onclick=()=>expeditionFinish('retreat');canvas.focus();
 document.getElementById('expeditionSave').onclick=()=>{document.getElementById('expeditionSaveStatus').textContent=save()?'원정 진행을 저장했습니다.':'저장 실패 · 페이지를 닫지 말고 다시 시도하거나 마을 메뉴에서 백업하세요.';};
 expeditionDraw();
}
function expeditionFinish(outcome){
 const e=expeditionState();if(e.phase!=='exploring')return false;
 if(outcome==='success'&&(e.run.rescued.length<2||e.run.collected.length<3||Math.hypot(e.run.x-50,e.run.y-450)>48))return false;
 e.phase='result';e.result={outcome,claimed:false};expeditionKeys.clear();expeditionPointer=null;save();expeditionRenderResult();return true;
}
function expeditionRenderResult(){
 const e=expeditionState(),ok=e.result?.outcome==='success';
 expeditionPanel.innerHTML=`<div id="expeditionContent"><h2>${ok?'🎉 원정 성공':e.result?.outcome==='failure'?'🛟 구조선으로 귀환':'⛵ 원정 철수'}</h2><p>${ok?'생존자 2명과 자원을 안전하게 회수했습니다. 생존자는 섬의 제작법과 기술을 전수합니다.':'추가 보상은 없지만 마을과 동행 선원은 잃지 않습니다. 물자 비용은 돌려받지 않습니다.'}</p><p>귀환 버튼을 눌러 선원을 복귀시키고 마을 시계를 재개하세요. 결과 상태도 저장되어 새로고침 뒤 이어집니다.</p><p>${expeditionRewardGuide()}</p><button id="expeditionReturn">마을로 귀환 · 결과 적용</button><button id="expeditionResultBackup">진행 백업</button><p id="expeditionNotice" role="status"></p></div>`;
 document.getElementById('expeditionReturn').onclick=expeditionReturn;document.getElementById('expeditionResultBackup').onclick=exportSave;document.getElementById('expeditionReturn').focus();
}
function expeditionReturn(){
 const e=expeditionState();if(e.phase!=='result'||e.result?.claimed)return false;
 const snapshot=JSON.parse(JSON.stringify(e)),money=G.money,count=workers.length;
 // 같은 저장 안에서 선원 복귀·보상·소비 완료를 함께 확정합니다.
 for(const record of e.run.party)workers.push({...record,job:null,moving:false,vx:0,vy:0,carry:[...(record.carry||[])]});
 e.result.claimed=true;
 if(e.result.outcome==='success'){
   e.completed++;G.money+=120;
   if(!e.rewards.kelp){e.rewards.kelp=true;e.result.reward='해초 보존식 제조법';}else if(!e.rewards.medic){e.rewards.medic=true;e.medicEnabled=true;e.result.reward='의무병 배치 해금';}else if(!e.rewards.compass){e.rewards.compass=true;e.result.reward='선장 나침반 · 공격력 +20%';}else {e.specialty=Math.min(20,e.specialty+5);e.result.reward='보존식 5개';}
 }
 e.lastResult={...e.result,id:e.run.id};e.phase='idle';e.run=null;
 if(!save()){workers.splice(count);G.money=money;G.expedition=snapshot;document.getElementById('expeditionNotice').textContent='저장 실패 · 보상과 선원 복귀는 아직 확정하지 않았습니다. 다시 시도하세요.';return false;}
 balanceAssignments();expeditionRenderPanel();document.getElementById('expeditionNotice').textContent='귀환 완료 · '+(e.lastResult.outcome==='success'?`획득: $120와 ${e.lastResult.reward}. `:'')+expeditionRewardGuide();expeditionRefreshButton();return true;
}
function expeditionUpdate(dt){
 const e=expeditionState();expeditionRefreshButton();
 if(e.phase==='idle')return !expeditionPanel.hidden;
 if(e.phase==='result')return true;
 const r=e.run;if(!r)return true;
 let x=(expeditionKeys.has('arrowright')||expeditionKeys.has('d')?1:0)-(expeditionKeys.has('arrowleft')||expeditionKeys.has('a')?1:0),y=(expeditionKeys.has('arrowdown')||expeditionKeys.has('s')?1:0)-(expeditionKeys.has('arrowup')||expeditionKeys.has('w')?1:0);
 if(expeditionPointer){x=(expeditionPointer.x-expeditionPointer.sx)/45;y=(expeditionPointer.y-expeditionPointer.sy)/45;}
 const len=Math.hypot(x,y);if(len>0){r.x=Math.max(24,Math.min(476,r.x+x/Math.max(1,len)*135*dt));r.y=Math.max(24,Math.min(476,r.y+y/Math.max(1,len)*135*dt));}
 const reach=25+r.party.length*12;
 EXP_SURVIVORS.forEach((p,i)=>{if(!r.rescued.includes(i)&&Math.hypot(r.x-p.x,r.y-p.y)<reach)r.rescued.push(i);});
 EXP_CRATES.forEach((p,i)=>{if(!r.collected.includes(i)&&Math.hypot(r.x-p.x,r.y-p.y)<reach)r.collected.push(i);});
 r.time-=dt;r.elapsed+=dt;r.nextHazard-=dt;
 if(r.nextHazard<=0){r.nextHazard=2.8;r.hazards.push({x:r.x,y:r.y,radius:48,t:1.3,hit:false});}
 for(const h of r.hazards){h.t-=dt;if(h.t<=0&&!h.hit){h.hit=true;if(Math.hypot(r.x-h.x,r.y-h.y)<h.radius)r.hp-=Math.max(6,18-r.party.length*3);}}
 r.hazards=r.hazards.filter(h=>h.t>-.35);
 if(r.hp<=0||r.time<=0){expeditionFinish('failure');return true;}
 if(r.rescued.length===2&&r.collected.length===3&&Math.hypot(r.x-50,r.y-450)<48){expeditionFinish('success');return true;}
 expeditionSaveClock+=dt;if(expeditionSaveClock>=1){expeditionSaveClock=0;save();}
 expeditionDraw();return true;
}
function expeditionDraw(){
 const r=G.expedition?.run,canvas=document.getElementById('expeditionCanvas');if(!r||!canvas)return;
 const c=canvas.getContext('2d');c.clearRect(0,0,500,500);
 const sea=c.createLinearGradient(0,0,500,500);sea.addColorStop(0,'#236e92');sea.addColorStop(1,'#53bac0');c.fillStyle=sea;c.fillRect(0,0,500,500);
 // 작은 파도와 얕은 물, 모래 해안. 지도 좌표는 화면 크기와 무관하게 고정됩니다.
 c.strokeStyle='#b1e4dc55';c.lineWidth=2;
 for(let y=18;y<500;y+=35)for(let x=12;x<500;x+=62){c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+12,y+5,x+26,y);c.stroke();}
 const island=(inset)=>{c.beginPath();c.moveTo(80+inset,38+inset);c.bezierCurveTo(190,6+inset,245,48+inset,348,28+inset);c.bezierCurveTo(470-inset,10+inset,500-inset,140,467-inset,241);c.bezierCurveTo(500-inset,340,454,490-inset,326,471-inset);c.bezierCurveTo(227,491-inset,203,432-inset,120,470-inset);c.bezierCurveTo(24+inset,502-inset,3+inset,405,37+inset,316);c.bezierCurveTo(4+inset,200,1+inset,83,80+inset,38+inset);c.closePath();};
 c.fillStyle='#83d0bb';island(-8);c.fill();c.fillStyle='#eed8a1';island(0);c.fill();c.fillStyle='#96bb70';island(18);c.fill();
 c.strokeStyle='#d2c78f';c.lineWidth=22;c.lineCap='round';c.beginPath();c.moveTo(50,450);c.lineTo(110,300);c.lineTo(125,130);c.lineTo(285,240);c.lineTo(385,110);c.moveTo(285,240);c.lineTo(405,365);c.stroke();
 // 섬 식생과 바위는 회수 목표나 공격 예고를 가리지 않습니다.
 const palm=(x,y)=>{c.strokeStyle='#8b6744';c.lineWidth=6;c.beginPath();c.moveTo(x,y);c.quadraticCurveTo(x+8,y-20,x+4,y-39);c.stroke();c.fillStyle='#3c815a';for(let i=0;i<5;i++){c.save();c.translate(x+4,y-39);c.rotate(i*Math.PI*2/5);c.beginPath();c.ellipse(11,0,19,6,0,0,Math.PI*2);c.fill();c.restore();}};
 [[60,110],[210,100],[440,190],[165,390],[320,420],[240,340],[65,240]].forEach(p=>palm(...p));
 for(const [x,y]of [[200,190],[350,310],[205,445],[435,65]]){c.fillStyle='#667f7b';c.beginPath();c.ellipse(x,y,19,13,-.3,0,Math.PI*2);c.fill();c.fillStyle='#8da19a';c.beginPath();c.ellipse(x-3,y-4,13,7,-.3,0,Math.PI*2);c.fill();}
 const text=(label,x,y,size=13)=>{c.font=`bold ${size}px sans-serif`;c.textAlign='center';c.textBaseline='middle';c.strokeStyle='#fff6d5';c.lineWidth=4;c.strokeText(label,x,y);c.fillStyle='#234b4b';c.fillText(label,x,y);};
 text('잊힌 해초섬',260,50,19);text('N ↑',455,30,14);
 // 두 구조 캠프와 자원 상자.
 EXP_SURVIVORS.forEach((p,i)=>{if(r.rescued.includes(i)){text('구조 완료',p.x,p.y,12);return;}c.fillStyle='#765a42';c.fillRect(p.x-21,p.y+2,42,19);c.fillStyle='#e5a465';c.beginPath();c.moveTo(p.x-30,p.y+4);c.lineTo(p.x,p.y-23);c.lineTo(p.x+30,p.y+4);c.fill();c.font='25px sans-serif';c.fillText('🙋',p.x,p.y+5);text('생존자',p.x,p.y+35);});
 EXP_CRATES.forEach((p,i)=>{if(r.collected.includes(i))return;c.fillStyle='#8b623c';c.fillRect(p.x-16,p.y-14,32,29);c.strokeStyle='#e0b46b';c.lineWidth=3;c.strokeRect(p.x-14,p.y-12,28,25);c.beginPath();c.moveTo(p.x-14,p.y-12);c.lineTo(p.x+14,p.y+13);c.moveTo(p.x+14,p.y-12);c.lineTo(p.x-14,p.y+13);c.stroke();text('회수 자원',p.x,p.y+29);});
 // 귀환 지점과 정박선.
 c.fillStyle='#ae8856';c.fillRect(19,439,69,10);c.strokeStyle='#d4b07e';c.lineWidth=2;for(let x=22;x<85;x+=9){c.beginPath();c.moveTo(x,439);c.lineTo(x,449);c.stroke();}
 c.fillStyle='#694b39';c.beginPath();c.moveTo(22,452);c.lineTo(78,452);c.lineTo(65,469);c.lineTo(36,469);c.closePath();c.fill();c.strokeStyle='#faf2ce';c.lineWidth=3;c.beginPath();c.moveTo(50,451);c.lineTo(50,420);c.stroke();c.fillStyle='#faf2ce';c.beginPath();c.moveTo(52,420);c.lineTo(73,446);c.lineTo(52,446);c.fill();text('귀환선',52,487);
 // 붉은 공격 예고는 지형과 목표 위에 표시합니다.
 for(const h of r.hazards){c.fillStyle=h.hit?'#ff3b38b0':'#f23c3950';c.strokeStyle='#ba2424';c.lineWidth=3;c.beginPath();c.arc(h.x,h.y,h.radius,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#fff';c.font='bold 18px sans-serif';c.fillText(h.hit?'피해':'!',h.x,h.y);}
 r.party.forEach((_,i)=>{c.font='20px sans-serif';c.fillText('👷',r.x-18-i*13,r.y+20);});c.fillStyle='#f8f5c1';c.beginPath();c.ellipse(r.x,r.y+12,13,5,0,0,Math.PI*2);c.fill();c.font='30px sans-serif';c.fillText('🧑‍✈️',r.x,r.y);
 document.getElementById('expeditionStatus').textContent=`체력 ${Math.max(0,Math.ceil(r.hp))}/${r.maxHp} · ${Math.max(0,Math.ceil(r.time))}초 · 구조 ${r.rescued.length}/2 · 자원 ${r.collected.length}/3${r.rescued.length===2&&r.collected.length===3?' · 왼쪽 아래 배로 귀환!':''}`;
}
window.addEventListener('keydown',ev=>{if(!expeditionPanel.hidden && !ev.ctrlKey && !ev.metaKey){if(ev.key==='Tab'&&!expeditionPanel.contains(document.activeElement)){ev.preventDefault();ev.stopImmediatePropagation();expeditionPanel.querySelector('button:not(:disabled),select,canvas')?.focus();return;}if(ev.key!=='Tab')ev.stopImmediatePropagation();if(ev.key==='Escape'&&expeditionState().phase==='idle'){expeditionClose();return;}}if(G?.expedition?.phase==='exploring'&&['arrowup','arrowdown','arrowleft','arrowright','w','a','s','d'].includes(ev.key.toLowerCase())){ev.preventDefault();ev.stopImmediatePropagation();expeditionKeys.add(ev.key.toLowerCase());}},true);
window.addEventListener('keyup',ev=>expeditionKeys.delete(ev.key.toLowerCase()),true);
window.addEventListener('blur',()=>{expeditionKeys.clear();expeditionPointer=null;});

// 모달 안에서 키보드 포커스를 유지합니다. 탐험 중 Escape는 명시적인 철수 버튼으로 안내합니다.
expeditionPanel.addEventListener('keydown',ev=>{
 if(ev.key!=='Tab')return;
 const focusable=[...expeditionPanel.querySelectorAll('button:not(:disabled),select,canvas')];
 if(!focusable.length)return;
 const first=focusable[0],last=focusable[focusable.length-1];
 if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last.focus();}
 else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first.focus();}
});
