/* ---------- 해적 성장: 침공마다 1레벨 (상한 없음), 레벨마다 체력·공격력 3%, 5레벨마다 보스 1회 ---------- */
const PIRATE_RAIDS_PER_LEVEL = 1;
const PIRATE_PROGRESSION_VERSION = 2;
const BOSS_POWER_MULTIPLIER = 5;
function pirateLevel(wave = G.wave) {
  const count = Number.isFinite(Number(wave)) ? Math.max(1, Math.floor(Number(wave))) : 1;
  return Math.max(1, Math.ceil(count / PIRATE_RAIDS_PER_LEVEL));
}
const PIRATE_GROWTH = 1.03; // 해적: 레벨마다 체력·공격력 3%
const ALLY_GROWTH = 1.1;     // 선장·선원: 기존 단계별 10% 성장 유지
const PIRATE_CREW_MULTIPLIER = 3; // 상륙 인원 3배
const pirateMultiplier = (level = pirateLevel()) => Math.pow(PIRATE_GROWTH, Math.max(0, level - 1));
const allyMultiplier = level => Math.pow(ALLY_GROWTH, Math.max(0, level - 1));
const normalPirateHp = (level = pirateLevel()) => PIRATE_BALANCE.health * Math.round((6 + 2 * level) * pirateMultiplier(level));
const normalPirateAttack = (level = pirateLevel()) => 2.5 * pirateMultiplier(level) * PIRATE_BALANCE.damage;
function pirateAttack(e) {
  const level = e.level || pirateLevel();
  if (e.champion) return normalPirateAttack(level) * BOSS_POWER_MULTIPLIER;
  const base = e.type === 'bomber' ? 6 : e.type === 'sniper' ? 3 : 2.5;
  return base * pirateMultiplier(level) * PIRATE_BALANCE.damage;
}
function normalPirateShipHp(level = pirateLevel(), wave = G.wave, big = false) {
  const base = Math.round((big ? 3 : 1) * (12 + 5 * level) * pirateMultiplier(level));
  return PIRATE_BALANCE.health * Math.round(base * raidPlan(wave).armor);
}
function bossDueNextRaid(wave = G.wave + 1) {
  const level = pirateLevel(wave);
  return level % 5 === 0 && level > (G.lastBossLevel || 0);
}
function boarderHpAtLevel(level, type, big) {
  let hp = Math.round((big ? 1.6 : 1) * (6 + 2 * level) * pirateMultiplier(level));
  const typeHealth = PIRATE_TYPES[type]?.hp;
  if (typeHealth) hp = Math.max(1, Math.round(hp * typeHealth));
  return hp * PIRATE_BALANCE.health;
}
function initializePirateProgression() {
  if ((G.pirateProgressVersion || 0) >= PIRATE_PROGRESSION_VERSION) return;
  const level = pirateLevel(), oldWave = Math.max(1, G.wave || 1), combat = G.combat;
  const legacyEnemies = combat?.raidOn ? combat.enemies || [] : [];
  const activeBoss = legacyEnemies.some(e => e.boss && !e.dead && e.hp > 0 && e.state !== 'sink');
  const previousMilestone = Math.floor((level - 1) / 5) * 5;
  G.lastBossLevel = Math.max(Number.isFinite(G.lastBossLevel) ? G.lastBossLevel : 0,
    activeBoss ? Math.floor(level / 5) * 5 : previousMilestone);
  for (const e of legacyEnemies) {
    const oldMax = Number.isFinite(e.max) && e.max > 0 ? e.max : Math.max(1, e.hp || 1);
    const fraction = e.dead || e.state === 'sink' || !(e.hp > 0) ? 0 : Math.min(1, e.hp / oldMax);
    let max;
    if (e.kind === 'boarder') {
      if (e.champion) {
        max = normalPirateHp(level) * BOSS_POWER_MULTIPLIER;
        e.attackMul = BOSS_POWER_MULTIPLIER;
      } else {
        // 예전 명부에는 출신 배 크기가 없어, 기존 최대 체력의 두 후보 중 가까운 쪽으로 복원합니다.
        const small = boarderHpAtLevel(oldWave, e.type, false), big = boarderHpAtLevel(oldWave, e.type, true);
        const fromBig = typeof e.fromBigShip === 'boolean' ? e.fromBigShip : Math.abs(oldMax - big) < Math.abs(oldMax - small);
        e.fromBigShip = fromBig; max = boarderHpAtLevel(level, e.type, fromBig);
      }
    } else {
      max = normalPirateShipHp(level, G.wave, !!e.big && !e.boss) * (e.boss ? BOSS_POWER_MULTIPLIER : 1);
    }
    e.level = level; e.max = max; e.hp = max * fraction;
  }
  G.pirateProgressVersion = PIRATE_PROGRESSION_VERSION;
}
