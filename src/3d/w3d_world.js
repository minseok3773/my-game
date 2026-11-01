/* ---------- 3D: 공용 재질·도형 ---------- */
const _mats = new Map(), _geos = new Map();
function mat(c, o) {
  const key = c + (o ? JSON.stringify(o) : '');
  let m = _mats.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.65, metalness: 0 }, o)); _mats.set(key, m); }
  return m;
}
function geo(key, make) { let g = _geos.get(key); if (!g) { g = make(); _geos.set(key, g); } return g; }
const boxG = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const cylG = (rt, rb, h, seg = 14) => geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const sphG = (r, ws = 18, hs = 12, ps = 0, pl = Math.PI * 2, ts = 0, tl = Math.PI) => geo(`s${r},${ws},${hs},${ps},${pl},${ts},${tl}`, () => new THREE.SphereGeometry(r, ws, hs, ps, pl, ts, tl));
const coneG = (r, h, seg = 12) => geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg));
function mk(g, m, cast = true, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; o.position.set(x, y, z); return o; }
function bx(w, h, d, c, o, cast = true, x = 0, y = 0, z = 0) { const m = mk(boxG(), mat(c, o), cast, x, y, z); m.scale.set(w, h, d); return m; }
function ringMesh(r0, r1, color, opacity) {
  const m = new THREE.Mesh(geo(`r${r0},${r1}`, () => new THREE.RingGeometry(r0, r1, 40)), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; return m;
}

/* ---------- 3D: 바다 ---------- */
const uTime = { value: 0 };
const waterMat = new THREE.MeshStandardMaterial({ color: 0x1f8db5, roughness: 0.22, metalness: 0.15, transparent: true, opacity: 0.94 });
waterMat.onBeforeCompile = sh => {
  sh.uniforms.uTime = uTime;
  sh.vertexShader = `uniform float uTime;
    float wave(vec2 p){ return sin(p.x*0.35+uTime*1.2)*0.12 + sin(p.y*0.5+uTime*0.9)*0.08 + sin((p.x+p.y)*0.8+uTime*1.7)*0.04; }
    vec2 waveD(vec2 p){
      float c = cos((p.x+p.y)*0.8+uTime*1.7)*0.032;
      return vec2(cos(p.x*0.35+uTime*1.2)*0.042 + c, cos(p.y*0.5+uTime*0.9)*0.04 + c);
    }
  ` + sh.vertexShader
    .replace('#include <beginnormal_vertex>', 'vec2 wd = waveD(position.xy); vec3 objectNormal = normalize(vec3(-wd.x, -wd.y, 1.0));')
    .replace('#include <begin_vertex>', 'vec3 transformed = vec3(position); transformed.z += wave(position.xy);');
};
const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 170, 170), waterMat);
water.rotation.x = -Math.PI / 2; water.position.set(12, -0.45, 8); water.receiveShadow = true; scene.add(water);
const WATER_DAY = new THREE.Color(0x1f8db5), WATER_NIGHT = new THREE.Color(0x163448);
// 뗏목 주변 얕은 물빛
const shallow = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(170,240,230,.5)'); gr.addColorStop(1, 'rgba(170,240,230,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = -0.2; scene.add(m); return m;
})();

/* ---------- 3D: 뗏목 (판자·바닥·통나무를 인스턴스로) ---------- */
const MAXT = 460;
const plankIM = new THREE.InstancedMesh(boxG(), new THREE.MeshStandardMaterial({ roughness: 0.85 }), MAXT * 3);
const baseIM = new THREE.InstancedMesh(boxG(), mat(0xbea277, { roughness: 1 }), MAXT);
const logIM = new THREE.InstancedMesh(cylG(1, 1, 1, 10), mat(0x6a4529, { roughness: 0.9 }), MAXT * 2);
for (const im of [plankIM, baseIM, logIM]) { im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); world.add(im); }
const PLANK3 = [0xc9ad82, 0xc9ad82, 0xc9ad82, 0xc9ad82, 0xc9ad82].map(c => new THREE.Color(c)); // 바닥은 한 가지 베이지색
for (let i = 0; i < MAXT * 3; i++) plankIM.setColorAt(i, PLANK3[i % 5]);
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _sv = new THREE.Vector3(), _pv = new THREE.Vector3(), _eu = new THREE.Euler();
let raftKey = '';
function syncRaft() {
  let anim = false;
  for (const k in tileBorn) if (G.t < tileBorn[k] + 0.4) { anim = true; break; }
  const key = tiles.size + (anim ? ':' + G.t.toFixed(2) : '');
  if (key === raftKey) return; raftKey = key;
  let n = 0, nb = 0, nl = 0;
  for (const t of tiles) {
    const [i, j] = t.split(',').map(Number), off = tileOff(i, j);
    if (off < 0) continue;
    const oy = off / 40;
    _q.identity();
    for (let r = 0; r < 3; r++) {
      _pv.set(i + 0.5, -0.07 + oy, j + (r + 0.5) / 3); _sv.set(0.985, 0.14, 0.315);
      plankIM.setMatrixAt(n, _m4.compose(_pv, _q, _sv)); plankIM.setColorAt(n, PLANK3[Math.floor(hash(i + r * 7, j) * 5)]); n++;
    }
    _pv.set(i + 0.5, -0.17 + oy, j + 0.5); _sv.set(1, 0.05, 1); baseIM.setMatrixAt(nb++, _m4.compose(_pv, _q, _sv));
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (hasTile(i + di, j + dj)) continue;
      _pv.set(i + 0.5 + di * 0.5, -0.2 + oy, j + 0.5 + dj * 0.5);
      _eu.set(di === 0 ? 0 : Math.PI / 2, 0, di === 0 ? Math.PI / 2 : 0); _q.setFromEuler(_eu); _sv.set(0.2, 1.03, 0.2);
      logIM.setMatrixAt(nl++, _m4.compose(_pv, _q, _sv)); _q.identity();
    }
  }
  plankIM.count = n; baseIM.count = nb; logIM.count = nl;
  plankIM.instanceMatrix.needsUpdate = true; plankIM.instanceColor.needsUpdate = true;
  baseIM.instanceMatrix.needsUpdate = true; logIM.instanceMatrix.needsUpdate = true;
}

