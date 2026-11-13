/* ---------- 섬 정착(챕터): 섬마다 미션 → 섬의 주인(최종 보스) → 다음 섬으로 출항 ----------
 * - 지금 뗏목 마을이 정박한 섬이 '현재 섬'입니다. 섬마다 미션을 모두 끝내야 섬의 주인에게 도전할 수 있습니다.
 * - 섬의 주인을 쓰러뜨려야 다음 섬으로 출항할 수 있고, 새 섬에서는 건물·일꾼을 처음부터 다시 짓고 모읍니다.
 * - 선장(레벨·훈련)·강화 카드·원정 보상·해적 레벨은 함께 갑니다. 돈은 일부(30%, 최대 $3,000)만 싣고 갑니다.
 * - 5번째 섬 뒤에는 '끝없는 바다' 섬이 계속 이어지며 미션과 보스가 점점 강해집니다.
 */
const CHAPTER_ISLANDS = [
  { name: '잊힌 해초섬', icon: '🌿', boss: '해초섬의 주인 · 늪지 상어', power: 1.0, sky: 0x8fd8ef, water: 0x28aacd },
  { name: '안개 산호섬', icon: '🪸', boss: '산호섬의 주인 · 안개 상어', power: 1.25, sky: 0xb7d6e2, water: 0x2f9fb4 },
  { name: '폭풍 바위섬', icon: '⛈', boss: '바위섬의 주인 · 폭풍 상어', power: 1.5, sky: 0x98b4c8, water: 0x2d7fa0 },
  { name: '화산 거북섬', icon: '🌋', boss: '거북섬의 주인 · 용암 상어', power: 1.8, sky: 0xe3b79a, water: 0x2f8a9a },
  { name: '해적 요새섬', icon: '🏴‍☠️', boss: '해적왕 · 강철 상어', power: 2.2, sky: 0xa9b6d6, water: 0x245f8c },
];
const CHAPTER_CARRY_SHARE = 0.3, CHAPTER_CARRY_MAX = 3000;
const chapterNo = () => Math.max(1, Math.floor(G?.chapter || 1));
function chapterIsland(n = chapterNo()) {
  if (n <= CHAPTER_ISLANDS.length) return CHAPTER_ISLANDS[n - 1];
  const loop = n - CHAPTER_ISLANDS.length, base = CHAPTER_ISLANDS[(loop - 1) % CHAPTER_ISLANDS.length];
  return { ...base, name: `끝없는 바다 ${loop} · ${base.name}`, icon: '🌊', boss: `심연의 ${base.boss}`, power: 2.2 + 0.4 * loop };
}
// 섬마다 미션(현재 섬에 도착한 뒤 기준). 뒤 섬일수록 목표가 커집니다.
function chapterMissions(n = chapterNo()) {
  const k = Math.min(n, 8) - 1, base = G.chapterBase || {};
  const builtCount = () => PADS.filter(p => unlocked.has(p.id)).length;
  const maxStar = () => Math.max(1, ...Object.keys(UPG).filter(id => DEFS[id] && unlocked.has(id)).map(id => slv(id)));
  const reward = n <= ISLANDS.length ? ISLANDS[n - 1].reward : null;
  const list = [
    { id: 'build', text: '🏗 시설 짓기', need: [6, 9, 11, 13, 15, 16, 17, 18][k], have: builtCount() },
    { id: 'crew', text: '👷 일꾼 모으기', need: [6, 7, 8, 10, 12, 12, 13, 14][k], have: aliveWorkers() },
    { id: 'defend', text: '🛡 이 섬에서 습격 막기', need: [3, 4, 5, 5, 6, 6, 7, 7][k], have: (G.defended || 0) - (base.defended || 0) },
    { id: 'sell', text: '🛒 이 섬에서 물건 팔기', need: [40, 80, 120, 160, 200, 240, 280, 320][k], have: (G.stats?.sold || 0) - (base.sold || 0) },
    { id: 'star', text: '⭐ 시설 하나를 별 단계로', need: [2, 3, 4, 5, 6, 7, 8, 9][k], have: maxStar() },
  ];
  // 섬 탐사: 1~5번째 섬은 같은 이름의 섬 원정을 성공해야 합니다(이미 성공했다면 완료).
  if (reward) list.push({ id: 'explore', text: `🧭 ${ISLANDS[n - 1].name} 탐사 원정 성공`, need: 1, have: G.expedition?.rewards?.[reward] ? 1 : 0 });
  for (const m of list) m.done = m.have >= m.need;
  return list;
}
const chapterMissionsDone = () => chapterMissions().every(m => m.done);

