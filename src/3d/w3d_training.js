/* ---------- 영웅·선원 훈련소: 건설 후 시설 앞 칸에 서 있으면 게이지가 차며 단계별 강화 ---------- */
const TRAINING_MAX_LEVEL = 50;
const TRAINING_FACILITIES = {
  heroForge: { id: 'heroForge', kind: 'hero', name: '영웅 훈련소', icon: '⚔️',
    x: 11.6, y: 1.75, cost: 100, pad: { x: 11.6, y: 3.65 }, color: 0x4f9ed1 },
  crewDojo: { id: 'crewDojo', kind: 'crew', name: '선원 훈련소', icon: '🛡️',
    x: 14.35, y: 1.75, cost: 120, pad: { x: 14.35, y: 3.65 }, color: 0x69b65a },
};
// 모듈은 기존 좌표·가격 배율 변환 뒤에 삽입됩니다. 아래 값은 실제 게임 좌표·가격입니다.
for (const facility of Object.values(TRAINING_FACILITIES)) {
  DEFS[facility.id] = { ...facility, type: 'training' };
  PADS.push({ id: facility.id, cost: facility.cost, x: facility.x, y: facility.y,
    icon: facility.icon, after: ['expand1', 'tent1'] });
}
function initializeTrainingState() {
  const old = G.training || {};
  const level = value => Number.isFinite(Number(value)) ? Math.min(TRAINING_MAX_LEVEL, Math.max(0, Math.floor(Number(value)))) : 0;
  G.training = { hero: level(old.hero), crew: level(old.crew) };
  // 훈련 % 규칙(2) 이전 저장: 이미 올린 단계는 고정 보너스로 남깁니다. 새 게임은 0단계라 모두 % 규칙입니다.
  if (G.trainingRule !== 2) { G.trainingLegacy = { hero: G.training.hero, crew: G.training.crew }; G.trainingRule = 2; }
  const legacy = G.trainingLegacy || {};
  G.trainingLegacy = { hero: Math.min(G.training.hero, level(legacy.hero)), crew: Math.min(G.training.crew, level(legacy.crew)) };
  const paid = G.trainPaid || {}, money = v => Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0;
  G.trainPaid = { hero: money(paid.hero), crew: money(paid.crew) }; // 강화 칸에 넣어 둔 돈 (게이지)
}
const trainingLevel = kind => G.training?.[kind] || 0;
const trainingCost = kind => (kind === 'hero' ? 60 : 50) + (kind === 'hero' ? 25 : 20) * trainingLevel(kind);
const trainingFacility = kind => Object.values(TRAINING_FACILITIES).find(f => f.kind === kind);
function canUseTraining(kind) {
  const f = trainingFacility(kind);
  return !!f && unlocked.has(f.id) && isHeroAvailable() && dist(player.x, player.y, f.pad.x, f.pad.y) <= 1.5;
}
// prepaid: 칸 게이지로 이미 낸 경우 (돈을 다시 빼지 않음)
function upgradeTraining(kind, prepaid = false) {
  if (!canUseTraining(kind) || trainingLevel(kind) >= TRAINING_MAX_LEVEL) return false;
  const cost = trainingCost(kind);
  if (!prepaid && G.money < cost) return false;
  const beforeHp = kind === 'hero' ? heroMaxHp() : crewHpMax();
  if (!prepaid) G.money -= cost;
  G.training[kind]++;
  if (kind === 'hero') {
    player.hp = Math.min(heroMaxHp(), player.hp + heroMaxHp() - beforeHp);
    snapshotHero();
  } else {
    const gained = crewHpMax() - beforeHp;
    for (const w of workers) if (w.hp > 0 && !w.dead) w.hp = Math.min(crewHpMax(), w.hp + gained);
  }
  save();
  toast(`${trainingFacility(kind).icon} ${kind === 'hero' ? '영웅' : '일꾼'} 강화 ${trainingLevel(kind)}단계 완료!`);
  if (!trainingPanel.hidden) refreshTrainingPanel();
  return true;
}
function trainingPads() {
  return Object.values(TRAINING_FACILITIES).filter(f => unlocked.has(f.id)).map(f => ({
    id: 'train:' + f.id, facility: f.id, kind: f.kind, train: true,
    x: f.pad.x, y: f.pad.y, icon: f.icon, cost: trainingCost(f.kind),
    paid: Math.min(trainingCost(f.kind), G.trainPaid?.[f.kind] || 0),
    level: trainingLevel(f.kind), maxed: trainingLevel(f.kind) >= TRAINING_MAX_LEVEL,
  }));
}

