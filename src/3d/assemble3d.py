import re
# 저장소 맨 위에서 실행: python3 src/3d/assemble3d.py  (base.html의 게임 규칙 + 3D 모듈 → raft-village-3d.html)
# base.html은 게임 규칙·화면 UI의 바탕 파일이며, 그 안의 평면 그리기 코드는 조립할 때 빠짐
import os
import base64
import hashlib
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
src = open(os.path.join(HERE, 'base.html'), encoding='utf-8').read()
B = lambda n: open(os.path.join(HERE, n), encoding='utf-8').read()
a = src.index("<script>\n(() => {"); b = src.rindex("})();\n</script>")
head, body, tail = src[:a], src[a + len("<script>\n(() => {\n"):b], src[b:]
lines = body.split('\n')
# 최상위 블록 단위로 나누기
starts = [i for i, L in enumerate(lines) if L and not L[0].isspace() and L[0] not in '})]']
chunks = []
for k, st in enumerate(starts):
    en = starts[k + 1] if k + 1 < len(starts) else len(lines)
    chunks.append('\n'.join(lines[st:en]))
pre = '\n'.join(lines[:starts[0]])

DROP = ['function box(', 'function drawPile(', 'function drawPerson(', 'function drawKid(', 'function drawStation(', 'function drawCash(',
        'function drawTent(', 'function drawSolar(', 'function drawLighthouse(', 'function swimShape(', 'function drawDolphinJump(',
        'function drawFrontJumpers(', 'function drawSea(', 'function slabSides(', 'function drawDocks(', 'function drawRaftShadow(',
        'function line(', 'function drawRaft(', 'function drawZone(', 'function drawPad(', 'function drawBase(', 'function drawTower(',
        'function drawBoarder(', 'function soldierDraw(', 'function drawEnemy(', 'function drawShots(', 'function render(', 'function frame(',
        'function post(', 'function resize(', "window.addEventListener('resize'", 'function S(', 'function inputDir(',
        'const bloomCv', 'const cv = ', '// 후가공:']
def keep(c):
    return not any(c.startswith(d) for d in DROP)

# 2D 렌더에서 오버레이로 재사용할 부분 추출
def seg(text, start, end):
    i = text.index(start); j = text.index(end, i); return text[i:j]
r2d = src[src.index('function render() {'):]
guide = seg(r2d, "  // 안내: 목표 지점의 파동", "  return obj;\n}")
guide = '\n'.join(L for L in guide.split('\n') if 'list.sort(' not in L).replace('  drawShots();', '  drawBooms();')
p2d = src[src.index('function post() {'):]
raidfx = seg(p2d, "  // 습격 중 화면 테두리 붉은 맥박", "  ctx.restore();\n}")
d2d = src[src.index('function drawShots() {'):]
booms = seg(d2d, "  for (const b of booms) {", "\n}\n") + "\n"
cust = seg(src[src.index('function render() {'):], "      const stage = c.emote ? 0", "      list.push(")

