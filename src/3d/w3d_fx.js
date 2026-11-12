/* ---------- 3D: 화려한 연출 (빛 번짐·폭발·보호막·목책·주변 섬·전투 흔적) ---------- */
// 빛 번짐(블룸): 포탄·불꽃·등불처럼 아주 밝은 부분만 번지게
let composer = null;
if (THREE.EffectComposer && THREE.RenderPass && THREE.UnrealBloomPass) {
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.18, 0.3, 1.15));
  // 합성 경로도 일반 렌더와 동일한 색 공간으로 출력합니다.
  const gammaPass = new THREE.ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){vec4 c=texture2D(tDiffuse,vUv);gl_FragColor=vec4(mix(c.rgb*12.92,1.055*pow(max(c.rgb,vec3(0.0)),vec3(1.0/2.4))-0.055,step(vec3(0.0031308),c.rgb)),c.a);}'
  });
  composer.addPass(gammaPass);
}
function renderScene() { if (composer) composer.render(); else renderer.render(scene, camera); }
function resizeFx() { if (composer) { composer.setPixelRatio(DPR); composer.setSize(W, H); } }
window.addEventListener('gameviewportresize', resizeFx); resizeFx();

// 캔버스로 만든 질감: 빛 알갱이, 연기, 나뭇결, 돌벽
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
}
const glowTex = canvasTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
const smokeTex = canvasTex(64, 64, (g) => { for (let i = 0; i < 6; i++) { const x = 20 + Math.random() * 24, y = 20 + Math.random() * 24, r = g.createRadialGradient(x, y, 0, x, y, 22); r.addColorStop(0, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); } });
const woodTex = canvasTex(256, 32, (g, w, h) => {
  g.fillStyle = '#fff4d5'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { g.strokeStyle = 'rgba(139,93,43,.1)'; g.lineWidth = 1.2; const y = 5 + i * 7; g.beginPath(); g.moveTo(8, y); g.bezierCurveTo(w * 0.3, y + 2, w * 0.6, y - 2, w - 8, y); g.stroke(); }
  g.fillStyle = 'rgba(102,73,41,.35)'; g.fillRect(6, h / 2 - 1, 3, 3); g.fillRect(w - 9, h / 2 - 1, 3, 3);
});
const stoneTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#8f8c86'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
    const x = c * 32 + (r % 2) * 16, y = r * 16, v = 150 + Math.random() * 40 | 0;
    g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(x + 1.5, y + 1.5, 29, 13);
    g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(x + 1.5, y + 1.5, 29, 3);
    if (x + 32 > w) { g.fillStyle = `rgb(${v},${v - 3},${v - 8})`; g.fillRect(x - w + 1.5, y + 1.5, 29, 13); }
  }
}, true);
plankIM.material.map = woodTex; plankIM.material.needsUpdate = true;
const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xe2ded6, roughness: 0.92 });
function stoneBox(w, h, d, x, y, z) { const m = mk(boxG(), stoneMat, true, x, y, z); m.scale.set(w, h, d); return m; }
const vivid = c => new THREE.Color(c).offsetHSL(0, 0.22, 0.04);

// 입자 효과: 빛나는 불꽃·연기·파편
const parts = [];
function spawnPart(x, y, z, o) {
  let p = null;
  for (const q of parts) if (!q.alive) { p = q; break; }
  if (!p) { if (parts.length >= 420) return; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(s); p = { s, add: true }; parts.push(p); }
  const add = o.add !== false;
  if (p.add !== add) { p.s.material.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending; p.s.material.needsUpdate = true; p.add = add; }
  p.s.material.map = o.tex || glowTex; p.s.material.color.set(o.color || 0xffffff);
  Object.assign(p, { alive: true, t: 0, life: o.life || 0.6, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, size: o.size || 0.3, grow: o.grow ?? 1, grav: o.grav ?? 4, op: o.op ?? 1 });
  p.s.position.set(x, y, z); p.s.visible = true;
}
function updateParts(dt) {
  for (const p of parts) {
    if (!p.alive) continue;
    p.t += dt; if (p.t >= p.life) { p.alive = false; p.s.visible = false; continue; }
    p.vy -= p.grav * dt; p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
    const k = p.t / p.life; p.s.scale.setScalar(p.size * (1 + (p.grow - 1) * k)); p.s.material.opacity = p.op * (1 - k);
  }
}
function explode(x, y, z, big) {
  for (let i = 0; i < (big ? 14 : 7); i++) spawnPart(x, y, z, { color: i % 3 ? 0xff9a2a : 0xffe27a, vx: rnd(-2, 2), vy: rnd(1.5, 4), vz: rnd(-2, 2), life: rnd(0.35, 0.6), size: big ? rnd(0.35, 0.6) : 0.3, grow: 0.4, grav: 6 });
  for (let i = 0; i < (big ? 6 : 3); i++) spawnPart(x, y + 0.1, z, { tex: smokeTex, add: false, color: 0x4a4542, vx: rnd(-0.4, 0.4), vy: rnd(0.6, 1.2), vz: rnd(-0.4, 0.4), life: rnd(1, 1.6), size: 0.5, grow: 2.6, grav: -0.2, op: 0.55 });
}
function splinters(x, y, z, n = 8) { for (let i = 0; i < n; i++) spawnPart(x, y, z, { add: false, color: 0x8a5a33, vx: rnd(-2.5, 2.5), vy: rnd(2, 4), vz: rnd(-2.5, 2.5), life: 0.8, size: 0.14, grow: 1, grav: 9 }); }