// 원래 하늘·바다 색(섬마다 살짝 다른 분위기)
const CHAPTER_BASE_SKY = SKY_DAY.clone(), CHAPTER_BASE_WATER = WATER_DAY.clone();
function applyChapterTheme() {
  const isl = chapterIsland();
  SKY_DAY.copy(CHAPTER_BASE_SKY).lerp(new THREE.Color(isl.sky), 0.75);
  WATER_DAY.copy(CHAPTER_BASE_WATER).lerp(new THREE.Color(isl.water), 0.75);
}
function initializeChapterState() {
  G.chapter = chapterNo();
  if (!G.chapterBase || typeof G.chapterBase !== 'object') G.chapterBase = { defended: G.defended || 0, sold: G.stats?.sold || 0 };
  G.chapterBossDone = !!G.chapterBossDone;
  G.chapterBossRaid = !!G.chapterBossRaid && !!G.combat?.raidOn;
  applyChapterTheme();
}
// 판매가: 뒤 섬일수록 조금씩 비싸게 팔려 처음부터 다시 짓는 속도를 돕습니다(섬마다 +10%).
const chapterSaleMul = () => 1 + 0.1 * (chapterNo() - 1);

// ---------- 섬의 주인(최종 보스) ----------
function chapterBossReady() { return !G.chapterBossDone && chapterMissionsDone(); }
function startChapterBoss() {
  if (!chapterBossReady() || raidOn || !isHeroAvailable() || expeditionBusy()) return false;
  const isl = chapterIsland();
  G.chapterBossRaid = true; G.scoutRaid = false;
  startRaid(); raidOn = true;
  const level = pirateLevel(), a = rnd(0, 6.28), r = raftC.r + 16;
  const hp = Math.round(normalPirateShipHp(level) * BOSS_POWER_MULTIPLIER * isl.power);
  enemies.push({ x: raftC.x + Math.cos(a) * r, y: raftC.y + Math.sin(a) * r, hp, max: hp, level, big: true, boss: true,
    chapterBoss: true, bossPower: isl.power, bossName: isl.boss, state: 'approach', fireT: 2, bob: 0, sinkT: 0, ang: 0, salvoT: 4, summonT: 6 });
  toast(`⚔️ ${isl.boss} 출현! 쓰러뜨려야 다음 섬으로 갈 수 있어요`, 3);
  closeChapterPanel(); save();
  return true;
}
// 습격이 끝날 때(assemble3d.py에서 연결): 섬의 주인 습격이었다면 승패를 정리합니다.
function chapterRaidEnded(wasLooted) {
  if (!G.chapterBossRaid) return;
  G.chapterBossRaid = false;
  if (wasLooted) { toast(`💥 ${chapterIsland().boss}에게 밀렸어요 · 정비하고 섬 미션 창에서 다시 도전하세요`, 3); return; }
  G.chapterBossDone = true;
  G.money += 300 * chapterNo();
  toast(`🏆 ${chapterIsland().boss} 격파! 보상 $${300 * chapterNo()} · 섬 미션 창에서 다음 섬으로 출항하세요`, 3);
  save();
}

// ---------- 다음 섬으로 출항 ----------
function sailToNextIsland() {
  if (!G.chapterBossDone || raidOn || expeditionBusy()) return false;
  const next = chapterNo() + 1, carry = Math.min(CHAPTER_CARRY_MAX, Math.floor(Math.max(0, G.money) * CHAPTER_CARRY_SHARE));
  if (!window.confirm(`⛵ ${chapterIsland(next).name}(으)로 출항할까요?\n\n· 건물과 일꾼은 이 섬에 두고 가요. 새 섬에서 처음부터 다시 짓고 모읍니다.\n· 선장(레벨·훈련)·강화 카드·원정 보상·해적 레벨은 함께 가요.\n· 돈은 30%($${fmt(carry)})를 싣고 가고, 정착 지원금 $${fmt(150 * next)}을 받아요.`)) return false;
  const keep = ['hero', 'training', 'trainingLegacy', 'trainingRule', 'cards', 'wave', 'lastBossLevel', 'pirateProgressVersion', 'expedition',
    'expeditionWon', 'tavern', 'stats', 'level', 'xp', 'uiSeen', 'defended', 'qi', 'qBase', 'bossBoardedWave', 'cardOffer'];
  const d = freshState();
  for (const k of keep) if (G[k] !== undefined) d[k] = JSON.parse(JSON.stringify(G[k]));
  d.money = carry + 150 * next;
  d.chapter = next; d.chapterBase = { defended: G.defended || 0, sold: G.stats?.sold || 0 }; d.chapterBossDone = false; d.chapterBossRaid = false;
  d.raidT = RAID_INTERVAL;
  if (d.expedition) { d.expedition.phase = 'idle'; d.expedition.run = null; d.expedition.result = null; }
  build(d);
  paused = false; document.getElementById('helpPanel').hidden = true;
  closeChapterPanel(); save();
  toast(`${chapterIsland().icon} ${chapterIsland().name} 도착! 새 섬에서 마을을 다시 일구세요`, 3);
  return true;
}