overlay = """
/* ---------- 화면 위 2D 오버레이: 간판·가격표·말풍선·효과 ---------- */
const lights = [];
// 체력 막대 + 레벨 배지
function hpBar(x, y, z, ratio, color, w = 26, lvl) {
  const p = S(x, y, z), wd = w * Z, h = 5.5 * Z, x0 = p.x - wd / 2;
  ctx.fillStyle = 'rgba(10,12,20,.75)'; ctx.beginPath(); ctx.roundRect(x0 - 1, p.y - 1, wd + 2, h + 2, 3 * Z); ctx.fill();
  const g = ctx.createLinearGradient(0, p.y, 0, p.y + h); g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, color); g.addColorStop(1, color);
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x0, p.y, wd * Math.max(0, Math.min(1, ratio)), h, 2.5 * Z); ctx.fill();
  if (lvl) {
    const r = 8 * Z, bx0 = x0 - r * 2 - 2;
    ctx.fillStyle = '#2b2350'; ctx.strokeStyle = '#f2d16b'; ctx.lineWidth = 1.5 * Z; ctx.beginPath(); ctx.roundRect(bx0, p.y + h / 2 - r, r * 2, r * 2, 4 * Z); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = `${11 * Z}px "Do Hyeon", sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lvl, bx0 + r, p.y + h / 2 + 1);
  }
}
function drawBooms() {
""" + booms + """}
function padBadge(p, full) {
  if (!full || dist(player.x, player.y, p.x, p.y) > 1.1) return;
  const paid = G.paid[p.id] || 0, left = p.cost - paid;
  sign(`${p.icon} $${fmt(left)}`, p.x, p.y, 95, '#fffbee', '#35434a', 21);
  if (paid > 0) hpBar(p.x, p.y, 10, paid / p.cost, '#67cf48', 46);
}
function overlayWorld() {
  drawBrokenSigns();
  const n = nightAmt();
  if (n > 0) {
    const pts = [];
    for (const id of STATION_IDS) if (unlocked.has(id) && DEFS[id].type === 'shop') pts.push([S(DEFS[id].x, DEFS[id].y, 55), 70]);
    if (unlocked.has('grill')) pts.push([S(DEFS.grill.x, DEFS.grill.y, 26), 90]);
    if (unlocked.has('lighthouse')) pts.push([S(DEFS.lighthouse.x, DEFS.lighthouse.y, 142), 170]);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const [l, r] of pts) {
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r * Z);
      g.addColorStop(0, `rgba(255,200,120,${0.38 * n})`); g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g; ctx.fillRect(l.x - r * Z, l.y - r * Z, r * 2 * Z, r * 2 * Z);
    }
    ctx.restore();
  }
  for (const id of unlocked) {
    const d = DEFS[id]; if (!d || d.x === undefined) continue;
    const up = dropOff(id);
    if (d.type === 'shop' && !raidOn && dist(player.x, player.y, d.x, d.y) < 5) {
      sign(`${ICON[d.item]} $${priceOf(d)}${slv(id) > 1 ? ' ★' + slv(id) : ''}`, d.x, d.y, 83 + up, '#fffbee', '#35434a', 17);
      const c = G.st[id].cash;
      if (c > 0) sign(`$${fmt(c)}`, d.cx, d.cy, 40 + Math.ceil(Math.min(9, Math.ceil(c / 8)) / 3) * 5, 'rgba(225,255,232,.9)', '#2f7d32', 16);
    } else if ((d.type === 'producer' || d.type === 'converter') && !raidOn && dist(player.x, player.y, d.x, d.y) < 2.8) sign(`${d.name}${slv(id) > 1 ? ' ★' + slv(id) : ''}`, d.x, d.y, 70 + up, '#ffd84d');
    else if (d.type === 'base') {
      sign(`⚓ 해군 기지 ★${blv()}`, d.x, d.y, 70 + up);
      const b = G.st.base;
      if (b.food >= 3 && G.soldiers < soldierCap()) { const p = S(d.x, d.y, 54), wd = 60 * Z; ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(p.x - wd / 2, p.y, wd, 6 * Z); ctx.fillStyle = '#4fd8f0'; ctx.fillRect(p.x - wd / 2, p.y, wd * Math.min(1, trainT / 5), 6 * Z); }
    }
  }
  const vp = visiblePads();
  const badges = vp.map(p => [dist(player.x, player.y, p.x, p.y), p]).filter(a => a[0] < 4).sort((a, b) => a[0] - b[0]).slice(0, W < 600 ? 1 : 2).map(a => a[1]);
  if (!raidOn) for (const p of vp) if (dist(player.x, player.y, p.x, p.y) < 4.5) padBadge(p, badges.includes(p));
  const k = Z;
  for (const id of STATION_IDS) {
    if (!unlocked.has(id) || DEFS[id].type !== 'shop') continue;
    for (const [index, c] of [...runtime[id].queue, ...runtime[id].leaving].entries()) {
""" + cust + """      if (emote && c.alpha > 0.3 && (index < 2 || index === runtime[id].queue.length)) { const p = S(c.x, c.y, 82); bubble(p.x, p.y + Math.sin(G.t * 3 + (c.ph || 0)) * 1.5 * k, emote, k, emote === '😡' ? '#ffd9d4' : '#ffffff', emote === '😡' ? 1.2 : 0); }
    }
  }
  for (const w of workers) { const em = w.repairing ? '🔧' : w.job && w.job.cash ? '💵' : w.idle ? '💤' : null; if (em) { const p = S(w.x, w.y, 82); bubble(p.x, p.y, em, k); } }
  if (G.stack.length >= cap) { const p = S(player.x, player.y, 92); bubble(p.x, p.y, '🎒', k); }
  for (const w of workers) if ((w.hp ?? CREW_HP) < CREW_HP) hpBar(w.x, w.y, 76, w.hp / CREW_HP, '#5fd16b', 24, pirateLevel());
  for (const s of soldiers) if ((s.hp ?? 12) < 12) hpBar(s.x, s.y, 76, s.hp / 12, '#5fd16b', 24, blv());
  for (const e of enemies) {
    if (!alive(e)) continue;
    if (e.kind === 'boarder') hpBar(e.x, e.y, 74, e.hp / e.max, '#ff4d3d', 26, G.wave);
    else hpBar(e.x, e.y, e.big ? 120 : 90, e.hp / e.max, '#ff4d3d', e.big ? 50 : 36, G.wave);
  }
}
function render(dt) {
  sync3D(dt);
  renderScene();
  ctx.clearRect(0, 0, W, H);
  overlayWorld();
  const obj = objective();
""" + guide.replace('rgba(110,230,255,${', 'rgba(${raidOn ? "255,130,110" : /짓기|업그레이드/.test(obj.text) ? "255,211,114" : "110,230,220"},${') + raidfx.replace('  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);\n', '') + """  return obj;
}
let last = performance.now(), paused = false, saveT = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; frameDt = dt;
  if (!paused) { update(dt); saveT += dt; if (saveT > 2.5) { saveT = 0; save(); } }
  const obj = render(dt);
  hud(obj);
  requestAnimationFrame(frame);
}
"""
newS = """const _sp = new THREE.Vector3();
// 세계 좌표(x, y는 바닥 평면, z는 높이)를 화면 좌표로
function S(x, y, z = 0) { _sp.set(x, raftY + z / 40, y).project(camera); return { x: (_sp.x * 0.5 + 0.5) * W, y: (-_sp.y * 0.5 + 0.5) * H }; }
"""
newInput = """function inputDir() {
  let dx = 0, dy = 0;
  if (keys.has('arrowleft') || keys.has('a')) dx -= 1;
  if (keys.has('arrowright') || keys.has('d')) dx += 1;
  if (keys.has('arrowup') || keys.has('w')) dy -= 1;
  if (keys.has('arrowdown') || keys.has('s')) dy += 1;
  let mag = Math.hypot(dx, dy) ? 1 : 0;
  if (!mag && joy.on) { const m = Math.hypot(joy.dx, joy.dy); if (m > 8) { dx = joy.dx; dy = joy.dy; mag = Math.min(1, m / 50); } }
  if (!mag) return null;
  // 대각선 카메라의 오른쪽/위쪽으로 이동하도록 화면 입력을 바닥 좌표로 회전.
  const wx = dx + dy, wy = dy - dx, l = Math.hypot(wx, wy);
  return { x: wx / l * mag, y: wy / l * mag };
}
"""
out = []
for c in chunks:
    if c.startswith("const $ = id =>"):
        out.append("const cv = document.getElementById('game'), ctx = cv.getContext('2d'); // 화면 효과용 2D 오버레이\n")
        out.append(c)
        continue
    if c.startswith("let W = 0, H = 0, Z = 1;"):
        out.append(c); out.append(B('w3d_setup.js')); continue
    if c.startswith("function S("): out.append(newS); continue
    if c.startswith("function inputDir("): out.append(newInput); continue
    if c.startswith("function slotPos("):
        out.append("function slotPos(d, k) { return customerSlotPos(d, k); }\n"); continue
    if c.startswith("function dockRect("):
        out.append("function dockRect(id) { return customerDockRect(id); }\n"); continue
    if c.startswith("/* ---------- HUD ---------- */"):
        out.append(B('w3d_storage.js'))
        out.append(B('w3d_world.js')); out.append(B('w3d_chars.js')); out.append(B('w3d_game.js')); out.append(B('w3d_progression.js')); out.append(B('w3d_melee.js')); out.append(B('w3d_hero.js')); out.append(B('w3d_crew.js')); out.append(B('w3d_training.js')); out.append(B('w3d_customers.js')); out.append(B('w3d_fx.js')); out.append(B('w3d_scenery.js')); out.append(B('w3d_defense.js')); out.append(B('w3d_logistics.js')); out.append(overlay); out.append(c); continue
    if c.startswith("/* ---------- 루프 ---------- */") or c.startswith("let last = performance.now()"):
        continue
    if keep(c): out.append(c)
