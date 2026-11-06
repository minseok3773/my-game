/* 판매소별 정원은 사망한 일꾼과 별도로 보관합니다. 새 일꾼은 결원부터 채웁니다. */
const assignmentShops = () => STATION_IDS.filter(id => DEFS[id].type === 'shop' && unlocked.has(id));
const assignmentCapacity = () => crewTents().reduce((n, id) => n + tentCapacity(id), 0);
function initializeAssignments() {
  if (!G.workerAssignments || typeof G.workerAssignments !== 'object') {
    G.workerAssignments = {};
    const shops = assignmentShops();
    for (let i = 0; i < assignmentCapacity() && shops.length; i++) {
      const id = shops[i % shops.length]; G.workerAssignments[id] = (G.workerAssignments[id] || 0) + 1;
    }
  }
  for (const id of STATION_IDS) {
    const n = Number(G.workerAssignments[id]);
    G.workerAssignments[id] = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  }
  balanceAssignments();
}
function balanceAssignments() {
  const used = {};
  for (const w of workers) {
    const id = w.assignment;
    if (!unlocked.has(id) || (used[id] || 0) >= (G.workerAssignments[id] || 0)) {
      w.assignment = null; w.job = null;
    } else used[id] = (used[id] || 0) + 1;
  }
  for (const w of workers) if (!w.assignment) {
    const id = assignmentShops().find(id => (used[id] || 0) < (G.workerAssignments[id] || 0));
    if (id) { w.assignment = id; used[id] = (used[id] || 0) + 1; w.job = null; }
  }
}
function setWorkerAssignment(id, count) {
  if (!assignmentShops().includes(id) || !Number.isInteger(count) || count < 0) return false;
  const other = Object.entries(G.workerAssignments).reduce((n, [key, value]) => n + (key === id ? 0 : value), 0);
  if (other + count > assignmentCapacity()) return false;
  G.workerAssignments[id] = count; balanceAssignments(); save(); refreshAssignmentPanel(); return true;
}
function assignmentRoute(w, route) {
  if (!w.assignment) return false;
  // 식당 담당자는 생선을 화로에 공급하고, 구운 생선을 식당으로 나릅니다.
  if (w.assignment === 'diner') return route.to === 'diner' || route.to === 'grill';
  return route.to === w.assignment;
}
// 배정 변경 중 들고 있던 다른 종류의 상품은 원래 생산소에 돌려놓습니다.
function returnUnassignedCargo(w, dt) {
  const item = w.carry[0];
  if (!item || ROUTES.some(r => assignmentRoute(w, r) && sourceInfo(r.from).item === item)) return false;
  const id = STATION_IDS.find(id => ['producer', 'converter'].includes(DEFS[id].type) && sourceInfo(id).item === item && unlocked.has(id));
  if (!id) return false;
  const source = sourceInfo(id), target = workerSlot(w, source);
  w.job = null;
  if (dist(w.x, w.y, target.x, target.y) > 0.35) moveTo(w, target.x, target.y, workerSpeed(), dt, workers);
  else { stopMove(w, dt); G.st[id][source.key]++; w.carry.shift(); }
  return true;
}
function workerSlot(w, target) {
  const peers = workers.filter(o => o.assignment === w.assignment);
  const index = Math.max(0, peers.indexOf(w));
  if (peers.length < 2) return target;
  const angle = index * 2.3999632297, radius = 0.43 + 0.35 * Math.floor(index / 6);
  const p = { x: target.x + Math.cos(angle) * radius, y: target.y + Math.sin(angle) * radius };
  return walkable(p.x, p.y) ? p : target;
}
function separateWorkers(dt) {
  if (raidOn) return;
  for (let i = 0; i < workers.length; i++) for (let j = i + 1; j < workers.length; j++) {
    const a = workers[i], b = workers[j]; let dx = a.x - b.x, dy = a.y - b.y;
    const distance = Math.hypot(dx, dy);
    if (distance >= 0.55) continue;
    if (distance < 0.001) { dx = Math.cos(i + j); dy = Math.sin(i + j); }
    const length = Math.hypot(dx, dy), push = Math.min((0.55 - distance) / 2, dt * 1.5);
    for (const [w, sign] of [[a, 1], [b, -1]]) {
      const x = w.x + sign * dx / length * push, y = w.y + sign * dy / length * push;
      if (walkable(x, y)) { w.x = x; w.y = y; }
    }
  }
}
const assignmentStyle = document.createElement('style');
assignmentStyle.textContent = `#assignmentBtn{position:fixed;right:10px;bottom:calc(136px + env(safe-area-inset-bottom,0px));z-index:6;min-height:48px;padding:8px;border:2px solid #59844b;border-radius:12px;background:#ecffde;color:#354a2d;font:16px var(--display)}
#assignmentPanel{z-index:35;overflow:auto}#assignmentPanel .box{max-height:85dvh;overflow:auto;width:min(420px,94vw);box-sizing:border-box}#assignmentPanel .assignment-row{display:flex;align-items:center;justify-content:space-between;gap:6px;margin:12px 0}#assignmentPanel button{min-width:44px;min-height:44px;touch-action:manipulation}#assignmentPanel .assignment-row>div{display:flex;align-items:center;flex:none}#assignmentPanel .assignment-row>span{font-size:14px;min-width:0;flex:1}#assignmentPanel h2{font-size:22px}#assignmentPanel p{font-size:14px;line-height:1.5}#assignmentPanel output{display:inline-block;min-width:30px;text-align:center}`;
document.head.appendChild(assignmentStyle);
const assignmentButton = document.createElement('button'); assignmentButton.id = 'assignmentBtn'; assignmentButton.textContent = '👷 일꾼 배정';
assignmentButton.setAttribute('aria-haspopup', 'dialog'); assignmentButton.setAttribute('aria-controls', 'assignmentPanel'); assignmentButton.setAttribute('aria-expanded', 'false'); document.body.appendChild(assignmentButton);
const assignmentPanel = document.createElement('div'); assignmentPanel.id = 'assignmentPanel'; assignmentPanel.className = 'panel'; assignmentPanel.hidden = true;
assignmentPanel.innerHTML = '<div class="box" role="dialog" aria-modal="true" aria-labelledby="assignmentTitle"><button class="close" aria-label="닫기">✕</button><h2 id="assignmentTitle">판매소 일꾼 배정</h2><p>배정 인원은 전사 후에도 유지됩니다. 텐트에서 충원하면 빈자리를 채웁니다.</p><div id="assignmentRows"></div><p id="assignmentTotal" role="status" aria-live="polite"></p></div>';
document.body.appendChild(assignmentPanel);
function refreshAssignmentPanel() {
  const rows = document.getElementById('assignmentRows'), active = document.activeElement;
  const focus = rows.contains(active) ? { id: active.dataset.assignment, delta: active.dataset.delta } : null;
  rows.replaceChildren();
  const total = Object.values(G.workerAssignments).reduce((n, value) => n + value, 0);
  for (const id of assignmentShops()) {
    const row = document.createElement('div'); row.className = 'assignment-row';
    const label = document.createElement('span'); label.textContent = `${DEFS[id].name} (${workers.filter(w => w.assignment === id).length}명 근무)`; row.appendChild(label);
    const controls = document.createElement('div');
    for (const delta of [-1, 1]) {
      if (delta === 1) { const output = document.createElement('output'); output.textContent = G.workerAssignments[id] || 0; controls.appendChild(output); }
      const b = document.createElement('button'); b.textContent = delta < 0 ? '−' : '+'; b.setAttribute('aria-label', `${DEFS[id].name} ${delta < 0 ? '감소' : '증가'}`);
      b.dataset.assignment = id; b.dataset.delta = String(delta);
      b.disabled = delta < 0 ? !(G.workerAssignments[id] > 0) : total >= assignmentCapacity();
      b.onclick = () => setWorkerAssignment(id, (G.workerAssignments[id] || 0) + delta); controls.appendChild(b);
    }
    row.appendChild(controls); rows.appendChild(row);
  }
  document.getElementById('assignmentTotal').textContent = `배정 ${total} / 텐트 정원 ${assignmentCapacity()} · 생존 ${workers.length}명 · 미배정 ${workers.filter(w => !w.assignment).length}명`;
  if (focus) {
    const buttons = [...rows.querySelectorAll('button:not(:disabled)')];
    const next = buttons.find(b => b.dataset.assignment === focus.id && b.dataset.delta === focus.delta)
      || buttons.find(b => b.dataset.assignment === focus.id) || assignmentPanel.querySelector('.close');
    next.focus({ preventScroll: true });
  }
}
let assignmentReturnFocus = null;
assignmentButton.onclick = () => {
  if (paused) return;
  assignmentReturnFocus = document.activeElement;
  clearMovementInput(); refreshAssignmentPanel(); assignmentPanel.hidden = false; paused = true;
  assignmentButton.setAttribute('aria-expanded', 'true');
  assignmentPanel.querySelector('.close').focus({ preventScroll: true });
};
function closeAssignments() {
  if (assignmentPanel.hidden) return;
  assignmentPanel.hidden = true; paused = false; last = performance.now(); clearMovementInput();
  assignmentButton.setAttribute('aria-expanded', 'false');
  const target = assignmentReturnFocus?.isConnected && typeof assignmentReturnFocus.focus === 'function' ? assignmentReturnFocus : assignmentButton;
  target.focus({ preventScroll: true });
}
assignmentPanel.querySelector('.close').onclick = closeAssignments;
assignmentPanel.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); closeAssignments(); }
  if (e.key === 'Tab') {
    const buttons = [...assignmentPanel.querySelectorAll('button:not(:disabled)')], first = buttons[0], end = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  }
});