/* ---------- 근처에서 여는 강화 화면: 결제 전 효과·금액을 확인 ---------- */
const trainingStyle = document.createElement('style');
trainingStyle.textContent = `
#trainingBtn{position:fixed;left:10px;bottom:calc(136px + env(safe-area-inset-bottom,0px));z-index:4;max-width:250px;min-width:150px;min-height:52px;padding:6px 12px;border:2px solid #326c8d;border-radius:12px;background:#dff6ff;color:#24546a;box-shadow:0 3px 0 #326c8d55;font:16px/1.2 var(--display);cursor:pointer}
#trainingBtn small{display:block;font-size:11px;margin-top:3px}
#trainingBtn[data-kind=crew]{background:#e6ffd5;border-color:#588c3e;color:#3c662b}
#trainingBtn:focus-visible{outline:3px solid white;outline-offset:3px;box-shadow:0 0 0 6px #2c8dac}
body.has-boss #trainingBtn{bottom:calc(216px + env(safe-area-inset-bottom,0px))}
body.has-recruit #trainingBtn{bottom:calc(198px + env(safe-area-inset-bottom,0px))}
body.has-boss.has-recruit #trainingBtn{bottom:calc(278px + env(safe-area-inset-bottom,0px))}
body.has-training #toast{bottom:calc(198px + env(safe-area-inset-bottom,0px))}
body.has-boss.has-training #toast{bottom:calc(278px + env(safe-area-inset-bottom,0px))}
#trainingPanel{z-index:30;overflow:auto}
#trainingPanel>div{max-width:390px;max-height:calc(100dvh - 32px);overflow:auto;overscroll-behavior:contain}
#trainingPanel h2{margin:0 0 8px;font-size:25px}
#trainingPanel .stats{display:grid;gap:8px;padding:12px;margin:12px 0;background:#e7f5ff;border:2px solid #a7cedb;border-radius:12px;font-size:16px;line-height:1.45}
#trainingPanel[data-kind=crew] .stats{background:#edffdf;border-color:#b5d59c}
#trainingPanel .stat{display:flex;justify-content:space-between;gap:10px}
#trainingPanel .stat strong{white-space:nowrap;color:#356b34;font-weight:700}
#trainingPanel .status{min-height:22px;color:#7d532b;font-size:14px}
#trainingPanel .buttons{display:grid;gap:10px;margin-top:12px}
#trainingPanel button{width:100%;min-height:48px}
#trainingPanel button:disabled{opacity:.55;cursor:default}
@media(max-height:500px) and (orientation:landscape){#trainingBtn{bottom:68px;max-width:200px;font-size:14px}body.has-boss #trainingBtn{bottom:calc(216px + env(safe-area-inset-bottom,0px))}#trainingPanel>div{padding:14px}#trainingPanel h2{font-size:22px}#trainingPanel .stats{margin:8px 0;padding:8px}}
`;
document.head.appendChild(trainingStyle);
const trainingBtn = document.createElement('button');
trainingBtn.id = 'trainingBtn'; trainingBtn.hidden = true; trainingBtn.type = 'button';
document.body.appendChild(trainingBtn);
const trainingPanel = document.createElement('div');
trainingPanel.id = 'trainingPanel'; trainingPanel.className = 'panel'; trainingPanel.hidden = true;
trainingPanel.innerHTML = '<div role="dialog" aria-modal="true" aria-labelledby="trainingTitle"><h2 id="trainingTitle"></h2><p class="level"></p><div class="stats"></div><p class="description"></p><p class="status" role="status"></p><div class="buttons"><button id="trainingUpgrade" type="button"></button><button class="ghost close" type="button">돌아가기</button></div></div>';
document.body.appendChild(trainingPanel);
let activeTrainingKind = null, trainingContact = null, trainingPanelSignature = '', trainingButtonSignature = '';
const TRAINING_PAD_REACH = 0.65;
function onTrainingPad(facilityOrPad) {
  const pad = facilityOrPad.pad || facilityOrPad;
  return Math.abs(player.x - pad.x) <= TRAINING_PAD_REACH && Math.abs(player.y - pad.y) <= TRAINING_PAD_REACH;
}
function resetTrainingInteraction() {
  trainingContact = null; activeTrainingKind = null;
  trainingPanelSignature = ''; trainingButtonSignature = '';
  trainingPanel.hidden = true; trainingBtn.hidden = true;
  document.body.classList.remove('has-training');
}
// 건설·업그레이드 칸과 같은 방식: 칸 위에 서 있으면 돈이 조금씩 들어가 게이지가 차고, 다 차면 한 단계 강화
function tickTrainingInteraction(dt = 0) {
  if (paused || !isHeroAvailable() || dt <= 0) return;
  const pad = trainingPads().filter(onTrainingPad)
    .sort((a, b) => dist(player.x, player.y, a.x, a.y) - dist(player.x, player.y, b.x, b.y))[0];
  if (!pad || pad.maxed || G.money <= 0) return;
  const cost = trainingCost(pad.kind), paid = G.trainPaid[pad.kind] || 0, rem = cost - paid;
  const amt = Math.min(G.money, rem, Math.max(1, Math.round(cost * dt / 1.4)));
  G.money -= amt; G.trainPaid[pad.kind] = paid + amt;
  if (Math.random() < 0.5) { const s = S(pad.x, pad.y), a = S(player.x, player.y); fx.push({ ax: a.x, ay: a.y - 40 * Z, bx: s.x, by: s.y, t: 0, dur: 0.3 }); }
  if (G.trainPaid[pad.kind] >= cost) { G.trainPaid[pad.kind] = 0; upgradeTraining(pad.kind, true); }
}
const trainingStatText = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
function refreshTrainingPanel() {
  const f = trainingFacility(activeTrainingKind);
  if (!f) return;
  const level = trainingLevel(f.kind), maxed = level >= TRAINING_MAX_LEVEL;
  const attack = f.kind === 'hero' ? heroAttack() : crewAttack();
  const health = f.kind === 'hero' ? heroMaxHp() : crewHpMax();
  const usable = canUseTraining(f.kind), cost = trainingCost(f.kind);
  const signature = [f.kind, level, G.money, attack, health, usable].join('|');
  if (signature === trainingPanelSignature) return;
  trainingPanelSignature = signature;
  const nextAttack = attack + (maxed ? 0 : f.kind === 'hero' ? 3 : 1);
  const nextHealth = health + (maxed ? 0 : f.kind === 'hero' ? 10 : 5);
  trainingPanel.dataset.kind = f.kind;
  trainingPanel.querySelector('h2').textContent = `${f.icon} ${f.name}`;
  trainingPanel.querySelector('.level').textContent = `강화 ${level}/${TRAINING_MAX_LEVEL}단계 · 보유 $${fmt(G.money)}`;
  const stats = trainingPanel.querySelector('.stats'); stats.replaceChildren();
  for (const [label, before, after] of [['공격력', attack, nextAttack], ['최대 체력', health, nextHealth]]) {
    const row = document.createElement('div'); row.className = 'stat';
    const name = document.createElement('span'); name.textContent = label;
    const values = document.createElement('strong'); values.textContent = maxed ? trainingStatText(before) : `${trainingStatText(before)} → ${trainingStatText(after)}`;
    row.append(name, values); stats.appendChild(row);
  }
  trainingPanel.querySelector('.description').textContent = f.kind === 'hero'
    ? `전투 레벨과 함께 적용됩니다. 단계마다 공격력·최대 체력 +2% (지금 +${level * 2}%).`
    : `현재 일꾼과 앞으로 모집할 일꾼 모두 적용됩니다. 단계마다 공격력·최대 체력 +2% (지금 +${level * 2}%). 해군은 별도입니다.`;
  trainingPanel.querySelector('.status').textContent = maxed ? '최고 단계까지 강화했습니다.'
    : !usable ? '시설 앞 칸에 살아 있는 영웅이 있어야 강화할 수 있습니다.'
    : G.money < cost ? `강화 비용 $${fmt(cost)} · 자금이 부족합니다.`
    : '강화 버튼을 누르면 한 단계만 결제됩니다.';
  const buy = $('trainingUpgrade');
  buy.textContent = maxed ? '최대 강화 완료' : `강화 ${level + 1}단계 · $${fmt(cost)}`;
  buy.disabled = maxed || !usable || G.money < cost;
}
function openTraining(kind) {
  if (paused || !canUseTraining(kind)) return false;
  const f = trainingFacility(kind);
  if (onTrainingPad(f)) trainingContact = kind;
  clearMovementInput();
  activeTrainingKind = kind; trainingPanel.hidden = false; paused = true;
  trainingBtn.hidden = true; document.body.classList.remove('has-training');
  refreshTrainingPanel(); trainingPanel.querySelector('.close').focus({ preventScroll: true });
  return true;
}
function closeTraining() {
  if (trainingPanel.hidden) return;
  trainingPanel.hidden = true; activeTrainingKind = null; paused = false; last = performance.now();
}
$('trainingUpgrade').onclick = () => upgradeTraining(activeTrainingKind);
trainingPanel.querySelector('.close').onclick = closeTraining;
trainingPanel.addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.preventDefault(); closeTraining(); }
  if (e.key === 'Tab') {
    const buttons = [...trainingPanel.querySelectorAll('button:not(:disabled)')];
    const first = buttons[0], end = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); end.focus(); }
    else if (!e.shiftKey && document.activeElement === end) { e.preventDefault(); first.focus(); }
  }
});
trainingBtn.onclick = () => openTraining(trainingBtn.dataset.kind);
function trainingHud() {
  if (!trainingPanel.hidden) refreshTrainingPanel();
  // 게이지 방식으로 바뀌어 강화 화면 버튼은 표시하지 않습니다.
  const near = false && isHeroAvailable() && !paused ? Object.values(TRAINING_FACILITIES)
    .filter(f => canUseTraining(f.kind))
    .sort((a, b) => dist(player.x, player.y, a.pad.x, a.pad.y) - dist(player.x, player.y, b.pad.x, b.pad.y))[0] : null;
  trainingBtn.hidden = !near;
  document.body.classList.toggle('has-training', !!near);
  if (!near) return;
  trainingBtn.dataset.kind = near.kind;
  const level = trainingLevel(near.kind), maxed = level >= TRAINING_MAX_LEVEL;
  const signature = `${near.kind}|${level}`;
  if (signature === trainingButtonSignature) return;
  trainingButtonSignature = signature;
  trainingBtn.replaceChildren(document.createTextNode(`${near.icon} ${near.name} ›`));
  const sub = document.createElement('small');
  sub.textContent = maxed ? `${level}단계 · 최대 강화 완료` : `칸에 올라서 강화 · ${level} → ${level + 1}단계 · $${fmt(trainingCost(near.kind))}`;
  trainingBtn.appendChild(sub);
  trainingBtn.setAttribute('aria-label', `${near.name} 강화 화면 열기, ${level}단계`);
}