js = pre + '\n' + '\n'.join(out)
js = js.replace("const KEY = 'raft-village-v1';", "const KEY = 'raft-village-3d-v1';")
# 언제나 낮: 밤·노을 없앰
js = re.sub(r"const phaseInfo = \(\) => \{[^\n]*\n", "const phaseInfo = () => '☀️ 낮';\n", js)
js = re.sub(r"function nightAmt\(\) \{[^\n]*\n", "function nightAmt() { return 0; }\n", js)
js = re.sub(r"function duskAmt\(\) \{[^\n]*\n", "function duskAmt() { return 0; }\n", js)
# 3D 전용: 전투 종료 후 60초 준비, 해적 무제한 성장·선장 최대 50레벨
R3 = [
    ("G.raidT = G.raidT ?? 60;", "G.raidT = G.raidT ?? RAID_INTERVAL;"),
    ("G.raidT = rnd(55, 80);", "G.raidT = 60;"),
    ("if (id === 'expand1') G.raidT = 90;", "if (id === 'expand1') G.raidT = RAID_INTERVAL;"),
    ("function spawnBoarder(ship) {", "const pirMul = () => pirateMultiplier(); // 침공 횟수와 분리한 해적 레벨 배율\nfunction spawnBoarder(ship) {"),
    ("hp = (ship.big ? 1.6 : 1) * (6 + G.wave * 2);", "hp = Math.round((ship.big ? 1.6 : 1) * (6 + pirateLevel() * 2) * pirMul());"),
    ("moveTo(e, tgt.x, tgt.y, 1.7, dt, null, true)", "moveTo(e, tgt.x, tgt.y, 1.7 * Math.min(1.5, 1 + 0.03 * (pirateLevel() - 1)), dt, null, true)"),
    ("foe.hp = (foe.hp ?? 12) - 2.5;", "foe.hp = (foe.hp ?? 12) - 2.5 * pirMul() * PIRATE_BALANCE.damage;"),
    ("hitVillage({ dmg: 3, x1: e.x, y1: e.y })", "hitVillage({ dmg: 3 * pirMul() * PIRATE_BALANCE.damage, x1: e.x, y1: e.y })"),
    ("const hp = (big ? 3 : 1) * (12 + G.wave * 5);", "const hp = Math.round((big ? 3 : 1) * (12 + pirateLevel() * 5) * pirMul());"),
    ("'enemy', e.big ? 10 : 5, 1.0", "'enemy', (e.big ? 10 : 5) * pirMul(), 1.0"),
    ("hp: Math.round(hp * raidPlan(G.wave).armor), max: Math.round(hp * raidPlan(G.wave).armor)", "hp: PIRATE_BALANCE.health * Math.round(hp * raidPlan(G.wave).armor), max: PIRATE_BALANCE.health * Math.round(hp * raidPlan(G.wave).armor)"),
    ("dur, kind, dmg, target:", "dur, kind, dmg: kind === 'enemy' ? dmg * PIRATE_BALANCE.damage : dmg, target:"),
    ("w.hp = (w.hp ?? CREW_HP) - 4;", "w.hp = (w.hp ?? CREW_HP) - 4 * PIRATE_BALANCE.damage;"),
    ("v = (e.big ? 0.9 : 1.4) * dt;", "v = (e.big ? 0.9 : 1.4) * PIRATE_BALANCE.shipSpeed * dt;"),
    ("e.x += dx / l * 2 * dt; e.y += dy / l * 2 * dt;", "e.x += dx / l * 2 * PIRATE_BALANCE.shipSpeed * dt; e.y += dy / l * 2 * PIRATE_BALANCE.shipSpeed * dt;"),
    ("if (nearRaft(e.x, e.y, 1.5)) e.state = 'attack';", "if (nearRaft(e.x, e.y, 1.5)) { e.state = 'attack'; e.boardT = 0; } // 도착하면 바로 상륙 준비"),
    ("const workerSpeed = () => 2.8", "const workerSpeed = () => PIRATE_BALANCE.crewSpeed * 2.8"),
    ("G.combat = { raidOn, looted, enemies };", "G.combat = { raidOn, looted, enemies, balanceVersion: PIRATE_BALANCE_VERSION };"),
    ("toast(`⚠️ 해적 습격 경보 · 제${G.wave}파 ${n}척`);", "toast(G.wave > 1 ? `⚠️ 제${G.wave}파 ${n}척 · 해골 해적 Lv.${pirateLevel()} (힘 +${Math.round((pirMul() - 1) * 100)}%)` : `⚠️ 해적 습격 경보 · 제${G.wave}파 ${n}척`);"),
]
for a_, b_ in R3:
    assert js.count(a_) == 1, a_
    js = js.replace(a_, b_)