// ---------- 섬 미션 버튼과 창 ----------
const chapterStyle = document.createElement('style');
chapterStyle.textContent = `
#chapterBtn{position:fixed;left:10px;bottom:calc(194px + env(safe-area-inset-bottom,0px));z-index:6;min-height:48px;max-width:46vw;padding:6px 10px;border:2px solid #3f6c86;border-radius:12px;background:#e6f6ff;color:#22465a;font:15px/1.2 var(--display);text-align:left}
#chapterBtn small{display:block;font:12px/1.2 var(--body);opacity:.85}
#chapterBtn.ready{background:#ffe9a8;border-color:#a8742a;color:#5a3a12;animation:chapterPulse 1.4s ease-in-out infinite}
@keyframes chapterPulse{50%{transform:scale(1.05)}}
#chapterPanel ul{list-style:none;padding:0;margin:10px 0}#chapterPanel li{display:flex;justify-content:space-between;gap:8px;padding:7px 4px;border-bottom:1px dashed #d8c9a4;font-size:15px}
#chapterPanel li.done{color:#3e7a3a}#chapterPanel .acts{display:flex;flex-direction:column;gap:8px;margin-top:12px}
#chapterPanel button{min-height:46px;font-size:16px;border-radius:12px;border:2px solid #536271;background:#fff1c7;color:#354650}
#chapterPanel button.go{background:#ffd56a;border-color:#a8742a;font-weight:bold}#chapterPanel button:disabled{opacity:.5}
@media(max-height:500px) and (orientation:landscape){#chapterBtn{bottom:calc(10px + env(safe-area-inset-bottom,0px));left:calc(110px + env(safe-area-inset-left,0px))}}
`;
document.head.appendChild(chapterStyle);
const chapterButton = document.createElement('button');
chapterButton.id = 'chapterBtn'; chapterButton.type = 'button'; chapterButton.hidden = true;
document.body.appendChild(chapterButton);
const chapterPanel = document.createElement('div');
chapterPanel.id = 'chapterPanel'; chapterPanel.className = 'panel'; chapterPanel.hidden = true;
chapterPanel.setAttribute('role', 'dialog'); chapterPanel.setAttribute('aria-modal', 'true'); chapterPanel.setAttribute('aria-label', '섬 미션');
document.body.appendChild(chapterPanel);
let chapterButtonKey = '';
function chapterHud() {
  if (!G) return;
  const missions = chapterMissions(), done = missions.filter(m => m.done).length, isl = chapterIsland();
  const state = G.chapterBossDone ? 'sail' : done === missions.length ? 'boss' : 'missions';
  const key = [chapterNo(), done, missions.length, state].join('|');
  chapterButton.classList.toggle('ready', state !== 'missions');
  if (key === chapterButtonKey) return;
  chapterButtonKey = key;
  chapterButton.innerHTML = `${isl.icon} ${chapterNo()}번째 섬<small>${state === 'sail' ? '⛵ 다음 섬으로 출항!' : state === 'boss' ? '⚔️ 섬의 주인 도전!' : `미션 ${done}/${missions.length}`}</small>`;
  chapterButton.setAttribute('aria-label', `${isl.name} 섬 미션 ${done}/${missions.length}`);
}
function renderChapterPanel() {
  const isl = chapterIsland(), missions = chapterMissions(), ready = chapterBossReady();
  const why = raidOn ? '습격 중에는 도전·출항할 수 없어요.' : !isHeroAvailable() ? '선장이 회복한 뒤 도전하세요.' : '';
  chapterPanel.innerHTML = `<div><h2>${isl.icon} ${chapterNo()}번째 섬 · ${isl.name}</h2>
    <p>미션을 모두 끝내면 <b>${isl.boss}</b>에게 도전할 수 있어요. 섬의 주인을 쓰러뜨려야 다음 섬으로 출항합니다.</p>
    <ul>${missions.map(m => `<li class="${m.done ? 'done' : ''}"><span>${m.done ? '✅' : '⬜'} ${m.text}</span><b>${fmt(Math.min(m.have, m.need))}/${fmt(m.need)}</b></li>`).join('')}
    <li class="${G.chapterBossDone ? 'done' : ''}"><span>${G.chapterBossDone ? '✅' : '⬜'} ⚔️ 섬의 주인 격파</span><b>${G.chapterBossDone ? '완료' : ready ? '도전 가능' : '미션 먼저'}</b></li></ul>
    <p id="chapterNote" role="status">${why}</p>
    <div class="acts">
      ${G.chapterBossDone ? `<button class="go" id="chapterSail" ${raidOn ? 'disabled' : ''}>⛵ ${chapterIsland(chapterNo() + 1).name}(으)로 출항</button>`
        : `<button class="go" id="chapterBoss" ${!ready || why ? 'disabled' : ''}>⚔️ 섬의 주인 도전</button>`}
      <button id="chapterClose">닫기</button>
    </div></div>`;
  document.getElementById('chapterClose').onclick = closeChapterPanel;
  document.getElementById('chapterBoss')?.addEventListener('click', startChapterBoss);
  document.getElementById('chapterSail')?.addEventListener('click', sailToNextIsland);
}
function openChapterPanel() { clearMovementInput(); renderChapterPanel(); chapterPanel.hidden = false; chapterPanel.querySelector('button:not(:disabled)')?.focus(); }
function closeChapterPanel() { chapterPanel.hidden = true; chapterButton.focus({ preventScroll: true }); }
chapterButton.onclick = openChapterPanel;
window.addEventListener('keydown', ev => { if (!chapterPanel.hidden && ev.key === 'Escape') { ev.preventDefault(); closeChapterPanel(); } });