/* ---------- 훈련 부두의 3D 시설: 원본 마을 색상과 어울리는 훈련장 ---------- */
const trainingObjs = new Map();
function buildTrainingStation(f) {
  const g = new THREE.Group(); g.name = f.id; g.position.set(f.x, 0, f.y);
  const details = new THREE.Group(); details.name = 'station-details'; g.add(details);
  const wood = 0x9c7144, gold = 0xf3c45d, trim = 0xffefd2;
  details.add(bx(2.05, 0.15, 1.72, wood, {}, true, 0, 0.075, 0));
  details.add(bx(1.94, 0.025, 1.61, f.color, {}, false, 0, 0.16, 0));
  for (const x of [-0.93, 0.93]) details.add(bx(0.06, 0.035, 1.61, trim, {}, false, x, 0.18, 0));
  const dummy = (x, z) => {
    const body = new THREE.Group(); body.position.set(x, 0.17, z); details.add(body);
    body.add(mk(cylG(0.07, 0.09, 0.95, 7), mat(wood), true, 0, 0.49, 0));
    body.add(mk(cylG(0.23, 0.2, 0.44, 8), mat(0xe9c27c), true, 0, 0.66, 0));
    body.add(bx(0.75, 0.075, 0.075, wood, {}, true, 0, 0.82, 0));
    body.add(mk(sphG(0.19, 10, 7), mat(0xf4d391), true, 0, 1.04, 0));
    for (const y of [0.5, 0.8]) body.add(mk(cylG(0.235, 0.235, 0.025, 8), mat(0xc48547), false, 0, y, 0));
    body.add(bx(0.31, 0.18, 0.035, f.color, {}, false, 0, 0.65, 0.2));
    return body;
  };
  const sword = (x, z, angle) => {
    const blade = new THREE.Group(); blade.position.set(x, 0.31, z); blade.rotation.z = angle; details.add(blade);
    blade.add(bx(0.07, 0.64, 0.035, 0xddeaf0, { metalness: 0.35 }, true, 0, 0.58, 0));
    blade.add(bx(0.3, 0.05, 0.075, gold, {}, true, 0, 0.25, 0));
    blade.add(bx(0.065, 0.21, 0.065, 0x5b4437, {}, true, 0, 0.13, 0));
  };
  if (f.kind === 'hero') {
    dummy(-0.46, -0.03);
    details.add(bx(0.66, 0.08, 0.53, gold, {}, true, 0.55, 0.24, 0.08));
    details.add(bx(0.12, 0.55, 0.12, wood, {}, true, 0.55, 0.53, 0.08));
    sword(0.4, 0.08, -0.13); sword(0.72, 0.08, 0.13);
    for (const x of [-0.87, 0.87]) details.add(mk(sphG(0.08, 8, 6), mat(gold), false, x, 0.24, 0.67));
  } else {
    dummy(-0.45, -0.05); dummy(0.45, -0.05);
    details.add(bx(0.42, 0.27, 0.34, 0xc89a60, {}, true, 0.69, 0.31, 0.54));
    for (const y of [0.22, 0.4]) details.add(bx(0.44, 0.025, 0.36, wood, {}, false, 0.69, y, 0.54));
  }
  details.add(mk(cylG(0.032, 0.045, 1.6, 8), mat(wood), true, -0.86, 0.98, -0.64));
  details.add(bx(0.61, 0.4, 0.04, f.color, {}, true, -0.56, 1.55, -0.64));
  details.add(bx(0.61, 0.06, 0.045, gold, {}, false, -0.56, 1.39, -0.64));
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 160;
  const texture = new THREE.CanvasTexture(canvas); texture.encoding = THREE.sRGBEncoding;
  // 이름표는 울타리와 시설 뒤로 잘리지 않도록 장면 위에 표시합니다.
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
  const sign = new THREE.Sprite(material); sign.renderOrder = 100;
  sign.position.set(0, 2.04, -0.15); sign.scale.set(2.6, 0.81, 1); g.add(sign);
  world.add(g);
  return { g, canvas, texture, material, level: -1 };
}
function syncTrainingStations() {
  for (const [id, o] of trainingObjs) if (!unlocked.has(id)) {
    world.remove(o.g); o.texture.dispose(); o.material.dispose(); trainingObjs.delete(id);
  }
  for (const f of Object.values(TRAINING_FACILITIES)) {
    if (!unlocked.has(f.id)) continue;
    let o = trainingObjs.get(f.id);
    if (!o) { o = buildTrainingStation(f); trainingObjs.set(f.id, o); }
    o.g.position.y = dropOff(f.id) / 40;
    const level = trainingLevel(f.kind);
    if (o.level === level) continue;
    const c = o.canvas.getContext('2d'); c.clearRect(0, 0, 512, 160);
    c.fillStyle = '#fff4d9'; c.strokeStyle = f.kind === 'hero' ? '#458bb4' : '#569448'; c.lineWidth = 10;
    c.beginPath(); c.roundRect(6, 6, 500, 148, 28); c.fill(); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#4d4b35'; c.font = 'bold 49px sans-serif';
    c.fillText(f.name, 256, 56, 470); c.fillStyle = f.kind === 'hero' ? '#337da8' : '#4b8538'; c.font = 'bold 38px sans-serif';
    c.fillText(`강화 ${level} / ${TRAINING_MAX_LEVEL}`, 256, 113, 470);
    o.texture.needsUpdate = true; o.level = level;
  }
}