# 3D 전용: 강화 카드 · 해적 종류 · 보스 연결
R4 = [
    ("const CREW_HP = 15;", "const CREW_HP_BASE = 15; // 실제 최대 체력은 crewHpMax()"),
    ("const priceOf = d => Math.round(", "const priceOf = d => Math.round((1 + 0.2 * ck('price')) * "),
    ("dir.x * 3.8 :", "dir.x * 3.8 * (1 + 0.15 * ck('speed')) :"),
    ("dir.y * 3.8 :", "dir.y * 3.8 * (1 + 0.15 * ck('speed')) :"),
    ("const hpMax = () => 100 + (blv() - 1) * 25;", "const hpMax = () => 100 + (blv() - 1) * 25 + 50 * ck('villageHp');"),
    ("G.hp = Math.min(hpMax(), G.hp + 1 * dt);", "G.hp = Math.min(hpMax(), G.hp + (1 + 2 * ck('regen')) * dt);"),
    ("cap = BASE_CAP; workers = [];", "cap = BASE_CAP + 5 * ck('bag'); workers = [];"),
    ("cap = Math.max(cap, d.cap);", "cap = Math.max(cap, d.cap + 5 * ck('bag'));"),
    ("shoot(d, tgt, 'ball', 12 * mult, 0.8, 50, 40);", "shoot(d, tgt, 'ball', 12 * mult * (1 + 0.3 * ck('towerDmg')), 0.8, 50, 40); if (ck('towerDouble')) { const t2 = nearestEnemy(tgt.x, tgt.y, 3) || tgt; shoot(d, t2, 'ball', 12 * mult * (1 + 0.3 * ck('towerDmg')), 0.95, 56, 40); }"),
    ("st.cd = 1.8 / (1 + 0.2 * (bl - 1));", "st.cd = 1.8 / (1 + 0.2 * (bl - 1)) / (1 + 0.25 * ck('towerRate'));"),
    ("shoot(s, tgt, 'water', 4.5 * mult, 0.25, 4, 34);", "shoot(s, tgt, 'water', 4.5 * mult * crewMul(), 0.25, 4, 34);"),
    ("shoot(w, tgt, 'water', 3 * (1 + 0.1 * (lv() - 1)), 0.25, 4, 34);", "shoot(w, tgt, 'water', 3 * (1 + 0.1 * (lv() - 1)) * crewMul(), 0.25, 4, 34);"),
    ("const pt = nearestEnemy(player.x, player.y, 3.5);", "const pt = nearestEnemy(player.x, player.y, 3.5 + ck('playerGun'));"),
    ("shoot(player, pt, 'water', 1, 0.3, 4, 24);", "shoot(player, pt, 'water', 1 + 2 * ck('playerGun'), 0.3, 4, 24);"),
    ("const reward = 6 + G.wave * 2;", "const reward = Math.round((6 + G.wave * 2) * lootMul());\n  if (e.loot) { G.money += e.loot; floatText(e.x, e.y - 0.6, `💰 되찾음 +$${fmt(e.loot)}`, '#9fffb0'); e.loot = 0; }"),
    ("const reward = (e.big ? 3 : 1) * (12 + G.wave * 4);", "const reward = Math.round((e.boss ? 25 : e.big ? 3 : 1) * (12 + G.wave * 4) * lootMul());\n  if (e.boss) toast('☠️ 보스 격침! 큰 현상금을 받았습니다');"),
    ("function updateBoarder(e, dt) {", "function updateBoarderBase(e, dt) {"),
    ("dust(p.x, p.y, 8); floatText(p.x, p.y, '해적 상륙!', '#ffb0a0');", "setupBoarder(enemies[enemies.length - 1]); dust(p.x, p.y, 8); floatText(p.x, p.y, '해적 상륙!', '#ffb0a0');"),
    ("if (e.kind === 'boarder') { updateBoarder(e, dt); continue; }", "if (e.kind === 'boarder') { updateBoarder(e, dt); continue; }\n    if (e.boss && e.state === 'attack') bossTick(e, dt);"),
    ("  raidIntro = { t: 0, n };", "  if (bossDueNextRaid(G.wave)) spawnBoss();\n  raidIntro = { t: 0, n };"),
    ("G.raidT = 60; if (!looted) toast('해적을 격퇴했습니다'); finishStrategyRaid(looted); looted = false;", "G.raidT = 60; if (!looted) { toast('해적을 격퇴했습니다'); offerCards(); } finishStrategyRaid(looted); looted = false;"),
    ("e.hp / e.max, '#ff4d3d', 26, G.wave);", "e.hp / e.max, ({ bomber: '#ff9a2e', thief: '#c9a2ff', sniper: '#5ec8ff' })[e.type] || '#ff4d3d', 26, G.wave);"),
    ("else hpBar(e.x, e.y, e.big ? 120 : 90,", "else if (!e.boss) hpBar(e.x, e.y, e.big ? 120 : 90,"),
]
for a_, b_ in R4:
    if a_ == "function updateBoarder(e, dt) {":
        assert js.count(a_) == 2; js = js.replace(a_, b_, 1); continue
    assert js.count(a_) == 1, a_
    js = js.replace(a_, b_)
