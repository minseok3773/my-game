/* ---------- 3D 전용 재미 요소: 강화 카드 · 해적 종류 · 보스 ---------- */
// 습격을 막을 때마다 카드 3장 중 1장을 골라 판마다 다르게 성장
const CARDS = [
  { id: 'smuggler', icon: '🏴‍☠️', name: '밀수 항로', desc: '판매가 +35% · 이후 습격 준비 시간 -6초 (최소 12초)', max: 2 },
  { id: 'glass', icon: '🔥', name: '과충전 포탄', desc: '포탑 피해 +60% · 마을이 받는 피해 +20%', max: 2 },
  { id: 'bunker', icon: '⚓', name: '요새 경제', desc: '마을이 받는 피해 -20% · 판매가 -15%', max: 2 },
  { id: 'towerDmg', icon: '🎯', name: '포탑 화력', desc: '포탑 피해 +30%', max: 5 },
  { id: 'towerRate', icon: '⚡', name: '포탑 연사', desc: '포탑 발사 속도 +25%', max: 4 },
  { id: 'towerDouble', icon: '💥', name: '2연발 포탄', desc: '포탑이 한 번에 두 발 발사', max: 1, need: () => TOWERS.some(t => unlocked.has(t)) },
  { id: 'crewPower', icon: '⚔️', name: '선원 훈련', desc: '선원·해군 공격력 +40%', max: 5 },
  { id: 'crewHp', icon: '🛡️', name: '튼튼한 선원', desc: '선원 체력 +50%', max: 4 },
  { id: 'playerGun', icon: '🔫', name: '왕물총', desc: '주인공 물총 피해 ×3, 사거리 +1', max: 3 },
  { id: 'price', icon: '🐟', name: '흥정 달인', desc: '모든 판매가 +20%', max: 5 },
  { id: 'speed', icon: '👟', name: '날쌘 발', desc: '주인공 이동 속도 +15%', max: 3 },
  { id: 'villageHp', icon: '🏰', name: '성벽 보강', desc: '마을 체력 +50, 즉시 전부 회복', max: 6 },
  { id: 'regen', icon: '💚', name: '응급 수리', desc: '마을 체력 회복 속도 ×3', max: 2 },
  { id: 'loot', icon: '💰', name: '현상금 사냥', desc: '해적 처치 보상 +50%', max: 4 },
  { id: 'bag', icon: '🎒', name: '큰 주머니', desc: '가방 칸 +5', max: 4 },
];
function ck(id) { return (G && G.cards && G.cards[id]) || 0; }
const lootMul = () => 1 + 0.5 * ck('loot');
const crewHpMax = () => Math.round(15 * (1 + 0.5 * ck('crewHp')));
const crewMul = () => 1 + 0.4 * ck('crewPower');

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
  cardPanel.querySelector('.sub').textContent = `제${G.wave}파를 막아냈습니다! 하나만 고르세요 · 다음 해적은 Lv.${G.wave + 1}`;
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
  if (c.id === 'villageHp') G.hp = hpMax();
  if (c.id === 'bag') cap += 5;
  cardPanel.hidden = true; paused = false; last = performance.now();
  toast(`${c.icon} ${c.name} 획득!`); save();
}