/* ---------- 3D: 물건 ---------- */
const ITEM3 = {
  fish: () => { const g = new THREE.Group(); const b = mk(sphG(1, 12, 8), mat(0xa9c4d8, { roughness: 0.3, metalness: 0.25 })); b.scale.set(0.12, 0.045, 0.06); g.add(b);
    const t = mk(coneG(0.045, 0.07, 4), mat(0x86a3b8)); t.rotation.z = Math.PI / 2; t.position.x = -0.13; g.add(t); return g; },
  grilled: () => { const g = new THREE.Group(); const b = mk(sphG(1, 12, 8), mat(0xa85a28, { roughness: 0.55 })); b.scale.set(0.12, 0.045, 0.06); g.add(b);
    const t = mk(coneG(0.045, 0.07, 4), mat(0x6b3412)); t.rotation.z = Math.PI / 2; t.position.x = -0.13; g.add(t); return g; },
  water: () => { const g = new THREE.Group(); g.add(mk(cylG(0.045, 0.045, 0.13, 10), mat(0x6fd3f5, { roughness: 0.15, transparent: true, opacity: 0.85 }), true, 0, 0.065, 0));
    g.add(mk(cylG(0.022, 0.022, 0.03, 8), mat(0xffffff), false, 0, 0.145, 0)); return g; },
  tomato: () => { const g = new THREE.Group(); g.add(mk(sphG(0.06, 12, 8), mat(0xe8432e, { roughness: 0.35 }), true, 0, 0.055, 0));
    const l = mk(sphG(0.035, 8, 6), mat(0x3c9a3a), false, 0, 0.11, 0); l.scale.y = 0.4; g.add(l); return g; },
  bill: () => bx(0.78, 0.09, 0.39, 0x3fbf4f, { roughness: 0.5 }),
  crate: () => bx(0.17, 0.13, 0.17, 0xb07a46, { roughness: 0.85 }, true, 0, 0.065, 0),
};
const ITEM_H3 = { fish: 0.075, grilled: 0.075, water: 0.15, tomato: 0.11, bill: 0.095, crate: 0.13 };
function syncPile(group, type, n, spread = 0.22) {
  if (group.userData.type !== type) { group.clear(); group.userData.type = type; }
  while (group.children.length < n) {
    const i = group.children.length, m = ITEM3[type](), c = i % 3, r = Math.floor(i / 3);
    m.position.x += (c - 1) * spread; m.position.y += r * ITEM_H3[type]; m.position.z += (c % 2) * 0.05; m.rotation.y = (i * 1.7) % 0.6 - 0.3;
    group.add(m);
  }
  while (group.children.length > n) group.remove(group.children[group.children.length - 1]);
}
function syncStack(group, arr) {
  const n = Math.min(arr.length, 20), sig = arr.slice(0, n).join();
  if (group.userData.sig === sig) return;
  group.clear(); group.userData.sig = sig;
  let h = 0;
  for (let i = 0; i < n; i++) { const m = ITEM3[arr[i]](); m.position.y += h; m.rotation.y = i % 2 ? 0.25 : -0.2; h += ITEM_H3[arr[i]]; group.add(m); }
}