js = js.replace('CREW_HP', 'crewHpMax()').replace('crewHpMax()_BASE', 'CREW_HP_BASE')
# 갑판 백병전: 약탈·원거리 선원 사격 대신 실제 근접전과 유료 충원으로 전환.
def replace_section(text, start, end, replacement):
    i = text.index(start); j = text.index(end, i)
    return text[:i] + replacement + text[j:]
js = replace_section(js, '  // 해군: 습격 땐', '  // 포대\n', '  updateDefenders(dt, bl, mult);\n')
js = replace_section(js, '      e.fireT -= dt;', '      e.boardT =', '')
old_board = "      if (e.boardT <= 0) { e.boardT = rnd(6, 9) * raidPlan(G.wave).boarding; if (enemies.filter(b => b.kind === 'boarder' && alive(b)).length < 3 + G.wave) spawnBoarder(e); }"
assert js.count(old_board) == 1
js = js.replace(old_board, """      if (e.boardT <= 0) {
        e.boardT = rnd(4, 6) * raidPlan(G.wave).boarding;
        if (e.boss) spawnBossBoarder(e);
        const budget = e.landingBudget || (e.boss ? 8 : e.big ? 4 : 2) * PIRATE_CREW_MULTIPLIER;
        const burst = (e.boarded ? 1 : e.big ? 3 : 2) * PIRATE_CREW_MULTIPLIER;
        for (let k = 0; k < burst && (e.boarded || 0) < budget; k++) {
          if (enemies.filter(b => b.kind === 'boarder' && alive(b)).length >= Math.min(16, 4 + pirateLevel() * 2) * PIRATE_CREW_MULTIPLIER) break;
          spawnBoarder(e); e.boarded = (e.boarded || 0) + 1;
        }
        if ((e.boarded || 0) >= budget) e.state = 'flee';
      }""")
