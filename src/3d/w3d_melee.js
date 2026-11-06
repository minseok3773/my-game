/* ---------- 갑판 백병전: 약탈 없이 선원을 추격하는 해적 ---------- */
const MELEE_REACH = 0.95;
function tickMeleeEffects(dt) {
  if (raidOn && (workers.length + soldiers.length > 0 || isHeroAvailable())) G.raidHadCrew = true;
  for (const unit of [player, ...workers, ...soldiers, ...enemies]) {
    unit.swingT = Math.max(0, (unit.swingT || 0) - dt);
    unit.hurtT = Math.max(0, (unit.hurtT || 0) - dt);
  }
  for (let i = fallenCrew.length - 1; i >= 0; i--) {
    fallenCrew[i].deathT += dt;
    if (fallenCrew[i].deathT >= 2) fallenCrew.splice(i, 1);
  }
}
function defenderDamage(dmg) { return dmg * strategyDamage() * (1 + 0.2 * ck('glass')) * Math.pow(0.8, ck('bunker')); }
function swordStrike(attacker, target, damage, enemy = false) {
  if (!target || target.hp <= 0 || target.dead) return;
  const actual = enemy ? defenderDamage(damage) : damage;
  attacker.swingT = 0.4; target.hurtT = 0.25; target.hp -= actual;
  booms.push({ x: (attacker.x + target.x) / 2, y: (attacker.y + target.y) / 2, t: 0, kind: 'water' });
  floaters.push({ x: target.x, y: target.y, text: `-${Math.ceil(actual)}`, color: enemy ? '#ff987c' : '#ffe997', t: 0, combat: true });
  if (attacker === player || target === player) G.hero.engagedWave = G.wave;
  if (attacker === player) {
    const defeated = target.hp <= 0;
    gainCombatXp(2 + (defeated ? target.champion ? 28 : 8 : 0));
    if (defeated) G.hero.kills++;
  }
  if (target.hp <= 0) {
    if (target === player) knockOutHero();
    else if (enemy) killCrew(target);
    else killBoarder(target);
  }
  if (target === player) snapshotHero();
}
function updateSwordBoarder(e, dt) {
  if (e.state === 'retreat') {
    e.retreatT -= dt; moveTo(e, e.home?.x ?? e.x, e.home?.y ?? e.y, 2.4, dt, null, true);
    if (e.retreatT <= 0) { const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); }
    return;
  }
  if (!alive(e)) return;
  const foe = nearestCrew(e, Infinity);
  e.fighting = false;
  if (!foe) { boarderWreck(e, dt); return; } // 싸울 상대가 없으면 시설을 부숨
  e.aimYaw = Math.atan2(foe.x - e.x, foe.y - e.y);
  const d = dist(e.x, e.y, foe.x, foe.y);
  if (d > MELEE_REACH) {
    const speed = e.type === 'bomber' ? 2.3 : e.type === 'thief' ? 2.4 : e.type === 'sniper' ? 1.6 : 1.7;
    moveTo(e, foe.x, foe.y, speed * Math.min(1.5, 1 + 0.03 * ((e.level || pirateLevel()) - 1)), dt, null, true); return;
  }
  stopMove(e, dt); e.fighting = true;
  e.atkT = (e.atkT ?? 0.8) - dt;
  if (e.atkT <= 0) { e.atkT = 1.05; swordStrike(e, foe, pirateAttack(e), true); }
}
function updateDefenders(dt, bl, mult) {
  const foes = enemies.filter(e => e.kind === 'boarder' && alive(e));
  const assigned = new Map();
  const targetFor = unit => {
    let target = null, score = Infinity;
    for (const e of foes) {
      if (!alive(e) || e.hp <= 0) continue;
      const next = dist(unit.x, unit.y, e.x, e.y) + (assigned.get(e) || 0) * 1.2;
      if (next < score) { score = next; target = e; }
    }
    if (target) assigned.set(target, (assigned.get(target) || 0) + 1);
    return target;
  };
  for (const unit of [...soldiers, ...workers]) {
    if (unit.hp <= 0 || unit.dead) continue;
    const worker = workers.includes(unit);
    unit.fighting = false;
    if (!raidOn) {
      const max = worker ? crewHpMax() : 12;
      unit.hp = Math.min(max, unit.hp + (2 + 4 * ck('regen')) * dt); unit.foe = null; unit.aimYaw = undefined;
      if (!worker) { const p = formation(soldiers.indexOf(unit)); moveTo(unit, p.x, p.y, 3, dt, soldiers, true); }
      continue;
    }
    G.raidHadCrew = true;
    const foe = targetFor(unit); unit.foe = foe;
    if (!foe) {
      // 선원은 배를 원거리에서 격침시키지 않고 상륙 지점에서 검병을 기다립니다.
      const ship = nearestEnemy(unit.x, unit.y, Infinity, 'ship');
      if (ship) { const p = shorePoint(ship.x, ship.y); moveTo(unit, p.x, p.y, worker ? workerSpeed() * 1.1 : 3, dt, worker ? workers : soldiers, true); }
      else stopMove(unit, dt);
      continue;
    }
    unit.aimYaw = Math.atan2(foe.x - unit.x, foe.y - unit.y);
    const d = dist(unit.x, unit.y, foe.x, foe.y);
    if (d > MELEE_REACH) {
      const dx = (unit.x - foe.x) / d, dy = (unit.y - foe.y) / d;
      const tx = foe.x + dx * 0.7, ty = foe.y + dy * 0.7;
      moveTo(unit, walkable(tx, ty) ? tx : foe.x, walkable(tx, ty) ? ty : foe.y, worker ? workerSpeed() * 1.1 : 3, dt, null, true);
      continue;
    }
    stopMove(unit, dt); unit.fighting = true;
    unit.cd = (unit.cd ?? 0.3) - dt;
    if (unit.cd <= 0) {
      unit.cd = worker ? 0.85 : 0.7 / (1 + 0.15 * (bl - 1));
      swordStrike(unit, foe, worker ? crewAttack() : 4.5 * mult * crewMul());
    }
  }
  if (raidOn && G.raidHadCrew && !workers.length && !soldiers.length && !isHeroAvailable()) {
    // 해적은 물러나지 않고 시설을 부숩니다. 주인공이 회복하면 다시 싸웁니다.
    G.raidHadCrew = false;
    toast('⚠️ 방어 인원이 모두 쓰러졌습니다! 해적이 시설을 부숩니다 · 주인공이 회복하면 끝까지 싸우세요'); save();
  }
}