// 탄환이 빛나며 꼬리를 남김
const SHOT_GLOW = { water: 0xffd25a, ball: 0xff8a2a, enemy: 0xff5a3a };
function fxShots() {
  shots.forEach((s, i) => {
    const m = shotPool[i]; if (!m) return;
    if (!m.userData.glow) { const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.add(g); m.userData.glow = g; }
    m.userData.glow.material.color.setHex(SHOT_GLOW[s.kind]); m.userData.glow.scale.setScalar(s.kind === 'water' ? 7 : 5);
    if (Math.random() < 0.6) spawnPart(m.position.x, m.position.y, m.position.z, { color: SHOT_GLOW[s.kind], life: 0.25, size: s.kind === 'water' ? 0.14 : 0.3, grow: 0.3, grav: 0 });
  });
}

// 폭발과 전투 흔적(그을음 자국)
const seenBooms = new WeakSet(), scorches = [];
function addScorch(x, z) {
  let d = scorches.find(q => q.t > 25);
  if (!d) { if (scorches.length >= 30) d = scorches.reduce((a, b) => a.t > b.t ? a : b); else { const m = new THREE.Mesh(geo('scorch', () => new THREE.CircleGeometry(0.45, 18)), new THREE.MeshBasicMaterial({ color: 0x1c140e, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; world.add(m); d = { m }; scorches.push(d); } }
  d.t = 0; d.m.position.set(x + rnd(-0.1, 0.1), 0.012, z + rnd(-0.1, 0.1)); d.m.scale.setScalar(rnd(0.8, 1.3)); d.m.visible = true;
}
function fxBooms(dt) {
  for (const b of booms) {
    if (seenBooms.has(b)) continue; seenBooms.add(b);
    if (b.kind === 'water') { for (let i = 0; i < 5; i++) spawnPart(b.x, raftY + 0.5, b.y, { color: 0xffe08a, vx: rnd(-1.5, 1.5), vy: rnd(0.5, 2), vz: rnd(-1.5, 1.5), life: 0.3, size: 0.16, grav: 4 }); continue; }
    const onRaft = b.kind === 'fire';
    explode(b.x, raftY + (onRaft ? 0.15 : -0.1), b.y, onRaft);
    if (onRaft) { addScorch(b.x, b.y); splinters(b.x, raftY + 0.1, b.y); }
  }
  for (const d of scorches) { d.t += dt; d.m.material.opacity = Math.max(0, 0.7 * (1 - d.t / 25)); d.m.visible = d.t < 25; }
}

// 해군 기지 보호막 돔: 가장자리가 빛나는 반구, 습격 중엔 더 밝게
const shieldMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uA: { value: 0.4 } },
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vP = position; vN = normalize(normalMatrix * normal); vV = normalize(-(viewMatrix * wp).xyz); gl_Position = projectionMatrix * viewMatrix * wp; }',
  fragmentShader: 'uniform float uT; uniform float uA; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 2.0); float band = 0.5 + 0.5 * sin(vP.y * 7.0 - uT * 2.2); vec3 c = mix(vec3(0.3, 0.75, 1.0), vec3(0.8, 0.5, 1.0), band); gl_FragColor = vec4(c * 0.75, (f * 0.8 + 0.03) * uA); }',
});
const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), shieldMat);
shield.visible = false; world.add(shield);