js = js.replace('e.sinkT > 1.4', "e.sinkT > (e.kind === 'boarder' ? 2 : 1.4)")
js = js.replace("e.state = 'sink'; e.sinkT = 0.6;", "e.state = 'sink'; e.sinkT = 0;")
js = js.replace('function updateMilitary(dt) {', 'function updateMilitary(dt) {\n  tickMeleeEffects(dt);')
js = js.replace('  G.wave++;', '  G.wave++; G.raidHadCrew = workers.length + soldiers.length > 0 || isHeroAvailable();')
js = js.replace('G.raidT -= dt;', 'if (raidGateOpen()) G.raidT -= dt; else G.raidT = Math.max(10, G.raidT);') # 일꾼 6명부터 침공
js = js.replace("state: 'walk', atkT: 0.6", "state: 'walk', atkT: 1.0")
js = replace_section(js, 'function hitVillage(s) {', 'function shoot(', """function hitVillage(s) {
  // 구버전 투사체 호환용. 새 해적은 선원과만 싸우며 돈과 시설을 약탈하지 않습니다.
  G.hp = Math.max(0, G.hp - s.dmg * strategyDamage()); shake = 0.2;
  for (const w of [...workers]) if (dist(w.x, w.y, s.x1, s.y1) < 1.1) {
    w.hp -= 4 * PIRATE_BALANCE.damage; if (w.hp <= 0) killCrew(w);
  }
  booms.push({ x: s.x1, y: s.y1, t: 0, kind: 'fire' });
}
""")

