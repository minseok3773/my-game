/* ---------- 텐트별 유료 일꾼 충원·명부 저장 ---------- */
const tentCapacity = id => DEFS[id]?.type === 'tent' ? DEFS[id].workers + (slv(id) - 1) * 2 : 0;
const crewCount = id => workers.filter(w => w.tent === id && w.hp > 0).length;
const recruitmentCost = id => 30 + (slv(id) - 1) * 10;
const crewTents = () => [...unlocked].filter(id => DEFS[id]?.type === 'tent');
function snapshotCrewRoster() {
  const record = w => ({ x: w.x, y: w.y, hp: w.hp, ph: w.ph, bob: 0,
    ...(w.tent ? { tent: w.tent, carry: [...w.carry], look: w.look } : {}) });
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
function recruitWorker(id) {
  if (!unlocked.has(id) || !tentCapacity(id) || G.recruitment[id] || crewCount(id) >= tentCapacity(id)) return false;
  const cost = recruitmentCost(id);
  if (G.money < cost) { toast(`충원 자금이 부족합니다 · $${cost} 필요`); return false; }
  G.money -= cost; G.recruitment[id] = { remaining: 5, paid: cost };
  save(); toast(`⛺ ${DEFS[id].name} · 일꾼 모집 시작 (5초)`); return true;
}
function tickRecruitment(dt) {
  for (const [id, job] of Object.entries(G.recruitment || {})) {
    if (!unlocked.has(id) || !tentCapacity(id)) continue;
    job.remaining = Math.max(0, job.remaining - dt);
    if (job.remaining > 0) continue;
    delete G.recruitment[id];
    if (crewCount(id) < tentCapacity(id)) { spawnWorker(id, 1); toast(`⛺ ${DEFS[id].name} · 일꾼 1명 합류`); }
    save();
  }
}
function crewHealthStatus() {
  const hp = workers.reduce((n, w) => n + Math.max(0, w.hp), 0) + soldiers.reduce((n, s) => n + Math.max(0, s.hp), 0);
  const max = crewTents().reduce((n, id) => n + tentCapacity(id) * crewHpMax(), 0) + soldiers.length * 12;
  return { hp, max, ratio: max ? Math.min(1, hp / max) : 0 };
}
const recruitStyle = document.createElement('style');
recruitStyle.textContent = `
#recruitBtn{position:fixed;left:10px;bottom:calc(136px + env(safe-area-inset-bottom,0px));z-index:4;min-height:44px;max-width:170px;padding:8px 12px;border:3px solid #8a663d;border-radius:12px;background:#ffe5a3;color:#624620;font:15px var(--display);box-shadow:0 3px 0 #805a3040;cursor:pointer}
#recruitBtn:focus-visible{outline:3px solid #fff;outline-offset:3px}
body.has-recruit #toast{bottom:calc(192px + env(safe-area-inset-bottom,0px))}
body.has-boss #recruitBtn{bottom:calc(188px + env(safe-area-inset-bottom,0px))}
body.has-boss.has-recruit #toast{bottom:calc(244px + env(safe-area-inset-bottom,0px))}
#recruitPanel{z-index:31}#recruitPanel .tent-list{display:grid;gap:12px;margin:14px 0}#recruitPanel article{border:2px solid #c6ae7a;border-radius:12px;padding:12px;background:#fff1cf}#recruitPanel article p{margin:6px 0}#recruitPanel article button{width:100%;font-size:15px}
@media(max-height:500px) and (orientation:landscape){#recruitBtn{bottom:68px;max-width:170px}body.has-recruit #toast{bottom:120px}}
`;
document.head.appendChild(recruitStyle);
const recruitBtn = document.createElement('button'); recruitBtn.id = 'recruitBtn'; recruitBtn.hidden = true;
document.body.appendChild(recruitBtn);
const recruitPanel = document.createElement('div'); recruitPanel.id = 'recruitPanel'; recruitPanel.className = 'panel'; recruitPanel.hidden = true;
recruitPanel.innerHTML = '<div role="dialog" aria-modal="true" aria-labelledby="recruitTitle"><h2 id="recruitTitle">⛺ 텐트 충원</h2><p>전사한 일꾼은 자동으로 복귀하지 않습니다. 텐트의 빈자리에 한 명씩 모집하세요.</p><p class="funds"></p><div class="tent-list"></div><button class="ghost close">돌아가기</button></div>';
document.body.appendChild(recruitPanel);
function closeRecruitment() { recruitPanel.hidden = true; paused = false; last = performance.now(); }
function openRecruitment() {
  if (paused || !crewTents().length) return;
  paused = true; recruitPanel.hidden = false;
  recruitPanel.querySelector('.funds').textContent = `보유 자금 $${fmt(G.money)} · 모집 시간 5초 · 생산 위치: 각 텐트`;
  const list = recruitPanel.querySelector('.tent-list'); list.replaceChildren();
  for (const id of crewTents()) {
    const live = crewCount(id), capacity = tentCapacity(id), job = G.recruitment[id], cost = recruitmentCost(id);
    const row = document.createElement('article'); row.dataset.tent = id;
    const title = document.createElement('b'); title.textContent = `${DEFS[id].name} ★${slv(id)} · ${live}/${capacity}명`;
    const text = document.createElement('p'); text.textContent = job ? `모집 중 · ${Math.ceil(job.remaining)}초 남음 (결제 완료)` : live >= capacity ? '현재 정원이 모두 근무 중입니다.' : `결원 ${capacity - live}명 · 1명 모집 $${cost}`;
    const button = document.createElement('button'); button.textContent = job ? '모집 진행 중' : `일꾼 1명 모집 · $${cost}`;
    button.disabled = !!job || live >= capacity || G.money < cost;
    button.onclick = () => { if (recruitWorker(id)) closeRecruitment(); };
    row.append(title, text, button); list.appendChild(row);
  }
  recruitPanel.querySelector('.close').focus({ preventScroll: true });
}
recruitBtn.onclick = openRecruitment; recruitPanel.querySelector('.close').onclick = closeRecruitment;
recruitPanel.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); closeRecruitment(); }
  if (e.key === 'Tab') {
    const buttons = [...recruitPanel.querySelectorAll('button:not(:disabled)')], first = buttons[0], end = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  }
});
function recruitmentHud() {
  const tents = crewTents(), missing = tents.reduce((n, id) => n + Math.max(0, tentCapacity(id) - crewCount(id)), 0);
  const near = tents.some(id => dist(player.x, player.y, DEFS[id].x, DEFS[id].y) < 3);
  recruitBtn.hidden = paused || !tents.length || (!missing && !near);
  recruitBtn.textContent = missing ? `⛺ 텐트 충원 · 결원 ${missing}명` : '⛺ 텐트 충원';
  document.body.classList.toggle('has-recruit', !recruitBtn.hidden);
}