/* ---------- 3D: 시설 ---------- */
const objs = {}, docks = {}, zoneRings = {};
function tentGeo() {
  return geo('tent', () => { const s = new THREE.Shape(); s.moveTo(-0.65, 0); s.lineTo(0.65, 0); s.lineTo(0, 1.1); s.lineTo(-0.65, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1.7, bevelEnabled: false }); g.translate(0, 0, -0.85); g.rotateY(Math.PI / 2); return g; });
}
function skullTex() {
  return geo('skull', () => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#1e1e22'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(34, 86); g.lineTo(94, 112); g.moveTo(94, 86); g.lineTo(34, 112); g.stroke();
    g.fillStyle = '#f2f2f2'; g.beginPath(); g.arc(64, 58, 28, 0, 7); g.fill(); g.fillRect(50, 72, 28, 16);
    g.fillStyle = '#1e1e22'; g.beginPath(); g.arc(53, 56, 7, 0, 7); g.arc(75, 56, 7, 0, 7); g.fill();
    return new THREE.CanvasTexture(c);
  });
}
function buildStation(id) {
  const d = DEFS[id], g = new THREE.Group(), o = { g };
  g.position.set(d.x, 0, d.y); world.add(g);
  if (d.type === 'producer' && d.item === 'fish') {
    g.add(bx(1.1, 0.42, 1.1, 0x8a5a33, { roughness: 0.9 }, true, 0, 0.21, 0));
    const rod = mk(cylG(0.02, 0.03, 2.3, 6), mat(0x5c391e), true, -0.45, 1.1, -0.4); rod.rotation.set(-0.55, 0, 0.55); g.add(rod);
    o.bobber = mk(sphG(0.06, 10, 8), mat(0xe8432e), false, -2.6, -0.25, -1.2); g.add(o.bobber);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.05, 2.05, -1.05), new THREE.Vector3(-2.6, -0.25, -1.2)]);
    g.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })));
    o.pile = new THREE.Group(); o.pile.position.y = 0.44; g.add(o.pile);
  } else if (d.type === 'producer' && d.item === 'water') {
    g.add(mk(cylG(0.5, 0.5, 1.05, 20), mat(0x7d93a3, { roughness: 0.35, metalness: 0.35 }), true, -0.2, 0.52, -0.2));
    g.add(mk(cylG(0.42, 0.42, 0.02, 20), mat(0x3d9fd0, { roughness: 0.1 }), false, -0.2, 1.05, -0.2));
    const f = mk(coneG(0.3, 0.35, 16), mat(0x9aaab6, { roughness: 0.4, metalness: 0.3 }), true, -0.2, 1.3, -0.2); f.rotation.x = Math.PI; g.add(f);
    o.pile = new THREE.Group(); o.pile.position.set(0.7, 0, 0.7); g.add(o.pile);
  } else if (d.type === 'producer') {
    g.add(bx(1.8, 0.3, 1.6, 0x7a4a26, { roughness: 0.9 }, true, 0, 0.15, 0));
    g.add(bx(1.7, 0.02, 1.5, 0x4a2f1c, { roughness: 1 }, false, 0, 0.31, 0));
    for (let i = 0; i < 6; i++) {
      const px = -0.55 + (i % 3) * 0.55, pz = -0.4 + Math.floor(i / 3) * 0.8;
      g.add(mk(sphG(0.27, 14, 10), mat(0x3c9a3a, { roughness: 0.8 }), true, px, 0.55, pz));
      for (const [tx, ty, tz] of [[0.12, 0.62, 0.2], [-0.15, 0.5, 0.18], [0.05, 0.75, -0.1]]) g.add(mk(sphG(0.065, 10, 8), mat(0xe8432e, { roughness: 0.35 }), false, px + tx, ty, pz + tz));
    }
    o.pile = new THREE.Group(); o.pile.position.set(1.1, 0, 1.0); g.add(o.pile);
  } else if (d.type === 'converter') {
    g.add(bx(1, 0.5, 1, 0x4b5058, { roughness: 0.6, metalness: 0.2 }, true, 0, 0.25, 0));
    o.fire = new THREE.MeshStandardMaterial({ color: 0x6b3a22, emissive: 0xff7a20, emissiveIntensity: 0 });
    const fireTop = mk(boxG(), o.fire, false, 0, 0.51, 0); fireTop.scale.set(0.7, 0.02, 0.7); g.add(fireTop);
    g.add(mk(cylG(0.09, 0.1, 1.2, 10), mat(0x5a5f68, { metalness: 0.3 }), true, -0.35, 1.05, -0.35));
    g.add(bx(0.7, 0.2, 0.6, 0xc08550, { roughness: 0.85 }, true, 0, 0.1, 0.85));
    g.add(bx(0.6, 0.2, 0.7, 0xc08550, { roughness: 0.85 }, true, 0.85, 0.1, 0));
    o.inPile = new THREE.Group(); o.inPile.position.set(0, 0.21, 0.85); g.add(o.inPile);
    o.outPile = new THREE.Group(); o.outPile.position.set(0.85, 0.21, 0); g.add(o.outPile);
  } else if (d.type === 'shop') {
    g.add(bx(1, 0.45, 1, 0xe6cfa3, { roughness: 0.8 }, true, 0, 0.225, 0));
    for (const [px, pz] of [[-0.56, -0.56], [0.56, -0.56], [-0.56, 0.56], [0.56, 0.56]]) g.add(mk(cylG(0.035, 0.035, 1.35, 6), mat(0x6e4526), true, px, 0.68, pz));
    for (let i = 0; i < 4; i++) { const st = mk(boxG(), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xe4dccd : vivid(d.color), roughness: 0.7 }), true, -0.465 + i * 0.31, 1.37, 0); st.scale.set(0.31, 0.05, 1.24); g.add(st); }
    o.stock = new THREE.Group(); o.stock.position.y = 0.47; g.add(o.stock);
    o.cash = new THREE.Group(); o.cash.position.set(d.cx - d.x, 0.03, d.cy - d.y); g.add(o.cash);
    const [x0, y0, x1, y1] = dockRect(id), dk = new THREE.Group();
    dk.add(bx(x1 - x0, 0.12, y1 - y0, 0xa7774a, { roughness: 0.9 }, false, (x0 + x1) / 2, -0.1, (y0 + y1) / 2));
    for (let a = 1.5; a < 10; a += 2) dk.add(mk(cylG(0.07, 0.07, 0.6, 6), mat(0x5c391e), false, d.x + d.dir[0] * a, -0.4, d.y + d.dir[1] * a));
    world.add(dk); docks[id] = dk;
    const zr = ringMesh(0.42, 0.5, 0xffffff, 0.6); zr.position.set(d.zx, 0.02, d.zy); world.add(zr); zoneRings[id] = zr;
  } else if (d.type === 'tent') {
    g.add(mk(tentGeo(), mat(0xb9a07a, { roughness: 0.95, side: THREE.DoubleSide })));
    const ridge = mk(cylG(0.04, 0.04, 1.8, 6), mat(0x8a5530), true, 0, 1.1, 0); ridge.rotation.z = Math.PI / 2; g.add(ridge);
  } else if (d.type === 'solar') {
    g.add(mk(cylG(0.06, 0.06, 0.8, 8), mat(0x888888, { metalness: 0.4 }), true, 0, 0.4, 0));
    const p = bx(1.6, 0.05, 1.1, 0x26407a, { roughness: 0.2, metalness: 0.5 }, true, 0, 0.85, 0); p.rotation.x = 0.4; g.add(p);
  } else if (d.type === 'lighthouse') {
    for (let i = 0; i < 5; i++) { const r0 = 0.6 - i * 0.075; g.add(mk(cylG(r0 - 0.07, r0, 0.65, 18), mat(i % 2 ? 0xf3f3f3 : 0xd8402c, { roughness: 0.55 }), true, 0, 0.33 + i * 0.65, 0)); }
    o.lamp = mk(sphG(0.22, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe680, emissiveIntensity: 1 }), false, 0, 3.55, 0); g.add(o.lamp);
    const beam = new THREE.Mesh(coneG(0.9, 6, 16), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.geometry = geo('beam', () => { const c = new THREE.ConeGeometry(0.9, 6, 16, 1, true); c.translate(0, -3, 0); c.rotateZ(Math.PI / 2); return c; });
    o.beam = new THREE.Group(); o.beam.position.y = 3.55; o.beam.add(beam); g.add(o.beam);
  } else if (d.type === 'base') {
    g.add(stoneBox(2.4, 0.75, 1.8, 0, 0.375, 0));
    g.add(bx(2.0, 0.25, 1.4, 0x2f4a73, { roughness: 0.6 }, true, 0, 0.87, 0));
    g.add(bx(0.6, 0.45, 0.05, 0x3b2a1c, {}, false, 0, 0.23, 0.91));
    for (const ox of [-0.8, 0.8]) g.add(bx(0.4, 0.25, 0.04, 0xcfe8ff, { emissive: 0xffc870, emissiveIntensity: 1.3 }, false, ox, 0.48, 0.91));
    g.add(mk(cylG(0.03, 0.03, 1.8, 6), mat(0xdddddd, { metalness: 0.4 }), true, 0.9, 1.9, -0.6));
    o.flag = mk(geo('flag', () => new THREE.PlaneGeometry(0.75, 0.45).translate(0.375, 0, 0)), mat(0x2f6fd6, { side: THREE.DoubleSide }), true, 0.9, 2.55, -0.6); g.add(o.flag);
    o.crates = new THREE.Group(); o.crates.position.set(BASE_ZONE.x + 0.6 - d.x, 0, BASE_ZONE.y - 0.6 - d.y); g.add(o.crates);
    const zr = ringMesh(0.42, 0.5, 0xffffff, 0.6); zr.position.set(BASE_ZONE.x, 0.02, BASE_ZONE.y); world.add(zr); zoneRings[id] = zr;
  } else if (d.type === 'tower') {
    g.add(stoneBox(1, 0.75, 1, 0, 0.375, 0));
    for (const [ox, oz] of [[-0.38, -0.38], [0.38, -0.38], [0.38, 0.38], [-0.38, 0.38]]) g.add(bx(0.22, 0.2, 0.22, 0xb8b8b8, { roughness: 0.85 }, true, ox, 0.85, oz));
    o.cannon = new THREE.Group(); o.cannon.position.y = 0.95; g.add(o.cannon);
    o.cannon.add(mk(sphG(0.18, 12, 10), mat(0x333333, { metalness: 0.5, roughness: 0.4 })));
    const barrel = mk(cylG(0.08, 0.1, 0.6, 10), mat(0x222222, { metalness: 0.5, roughness: 0.4 }), true, 0, 0.03, 0.3); barrel.rotation.x = Math.PI / 2; o.cannon.add(barrel);
  }
  objs[id] = o;
  return o;
}
function syncStations() {
  for (const id in objs) if (!unlocked.has(id)) { world.remove(objs[id].g); if (docks[id]) world.remove(docks[id]); if (zoneRings[id]) world.remove(zoneRings[id]); delete objs[id]; delete docks[id]; delete zoneRings[id]; }
  for (const id of unlocked) {
    const d = DEFS[id];
    if (!d || ['bag', 'expand'].includes(d.type)) continue;
    const o = objs[id] || buildStation(id), s = G.st[id];
    o.g.position.y = dropOff(id) / 40;
    if (o.pile) syncPile(o.pile, d.item, s.pile);
    if (o.bobber) o.bobber.position.y = -0.27 + Math.sin(G.t * 3) * 0.05;
    if (o.inPile) { syncPile(o.inPile, 'fish', s.inPile); syncPile(o.outPile, 'grilled', s.outPile); o.fire.emissiveIntensity = s.inPile > 0 && s.outPile < maxPile(id) ? 2 + Math.sin(G.t * 20) * 0.4 : 0.05; }
    if (o.stock) { syncPile(o.stock, d.item, s.stock); syncPile(o.cash, 'bill', Math.min(9, Math.ceil(s.cash / 8)), 0.82); }
    if (o.beam) o.beam.rotation.y = G.t * 1.2;
    if (o.flag) o.flag.rotation.y = Math.sin(G.t * 4) * 0.25;
    if (o.crates) syncPile(o.crates, 'crate', Math.ceil(G.st.base.food / 3));
    if (o.cannon && towerSt[id]) o.cannon.rotation.y += Math.atan2(Math.sin((towerSt[id].yaw || 0) - o.cannon.rotation.y), Math.cos((towerSt[id].yaw || 0) - o.cannon.rotation.y)) * Math.min(1, frameDt * 8);
  }
  for (const id in zoneRings) zoneRings[id].material.opacity = 0.35 + 0.25 * Math.sin(G.t * 3);
}

