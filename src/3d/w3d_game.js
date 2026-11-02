/* ---------- 3D 전용 재미 요소: 강화 카드 · 해적 종류 · 보스 ---------- */
const RAID_INTERVAL = 60;
function restoreRaidSchedule() {
  if (G.raidIntervalVersion !== 1) {
    if (!G.combat?.raidOn) G.raidT = RAID_INTERVAL;
    G.raidIntervalVersion = 1;
  }
  if (!Number.isFinite(G.raidT)) G.raidT = RAID_INTERVAL;
  G.raidT = Math.max(0, G.raidT);
}
const PIRATE_BALANCE = Object.freeze({ health: 4, damage: 4 / 3, shipSpeed: 2, crewSpeed: 0.5 });
const PIRATE_BALANCE_VERSION = 2;
// 진행 중인 구버전 습격도 남은 체력 비율을 유지해 한 번만 새 난이도로 전환.
function restorePirateBalance(combat) {
  if ((combat.balanceVersion || 0) >= PIRATE_BALANCE_VERSION) return;
  const ratio = (combat.balanceVersion || 0) >= 1 ? 2 : 4;
  for (const e of combat.enemies || []) {
    if (Number.isFinite(e.hp)) e.hp *= ratio;
    if (Number.isFinite(e.max)) e.max *= ratio;
    if (e.loot) { G.money += e.loot; e.loot = 0; }
  }
  combat.balanceVersion = PIRATE_BALANCE_VERSION;
}
// 습격을 막을 때마다 카드 3장 중 1장을 골라 판마다 다르게 성장
const CARDS = [
  { id: 'smuggler', icon: '🏴‍☠️', name: '밀수 항로', desc: '판매가 +35% · 습격 간격 60초 유지', max: 2 },
  { id: 'glass', icon: '🔥', name: '과충전 포탄', desc: '포탑 피해 +60% · 아군이 받는 피해 +20%', max: 2 },
  { id: 'bunker', icon: '⚓', name: '요새 경제', desc: '아군이 받는 피해 -20% · 판매가 -15%', max: 2 },
  { id: 'towerDmg', icon: '🎯', name: '포탑 화력', desc: '포탑 피해 +30%', max: 5 },
  { id: 'towerRate', icon: '⚡', name: '포탑 연사', desc: '포탑 발사 속도 +25%', max: 4 },
  { id: 'towerDouble', icon: '💥', name: '2연발 포탄', desc: '포탑이 한 번에 두 발 발사', max: 1, need: () => TOWERS.some(t => unlocked.has(t)) },
  { id: 'crewPower', icon: '⚔️', name: '선원 훈련', desc: '선원·해군 공격력 +40%', max: 5 },
  { id: 'crewHp', icon: '🛡️', name: '튼튼한 선원', desc: '선원 체력 +50%', max: 4 },
  { id: 'playerGun', icon: '⚔️', name: '선장의 검술', desc: '선장 공격력 +2 · 검 사거리 +0.15', max: 3 },
  { id: 'price', icon: '🐟', name: '흥정 달인', desc: '모든 판매가 +20%', max: 5 },
  { id: 'speed', icon: '👟', name: '날쌘 발', desc: '주인공 이동 속도 +15%', max: 3 },
  { id: 'villageHp', icon: '🏰', name: '전투 의무실', desc: '일꾼 최대 체력 +10, 즉시 아군 전원 회복', max: 6 },
  { id: 'regen', icon: '💚', name: '휴식 치료', desc: '비전투 중 선원 회복 속도 증가', max: 2 },
  { id: 'loot', icon: '💰', name: '현상금 사냥', desc: '해적 처치 보상 +50%', max: 4 },
  { id: 'bag', icon: '🎒', name: '큰 주머니', desc: '가방 칸 +5', max: 4 },
];
function ck(id) { return (G && G.cards && G.cards[id]) || 0; }
const lootMul = () => 1 + 0.5 * ck('loot');
const crewHpMax = () => Math.round((15 + 6 * (pirateLevel() - 1)) * pirateMultiplier() * (1 + 0.5 * ck('crewHp'))) + 10 * ck('villageHp') + 5 * trainingLevel('crew');
const crewMul = () => 1 + 0.4 * ck('crewPower');
const crewAttack = () => 3 * (1 + 0.1 * (Math.max(lv(), pirateLevel()) - 1)) * pirateMultiplier() * crewMul() + trainingLevel('crew');