# 선장도 갑판에서 근접전: 보스는 배가 침몰해도 반드시 상륙합니다.
js = replace_section(js, '  // 주인공도 가까운 해적선에 물총', '  // 탄환\n', '  updateHeroCombat(dt);\n')
js = js.replace('function sinkEnemy(e) {', 'function sinkEnemy(e) {\n  if (e.boss) spawnBossBoarder(e);')
js = js.replace("  for (const s of soldiers) if ((s.hp ?? 12) < 12)", "  if (isHeroAvailable() && (raidOn || player.hp < heroMaxHp())) hpBar(player.x, player.y, 86, player.hp / heroMaxHp(), '#f3d15c', 32, heroLevel());\n  for (const s of soldiers) if ((s.hp ?? 12) < 12)")
js = js.replace("hpBar(e.x, e.y, 74,", "hpBar(e.x, e.y, e.champion ? 110 : 74,")
js = js.replace("|| '#ff4d3d', 26, G.wave);", "|| '#ff4d3d', e.champion ? 44 : 26, G.wave);")

# 적 체력 배지에는 실제 해적 레벨을 표시합니다.
js = js.replace("e.champion ? 44 : 26, G.wave);", "e.champion ? 44 : 26, e.level || pirateLevel());")
js = js.replace("e.big ? 50 : 36, G.wave);", "e.big ? 50 : 36, e.level || pirateLevel());")

# 저장된 강화 선택을 복구해 새로고침으로 보상을 잃거나 다시 뽑지 않게 함
js = js.replace("  const go = () => requestAnimationFrame(frame);", "  if (G.cardOffer && G.cardOffer.length) offerCards();\n  const go = () => requestAnimationFrame(frame);")
# 선택의 대가: 카드 효과를 실제 경제/전투/습격 시간에 연결
js = js.replace("strategySale() * d.price", "strategySale() * (1 + 0.35 * ck('smuggler')) * Math.pow(0.85, ck('bunker')) * d.price")
js = js.replace("s.dmg * strategyDamage()", "s.dmg * strategyDamage() * (1 + 0.2 * ck('glass')) * Math.pow(0.8, ck('bunker'))")
js = js.replace("(1 + 0.3 * ck('towerDmg'))", "(1 + 0.3 * ck('towerDmg') + 0.6 * ck('glass'))")

