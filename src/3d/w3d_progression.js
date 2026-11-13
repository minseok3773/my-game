/* ---------- 해적 성장: 침공마다 1레벨 (상한 없음), 레벨마다 체력·공격력 3% (Lv.15부터 7%), 5레벨마다 보스 1회 ---------- */
const PIRATE_RAIDS_PER_LEVEL = 1;
const PIRATE_PROGRESSION_VERSION = 2;
const BOSS_POWER_MULTIPLIER = 5;
function pirateLevel(wave = G.wave) {
  const count = Number.isFinite(Number(wave)) ? Math.max(1, Math.floor(Number(wave))) : 1;
  return Math.max(1, Math.ceil(count / PIRATE_RAIDS_PER_LEVEL));
}
const PIRATE_GROWTH = 1.03; // 해적: 레벨마다 체력·공격력 3%
const ALLY_GROWTH = 1.06;    // 선장·선원: 단계별 6% (후반에 해적보다 지나치게 강해지지 않게)
const PIRATE_CREW_MULTIPLIER = 3; // 상륙 인원 3배 (해적 Lv.10부터)
// 초반 완화: 해적 Lv.1~5는 1.5배, Lv.6~9는 2배로 상륙합니다. 첫 습격들에서 일꾼이 한꺼번에 쓰러지지 않게 합니다.
// 새 섬 도착 직후(arrivalGrace)에도 1.5배로 줄입니다(w3d_chapter.js).
function pirateCrewMultiplier(level = pirateLevel()) { const m = level <= 5 ? 1.5 : level <= 9 ? 2 : PIRATE_CREW_MULTIPLIER; return G?.arrivalGrace > 0 ? Math.min(m, 1.5) : m; }
// 갑판에 동시에 있을 수 있는 해적 수: 휴대폰(터치 화면)은 30명, 그 외 48명. 총 상륙 인원은 같고 나눠서 올라옴
const MAX_LIVE_PIRATES = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 30 : 48;
// 후반(Lv.15~)에는 해적이 7%씩 자라 선원 성장(6%, 선장 Lv.50 상한)을 따라잡습니다. 방어가 다시 자동화되지 않게 합니다.
const PIRATE_LATE_FROM = 15, PIRATE_LATE_GROWTH = 1.07;
const pirateMultiplier = (level = pirateLevel()) => Math.pow(PIRATE_GROWTH, Math.max(0, Math.min(level, PIRATE_LATE_FROM) - 1)) * Math.pow(PIRATE_LATE_GROWTH, Math.max(0, level - PIRATE_LATE_FROM));
const allyMultiplier = level => Math.pow(ALLY_GROWTH, Math.max(0, level - 1));
const normalPirateHp = (level = pirateLevel()) => PIRATE_BALANCE.health * Math.round((6 + 2 * level) * pirateMultiplier(level));
const normalPirateAttack = (level = pirateLevel()) => 2.5 * pirateMultiplier(level) * PIRATE_BALANCE.damage;
function pirateAttack(e) {
  const level = e.level || pirateLevel();
  if (e.champion) return normalPirateAttack(level) * BOSS_POWER_MULTIPLIER * (e.bossPower || 1);
  const base = e.type === 'bomber' ? 6 : e.type === 'sniper' ? 3 : 2.5;
  // 정찰선 해적은 살피러 온 것이라 공격력이 절반입니다(w3d_defense.js).
  return base * pirateMultiplier(level) * PIRATE_BALANCE.damage * (G.scoutRaid ? 0.5 : 1);
}
function normalPirateShipHp(level = pirateLevel(), wave = G.wave, big = false) {
  const base = Math.round((big ? 3 : 1) * (12 + 5 * level) * pirateMultiplier(level));
  return PIRATE_BALANCE.health * Math.round(base * raidPlan(wave).armor);
}
// 5·10·15… 단계마다 보스 1회. 정찰선이 그 단계를 지나쳐도 다음 정식 습격에서 보스가 나옵니다.
const bossMilestone = level => Math.floor(level / 5) * 5;
function bossDueNextRaid(wave = G.wave + 1) {
  const milestone = bossMilestone(pirateLevel(wave));
  return milestone >= 5 && milestone > (G.lastBossLevel || 0);
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
