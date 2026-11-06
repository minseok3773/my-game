/* ---------- 선장 백병전·전투 성장 (마을 생산 숙련도와 별도 저장) ---------- */
const HERO_MAX_LEVEL = 50;
const heroLevel = () => G.hero?.level || 1;
const heroXpNeed = (level = heroLevel()) => 20 + 10 * (level - 1);
const heroAttack = () => (4 + 2 * (heroLevel() - 1)) * allyMultiplier(heroLevel()) + 2 * ck('playerGun') + 3 * trainingLevel('hero');
const heroMaxHp = () => (40 + 6 * (heroLevel() - 1)) * allyMultiplier(heroLevel()) + 10 * trainingLevel('hero');
const isHeroAvailable = () => !!player && !player.dead && player.hp > 0 && !(G.hero?.downT > 0);
function initializeHeroState() {
  const old = G.hero || {};
  const savedLevel = Number(old.level ?? G.level ?? 1);
  const level = Number.isFinite(savedLevel) ? Math.min(HERO_MAX_LEVEL, Math.max(1, Math.max(pirateLevel(), Math.floor(savedLevel)))) : 1;
  G.hero = { level, xp: level >= HERO_MAX_LEVEL ? 0 : Math.max(0, Number.isFinite(old.xp) ? old.xp : 0),
    downT: Math.max(0, old.downT || 0), kills: old.kills || 0,
    engagedWave: old.engagedWave || 0, rewardedWave: old.rewardedWave || 0 };
  G.hero.hp = Math.max(0, Math.min(heroMaxHp(), old.hp ?? heroMaxHp()));
  if (!G.hero.hp && !G.hero.downT) G.hero.downT = 8;
}
function restoreHeroRuntime() {
  player.hp = G.hero.hp; player.dead = G.hero.downT > 0 || player.hp <= 0;
  player.fighting = false; player.swingT = 0; player.hurtT = 0;
}
function snapshotHero() { G.hero.hp = Math.max(0, player.hp); }
function gainCombatXp(n) {
  if (heroLevel() >= HERO_MAX_LEVEL) { G.hero.xp = 0; return; }
  if (!(n > 0) || !Number.isFinite(n)) return;
  G.hero.xp += n;
  let gained = 0;
  while (heroLevel() < HERO_MAX_LEVEL && G.hero.xp >= heroXpNeed()) {
    G.hero.xp -= heroXpNeed(); G.hero.level++; gained++;
    if (isHeroAvailable()) player.hp = Math.min(heroMaxHp(), player.hp + 6);
  }
  if (heroLevel() >= HERO_MAX_LEVEL) G.hero.xp = 0;
  if (gained) {
    toast(`⚔️ 선장 Lv.${heroLevel()}! 공격력 ${heroAttack()} · 체력 ${heroMaxHp()}`);
    floatText(player.x, player.y, `Lv.${heroLevel()} ↑`, '#ffe485');
  }
  snapshotHero();
}
function awardHeroVictory() {
  if (!G.wave || G.hero.engagedWave !== G.wave || G.hero.rewardedWave === G.wave) return;
  G.hero.rewardedWave = G.wave;
  gainCombatXp(Math.max(heroXpNeed() - G.hero.xp, 10 + 2 * G.wave));
}
function knockOutHero() {
  player.hp = 0; player.dead = true; player.fighting = false; player.swingT = 0;
  player.vx = player.vy = 0; G.hero.downT = 8; snapshotHero();
  toast('💫 선장이 쓰러졌습니다 · 8초 뒤 회복합니다'); save();
}
function tickHeroState(dt) {
  if (G.hero.downT > 0) {
    G.hero.downT = Math.max(0, G.hero.downT - dt);
    player.vx = player.vy = 0; player.moving = false;
    if (!G.hero.downT) {
      player.dead = false; player.hp = heroMaxHp(); player.x = 5; player.y = 3.75;
      player.cd = 0.65; player.hurtT = 0; toast('⚔️ 선장이 회복했습니다!'); save();
    }
  } else if (!raidOn && isHeroAvailable()) player.hp = Math.min(heroMaxHp(), player.hp + 3 * dt);
  snapshotHero();
}
function updateHeroCombat(dt) {
  player.fighting = false; player.aimYaw = undefined;
  player.cd = Math.max(0, (player.cd || 0) - dt);
  if (!raidOn || !isHeroAvailable()) return;
  const foe = nearestEnemy(player.x, player.y, 1.25 + 0.15 * ck('playerGun'), 'boarder');
  if (!foe) return;
  player.fighting = true; player.aimYaw = Math.atan2(foe.x - player.x, foe.y - player.y);
  if (player.cd > 0) return;
  player.cd = 0.65;
  swordStrike(player, foe, heroAttack());
}