/* ---------- 3D: 건설·업그레이드 칸 ---------- */
const padObjs = new Map();
function buildPad(p) {
  const g = new THREE.Group(); g.position.set(p.x, 0.03, p.y);
  const base = new THREE.Mesh(geo('padBase', () => new THREE.PlaneGeometry(1.2, 1.2)), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false }));
  base.rotation.x = -Math.PI / 2; g.add(base);
  const fill = new THREE.Mesh(geo('padFill', () => new THREE.PlaneGeometry(1.2, 1.2).translate(0, 0.6, 0)), new THREE.MeshBasicMaterial({ color: 0x59d36a, transparent: true, opacity: 0.8, depthWrite: false }));
  fill.rotation.x = -Math.PI / 2; fill.position.set(0, 0.005, 0.6); g.add(fill);
  const sq = geo('padLine', () => new THREE.BufferGeometry().setFromPoints([[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6]].map(([x, z]) => new THREE.Vector3(x, 0.01, z))));
  const border = new THREE.LineLoop(sq, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
  const ripple = new THREE.LineLoop(sq, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true }));
  g.add(border, ripple); world.add(g);
  const o = { g, base, fill, border, ripple }; padObjs.set(p.id, o); return o;
}
function syncPads(vp) {
  const ids = new Set(vp.map(p => p.id));
  for (const [id, o] of padObjs) if (!ids.has(id)) { world.remove(o.g); padObjs.delete(id); }
  for (const p of vp) {
    const o = padObjs.get(p.id) || buildPad(p), left = p.cost - (G.paid[p.id] || 0), afford = G.money >= left, ratio = (G.paid[p.id] || 0) / p.cost;
    const far = dist(player.x, player.y, p.x, p.y) > 6.5 && !afford;
    o.g.visible = !far || dist(player.x, player.y, p.x, p.y) < 9;
    o.border.material.color.setHex(afford ? 0xffd84d : 0xffffff); o.border.material.opacity = far ? 0.35 : 0.9;
    o.base.material.color.setHex(afford ? 0xffe078 : 0xffffff);
    o.fill.visible = ratio > 0; o.fill.scale.y = Math.max(0.001, ratio);
    const f = (G.t * 0.8 + p.x * 0.13) % 1;
    o.ripple.scale.setScalar(1 + f * 0.7); o.ripple.material.opacity = (1 - f) * (afford ? 0.8 : 0.4); o.ripple.material.color.setHex(afford ? 0xffdc64 : 0xffffff);
  }
}

