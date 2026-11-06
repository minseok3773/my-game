/* ---------- 마을 방어 규칙 ----------
 * - 살아 있는 일꾼이 6명 이상일 때만 습격 카운트다운이 흐릅니다.
 * - 방어 인원(일꾼·해군·주인공)이 모두 쓰러지면 해적은 물러나지 않고 가까운 시설을 부숩니다.
 * - 주인공이 회복하면 해적은 다시 주인공과 싸우고, 주인공이 끝까지 물리쳐야 습격이 끝납니다.
 * - 부서진 시설은 생산·판매가 멈추며, 주인공이 옆에 2초 서 있으면 무료로 수리됩니다.
 */
const RAID_MIN_CREW = 6;
const BUILDING_HP = 120;
const REPAIR_SECONDS = 2;
const aliveWorkers = () => workers.filter(w => w.hp > 0 && !w.dead).length;
const raidGateOpen = () => aliveWorkers() >= RAID_MIN_CREW;
function initializeBuildingState() {
  G.broken = G.broken && typeof G.broken === 'object' ? G.broken : {};
  G.bhp = G.bhp && typeof G.bhp === 'object' ? G.bhp : {};
  G.repair = null;
}
const isBroken = id => !!G.broken?.[id];
const buildingMaxHp = id => BUILDING_HP + 30 * (slv(id) - 1);
function nearestBuilding(e) {
  let best = null, bd = Infinity;
  for (const id of STATION_IDS) {
    if (!unlocked.has(id) || isBroken(id)) continue;
    const d = DEFS[id], dd = dist(e.x, e.y, d.x, d.y);
    if (dd < bd) { bd = dd; best = id; }
  }
  return best;
}
// 싸울 상대가 없을 때 해적: 가까운 시설로 가서 칼로 부숨
function boarderWreck(e, dt) {
  if (!e.wreckId || isBroken(e.wreckId) || !unlocked.has(e.wreckId)) e.wreckId = nearestBuilding(e);
  const id = e.wreckId;
  e.fighting = false;
  if (!id) { stopMove(e, dt); return; }
  const d = DEFS[id], dd = dist(e.x, e.y, d.x, d.y);
  e.aimYaw = Math.atan2(d.x - e.x, d.y - e.y);
  if (dd > 1.35) { moveTo(e, d.x, d.y, 1.8, dt, null, true); return; }
  stopMove(e, dt); e.fighting = true;
  e.atkT = (e.atkT ?? 0.8) - dt;
  if (e.atkT > 0) return;
  e.atkT = 1.05; e.swingT = 0.4;
  G.bhp[id] = (G.bhp[id] ?? buildingMaxHp(id)) - pirateAttack(e);
  booms.push({ x: d.x + rnd(-0.4, 0.4), y: d.y + rnd(-0.4, 0.4), t: 0, kind: 'fire' }); shake = Math.max(shake, 0.08);
  if (G.bhp[id] <= 0) {
    G.broken[id] = true; delete G.bhp[id]; e.wreckId = null;
    floatText(d.x, d.y, `💥 ${d.name} 파손!`, '#ffb0a0');
    toast(`💥 해적이 ${d.name}을(를) 부쉈습니다! 주인공이 회복하면 다시 싸워 물리치세요`); save();
  }
}
// 부서진 시설 옆에 주인공이 서 있으면 수리 (근처에 싸우는 해적이 있으면 멈춤)
function tickRepairs(dt) {
  if (!isHeroAvailable()) { G.repair = null; return; }
  for (const id of Object.keys(G.broken || {})) {
    if (!G.broken[id]) continue;
    const d = DEFS[id];
    if (!d || dist(player.x, player.y, d.x, d.y) > 1.9) continue;
    if (enemies.some(e => e.kind === 'boarder' && alive(e) && dist(e.x, e.y, d.x, d.y) < 3)) return;
    if (!G.repair || G.repair.id !== id) G.repair = { id, t: 0 };
    G.repair.t += dt;
    if (G.repair.t >= REPAIR_SECONDS) {
      delete G.broken[id]; G.repair = null; if (G.repairWork) delete G.repairWork[id];
      for (const o of workers) if (o.repairing === id) o.repairing = null;
      floatText(d.x, d.y, `🔧 ${d.name} 수리 완료`, '#b8ffbf'); save();
    }
    return;
  }
  G.repair = null;
}
// 일꾼 수리: 할 일이 없는 일꾼은 부서진 시설로 가서 고침 (시설 하나에 최대 3명, 일꾼 1명 기준 4초)
const WORKER_REPAIR_SECONDS = 4;
function workerRepair(w, dt) {
  const ids = Object.keys(G.broken || {}).filter(id => G.broken[id] && DEFS[id]);
  if (!ids.length) { w.repairing = null; return false; }
  let id = w.repairing && G.broken[w.repairing] ? w.repairing : null;
  if (!id) {
    id = ids.sort((a, b) => dist(w.x, w.y, DEFS[a].x, DEFS[a].y) - dist(w.x, w.y, DEFS[b].x, DEFS[b].y))
      .find(i => workers.filter(o => o !== w && o.repairing === i).length < 3) || null;
    w.repairing = id;
  }
  if (!id) return false;
  const d = DEFS[id];
  w.idle = false;
  if (dist(w.x, w.y, d.x, d.y) > 1.3) { moveTo(w, d.x, d.y, workerSpeed(), dt, workers, true); return true; }
  stopMove(w, dt);
  if (enemies.some(e => e.kind === 'boarder' && alive(e) && dist(e.x, e.y, d.x, d.y) < 3)) return true;
  G.repairWork = G.repairWork || {};
  G.repairWork[id] = (G.repairWork[id] || 0) + dt;
  if (Math.random() < 0.08) booms.push({ x: d.x + rnd(-0.4, 0.4), y: d.y + rnd(-0.4, 0.4), t: 0, kind: 'water' });
  if (G.repairWork[id] >= WORKER_REPAIR_SECONDS) {
    delete G.broken[id]; delete G.repairWork[id];
    for (const o of workers) if (o.repairing === id) o.repairing = null;
    floatText(d.x, d.y, `🔧 ${d.name} 수리 완료`, '#b8ffbf'); save();
  }
  return true;
}
// 부서진 시설: 기울어지고 연기가 남
function syncBrokenFx() {
  for (const id of STATION_IDS) {
    const o = objs[id]; if (!o || !o.g) continue;
    const broken = isBroken(id);
    o.g.rotation.z = broken ? 0.12 : 0;
    o.g.scale.y = broken ? 0.88 : 1;
    if (broken && Math.random() < 0.12) {
      const d = DEFS[id];
      spawnPart(d.x + rnd(-0.4, 0.4), raftY + 1.2, d.y + rnd(-0.4, 0.4), { tex: smokeTex, add: false, color: 0x5d5752, vx: rnd(-0.1, 0.1), vy: 0.55, vz: rnd(-0.1, 0.1), life: 1.6, size: 0.9 });
    }
  }
}
// 화면 위 표시: 공격받는 시설 체력, 부서진 시설 수리 안내
function drawBrokenSigns() {
  for (const id of Object.keys(G.bhp || {})) {
    const d = DEFS[id]; if (!d || isBroken(id)) continue;
    hpBar(d.x, d.y, 95, G.bhp[id] / buildingMaxHp(id), '#ffb347', 40);
  }
  for (const id of Object.keys(G.broken || {})) {
    const d = DEFS[id]; if (!d || !G.broken[id]) continue;
    const hero = G.repair && G.repair.id === id ? G.repair.t / REPAIR_SECONDS : 0;
    const crew = (G.repairWork?.[id] || 0) / WORKER_REPAIR_SECONDS;
    const pct = Math.min(100, Math.round(Math.max(hero, crew) * 100));
    sign(pct > 0 ? `🔧 수리 중 ${pct}%` : '🔧 부서짐 · 일꾼이 곧 고쳐요', d.x, d.y, 100, 'rgba(255,232,226,.93)', '#a3392a', 15);
  }
}
