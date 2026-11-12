/* ---------- 주인공 기술과 특수 습격 ----------
 * 1) 🌀 회전 베기: 습격 중 버튼(또는 Space·E)을 누르면 주변 해적을 크게 베고 밀쳐냄. 재사용 8초.
 * 2) 특수 습격: 해적 Lv.6부터 습격의 40%가 특수 습격.
 *    🌩 폭풍: 해적 이동 +30%, 비와 어두운 하늘
 *    🐙 바다 괴물: 뗏목 가장자리에 촉수 3개가 솟아 가까운 아군을 내려침 (촉수를 베어야 습격 종료)
 */
const SKILL_COOLDOWN = 8, SKILL_RADIUS = 2.4, SKILL_POWER = 2.5;
const RAID_EVENT_FROM = 6, RAID_EVENT_CHANCE = 0.4;
const RAID_EVENTS = {
  storm: { name: '🌩 폭풍 습격', intro: '🌩 폭풍 습격! 비바람을 타고 해적이 30% 빠르게 몰려옵니다' },
  kraken: { name: '🐙 바다 괴물', intro: '🐙 바다 괴물 출현! 뗏목 가장자리의 촉수를 베어 내세요' },
};
const stormMul = () => (raidOn && G.raidEvent === 'storm') ? 1.3 : 1;

// ---------- 회전 베기 버튼 ----------
const skillStyle = document.createElement('style');
skillStyle.textContent = `
#skillBtn{position:fixed;right:12px;bottom:calc(262px + env(safe-area-inset-bottom,0px));z-index:9;width:76px;height:76px;border-radius:50%;border:3px solid #fff3c4;
 background:radial-gradient(circle at 35% 30%,#ffd56a,#f08a2c);color:#4a2a0c;font:bold 13px/1.15 sans-serif;box-shadow:0 4px 0 #a5521b,0 6px 14px #0004;padding:0;touch-action:manipulation}
#skillBtn .ic{display:block;font-size:26px;line-height:1}
#skillBtn:disabled{filter:grayscale(.7) brightness(.85);box-shadow:0 2px 0 #7b5a3c}
#skillBtn .cd{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;background:#0006;color:#fff;font:bold 22px sans-serif}
#skillBtn:focus-visible{outline:3px solid #fff;outline-offset:3px}
#raidEventBadge{position:fixed;left:50%;top:calc(126px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:6;padding:5px 12px;border-radius:999px;
 background:#2b2350e6;color:#fff;font:bold 14px sans-serif;border:2px solid #f2d16b;pointer-events:none;white-space:nowrap}
`;
document.head.appendChild(skillStyle);
const skillBtn = document.createElement('button');
skillBtn.id = 'skillBtn'; skillBtn.type = 'button'; skillBtn.hidden = true;
skillBtn.setAttribute('aria-label', '회전 베기 기술 사용');
skillBtn.innerHTML = '<span class="ic">🌀</span>회전<br>베기<span class="cd" hidden></span>';
document.body.appendChild(skillBtn);
const raidEventBadge = document.createElement('div');
raidEventBadge.id = 'raidEventBadge'; raidEventBadge.hidden = true; document.body.appendChild(raidEventBadge);

