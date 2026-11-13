/* ---------- 해적 성장: 침공마다 1레벨 (상한 없음), 레벨마다 체력·공격력 3%, 5레벨마다 보스 1회 ---------- */
const PIRATE_RAIDS_PER_LEVEL = 1;
const PIRATE_PROGRESSION_VERSION = 2;
const BOSS_POWER_MULTIPLIER = 5;
function pirateLevel(wave = G.wave) {
  const count = Number.isFinite(Number(wave)) ? Math.max(1, Math.floor(Number(wave))) : 1;
  return Math.max(1, Math.ceil(count / PIRATE_RAIDS_PER_LEVEL));
}
const PIRATE_GROWTH = 1.03; // 해적: 레벨마다 체력·공격력 3%
const ALLY_GROWTH = 1.06;    // 선장·선원: 단계별 6% (후반에 해적보다 지나치게 강해지지 않게)
const PIRATE_CREW_MULTIPLIER = 3; // 상륙 인원 3배
// 갑판에 동시에 있을 수 있는 해적 수: 휴대폰(터치 화면)은 30명, 그 외 48명. 총 상륙 인원은 같고 나눠서 올라옴
const MAX_LIVE_PIRATES = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 30 : 48;
const pirateMultiplier = (level = pirateLevel()) => Math.pow(PIRATE_GROWTH, Math.max(0, level - 1));
const allyMultiplier = level => Math.pow(ALLY_GROWTH, Math.max(0, level - 1));
// 선장은 50레벨까지 기존 6% 성장을 유지합니다. 선원은 그 뒤 성장 배율을
// 50레벨 배율의 2%씩만 더해, 해적보다 높은 복리 성장으로 격차가 벌어지는 것을 막습니다.
const CREW_GROWTH_SOFT_CAP = 50, CREW_LATE_GROWTH = 0.02, ALLY_GROWTH_VERSION = 1;
function crewGrowthMultiplier(level = pirateLevel()) {
  const n = Math.max(1, Number.isFinite(Number(level)) ? Math.floor(Number(level)) : 1);
  return allyMultiplier(Math.min(n, CREW_GROWTH_SOFT_CAP)) *
    (1 + CREW_LATE_GROWTH * Math.max(0, n - CREW_GROWTH_SOFT_CAP));
}
function crewAllyMultiplier(level = pirateLevel()) {
  const floor = Number.isFinite(G.crewGrowthFloor) ? Math.max(1, G.crewGrowthFloor) : 1;
  return Math.max(crewGrowthMultiplier(level), floor);
}
function initializeAllyProgression() {
  if ((G.allyGrowthVersion || 0) >= ALLY_GROWTH_VERSION) {
    G.crewGrowthFloor = Number.isFinite(G.crewGrowthFloor) ? Math.max(1, G.crewGrowthFloor) : 1;
    return;
  }
  // 구버전이 이미 얻은 선원 능력치는 한 번만 보존합니다. 기존 카드·훈련·상처는
  // 그대로이며, 이후에는 새 성장 배율이 이 보존 배율을 넘을 때부터 다시 증가합니다.
  const previous = pirateLevel() > CREW_GROWTH_SOFT_CAP ? allyMultiplier(pirateLevel()) : 1;
  G.crewGrowthFloor = Number.isFinite(previous) ? previous : 1;
  G.allyGrowthVersion = ALLY_GROWTH_VERSION;
}
const normalPirateHp = (level = pirateLevel()) => PIRATE_BALANCE.health * Math.round((6 + 2 * level) * pirateMultiplier(level));
const normalPirateAttack = (level = pirateLevel()) => 2.5 * pirateMultiplier(level) * PIRATE_BALANCE.damage;
function pirateAttack(e) {
  const level = e.level || pirateLevel();
  if (e.champion) return normalPirateAttack(level) * BOSS_POWER_MULTIPLIER;
  const base = e.type === 'bomber' ? 6 : e.type === 'sniper' ? 3 : 2.5;
  // 정찰선 해적은 살피러 온 것이라 공격력이 절반입니다(w3d_defense.js).
  return base * pirateMultiplier(level) * PIRATE_BALANCE.damage * (G.scoutRaid ? 0.5 : 1);
}
function normalPirateShipHp(level = pirateLevel(), wave = G.wave, big = false) {
  const base = Math.round((big ? 3 : 1) * (12 + 5 * level) * pirateMultiplier(level));
  return PIRATE_BALANCE.health * Math.round(base * raidPlan(wave).armor);
}
function bossDueNextRaid(wave = G.wave + 1) {
  const level = pirateLevel(wave);
  return Math.floor(level / 5) * 5 > (G.lastBossLevel || 0);
}
function boarderHpAtLevel(level, type, big) {
  let hp = Math.round((big ? 1.6 : 1) * (6 + 2 * level) * pirateMultiplier(level));
  const typeHealth = PIRATE_TYPES[type]?.hp;
  if (typeHealth) hp = Math.max(1, Math.round(hp * typeHealth));
  return hp * PIRATE_BALANCE.health;
}
function initializePirateProgression() {
  initializeAllyProgression();
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