const cardStyle = document.createElement('style');
cardStyle.textContent = `
#cardPanel .box{max-width:420px;width:100%;text-align:center}
#cardPanel h2{margin:0 0 4px}
#cardPanel .sub{margin:0 0 14px;color:#78613f;font-size:14px}
#cardPanel .cards{display:flex;flex-direction:column;gap:10px}
#cardPanel button.card{display:flex;align-items:center;gap:10px;text-align:left;padding:12px;border:2px solid #b69760;border-radius:14px;background:#fff2c7;color:#59462c;box-shadow:0 3px 0 #b69760;font-family:inherit}
#cardPanel button.card:nth-child(2){background:#dff4fb;border-color:#7bafbd;box-shadow:0 3px 0 #7bafbd}
#cardPanel button.card:nth-child(3){background:#e9f6d4;border-color:#8dad66;box-shadow:0 3px 0 #8dad66}
#cardPanel button.card .ic{font-size:28px;width:34px;text-align:center;flex:none}
#cardPanel button.card b{display:block;font-size:17px;font-family:var(--display)}
#cardPanel button.card span{display:block;font-size:13px;line-height:1.4}
#cardPanel button.card .lv{margin-left:auto;font:11px var(--display);background:#fffdf1;color:#76603b;border:1px solid #c8b085;border-radius:8px;padding:3px 5px;flex:none}
#bossBar{position:fixed;left:50%;bottom:calc(136px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);width:min(320px,70vw);z-index:5;pointer-events:none;text-align:center;font-family:var(--display);color:#fff;text-shadow:0 2px 0 #78392c}
#bossBar .bar{height:12px;border-radius:7px;background:rgba(10,10,20,.75);border:2px solid #f2d16b;overflow:hidden;margin-top:3px}
#bossBar .fill{height:100%;background:linear-gradient(#ff8a7a,#d8231a);width:100%}
`;
document.head.appendChild(cardStyle);
const cardPanel = document.createElement('div');
cardPanel.className = 'panel'; cardPanel.id = 'cardPanel'; cardPanel.hidden = true;
cardPanel.innerHTML = '<div class="box"><h2>🃏 강화 카드 선택</h2><p class="sub"></p><div class="cards"></div></div>';
document.body.appendChild(cardPanel);
const bossBar = document.createElement('div');
bossBar.id = 'bossBar'; bossBar.hidden = true;
bossBar.innerHTML = '<div class="nm"></div><div class="bar"><div class="fill"></div></div>';
document.body.appendChild(bossBar);

function offerCards() {
  G.cards = G.cards || {};
  const pool = CARDS.filter(c => ck(c.id) < c.max && (!c.need || c.need()));
  if (!pool.length) return;
  const pick = (G.cardOffer || []).map(id => pool.find(c => c.id === id)).filter(Boolean);
  if (!pick.length) while (pick.length < 3 && pool.length) pick.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  G.cardOffer = pick.map(c => c.id);
  cardPanel.querySelector('.sub').textContent = `제${G.wave}파를 막아냈습니다! 하나만 고르세요 · 다음 해적은 Lv.${pirateLevel(G.wave + 1)}`;
  const box = cardPanel.querySelector('.cards'); box.innerHTML = '';
  for (const c of pick) {
    const b = document.createElement('button'); b.className = 'card';
    b.innerHTML = `<div class="ic">${c.icon}</div><div><b>${c.name}</b><span>${c.desc}</span></div><div class="lv">${ck(c.id) ? 'Lv.' + ck(c.id) + ' → ' + (ck(c.id) + 1) : '새 카드'}</div>`;
    b.onclick = () => takeCard(c);
    box.appendChild(b);
  }
  cardPanel.hidden = false; paused = true; save();
}
function takeCard(c) {
  if (cardPanel.hidden || !G.cardOffer?.includes(c.id) || ck(c.id) >= c.max) return;
  G.cards[c.id] = ck(c.id) + 1; G.cardOffer = null;
  if (c.id === 'villageHp') { if (isHeroAvailable()) { player.hp = heroMaxHp(); snapshotHero(); } G.hp = hpMax(); for (const w of workers) w.hp = crewHpMax(); for (const s of soldiers) s.hp = 12; }
  if (c.id === 'bag') cap += 5;
  cardPanel.hidden = true; paused = false; last = performance.now();
  toast(`${c.icon} ${c.name} 획득!`); save();
}