function skillReady() { return raidOn && isHeroAvailable() && !paused && (G.skillCd || 0) <= 0; }
function useHeroSkill() {
  if (!skillReady()) return false;
  G.skillCd = SKILL_COOLDOWN;
  player.swingT = 0.5;
  const dmg = heroAttack() * SKILL_POWER;
  let hits = 0;
  for (const e of [...enemies]) {
    if (e.kind !== 'boarder' || !alive(e)) continue;
    const d = dist(player.x, player.y, e.x, e.y);
    if (d > SKILL_RADIUS) continue;
    hits++;
    swordStrike(player, e, dmg);
    if (e.type !== 'tentacle' && d > 0.01) { // 밀쳐내기
      const nx = e.x + (e.x - player.x) / d * 1.3, ny = e.y + (e.y - player.y) / d * 1.3;
      if (walkable(nx, ny)) { e.x = nx; e.y = ny; }
      e.atkT = Math.max(e.atkT || 0, 0.9);
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    booms.push({ x: player.x + Math.cos(a) * SKILL_RADIUS * 0.8, y: player.y + Math.sin(a) * SKILL_RADIUS * 0.8, t: i * 0.02, kind: 'water' });
  }
  shake = Math.max(shake, 0.3);
  floatText(player.x, player.y, hits ? `🌀 회전 베기 ×${hits}` : '🌀 회전 베기', '#ffe28a');
  return true;
}
skillBtn.onclick = () => useHeroSkill();
window.addEventListener('keydown', ev => {
  if (ev.repeat || ev.ctrlKey || ev.metaKey) return;
  const k = ev.key.toLowerCase();
  if ((k === ' ' || k === 'e') && raidOn && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'SELECT') {
    if (document.activeElement && document.activeElement !== document.body && document.activeElement !== skillBtn && k === ' ') return;
    if (useHeroSkill()) ev.preventDefault();
  }
});

// ---------- 특수 습격 ----------
function startRaidEvent() {
  G.raidEvent = null;
  if (pirateLevel() < RAID_EVENT_FROM || Math.random() >= RAID_EVENT_CHANCE) return;
  const type = G.lastRaidEvent === 'storm' ? 'kraken' : G.lastRaidEvent === 'kraken' ? 'storm' : (Math.random() < 0.5 ? 'storm' : 'kraken');
  G.raidEvent = type; G.lastRaidEvent = type;
  toast(RAID_EVENTS[type].intro);
  if (type === 'kraken') spawnTentacles();
}
function spawnTentacles() {
  const base = Math.random() * Math.PI * 2, level = pirateLevel();
  for (let i = 0; i < 3; i++) {
    const a = base + i * (Math.PI * 2 / 3);
    const p = shorePoint(raftC.x + Math.cos(a) * 40, raftC.y + Math.sin(a) * 40);
    const hp = Math.round(normalPirateHp(level) * 3);
    enemies.push({ kind: 'boarder', type: 'tentacle', x: p.x, y: p.y, hp, max: hp, level, state: 'walk', atkT: 2, bob: 0,
      vx: 0, vy: 0, sinkT: 0, ang: 0, ph: Math.random() * 6, goal: { x: p.x, y: p.y }, home: { x: p.x, y: p.y } });
    dust(p.x, p.y, 12);
  }
}
// 촉수: 움직이지 않고, 가까운 아군 주변을 크게 내려침
function updateTentacle(e, dt) {
  e.fighting = false;
  const foe = nearestCrew(e, 2.2);
  if (!foe) return;
  e.aimYaw = Math.atan2(foe.x - e.x, foe.y - e.y); e.fighting = true;
  e.atkT = (e.atkT ?? 1.6) - dt;
  if (e.atkT > 0) return;
  e.atkT = 1.8; e.swingT = 0.5;
  for (const u of [...soldiers, ...workers, ...(isHeroAvailable() ? [player] : [])]) {
    if (u.hp <= 0 || u.dead || dist(u.x, u.y, foe.x, foe.y) > 1.4) continue;
    swordStrike(e, u, pirateAttack(e) * 1.2, true);
  }
  booms.push({ x: foe.x, y: foe.y, t: 0, kind: 'water' }); shake = Math.max(shake, 0.15);
}
function tickRaidEvents(dt) {
  G.skillCd = Math.max(0, (G.skillCd || 0) - dt);
  if (raidOn && G.raidEventWave !== G.wave) { G.raidEventWave = G.wave; startRaidEvent(); }
  if (!raidOn && G.raidEvent) G.raidEvent = null;
}
function raidEventHud() {
  const show = raidOn && isHeroAvailable() && !(typeof expeditionBusy === 'function' && expeditionBusy());
  skillBtn.hidden = !show;
  if (show) {
    const cd = Math.ceil(G.skillCd || 0), cdEl = skillBtn.querySelector('.cd');
    cdEl.hidden = cd <= 0; cdEl.textContent = cd > 0 ? cd : '';
    skillBtn.disabled = cd > 0;
  }
  raidEventBadge.hidden = !(raidOn && G.raidEvent);
  if (!raidEventBadge.hidden) raidEventBadge.textContent = RAID_EVENTS[G.raidEvent].name;
}
// 폭풍: 화면 위에 비와 어두운 하늘
function drawWeather() {
  if (!(raidOn && G.raidEvent === 'storm')) return;
  ctx.save();
  ctx.fillStyle = 'rgba(20,30,60,.22)'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(210,230,255,.55)'; ctx.lineWidth = 1.5 * Z;
  const t = G.t;
  ctx.beginPath();
  for (let i = 0; i < 90; i++) {
    const x = ((i * 97.3 + t * 420) % (W + 200)) - 100, y = ((i * 61.7 + t * 900) % (H + 100)) - 50;
    ctx.moveTo(x, y); ctx.lineTo(x - 7 * Z, y + 20 * Z);
  }
  ctx.stroke();
  ctx.restore();
}
// 촉수 모형: 보라색 마디가 이어진 원뿔, 흔들리고 내려침
function makeTentacle() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const skin = mat(0x8a4fb8, { roughness: 0.55 }), belly = mat(0xd9a2e8, { roughness: 0.6 });
  const segs = [];
  let parent = body;
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Group(); s.position.y = i === 0 ? 0 : 0.32; parent.add(s);
    const r = 0.22 * (1 - i * 0.13);
    s.add(mk(sphG(r, 12, 10), skin, true, 0, 0.16, 0));
    const sucker = mk(sphG(r * 0.42, 8, 6), belly, false, 0, 0.16, r * 0.85); sucker.scale.z = 0.4; s.add(sucker);
    segs.push(s); parent = s;
  }
  const ring = mk(new THREE.TorusGeometry(0.42, 0.06, 6, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }), false, 0, 0.05, 0);
  ring.rotation.x = Math.PI / 2; root.add(ring);
  const m = { root, body, tentacle: true, segs, ph: Math.random() * 6 };
  return attachCharacterGear(m, root);
}
function animateTentacle(m, ent, dt, st) {
  m.root.position.set(ent.x, 0, ent.y);
  const t = G.t + m.ph, slam = Math.max(0, ent.swingT || 0) / 0.5;
  if (ent.aimYaw !== undefined) m.root.rotation.y = ent.aimYaw;
  m.segs.forEach((s, i) => { s.rotation.x = Math.sin(t * 2 + i * 0.7) * 0.18 + slam * 0.32; s.rotation.z = Math.cos(t * 1.6 + i * 0.5) * 0.12; });
  const sink = st.dead ? Math.min(1, (ent.sinkT || 0) / 1.5) : 0;
  m.root.position.y = -sink * 1.6;
  m.sword.visible = false; m.rifle.visible = false; m.carry.visible = false;
}