/* ---------- 3D: 캐릭터 ---------- */
function makeLeg(parent, x, y, legColor, shoeColor, m) {
  const hip = new THREE.Group(); hip.position.set(x, y, 0); parent.add(hip);
  hip.add(mk(cylG(0.072, 0.064, 0.28, 10), mat(legColor), true, 0, -0.14, 0));
  const knee = new THREE.Group(); knee.position.y = -0.28; hip.add(knee);
  knee.add(mk(cylG(0.062, 0.055, 0.27, 10), mat(legColor), true, 0, -0.135, 0));
  const shoe = mk(sphG(0.09, 12, 8), mat(shoeColor, { roughness: 0.45 }), true, 0, -0.29, 0.035); shoe.scale.set(1, 0.6, 1.45); knee.add(shoe);
  m.legs.push(hip); m.knees.push(knee);
}
function makeKid3(L) {
  const H = HATS[L.hat] || {}, sc = L.sc || 1;
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body); root.scale.setScalar(sc * 0.92);
  const m = { root, body, legs: [], knees: [], arms: [], ears: [], phase: rnd(0, 6), walk: 0, earA: 0, earV: 0, heading: 0, ph: rnd(0, 6), idleT: 0 };
  const top = L.top, bottom = L.bottom || L.top;
  for (const d of [-1, 1]) makeLeg(body, d * 0.1, 0.62, L.dress ? L.skin : bottom, L.shoe, m);
  if (L.dress) body.add(mk(cylG(0.17, 0.33, 0.5, 18), mat(top), true, 0, 0.72, 0));
  else body.add(mk(cylG(0.235, 0.24, 0.2, 18), mat(bottom), true, 0, 0.7, 0));
  m.torso = mk(cylG(0.19, 0.235, 0.46, 18), mat(top), true, 0, 0.98, 0); body.add(m.torso);
  if (L.overalls) {
    const bib = bx(0.22, 0.22, 0.05, bottom, {}, true, 0, 0.95, 0.2); bib.rotation.x = -0.1; body.add(bib);
    for (const d of [-1, 1]) { const st = bx(0.045, 0.26, 0.03, bottom, {}, false, d * 0.09, 1.1, 0.17); st.rotation.x = -0.25; body.add(st); }
  }
  for (const d of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(d * 0.24, 1.18, 0); sh.rotation.z = d * 0.12; body.add(sh);
    sh.add(mk(cylG(0.055, 0.05, 0.44, 10), mat(top), true, 0, -0.22, 0));
    sh.add(mk(sphG(0.058, 10, 8), mat(L.skin, { roughness: 0.7 }), true, 0, -0.46, 0));
    m.arms.push(sh);
  }
  const head = new THREE.Group(); head.position.y = 1.5; body.add(head); m.head = head;
  head.add(mk(sphG(0.21, 22, 16), mat(L.skin, { roughness: 0.7 })));
  if (H.cap) {
    head.add(mk(sphG(0.215, 18, 12), mat(L.hair, { roughness: 0.6 }), true, 0, 0.02, -0.025));
    head.add(mk(cylG(0.2, 0.22, 0.12, 18), mat(0xffffff, { roughness: 0.5 }), true, 0, 0.18, 0));
    head.add(mk(cylG(0.27, 0.27, 0.02, 20), mat(0xffffff, { roughness: 0.5 }), true, 0, 0.13, 0));
    head.add(mk(cylG(0.222, 0.222, 0.035, 18), mat(0x1f3a70), false, 0, 0.15, 0));
  } else {
    const hood = mk(sphG(0.26, 26, 18, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9), mat(H.c, { roughness: 0.75, side: THREE.DoubleSide }), true, 0, 0.02, -0.015);
    hood.scale.y = 1.04; head.add(hood);
    const earC = H.earC || H.c;
    for (const d of [-1, 1]) {
      const piv = new THREE.Group(); head.add(piv);
      if (H.ears === 'long') {
        piv.position.set(d * 0.11, 0.22, -0.03); piv.rotation.z = -d * 0.16;
        const e = mk(sphG(0.07, 14, 10), mat(H.c, { roughness: 0.75 }), true, 0, 0.2, 0); e.scale.set(1, 3.1, 0.55); piv.add(e);
        const ei = mk(sphG(0.045, 10, 8), mat(H.in, { roughness: 0.8 }), false, 0, 0.19, 0.022); ei.scale.set(1, 3.4, 0.4); piv.add(ei);
      } else if (H.ears === 'round' || H.ears === 'koala') {
        const big = H.ears === 'koala';
        piv.position.set(d * (big ? 0.23 : 0.2), big ? 0.13 : 0.18, -0.02);
        const e = mk(sphG(big ? 0.11 : 0.08, 12, 10), mat(earC), true); e.scale.z = 0.6; piv.add(e);
        const ei = mk(sphG(big ? 0.065 : 0.045, 10, 8), mat(H.in), false, 0, 0, 0.03); ei.scale.z = 0.4; piv.add(ei);
      } else if (H.ears === 'point' || H.ears === 'tuft') {
        const big = H.ears === 'point';
        piv.position.set(d * 0.15, 0.22, -0.02); piv.rotation.z = -d * 0.35;
        const e = mk(coneG(big ? 0.085 : 0.06, big ? 0.2 : 0.14, 4), mat(H.c), true, 0, 0.08, 0); e.scale.z = 0.6; piv.add(e);
      } else if (H.ears === 'eyes') {
        piv.position.set(d * 0.1, 0.22, 0.06);
        piv.add(mk(sphG(0.07, 12, 10), mat(H.c)));
        piv.add(mk(sphG(0.045, 10, 8), mat(0xffffff), false, 0, 0.01, 0.04));
        piv.add(mk(sphG(0.022, 8, 6), mat(0x1d1d1d), false, 0, 0.01, 0.08));
      }
      m.ears.push({ piv, d, base: piv.rotation.z });
    }
    if (H.mane) for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; head.add(mk(sphG(0.09, 8, 6), mat(H.mane), true, Math.cos(a) * 0.26, Math.sin(a) * 0.26 + 0.02, -0.05)); }
    if (H.curls) for (let i = 0; i < 11; i++) { const a = Math.PI * (-0.1 + i * 0.12); head.add(mk(sphG(0.065, 8, 6), mat(H.c), true, Math.cos(a) * 0.25, Math.sin(a) * 0.25 + 0.03, 0.08)); }
    if (H.stripes) for (const ox of [-0.08, 0, 0.08]) head.add(bx(0.03, 0.02, 0.18, 0x3a2414, {}, false, ox, 0.27, 0.0));
    if (H.patches) for (const d of [-1, 1]) { const p = mk(sphG(0.05, 8, 6), mat(0x2b2b2b), false, d * 0.1, 0.17, 0.2); p.scale.z = 0.4; head.add(p); }
    if (H.owl) for (const d of [-1, 1]) { head.add(mk(sphG(0.055, 10, 8), mat(0xffe07a), false, d * 0.085, 0.2, 0.18)); head.add(mk(sphG(0.025, 8, 6), mat(0x2a1a0e), false, d * 0.085, 0.2, 0.225)); }
    head.add(mk(sphG(0.213, 20, 8, Math.PI / 2 - 0.95, 1.9, 0.3, 0.62), mat(L.hair, { roughness: 0.55, side: THREE.DoubleSide }), false));
  }
  for (const d of [-1, 1]) {
    const eye = mk(sphG(0.03, 10, 8), mat(0x2a1a12, { roughness: 0.2 }), false, d * 0.075, -0.01, 0.185); eye.scale.z = 0.6; head.add(eye);
    head.add(mk(sphG(0.01, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), false, d * 0.075 - 0.009, 0.004, 0.205));
    const bl = mk(sphG(0.035, 10, 6), new THREE.MeshBasicMaterial({ color: 0xff9aa8, transparent: true, opacity: 0.35 }), false, d * 0.125, -0.065, 0.165); bl.scale.set(1, 0.6, 0.3); head.add(bl);
  }
  const mouth = mk(geo('mouth', () => new THREE.TorusGeometry(0.024, 0.006, 6, 12, Math.PI)), mat(0x7a3b2e), false, 0, -0.07, 0.2); mouth.rotation.z = Math.PI; head.add(mouth);
  if (H.pom) {
    m.pom = new THREE.Group(); m.pom.position.set(0.23, -0.08, 0.06); head.add(m.pom);
    m.pom.add(mk(sphG(0.055, 12, 8), mat(0xffffff, { roughness: 0.9 }), true, 0, -0.1, 0));
  }
  m.carry = new THREE.Group(); m.carry.position.set(0, 1.08, 0.32); body.add(m.carry);
  // 총: 해군은 늘 들고, 선원과 주인공은 습격 때만 듦
  m.rifle = new THREE.Group(); m.rifle.position.set(0.1, 1.02, 0.22); m.rifle.visible = !!H.cap; body.add(m.rifle);
  m.rifle.add(bx(0.05, 0.06, 0.55, 0x2b2b30, { metalness: 0.5, roughness: 0.35 }, true, 0, 0, 0.12));
  m.rifle.add(bx(0.06, 0.09, 0.22, 0x7a5232, { roughness: 0.7 }, true, 0, -0.02, -0.12));
  return m;
}
function makeAdult3(o) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const m = { root, body, legs: [], knees: [], arms: [], ears: [], phase: rnd(0, 6), walk: 0, earA: 0, earV: 0, heading: 0, ph: rnd(0, 6), idleT: 0 };
  for (const d of [-1, 1]) makeLeg(body, d * 0.1, 0.6, o.pants || '#3d4a66', 0x3a2a20, m);
  m.torso = mk(cylG(0.2, 0.23, 0.6, 14), mat(o.shirt), true, 0, 0.92, 0); body.add(m.torso);
  for (const d of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(d * 0.25, 1.17, 0); sh.rotation.z = d * 0.1; body.add(sh);
    sh.add(mk(cylG(0.055, 0.05, 0.46, 8), mat(o.shirt), true, 0, -0.23, 0));
    sh.add(mk(sphG(0.055, 8, 6), mat(o.skin || '#f2c9a0'), true, 0, -0.48, 0));
    m.arms.push(sh);
  }
  const head = new THREE.Group(); head.position.y = 1.43; body.add(head); m.head = head;
  head.add(mk(sphG(0.18, 16, 12), mat(o.skin || '#f2c9a0', { roughness: 0.7 })));
  head.add(mk(sphG(0.188, 16, 8, 0, Math.PI * 2, 0, 1.45), mat(o.hair || '#3a2414', { roughness: 0.6 }), true, 0, 0.01, -0.01));
  for (const d of [-1, 1]) head.add(mk(sphG(0.025, 8, 6), mat(0x2a1a12), false, d * 0.065, 0, 0.165));
  if (o.bandana) {
    head.add(mk(sphG(0.198, 16, 8, 0, Math.PI * 2, 0, 1.25), mat(0xc62f2f, { roughness: 0.7 }), true, 0, 0.02, 0));
    const tail = bx(0.05, 0.14, 0.03, 0xc62f2f, {}, false, -0.08, -0.05, -0.19); tail.rotation.z = 0.4; head.add(tail);
    m.sword = bx(0.03, 0.5, 0.02, 0xdfe3e8, { metalness: 0.7, roughness: 0.25 }, true, 0, -0.7, 0.1); m.arms[1].add(m.sword);
  }
  return m;
}
// 걷기 사이클과 귀 스프링 (2D 버전과 같은 동작을 3D 관절로)
function animate3(m, ent, dt, fighting) {
  const vx = ent.vx || 0, vy = ent.vy || 0, spd = Math.hypot(vx, vy), t = G.t;
  if (spd > 0.12) { m.idleT = 0; m.rest = undefined; } else m.idleT += dt;
  if (m.rest === undefined && spd <= 0.12) m.rest = m.heading;
  const look = m.idleT > 2.5 && ent.aimYaw === undefined ? m.rest + Math.sin(t * 0.7 + m.ph) * 0.45 : undefined;
  const tg = spd > 0.12 ? Math.atan2(vx, vy) : ent.aimYaw ?? look;
  if (tg !== undefined) m.heading += Math.atan2(Math.sin(tg - m.heading), Math.cos(tg - m.heading)) * Math.min(1, dt * (spd > 0.12 ? 16 : 5));
  m.root.rotation.y = m.heading;
  m.root.position.set(ent.x, 0, ent.y);
  m.walk += (Math.min(1, spd / 2.4) - m.walk) * Math.min(1, dt * 8);
  if (spd > 0.12) m.phase += dt * (6.5 + spd * 3.2);
  const w = m.walk, p = m.phase, breathe = Math.sin(t * 2.4 + m.ph) * (1 - w);
  m.legs[0].rotation.x = Math.sin(p) * 0.85 * w; m.legs[1].rotation.x = -Math.sin(p) * 0.85 * w;
  m.knees[0].rotation.x = (0.1 + Math.max(0, Math.cos(p)) * 1.25) * w; m.knees[1].rotation.x = (0.1 + Math.max(0, -Math.cos(p)) * 1.25) * w;
  m.arms[0].rotation.x = -Math.sin(p) * 0.6 * w; m.arms[1].rotation.x = fighting ? -1.2 + Math.sin(t * 14) * 1.1 : Math.sin(p) * 0.6 * w;
  if (m.rifle && m.rifle.visible) { m.arms[0].rotation.x = m.arms[1].rotation.x = -1.15 + Math.sin(p) * 0.08 * w; m.arms[0].rotation.z = -0.35; m.arms[1].rotation.z = 0.35; }
  else if (m.rifle) { m.arms[0].rotation.z = -0.12; m.arms[1].rotation.z = 0.12; }
  m.body.position.y = (1 + Math.cos(2 * p)) * 0.5 * 0.07 * w - 0.03 * w;
  m.body.position.x = Math.sin(p) * 0.025 * w;
  m.body.rotation.z = Math.sin(p) * 0.045 * w; m.body.rotation.x = 0.16 * w;
  m.torso.scale.set(1 + breathe * 0.012, 1 + breathe * 0.02, 1 + breathe * 0.012);
  m.head.rotation.z = -Math.sin(p) * 0.04 * w;
  if (m.ears.length) {
    const twitch = Math.pow(Math.max(0, Math.sin(t * 0.9 + m.ph * 3)), 14) * 0.4;
    const target = -0.55 * w + Math.sin(2 * p - 1.1) * 0.18 * w;
    m.earV += ((target - m.earA) * 80 - m.earV * 8) * dt; m.earA += m.earV * dt;
    for (const e of m.ears) { e.piv.rotation.x = m.earA; e.piv.rotation.z = e.base - e.d * (Math.cos(2 * p - 1.3) * 0.1 * w + twitch * 0.5); }
    if (m.pom) m.pom.rotation.x = -m.earA * 0.8;
  }
  if (m.sword) m.sword.visible = !!fighting;
}
const models = new Map();
function charModel(ent, make) {
  let m = models.get(ent);
  if (!m) { m = make(); world.add(m.root); models.set(ent, m); }
  m.seen = true; return m;
}