// 뗏목 가장자리 목책: 해적이 상륙한 자리는 부서졌다가 다시 세워짐
const postIM = new THREE.InstancedMesh(cylG(0.05, 0.065, 0.62, 6), mat(0x7a5232, { roughness: 0.9 }), 1800);
const tipIM = new THREE.InstancedMesh(coneG(0.065, 0.14, 6), mat(0x6a4529, { roughness: 0.9 }), 1800);
const railIM = new THREE.InstancedMesh(boxG(), mat(0x93663c, { roughness: 0.9 }), 1300);
for (const im of [postIM, tipIM, railIM]) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); world.add(im); }
const broken = new Map(), seenBoarders = new WeakSet();
let fenceKey = '';
function fenceEdges() {
  const list = [];
  for (const t of tiles) {
    const [i, j] = t.split(',').map(Number);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (hasTile(i + di, j + dj)) continue;
      const mx = i + 0.5 + di * 0.5, mz = j + 0.5 + dj * 0.5;
      if (dockAt(mx + di * 0.6, mz + dj * 0.6)) continue;
      list.push({ key: `${i},${j},${di},${dj}`, i, j, di, dj, mx, mz });
    }
  }
  return list;
}
function syncFence() {
  for (const e of enemies) if (e.kind === 'boarder' && !seenBoarders.has(e)) {
    seenBoarders.add(e);
    let best = null, bd = 99;
    for (const f of fenceEdges()) { const d = dist(f.mx, f.mz, e.x, e.y); if (d < bd) { bd = d; best = f; } }
    if (best && bd < 2) { broken.set(best.key, G.t + 25); splinters(best.mx, raftY + 0.3, best.mz, 12); }
  }
  for (const [k, until] of broken) if (G.t > until) broken.delete(k);
  let anim = false; for (const k in tileBorn) if (G.t < tileBorn[k] + 0.4) { anim = true; break; }
  const key = tiles.size + '|' + [...broken.keys()].join(';') + (anim ? ':' + G.t.toFixed(2) : '');
  if (key === fenceKey) return; fenceKey = key;
  let np = 0, nr = 0;
  for (const f of fenceEdges()) {
    if (broken.has(f.key)) continue;
    const off = tileOff(f.i, f.j); if (off < 0) continue;
    const oy = off / 40, along = f.di === 0, ix = -f.di * 0.06, iz = -f.dj * 0.06;
    for (const a of [-0.36, 0, 0.36]) {
      const px = f.mx + ix + (along ? a : 0), pz = f.mz + iz + (along ? 0 : a), lean = hash(px * 3, pz * 3) * 0.12 - 0.06;
      _eu.set(lean, 0, -lean); _q.setFromEuler(_eu);
      _pv.set(px, 0.31 + oy, pz); _sv.set(1, 1, 1); postIM.setMatrixAt(np, _m4.compose(_pv, _q, _sv));
      _pv.set(px, 0.69 + oy, pz); tipIM.setMatrixAt(np, _m4.compose(_pv, _q, _sv)); np++;
    }
    _q.identity();
    for (const h of [0.22, 0.46]) {
      _pv.set(f.mx + ix * 1.6, h + oy, f.mz + iz * 1.6); _sv.set(along ? 1.02 : 0.05, 0.06, along ? 0.05 : 1.02);
      railIM.setMatrixAt(nr++, _m4.compose(_pv, _q, _sv));
    }
  }
  postIM.count = tipIM.count = np; railIM.count = nr;
  postIM.instanceMatrix.needsUpdate = tipIM.instanceMatrix.needsUpdate = railIM.instanceMatrix.needsUpdate = true;
}

// 멀리 보이는 무인도와 난파선
function palm(g, x, z, s) {
  let px = x, py = 0.5, pz = z, lean = rnd(-0.25, 0.25);
  for (let i = 0; i < 5; i++) { const seg = mk(cylG(0.09 * s, 0.11 * s, 0.6 * s, 7), mat(0x8a6a44, { roughness: 0.9 }), false, px, py + 0.3 * s, pz); seg.rotation.z = lean * i * 0.4; g.add(seg); px += Math.sin(lean * i * 0.4) * -0.3 * s; py += 0.57 * s; }
  for (let i = 0; i < 6; i++) { const lf = mk(coneG(0.16 * s, 1.4 * s, 4), mat(0x3f9a3c, { roughness: 0.8 }), false, px, py, pz); const a = i / 6 * Math.PI * 2; lf.rotation.set(Math.cos(a) * 1.25, a, Math.sin(a) * 1.25); lf.scale.z = 0.25; g.add(lf); }
}
function island(x, z, r) {
  const g = new THREE.Group(); g.position.set(x, -0.6, z);
  const sand = mk(sphG(1, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xecd59c, { roughness: 1 }), false); sand.scale.set(r, 1.1, r * 0.8); g.add(sand);
  const grass = mk(sphG(1, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5bb04c, { roughness: 0.9 }), false, 0, 0.3, 0); grass.scale.set(r * 0.68, 1.2, r * 0.52); g.add(grass);
  for (let i = 0; i < Math.round(r * 0.8); i++) { const a = rnd(0, 6.28), d = rnd(0, r * 0.45); palm(g, Math.cos(a) * d, Math.sin(a) * d * 0.8, rnd(0.9, 1.3)); }
  for (let i = 0; i < 4; i++) { const a = rnd(0, 6.28), rk = mk(geo('rock', () => new THREE.DodecahedronGeometry(0.5)), mat(0x8c8a84, { roughness: 1 }), false, Math.cos(a) * r * 0.95, 0.1, Math.sin(a) * r * 0.78); rk.scale.setScalar(rnd(0.6, 1.4)); g.add(rk); }
  scene.add(g);
}
island(-24, 34, 6); island(48, -16, 5); island(54, 34, 7.5); island(-20, -24, 4.5);
{
  const wk = new THREE.Group(); wk.position.set(36, -0.45, 24); wk.rotation.set(0.25, 0.8, 0.35);
  wk.add(bx(2.6, 0.8, 1.1, 0x5a3a22, { roughness: 0.9 }, false)); wk.add(bx(0.12, 2.6, 0.12, 0x4a2c16, {}, false, 0.4, 1.1, 0));
  const torn = mk(geo('torn', () => new THREE.PlaneGeometry(0.9, 0.7)), mat(0xd8cfb8, { side: THREE.DoubleSide }), false, 0.45, 1.7, 0); torn.rotation.set(0.2, Math.PI / 2, 0.3); wk.add(torn);
  scene.add(wk);
}
scene.fog.near = 28; scene.fog.far = 95;

