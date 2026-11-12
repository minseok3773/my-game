/* ---------- 텐트별 유료 일꾼 충원·명부 저장 ---------- */
const tentCapacity = id => DEFS[id]?.type === 'tent' ? DEFS[id].workers + (slv(id) - 1) * 2 : 0;
const crewCount = id => workers.filter(w => w.tent === id && w.hp > 0).length;
const recruitmentCost = () => 30;
// 긴급 충원: 일꾼이 한 명도 없고 돈이 $30 미만이면 (습격 중 아닐 때) 무료
const recruitPrice = () => (!raidOn && !workers.some(w => w.hp > 0 && !w.dead) && G.money < 30) ? 0 : 30;
const RECRUIT_SECONDS = 1;
const crewTents = () => [...unlocked].filter(id => DEFS[id]?.type === 'tent');
function restoreRecruitmentJobs() {
  G.recruitment = G.recruitment || {};
  // 이미 지불한 구버전 5초 모집은 비용을 유지하고 남은 시간을 최대 1초로 줄입니다.
  for (const job of Object.values(G.recruitment)) {
    job.remaining = Math.min(RECRUIT_SECONDS, Math.max(0, Number.isFinite(job.remaining) ? job.remaining : RECRUIT_SECONDS));
    job.duration = RECRUIT_SECONDS;
  }
}
function snapshotCrewRoster() {
  const record = w => ({ x: w.x, y: w.y, hp: w.hp, ph: w.ph, bob: 0,
    ...(w.tent ? { tent: w.tent, carry: [...w.carry], look: w.look, assignment: w.assignment } : {}) });
  G.crewRoster = workers.filter(w => w.hp > 0).map(record);
  G.navyRoster = soldiers.filter(s => s.hp > 0).map(record);
  G.crewRosterVersion = 1;
}
function restoreCrewRoster(legacyRespawn) {
  if (restoringCrewRoster) {
    for (const saved of G.crewRoster) {
      const id = saved.tent;
      if (!unlocked.has(id) || !tentCapacity(id) || crewCount(id) >= tentCapacity(id) || saved.hp <= 0) continue;
      spawnWorker(id, 1); const w = workers[workers.length - 1];
      if (Number.isFinite(saved.x) && Number.isFinite(saved.y) && walkable(saved.x, saved.y)) { w.x = saved.x; w.y = saved.y; }
      w.hp = Math.min(crewHpMax(), saved.hp ?? crewHpMax());
      if (Number.isFinite(saved.ph)) w.ph = saved.ph;
      if (Array.isArray(saved.carry)) w.carry = saved.carry.filter(t => Object.hasOwn(ITEMS, t)).slice(0, crewCap());
      w.assignment = saved.assignment || null;
      if (saved.look) w.look = saved.look;
    }
  } else {
    // 구버전 자동 복귀 대기자는 무료 복귀 대신 해당 텐트의 결원으로 이관.
    for (const missing of legacyRespawn) {
      const i = workers.findIndex(w => w.tent === missing.tent);
      if (i >= 0) workers.splice(i, 1);
    }
  }
  G.crewRoster = workers.map(w => ({ tent: w.tent, x: w.x, y: w.y, hp: w.hp, carry: [...w.carry], ph: w.ph, look: w.look }));
}
// 후보는 텐트 입구 쪽부터 검사합니다. 향후 건설·증축 칸도 피해 저장 후 위치를 유지합니다.
function recruitmentPadPosition(id) {
  G.recruitPadPositions = G.recruitPadPositions || {};
  const fitsRaft = p => walkable(p.x, p.y) && [-0.62, 0.62].every(dx => [-0.62, 0.62].every(dy => hasTile(Math.floor(p.x + dx), Math.floor(p.y + dy))));
  const saved = G.recruitPadPositions[id];
  if (saved && fitsRaft(saved)) return saved;
  const d = DEFS[id];
  const blockers = [
    ...PADS.filter(p => p.id !== id),
    ...Object.values(UPG),
    ...Object.entries(DEFS).filter(([other, def]) => other !== id && Number.isFinite(def.x)).map(([, def]) => def),
    ...Object.entries(G.recruitPadPositions).filter(([other]) => other !== id).map(([, point]) => point),
  ];
  const offsets = [[0,1.8],[-2.1,0],[2.1,.5],[0,-2.1],[-1.5,.5],[1.8,0],[-1.8,1],[0,2.4],[-2.4,-.5],[2.4,-.5]];
  const candidates = offsets.map(([dx,dy]) => ({ x:d.x+dx, y:d.y+dy })).filter(fitsRaft);
  if (!candidates.length) return null;
  const clearance = point => Math.min(...blockers.map(other => Math.max(Math.abs(point.x-other.x),Math.abs(point.y-other.y))));
  const point = candidates.find(candidate => clearance(candidate) >= 1.35)
    || candidates.reduce((best,candidate) => clearance(candidate)>clearance(best) ? candidate : best);
  G.recruitPadPositions[id] = point;
  return point;
}
function recruitmentPads() {
  return crewTents().map(tent => {
    const point = recruitmentPadPosition(tent);
    if (!point) return null;
    const live = crewCount(tent), capacity = tentCapacity(tent), job = G.recruitment?.[tent];
    return { id:'recruit:'+tent, tent, recruit:true, x:point.x, y:point.y, cost:recruitPrice(),
      icon:'⛺', live, capacity, remaining:job ? Math.max(0,job.remaining) : 0, duration:RECRUIT_SECONDS,
      progress:job ? Math.max(0, Math.min(1, 1-job.remaining/RECRUIT_SECONDS)) : 0,
      pending:!!job, canRecruit:live<capacity && !job && G.money>=recruitPrice() };
  }).filter(Boolean);
}
function recruitWorker(id) {
  const pad = recruitmentPads().find(p => p.tent === id);
  const heroReady = typeof isHeroAvailable === 'function' ? isHeroAvailable() : true;
  if (!heroReady || !pad || dist(player.x,player.y,pad.x,pad.y)>0.6 || !pad.canRecruit) return false;
  const price = recruitPrice(); G.money -= price; G.recruitment[id] = { remaining:RECRUIT_SECONDS, duration:RECRUIT_SECONDS, paid:price };
  save(); return true;
}
function tickRecruitment(dt) {
  if (!(dt>0) || paused) return;
  const heroReady = typeof isHeroAvailable === 'function' ? isHeroAvailable() : true;
  const pad = heroReady ? recruitmentPads().filter(p => dist(player.x,player.y,p.x,p.y)<=0.6)
    .sort((a,b) => dist(player.x,player.y,a.x,a.y)-dist(player.x,player.y,b.x,b.y) || a.id.localeCompare(b.id))[0]
    : null;
  // 첫 틱부터 시간을 사용하고, 완료 후 남은 시간을 다음 모집에 넘겨 정확히 초당 1명을 충원합니다.
  // 이미 결제한 모집은 칸을 떠나거나 주인공이 쓰러져도 마저 진행합니다.
  for (const id of crewTents()) {
    let remainingDt = dt;
    while (remainingDt>1e-8) {
      if (!G.recruitment[id] && (pad?.tent!==id || !recruitWorker(id))) break;
      const job = G.recruitment[id];
      if (job.remaining>remainingDt+1e-8) { job.remaining-=remainingDt; break; }
      remainingDt = Math.max(0,remainingDt-Math.max(0,job.remaining));
      delete G.recruitment[id];
      if (crewCount(id)<tentCapacity(id)) { spawnWorker(id,1); toast(`⛺ ${DEFS[id].name} · 일꾼 1명 합류`); }
      save();
    }
  }
}
function crewHealthStatus() {
  const hp = workers.reduce((n, w) => n + Math.max(0, w.hp), 0) + soldiers.reduce((n, s) => n + Math.max(0, s.hp), 0);
  const max = crewTents().reduce((n, id) => n + tentCapacity(id) * crewHpMax(), 0) + soldiers.length * 12;
  return { hp, max, ratio: max ? Math.min(1, hp / max) : 0 };
}
// 구버전 build의 참조만 유지합니다. 실제 충원은 텐트 바닥 칸에서만 합니다.
const recruitPanel = document.createElement('div'); recruitPanel.hidden = true;
const recruitStyle = document.createElement('style');
recruitStyle.textContent = `
#recruitHint{left:10px;bottom:calc(136px + env(safe-area-inset-bottom,0px));z-index:4;max-width:230px;padding:7px 10px;border:2px solid #8a663d;border-radius:11px;background:#fff0beed;color:#624620;font:13px/1.35 var(--display);box-shadow:0 3px 0 #805a3030;pointer-events:none}
body.has-boss #toast{bottom:calc(216px + env(safe-area-inset-bottom,0px))}
body.has-recruit #toast{bottom:calc(198px + env(safe-area-inset-bottom,0px))}
body.has-boss #recruitHint{bottom:calc(216px + env(safe-area-inset-bottom,0px))}
body.has-boss.has-recruit #toast{bottom:calc(278px + env(safe-area-inset-bottom,0px))}
@media(max-height:500px) and (orientation:landscape){#recruitHint{bottom:68px;max-width:210px}body.has-boss #toast{bottom:calc(216px + env(safe-area-inset-bottom,0px))}
body.has-recruit #toast{bottom:132px}}
`;
document.head.appendChild(recruitStyle);
const recruitHint = document.createElement('div'); recruitHint.id='recruitHint'; recruitHint.className='hud'; recruitHint.hidden=true;
document.body.appendChild(recruitHint);
function recruitmentHud() {
  const heroReady = typeof isHeroAvailable === 'function' ? isHeroAvailable() : true;
  const pad = recruitmentPads().filter(p => dist(player.x,player.y,p.x,p.y)<1.8)
    .sort((a,b) => dist(player.x,player.y,a.x,a.y)-dist(player.x,player.y,b.x,b.y) || a.id.localeCompare(b.id))[0];
  recruitHint.hidden = paused || !heroReady || !pad;
  if (pad) recruitHint.textContent = pad.pending ? `⛺ 모집 중 ${Math.ceil(pad.remaining)}초 · ${pad.live}/${pad.capacity}명`
    : pad.live>=pad.capacity ? `⛺ ${DEFS[pad.tent].name} · 정원 ${pad.capacity}명 충원 완료`
    : recruitPrice()===0 ? `⛺ 무료 충원 · 네모 칸에 서 있으면 1명 충원 · ${pad.live}/${pad.capacity}명`
    : G.money<recruitPrice() ? `⛺ 일꾼 충원 $${recruitPrice()} · 자금이 부족합니다`
    : `⛺ 네모 칸에 서 있으면 $${recruitPrice()}씩 · 1초에 1명 충원 · ${pad.live}/${pad.capacity}명`;
  document.body.classList.toggle('has-recruit',!recruitHint.hidden);
}