/* ---------- 3D: 해적선·탄환·바다 생물 ---------- */
const shipModels = new Map();
// 해적선: 통통한 나무 배 + 검은 해골 돛 + 빨간 깃발 + 뱃머리 대포 + 옆면 포문, 해골 선원 탑승
function plankTex() {
  return geo('plankTex', () => {
    const c = document.createElement('canvas'); c.width = 16; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#a8642f'; g.fillRect(0, 0, 16, 128);
    g.fillStyle = '#7a4520'; for (let y = 3; y < 128; y += 9) g.fillRect(0, y, 16, 2);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t;
  });
}
function makeSkelCrew(v) {
  const g = new THREE.Group();
  const coat = mk(cylG(0.16, 0.24, 0.5, 10), mat(0x1e2030, { roughness: 0.75 }), true, 0, 0.25, 0); g.add(coat);
  g.add(bx(0.1, 0.32, 0.02, 0xc4c4cc, {}, false, 0, 0.3, 0.2));
  const sk = makeSkull(v); sk.position.y = 0.62; sk.scale.setScalar(0.95); g.add(sk);
  return g;
}
function makeShip3(big, boss) {
  const g = new THREE.Group(), wood = mat(0x9a5a2c, { roughness: 0.75 }), woodL = mat(0xb87a40, { roughness: 0.7 }), iron = mat(0x3a3a40, { metalness: 0.5, roughness: 0.45 });
  // 둥근 선체: 아래 반구를 길게 늘이고 나무판 줄무늬
  const hull = mk(sphG(1, 26, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ map: plankTex(), roughness: 0.75, side: THREE.DoubleSide }), true, 0, 0.42, 0);
  hull.scale.set(0.8, 0.5, 0.44); g.add(hull);
  const rim = mk(new THREE.TorusGeometry(1, 0.06, 8, 30), woodL, true, 0, 0.42, 0); rim.rotation.x = Math.PI / 2; rim.scale.set(0.8, 0.44, 1); g.add(rim);
  const deck = mk(cylG(1, 1, 0.03, 26), mat(0x8a5328, { roughness: 0.85 }), false, 0, 0.36, 0); deck.scale.set(0.76, 1, 0.4); g.add(deck);
  // 고물(뒤) 높은 갑판과 난간
  g.add(bx(0.42, 0.2, 0.7, 0x9a5a2c, { roughness: 0.75 }, true, -0.5, 0.5, 0));
  g.add(bx(0.44, 0.04, 0.74, 0xb87a40, { roughness: 0.7 }, true, -0.5, 0.61, 0));
  for (const z of [-0.33, 0.33]) g.add(bx(0.44, 0.04, 0.04, 0xb87a40, { roughness: 0.7 }, true, -0.5, 0.78, z));
  g.add(bx(0.04, 0.04, 0.7, 0xb87a40, { roughness: 0.7 }, true, -0.71, 0.78, 0));
  for (const [x, z] of [[-0.3, -0.33], [-0.5, -0.33], [-0.7, -0.33], [-0.3, 0.33], [-0.5, 0.33], [-0.7, 0.33], [-0.71, 0]]) g.add(bx(0.04, 0.17, 0.04, 0x9a5a2c, {}, true, x, 0.7, z));
  // 옆면 포문
  for (const z of [-1, 1]) for (const x of [-0.3, 0.05, 0.4]) {
    const zz = z * 0.44 * Math.sqrt(Math.max(0.05, 1 - (x / 0.8) ** 2 - (0.12 / 0.5) ** 2));
    const ring = mk(new THREE.TorusGeometry(0.065, 0.025, 6, 14), iron, false, x, 0.3, zz); g.add(ring);
    const hole = mk(cylG(0.05, 0.05, 0.02, 10), mat(0x101012), false, x, 0.3, zz); hole.rotation.x = Math.PI / 2; g.add(hole);
  }
  // 뱃머리 대포
  const can = mk(cylG(0.06, 0.08, 0.42, 12), iron, true, 0.72, 0.5, 0); can.rotation.z = -Math.PI / 2 + 0.12; g.add(can);
  const muzzle = mk(new THREE.TorusGeometry(0.065, 0.02, 6, 12), iron, false, 0.93, 0.53, 0); muzzle.rotation.y = Math.PI / 2; g.add(muzzle);
  // 돛대 + 휘어진 검은 해골 돛 + 빨간 깃발
  for (const mx of big ? [-0.12, 0.32] : [0.1]) {
    g.add(mk(cylG(0.03, 0.04, 1.6, 8), wood, true, mx, 1.15, 0));
    g.add(mk(sphG(0.06, 10, 8), woodL, true, mx, 1.97, 0));
    for (const y of [1.65, 0.85]) { const yard = mk(cylG(0.025, 0.025, 0.95, 8), woodL, true, mx + 0.04, y, 0); yard.rotation.x = Math.PI / 2; g.add(yard); }
    const sail = mk(geo('sailC', () => new THREE.CylinderGeometry(1.1, 1.1, 0.78, 16, 1, true, Math.PI / 2 - 0.42, 0.84)), new THREE.MeshStandardMaterial({ map: skullTex(), side: THREE.DoubleSide, roughness: 0.9 }), true, mx + 0.06 - 1.1 + 0.1, 1.25, 0);
    g.add(sail);
    const flag = mk(geo('flagG', () => { const f = new THREE.PlaneGeometry(0.42, 0.2, 6, 1); f.translate(0.21, 0, 0); return f; }), mat(0xe8503a, { roughness: 0.8, side: THREE.DoubleSide }), true, mx, 1.9, 0);
    flag.rotation.y = Math.PI; g.add(flag); (g.userData.flags = g.userData.flags || []).push(flag);
  }
  // 해골 선원
  const c1 = makeSkelCrew(1); c1.position.set(-0.5, 0.63, 0.05); c1.scale.setScalar(0.55); g.add(c1);
  if (big) { const c2 = makeSkelCrew(2); c2.position.set(0.2, 0.37, 0.2); c2.scale.setScalar(0.5); g.add(c2); }
  if (boss) { // 보스: 금관 쓴 해골 선장 + 금빛 테두리
    const cap = makeSkelCrew(2); cap.position.set(-0.5, 0.63, -0.15); cap.scale.setScalar(0.75); g.add(cap);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; cap.add(mk(coneG(0.04, 0.12, 4), mat(0xf2c240, { metalness: 0.7, roughness: 0.3 }), false, Math.cos(a) * 0.17, 1.12, Math.sin(a) * 0.17)); }
    const trim = mk(new THREE.TorusGeometry(1, 0.035, 6, 30), mat(0xf2c240, { metalness: 0.7, roughness: 0.3 }), false, 0, 0.47, 0); trim.rotation.x = Math.PI / 2; trim.scale.set(0.8, 0.44, 1); g.add(trim);
  }
  g.scale.setScalar(boss ? 2.2 : big ? 1.4 : 1);
  scene.add(g);
  return g;
}
const shotPool = [];
function shotMesh(i, kind) {
  let m = shotPool[i];
  if (!m) { m = mk(sphG(1, 10, 8), mat(0x222222), false); scene.add(m); shotPool[i] = m; }
  m.visible = true;
  m.material = kind === 'water' ? mat(0xffe08a, { emissive: 0xffc040, emissiveIntensity: 2.5 }) : kind === 'ball' ? mat(0x332a22, { emissive: 0xff6a20, emissiveIntensity: 0.8 }) : mat(0x2a1a14, { emissive: 0xff3a20, emissiveIntensity: 0.8 });
  m.scale.setScalar(kind === 'water' ? 0.05 : 0.1);
  return m;
}
const finModels = sea.map(c => {
  if (c.kind === 'shark') { const f = mk(coneG(0.16, 0.45, 3), mat(0x4f5f6e, { roughness: 0.5 })); scene.add(f); return f; }
  const g = new THREE.Group(), b = mk(sphG(1, 14, 10), mat(0x7f9bb3, { roughness: 0.35 })); b.scale.set(0.5, 0.17, 0.17); g.add(b);
  const fin = mk(coneG(0.08, 0.2, 4), mat(0x7f9bb3), true, -0.05, 0.18, 0); fin.rotation.z = -0.4; g.add(fin);
  const tail = mk(coneG(0.12, 0.22, 4), mat(0x7f9bb3), true, -0.55, 0, 0); tail.rotation.z = Math.PI / 2; tail.scale.z = 0.3; g.add(tail);
  scene.add(g); return g;
});
const debrisModels = debris.map(b => {
  const m = b.kind === 0 ? bx(rnd(0.5, 0.9), 0.1, 0.18, 0xa77b4f, { roughness: 0.9 }) : b.kind === 1 ? mk(cylG(0.06, 0.06, 0.28, 8), mat(0x9fe6c8, { transparent: true, opacity: 0.8 })) : mk(sphG(0.15, 10, 8), mat(0xe8432e));
  if (b.kind === 1) m.rotation.z = Math.PI / 2;
  scene.add(m); return m;
});
const schoolFish = Array.from({ length: 30 }, () => { const f = ITEM3.fish(); f.scale.setScalar(1.3); f.visible = false; scene.add(f); return f; });
const splashPool = [];