// 가게 깃발·등불, 기지 성곽 장식을 시설에 덧붙임
const decorated = new WeakSet();
function decorate() {
  for (const id in objs) {
    const o = objs[id], d = DEFS[id];
    if (decorated.has(o.g)) continue; decorated.add(o.g);
    if (d.type === 'shop') {
      o.g.add(mk(cylG(0.02, 0.02, 0.7, 6), mat(0x6e4526), false, 0.56, 1.75, -0.56));
      const fl = mk(coneG(0.14, 0.38, 3), new THREE.MeshStandardMaterial({ color: vivid(d.color), roughness: 0.6 }), false, 0.74, 1.98, -0.56); fl.rotation.z = -Math.PI / 2; fl.scale.z = 0.15; o.g.add(fl); o.flagMesh = fl;
      o.g.add(mk(sphG(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffb040, emissiveIntensity: 1.6 }), false, -0.5, 1.22, 0.5));
    } else if (d.type === 'base') {
      for (let k = 0; k < 7; k++) for (const s of [-1, 1]) { o.g.add(stoneBox(0.18, 0.16, 0.18, -1.08 + k * 0.36, 1.07, s * 0.78)); }
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { o.g.add(stoneBox(0.18, 0.16, 0.18, s * 1.08, 1.07, -0.54 + k * 0.36)); }
    } else if (d.type === 'converter') {
      o.g.add(mk(sphG(0.12, 10, 8), new THREE.MeshStandardMaterial({ color: 0xff9a3a, emissive: 0xff7a20, emissiveIntensity: 2 }), false, 0, 0.6, 0));
    }
    // 장식까지 붙은 뒤 정적인 부품을 재질별로 합침 (깃발·대포·찌·쌓인 물건 등 움직이는 것은 제외)
    mergeByMaterial(o.g, new Set(Object.values(o).filter(v => v && v.isObject3D && v !== o.g)));
  }
}

function syncFx(dt) {
  decorate(); fxShots(); fxBooms(dt); syncFence(); updateParts(dt);
  for (const id in objs) if (objs[id].flagMesh) objs[id].flagMesh.rotation.y = Math.sin(G.t * 5 + objs[id].g.position.x) * 0.35;
  // 화로 연기·불티
  if (unlocked.has('grill') && G.st.grill.inPile > 0 && Math.random() < 0.25) { const d = DEFS.grill; spawnPart(d.x - 0.35, raftY + 1.7, d.y - 0.35, { tex: smokeTex, add: false, color: 0x9a948e, vx: rnd(-0.1, 0.1), vy: 0.6, vz: rnd(-0.1, 0.1), life: 1.6, size: 0.3, grow: 3, grav: -0.1, op: 0.45 }); spawnPart(d.x, raftY + 0.6, d.y, { color: 0xffa040, vx: rnd(-0.3, 0.3), vy: rnd(0.8, 1.5), vz: rnd(-0.3, 0.3), life: 0.6, size: 0.08, grav: 0.5 }); }
  if (unlocked.has('base')) {
    const d = DEFS.base; shield.visible = true; shield.position.set(d.x, 0, d.y); shield.scale.set(4.4, 3.2, 4.4);
    shieldMat.uniforms.uT.value = G.t; shieldMat.uniforms.uA.value = raidOn ? 0.55 + Math.sin(G.t * 6) * 0.1 : 0.25;
  } else shield.visible = false;
}