// 저장 호환용 유형 ID는 유지하되 일반·강습·돌격·정예 검병 모두 근접전을 수행합니다.
const PIRATE_TYPES = {
  bomber: { from: 2, chance: 0.25, hp: 0.6, intro: '⚔️ 강습 검병 등장! 빠르게 선원에게 달려듭니다' },
  thief: { from: 3, chance: 0.22, hp: 0.75, intro: '⚔️ 돌격 검병 등장! 일꾼을 향해 달려듭니다' },
  sniper: { from: 4, chance: 0.22, hp: 0.8, intro: '⚔️ 정예 검병 등장! 갑판에서 선원과 맞붙습니다' },
};
function pickPirateType() {
  const forecast = raidPlan(G.wave).type;
  if (forecast !== 'normal' && pirateLevel() >= (PIRATE_TYPES[forecast]?.from || Infinity) && Math.random() < 0.65) return forecast;
  const r = Math.random(); let acc = 0;
  for (const [k, t] of Object.entries(PIRATE_TYPES)) { if (pirateLevel() < t.from) continue; acc += t.chance; if (r < acc) return k; }
  return 'normal';
}
function setupBoarder(e) {
  e.level = pirateLevel(); e.type = pickPirateType(); e.home = { x: e.x, y: e.y };
  const t = PIRATE_TYPES[e.type];
  if (t) {
    e.hp = e.max = Math.max(1, Math.round(e.hp * t.hp));
    G.seenTypes = G.seenTypes || {};
    if (!G.seenTypes[e.type]) { G.seenTypes[e.type] = 1; toast(t.intro); }
  }
  e.hp *= PIRATE_BALANCE.health; e.max *= PIRATE_BALANCE.health;
}
function nearestCrew(e, range) {
  let foe = null, fd = range;
  for (const s of [...soldiers, ...workers, ...(isHeroAvailable() ? [player] : [])]) { if (s.hp <= 0 || s.dead) continue; const d = dist(e.x, e.y, s.x, s.y); if (d < fd) { fd = d; foe = s; } }
  return foe;
}
function updateBoarder(e, dt) { updateSwordBoarder(e, dt); }

// 해적 Lv.5·10·15마다 보스선에서 상어 대장이 직접 상륙합니다.
function spawnBoss() {
  if (!bossDueNextRaid(G.wave)) return false;
  const level = pirateLevel();
  G.lastBossLevel = level;
  const a = rnd(0, 6.28), r = raftC.r + 16;
  const hp = normalPirateShipHp(level) * BOSS_POWER_MULTIPLIER;
  enemies.push({ x: raftC.x + Math.cos(a) * r, y: raftC.y + Math.sin(a) * r, hp, max: hp, level, big: true, boss: true, state: 'approach', fireT: 2, bob: 0, sinkT: 0, ang: 0, salvoT: 4, summonT: 6 });
  setTimeout(() => toast(`☠️ 보스 침공! 상어 대장 Lv.${level} · 체력·공격력 5배`), 1600);
  return enemies[enemies.length - 1];
}

function spawnBossBoarder(ship) {
  if (!ship?.boss || ship.kind === 'boarder' || ship.bossBoarded || G.bossBoardedWave === G.wave) return;
  ship.bossBoarded = true; G.bossBoardedWave = G.wave;
  const level = ship.level || pirateLevel();
  const p = shorePoint(ship.x, ship.y), hp = normalPirateHp(level) * BOSS_POWER_MULTIPLIER;
  enemies.push({ kind:'boarder', boss:true, champion:true, type:'boss', x:p.x, y:p.y,
    hp, max:hp, level, attackMul:BOSS_POWER_MULTIPLIER, state:'walk', atkT:1.1, bob:0, vx:0, vy:0, sinkT:0,
    ang:0, ph:0.1, home:{x:p.x,y:p.y}, goal:{x:p.x,y:p.y} });
  dust(p.x,p.y,14); toast('☠️ 상어 대장 상륙! 선장과 선원이 함께 맞서 싸우세요');
}
function bossTick(e, dt) {
  // 보스도 포격·약탈 대신 상륙 병력을 보내 갑판 전투를 벌입니다.
  e.landingBudget = 8;
}
function bossHud() {
  const b = enemies.find(e => e.champion && alive(e)) || enemies.find(e => e.boss && !e.bossBoarded && alive(e));
  bossBar.hidden = !b; document.body.classList.toggle('has-boss', !!b);
  if (!b) return;
  bossBar.querySelector('.nm').textContent = `☠️ ${b.champion ? '상어 대장' : '보스선 접근 중'} Lv.${b.level || pirateLevel()} · ${Math.ceil(b.hp)}/${b.max}`;
  bossBar.querySelector('.fill').style.width = `${Math.max(0, b.hp / b.max) * 100}%`;
}