/* ---------- 3D: 매 프레임 동기화 ---------- */
function sync3D(dt) {
  uTime.value = G.t;
  raftY = Math.sin(G.t * 1.1) * 0.04;
  world.position.y = raftY;
  shallow.position.set(raftC.x, -0.2, raftC.y); shallow.scale.setScalar(raftC.r * 2.8);
  syncRaft(); syncStations(); syncPads(visiblePads()); syncSharks(dt); bossHud();
  // 캐릭터
  for (const m of models.values()) m.seen = false;
  const pm = charModel(player, () => mkChar('player', player)); pm.rifle.visible = raidOn; animChar(pm, player, dt); syncStack(pm.carry, G.stack);
  for (const w of workers) { const m = charModel(w, () => mkChar('worker', w)); m.rifle.visible = raidOn && (!m.gl || m.weaponMode !== 'raid'); m.carry.visible = !raidOn; animChar(m, w, dt, { fighting: raidOn && !!w.foe && w.foe.kind === 'boarder' && dist(w.x, w.y, w.foe.x, w.foe.y) < 2.6 }); syncStack(m.carry, w.carry); }
  soldiers.forEach((s, i) => animate3(charModel(s, () => makeKid3(SOLDIER_LOOKS[i % SOLDIER_LOOKS.length])), s, dt));
  for (const id of STATION_IDS) {
    if (!unlocked.has(id) || DEFS[id].type !== 'shop') continue;
    for (const c of [...runtime[id].queue, ...runtime[id].leaving]) { const m = charModel(c, () => mkChar('customer', c)); animChar(m, c, dt); m.root.visible = c.alpha > 0.15; }
  }
  for (const e of enemies) {
    if (e.kind !== 'boarder') continue;
    const m = charModel(e, () => mkChar('boarder', e));
    animChar(m, e, dt, { fighting: e.fighting && alive(e), dead: e.state === 'sink' });
    if (!m.gl && e.state === 'sink') { m.root.rotation.x = Math.min(1.4, e.sinkT * 2); m.root.position.y = -Math.max(0, e.sinkT - 0.7) * 0.6; }
  }
  for (const [ent, m] of models) if (!m.seen) { world.remove(m.root); models.delete(ent); }
  // 해적선
  const seenShips = new Set();
  for (const e of enemies) {
    if (e.kind === 'boarder') continue;
    seenShips.add(e);
    let g = shipModels.get(e); if (!g) { g = makeShip3(e.big, e.boss); shipModels.set(e, g); }
    const sink = e.state === 'sink' ? e.sinkT / 1.4 : 0;
    g.position.set(e.x, -0.55 + Math.sin(e.bob * 2) * 0.05 - sink * 0.9, e.y);
    g.rotation.set(0, -e.ang, sink * 0.6);
    for (const f of g.userData.flags || []) f.rotation.y = Math.PI + Math.sin(G.t * 5 + e.bob) * 0.35;
  }
  for (const [e, g] of shipModels) if (!seenShips.has(e)) { scene.remove(g); shipModels.delete(e); }
  // 탄환
  shots.forEach((s, i) => {
    const k = Math.min(1, s.t / s.dur), m = shotMesh(i, s.kind);
    m.position.set(s.x0 + (s.x1 - s.x0) * k, raftY + (s.z0 * (1 - k) + Math.sin(k * Math.PI) * s.h) / 40, s.y0 + (s.y1 - s.y0) * k);
  });
  for (let i = shots.length; i < shotPool.length; i++) shotPool[i].visible = false;
  // 바다 생물
  sea.forEach((c, i) => {
    const p = seaPos(c), q = seaPos(c, Math.sign(c.w) * 0.04), yaw = -Math.atan2(q.y - p.y, q.x - p.x), m = finModels[i];
    if (c.kind === 'shark') { m.position.set(p.x, -0.12, p.y); m.rotation.y = yaw; m.visible = !GL.ready; return; }
    const jumping = c.jump >= 0 && c.jump <= 1.1;
    m.visible = jumping;
    if (jumping) { const j = c.jump / 1.1; m.position.set(p.x, -0.3 + Math.sin(Math.PI * j) * 1.5, p.y); m.rotation.set(0, yaw, (0.5 - j) * 1.8); }
  });
  debris.forEach((b, i) => { debrisModels[i].position.set(b.x, -0.25 + Math.sin(G.t * 2 + b.ph) * 0.05, b.y); });
  schoolFish.forEach((f, i) => {
    f.visible = !!school && i < school.n;
    if (!f.visible) return;
    const k = Math.min(1, school.t / 4), e = k * k * (3 - 2 * k), cx = school.sx + (school.tx - school.sx) * e, cy = school.sy + (school.ty - school.sy) * e;
    const a = i * 2.4 + G.t * 2, rr = 0.25 + (i % 5) * 0.22;
    f.position.set(cx + Math.cos(a) * rr, -0.22 + Math.sin(G.t * 6 + i) * 0.03, cy + Math.sin(a) * rr);
    f.rotation.y = -Math.atan2(school.ty - school.sy, school.tx - school.sx);
  });
  splashes.forEach((sp, i) => {
    let r = splashPool[i]; if (!r) { r = ringMesh(0.8, 1, 0xffffff, 0.8); scene.add(r); splashPool[i] = r; }
    r.visible = true; const k = sp.t / 0.7; r.position.set(sp.x, -0.15, sp.y); r.scale.setScalar(0.2 + k * 0.6); r.material.opacity = 1 - k;
  });
  for (let i = splashes.length; i < splashPool.length; i++) splashPool[i].visible = false;
  // 낮과 밤
  const n = nightAmt(), dk = Math.min(1, duskAmt());
  const sky = SKY_DAY.clone().lerp(SKY_DUSK, dk * (1 - n)).lerp(SKY_NIGHT, n);
  scene.background.copy(sky); scene.fog.color.copy(sky);
  sun.intensity = 1.05 * (1 - n * 0.82); sun.color.setHex(0xfff0d6).lerp(new THREE.Color(0xff9a5a), dk * 0.7 * (1 - n));
  hemi.intensity = 0.45 * (1 - n * 0.55);
  waterMat.color.copy(WATER_DAY).lerp(WATER_NIGHT, n);
  if (unlocked.has('grill')) { const d = DEFS.grill, s = G.st.grill; lampGrill.position.set(d.x, 0.9, d.y); lampGrill.intensity = (s.inPile > 0 ? 0.5 : 0) + n * 1.3; }
  if (unlocked.has('lighthouse')) { const d = DEFS.lighthouse; lampTower.position.set(d.x, 3.6, d.y); lampTower.intensity = n * 2.2; }
  lampPlayer.position.set(player.x, 1.6, player.y); lampPlayer.intensity = n * 1.1;
  // 카메라: 높은 곳에서 내려다보며 부드럽게 따라감 (흔들림 포함)
  const far = camera.aspect < 0.7 ? 2.6 : 1.8;
  _pv.set(player.x, 12.5 * far, player.y + 9.5 * far);
  camera.position.lerp(_pv, Math.min(1, dt * 4));
  if (shake > 0) camera.position.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake * 0.5));
  camera.lookAt(player.x, 0.4, player.y);
  // 밤에는 달빛처럼 머리 위에서 비춰 그림자를 짧게
  sun.position.set(player.x - 7 * (1 - n * 0.85), 14, player.y + 4 * (1 - n * 0.85)); sun.target.position.set(player.x, 0, player.y);
  camera.updateMatrixWorld();
  syncFx(dt);
}