old = "const a = S(d.x, d.y), c = S(tgt.x, tgt.y); st.ang = Math.atan2(c.y - a.y, c.x - a.x);"
assert js.count(old) == 1; js = js.replace(old, "st.yaw = Math.atan2(tgt.x - d.x, tgt.y - d.y);")
# 안내창 링크·제목·캔버스
h = head.replace("<title>표류 뗏목 마을</title>", "<title>표류 뗏목 마을 3D</title>")
h = h.replace('<canvas id="game"', '<div id="world"></div>\n<canvas id="game"')
# 3D 전용: 왼쪽 위 생존 일차 카드 숨김
h = h.replace('</style>', '#dayCard{display:none!important}\n#world,#world canvas{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none}\n.panel a{color:#287b93}\n</style>', 1)
# 필수 엔진은 검증한 고정 버전을 함께 배포합니다. 외부 CDN 장애가 게임 시작을 막지 않습니다.
boot_guard = r'''<script>
window.gameBoot = (() => {
  let failed = false, ready = false;
  const start = document.getElementById('startBtn');
  if (start) start.disabled = true;
  function fail(message) {
    failed = true;
    if (start) start.disabled = true;
    let panel = document.getElementById('bootFailure');
    if (!panel) {
      const style = document.createElement('style');
      style.textContent = '#bootFailure{position:fixed;inset:0;z-index:100;display:grid;place-items:center;padding:18px;background:#225971cc;font:16px/1.6 system-ui,sans-serif;color:#30404a}#bootFailure>div{max-width:440px;padding:24px;border:3px solid #405363;border-radius:18px;background:#fff9e9}#bootFailure h2{margin:0 0 12px;font-size:23px}#bootFailure button{min-height:44px;padding:10px 18px;border:2px solid #427a32;border-radius:10px;background:#a9e66d;color:#28502b;font:inherit;cursor:pointer}#bootFailure button:focus-visible{outline:3px solid #2685ba;outline-offset:4px}';
      document.head.appendChild(style);
      panel = document.createElement('section'); panel.id = 'bootFailure';
      panel.setAttribute('role', 'alertdialog'); panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-labelledby', 'bootFailureTitle'); panel.setAttribute('aria-describedby', 'bootFailureMessage');
      panel.innerHTML = '<div><h2 id="bootFailureTitle">게임을 시작하지 못했어요</h2><p id="bootFailureMessage"></p><button id="bootRetry" type="button">다시 시도</button></div>';
      document.body.appendChild(panel);
      document.getElementById('bootRetry').onclick = () => location.reload();
      panel.addEventListener('keydown', event => { if (event.key === 'Tab') { event.preventDefault(); document.getElementById('bootRetry').focus(); } });
    }
    document.getElementById('bootFailureMessage').textContent = message;
    document.getElementById('bootRetry').focus();
  }
  window.addEventListener('error', event => {
    if (event.target?.tagName === 'SCRIPT' && event.target.src.includes('/vendor/three-r128/')) fail('게임 파일을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
    else if (!ready && event.error) fail('게임 준비 중 오류가 발생했어요. 페이지를 다시 열어 주세요. 문제가 계속되면 브라우저를 업데이트해 주세요.');
  }, true);
  return {
    fail,
    check() {
      const engine = window.THREE;
      if (failed || !engine || !['CopyShader', 'LuminosityHighPassShader', 'EffectComposer', 'RenderPass', 'ShaderPass', 'UnrealBloomPass', 'GLTFLoader', 'SkeletonUtils'].every(name => engine[name])) {
        fail('게임 파일을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'); return false;
      }
      return true;
    },
    renderer(engine) {
      try { return new engine.WebGLRenderer({ antialias: true }); }
      catch (error) { fail('3D 화면을 열지 못했어요. 브라우저의 하드웨어 가속을 켜거나 WebGL을 지원하는 최신 브라우저에서 다시 시도해 주세요.'); return null; }
    },
    ready() { ready = true; if (!failed && start) start.disabled = false; }
  };
})();</script>
'''
runtime_paths = ['build/three.min.js'] + ['examples/js/' + f for f in ['shaders/CopyShader.js', 'shaders/LuminosityHighPassShader.js', 'postprocessing/EffectComposer.js', 'postprocessing/RenderPass.js', 'postprocessing/ShaderPass.js', 'postprocessing/UnrealBloomPass.js', 'loaders/GLTFLoader.js', 'utils/SkeletonUtils.js']]
runtime_scripts = []
for relative in runtime_paths:
    path = 'vendor/three-r128/' + relative
    with open(os.path.join(ROOT, path), 'rb') as runtime_file:
        integrity = base64.b64encode(hashlib.sha384(runtime_file.read()).digest()).decode('ascii')
    runtime_scripts.append(f'<script src="{path}" integrity="sha384-{integrity}"></script>\n')
h += boot_guard + ''.join(runtime_scripts)
renderer_init = 'const renderer = new THREE.WebGLRenderer({ antialias: true });'
assert js.count(renderer_init) == 1
js = js.replace(renderer_init, 'const renderer = window.gameBoot.renderer(THREE);\nif (!renderer) return;')
res = h + "<script>\n(() => {\nif (!window.gameBoot.check()) return;\n" + js + tail.replace('})();\n</script>', 'window.gameBoot.ready();\n})();\n</script>', 1)
open(os.path.join(ROOT, 'raft-village-3d.html'), 'w', encoding='utf-8').write(res)
print('chunks', len(chunks), 'size', len(res))
for k in ['#game{', 'id="world"', 'three.min.js', 'function sync3D', 'function render(dt)']: print(k, res.count(k))