// 상륙 해적 종류: 일반 · 폭탄(시설에 닿으면 폭발) · 도둑(돈을 훔쳐 배로 도망) · 저격(멀리서 선원을 쏨)
const PIRATE_TYPES = {
  bomber: { from: 2, chance: 0.25, hp: 0.6, intro: '💣 폭탄 해적 등장! 시설에 닿으면 폭발하니 먼저 쓰러뜨리세요' },
  thief: { from: 3, chance: 0.22, hp: 0.75, intro: '💰 도둑 해적 등장! 돈을 훔쳐 배로 도망갑니다. 쫓아가 잡으면 돌려받아요' },
  sniper: { from: 4, chance: 0.22, hp: 0.8, intro: '🎯 저격 해적 등장! 멀리서 선원을 노립니다' },
};
function pickPirateType() {
  const forecast = raidPlan(G.wave).type;
  if (forecast !== 'normal' && Math.random() < 0.65) return forecast;
  const r = Math.random(); let acc = 0;
  for (const [k, t] of Object.entries(PIRATE_TYPES)) { if (G.wave < t.from) continue; acc += t.chance; if (r < acc) return k; }
  return 'normal';
}
function setupBoarder(e) {
  e.type = pickPirateType(); e.home = { x: e.x, y: e.y };
  const t = PIRATE_TYPES[e.type];
  if (t) {
    e.hp = e.max = Math.max(1, Math.round(e.hp * t.hp));
    G.seenTypes = G.seenTypes || {};
    if (!G.seenTypes[e.type]) { G.seenTypes[e.type] = 1; toast(t.intro); }
  }
}
function nearestCrew(e, range) {
  let foe = null, fd = range;
  for (const s of [...soldiers, ...workers]) { const d = dist(e.x, e.y, s.x, s.y); if (d < fd) { fd = d; foe = s; } }
  return foe;
}
function updateBoarder(e, dt) {
  if (e.type === 'bomber') return updateBomber(e, dt);
  if (e.type === 'thief') return updateThief(e, dt);
  if (e.type === 'sniper') return updateSniper(e, dt);
  updateBoarderBase(e, dt);
}
function updateBomber(e, dt) {
  const crew = nearestCrew(e, 0.8), tgt = e.goal, d = dist(e.x, e.y, tgt.x, tgt.y);
  e.fighting = false;
  if (!crew && d > 0.8) { moveTo(e, tgt.x, tgt.y, 2.3, dt, null, true); return; }
  // 펑!
  const dmg = 12 * pirMul();
  for (const s of [...soldiers, ...workers]) if (dist(e.x, e.y, s.x, s.y) < 1.8) { s.hp = (s.hp ?? crewHpMax()) - 6 * pirMul(); if (s.hp <= 0) killCrew(s); }
  hitVillage({ dmg, x1: e.x, y1: e.y });
  for (let i = 0; i < 4; i++) booms.push({ x: e.x + rnd(-0.6, 0.6), y: e.y + rnd(-0.6, 0.6), t: rnd(0, 0.2), kind: 'fire' });
  shake = Math.max(shake, 0.4); dust(e.x, e.y, 14); floatText(e.x, e.y, `💥 폭발 -${Math.round(dmg)}`, '#ffb070');
  e.state = 'sink'; e.sinkT = 1.2; e.blown = true;
}
function updateThief(e, dt) {
  e.fighting = false;
  if (!e.loot) {
    const tgt = e.goal;
    if (dist(e.x, e.y, tgt.x, tgt.y) > 0.7) { moveTo(e, tgt.x, tgt.y, 2.4, dt, null, true); return; }
    const amt = Math.min(G.money, Math.round(15 * pirMul() + G.money * 0.12));
    if (amt <= 0) { e.type = 'normal'; return; }
    G.money -= amt; e.loot = amt;
    floatText(e.x, e.y, `💰 도둑맞음 -$${fmt(amt)}`, '#ff9a8a'); toast(`💰 도둑 해적이 $${fmt(amt)}를 훔쳐 달아납니다! 잡으세요`);
    return;
  }
  const h = e.home;
  if (dist(e.x, e.y, h.x, h.y) > 0.5) { moveTo(e, h.x, h.y, 2.1, dt, null, true); return; }
  floatText(e.x, e.y, `도둑이 $${fmt(e.loot)}를 갖고 도망쳤습니다`, '#ffb0a0');
  e.loot = 0; const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
}
function updateSniper(e, dt) {
  const foe = nearestCrew(e, 6.5), tgt = foe || e.goal, d = dist(e.x, e.y, tgt.x, tgt.y);
  e.fighting = false; e.aimYaw = Math.atan2(tgt.x - e.x, tgt.y - e.y);
  if (d > (foe ? 4.2 : 3.5)) { moveTo(e, tgt.x, tgt.y, 1.6, dt, null, true); return; }
  stopMove(e, dt);
  e.atkT -= dt; if (e.atkT > 0) return; e.atkT = 1.7;
  shoot(e, { x: tgt.x, y: tgt.y }, 'enemy', 2 * pirMul(), 0.35, 6, 30);
  if (foe) { foe.hp = (foe.hp ?? crewHpMax()) - 3 * pirMul(); if (foe.hp <= 0) killCrew(foe); }
}

// 5번째 습격마다 해골 선장 보스선: 일제 사격 + 졸개 소환
function spawnBoss() {
  const a = rnd(0, 6.28), r = raftC.r + 16;
  const hp = Math.round(10 * (12 + G.wave * 5) * pirMul());
  enemies.push({ x: raftC.x + Math.cos(a) * r, y: raftC.y + Math.sin(a) * r, hp, max: hp, big: true, boss: true, state: 'approach', fireT: 2, bob: 0, sinkT: 0, ang: 0, salvoT: 4, summonT: 6 });
  setTimeout(() => toast(`☠️ 보스 등장! 해골 선장 Lv.${G.wave}의 거대 해적선`), 1600);
}
function bossTick(e, dt) {
  e.salvoT -= dt; e.summonT -= dt;
  if (e.salvoT <= 0) {
    e.salvoT = 7;
    const p = shorePoint(e.x, e.y);
    for (let i = 0; i < 6; i++) {
      const t = { x: p.x + rnd(-3, 3), y: p.y + rnd(-3, 3) };
      shoot(e, walkable(t.x, t.y) ? t : p, 'enemy', 5 * pirMul(), 1.0 + i * 0.12, 80, 14);
    }
    floatText(e.x, e.y, '💥 일제 사격!', '#ffb070'); shake = Math.max(shake, 0.2);
  }
  if (e.summonT <= 0) { e.summonT = 9; spawnBoarder(e); spawnBoarder(e); }
}
function bossHud() {
  const b = enemies.find(e => e.boss && alive(e));
  bossBar.hidden = !b;
  if (!b) return;
  bossBar.querySelector('.nm').textContent = `☠️ 해골 선장 Lv.${G.wave} · ${Math.ceil(b.hp)}/${b.max}`;
  bossBar.querySelector('.fill').style.width = `${Math.max(0, b.hp / b.max) * 100}%`;
}
