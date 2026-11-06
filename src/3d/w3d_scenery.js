/* ---------- 열대 해안 배경: 청록 얕은 바다, 모래섬·야자수, 바위 절벽·기둥, 기둥 오두막, 정박한 범선 ---------- */
// 뗏목이 가장 넓을 때(가로 25 × 세로 16)와 손님 부두·낚시터 물길을 피해서 배치합니다.
const SCENERY_SHALLOWS = []; // 바다 셰이더용 얕은 물 둘레 [x, z, 반지름]
let _sceneSeed = 1337;
const srnd = (a, b) => { _sceneSeed = (_sceneSeed * 16807) % 2147483647; return a + (_sceneSeed / 2147483647) * (b - a); };
const SCN_MAT = {
  sand: mat(0xf3dfa6, { roughness: 1 }), wetSand: mat(0xdcc68f, { roughness: 1 }),
  rock: mat(0x8f8a9c, { roughness: 0.95 }), rockDark: mat(0x6d6a7c, { roughness: 1 }), rockLight: mat(0xb0a9b8, { roughness: 0.95 }),
  leaf: mat(0x3c9a46, { roughness: 0.85 }), leafLight: mat(0x6cc35a, { roughness: 0.85 }), moss: mat(0x58a84a, { roughness: 0.9 }),
  wood: mat(0xa06d3d, { roughness: 0.85 }), woodDark: mat(0x6f4a2b, { roughness: 0.9 }), roof: mat(0xd5653d, { roughness: 0.8 }),
  sail: mat(0xf5ead0, { roughness: 0.9, side: THREE.DoubleSide }), flag: mat(0x2f8fd0, { roughness: 0.8, side: THREE.DoubleSide }),
};
const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
const rockGeo = () => geo('scn-rock', () => new THREE.DodecahedronGeometry(1, 0));
const foamRings = [], bobbers = [];
function foamRing(x, z, r) {
  const m = new THREE.Mesh(geo(`scn-foam${r.toFixed(2)}`, () => new THREE.RingGeometry(r * 0.92, r * 1.18, 28)), foamMat.clone());
  m.rotation.x = -Math.PI / 2; m.position.set(x, -0.36, z); scene.add(m); foamRings.push({ m, ph: srnd(0, 6) }); return m;
}
function bushCluster(g, x, y, z, s) {
  for (let i = 0; i < 4; i++) {
    const b = mk(sphG(1, 10, 8), i % 2 ? SCN_MAT.leaf : SCN_MAT.leafLight, false, x + srnd(-0.6, 0.6) * s, y + srnd(0, 0.35) * s, z + srnd(-0.6, 0.6) * s);
    b.scale.set(s * srnd(0.55, 0.8), s * srnd(0.4, 0.6), s * srnd(0.55, 0.8)); g.add(b);
  }
}
// 모래 해변 섬 (야자수·바위 몇 개)
function beach(x, z, rx, rz, palms = 3) {
  const g = new THREE.Group(); g.position.set(x, -0.62, z);
  const wet = mk(sphG(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), SCN_MAT.wetSand, false); wet.scale.set(rx * 1.12, 0.55, rz * 1.12); g.add(wet);
  const dry = mk(sphG(1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), SCN_MAT.sand, false, 0, 0.05, 0); dry.scale.set(rx, 0.85, rz); g.add(dry);
  for (let i = 0; i < palms; i++) { const a = srnd(0, 6.28), d = srnd(0.1, 0.55); palm(g, Math.cos(a) * rx * d, Math.sin(a) * rz * d, srnd(0.8, 1.15)); }
  for (let i = 0; i < 3; i++) { const a = srnd(0, 6.28), r = mk(rockGeo(), SCN_MAT.rockLight, false, Math.cos(a) * rx * 0.85, 0.25, Math.sin(a) * rz * 0.85); r.scale.setScalar(srnd(0.18, 0.35)); g.add(r); }
  scene.add(g); SCENERY_SHALLOWS.push([x, z, Math.max(rx, rz)]); foamRing(x, z, Math.max(rx, rz) * 1.08);
  return g;
}
// 초록 덤불을 얹은 바위 절벽
function cliff(x, z, r, h) {
  const g = new THREE.Group(); g.position.set(x, -0.5, z);
  const layers = Math.max(3, Math.round(h / 1.6));
  for (let i = 0; i < layers; i++) {
    const k = i / layers, rr = r * (1 - k * 0.35);
    for (let j = 0; j < 3; j++) {
      const a = srnd(0, 6.28), rk = mk(rockGeo(), j % 2 ? SCN_MAT.rock : SCN_MAT.rockDark, i === 0, Math.cos(a) * rr * 0.35, h * k + 0.6, Math.sin(a) * rr * 0.35);
      rk.scale.set(rr * srnd(0.75, 0.95), h / layers * 0.9, rr * srnd(0.75, 0.95)); rk.rotation.y = srnd(0, 6.28); g.add(rk);
    }
  }
  const cap = mk(sphG(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), SCN_MAT.moss, false, 0, h + 0.3, 0); cap.scale.set(r * 0.7, 0.35, r * 0.7); g.add(cap);
  bushCluster(g, 0, h + 0.45, 0, r * 0.45);
  const top = new THREE.Group(); top.position.y = h; g.add(top); // 꼭대기 야자수
  for (let i = 0; i < 3; i++) { const a = i * 2.1 + srnd(0, 1); palm(top, Math.cos(a) * r * 0.35, Math.sin(a) * r * 0.35, srnd(0.7, 0.95)); }
  scene.add(g); SCENERY_SHALLOWS.push([x, z, r * 1.25]); foamRing(x, z, r * 1.05);
  return g;
}
// 바다 위에 솟은 높은 바위 기둥
function spire(x, z, r, h) {
  const g = new THREE.Group(); g.position.set(x, -0.5, z);
  const col = mk(cylG(r * 0.55, r, h, 7), SCN_MAT.rock, true, 0, h / 2, 0); g.add(col);
  for (let i = 0; i < 5; i++) { const rk = mk(rockGeo(), SCN_MAT.rockDark, false, srnd(-0.4, 0.4) * r, srnd(0.2, 0.85) * h, srnd(-0.4, 0.4) * r); rk.scale.setScalar(r * srnd(0.45, 0.65)); g.add(rk); }
  bushCluster(g, 0, h + 0.1, 0, r * 0.7);
  scene.add(g); SCENERY_SHALLOWS.push([x, z, r * 1.6]); foamRing(x, z, r * 1.2);
  return g;
}
// 물 위 바위 + 물거품
function foamRock(x, z, s) {
  const rk = mk(rockGeo(), SCN_MAT.rockLight, false, x, -0.35, z); rk.scale.set(s, s * 0.6, s * 0.9); rk.rotation.y = srnd(0, 6.28); scene.add(rk);
  foamRing(x, z, s * 1.1); SCENERY_SHALLOWS.push([x, z, s * 1.8]);
}
// 기둥 위 나무 오두막 (주황 지붕)
function stiltHut(x, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, -0.45, z); g.rotation.y = rot;
  for (const [px, pz] of [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.6], [0.7, 0.6]]) g.add(mk(cylG(0.07, 0.08, 1.4, 6), SCN_MAT.woodDark, false, px, 0.7, pz));
  g.add(bx(1.8, 0.1, 1.6, 0x9a673a, { roughness: 0.85 }, true, 0, 1.4, 0));
  g.add(bx(1.4, 0.9, 1.15, 0xc79458, { roughness: 0.85 }, true, 0, 1.9, 0));
  g.add(bx(0.32, 0.5, 0.04, 0x5a3a20, {}, false, 0, 1.72, 0.6));
  const roof = mk(coneG(1.25, 0.8, 4), SCN_MAT.roof, true, 0, 2.75, 0); roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.95); g.add(roof);
  for (let i = 0; i < 4; i++) g.add(bx(0.32, 0.05, 1.6, 0xa87545, {}, false, -0.2 + i * 0.36, 1.38, 1.5));
  scene.add(g); return g;
}
// 정박한 범선 (크림색 돛, 파란 깃발)
function sailboat(x, z, rot = 0, s = 1) {
  const g = new THREE.Group(); g.position.set(x, -0.5, z); g.rotation.y = rot; g.scale.setScalar(s);
  const hull = mk(sphG(1, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), SCN_MAT.wood, true, 0, 0.45, 0); hull.scale.set(1.6, 0.6, 0.6); g.add(hull);
  g.add(bx(3.0, 0.08, 1.05, 0xc89a62, {}, false, 0, 0.47, 0));
  g.add(bx(0.7, 0.4, 0.9, 0x8a5a30, {}, true, -1.05, 0.7, 0));
  for (const [mx, h] of [[0.45, 2.6], [-0.35, 2.1]]) {
    g.add(mk(cylG(0.04, 0.05, h, 7), SCN_MAT.woodDark, true, mx, 0.45 + h / 2, 0));
    for (const [y, w] of [[0.45 + h * 0.62, 0.95], [0.45 + h * 0.32, 1.15]]) {
      const sl = mk(geo(`scn-sail${w}`, () => { const p = new THREE.PlaneGeometry(w, 0.62, 4, 1); const a = p.attributes.position; for (let i = 0; i < a.count; i++) a.setZ(i, Math.cos(a.getX(i) / w * Math.PI) * 0.12); p.computeVertexNormals(); return p; }), SCN_MAT.sail, true, mx + 0.04, y, 0);
      sl.rotation.y = Math.PI / 2; g.add(sl);
    }
  }
  const fl = mk(geo('scn-flag', () => new THREE.PlaneGeometry(0.4, 0.2)), SCN_MAT.flag, false, 0.65, 3.15, 0); g.add(fl);
  scene.add(g); bobbers.push({ g, y: -0.5, ph: srnd(0, 6), flag: fl }); foamRing(x, z, 1.9 * s);
  return g;
}
function rowboat(x, z, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, -0.45, z); g.rotation.y = rot;
  const h = mk(sphG(1, 14, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), SCN_MAT.wood, false, 0, 0.18, 0); h.scale.set(0.75, 0.3, 0.32); g.add(h);
  g.add(bx(0.08, 0.04, 0.55, 0x6f4a2b, {}, false, 0, 0.2, 0));
  scene.add(g); bobbers.push({ g, y: -0.45, ph: srnd(0, 6) }); return g;
}
function pier(x, z, len, rot = 0) {
  const g = new THREE.Group(); g.position.set(x, -0.45, z); g.rotation.y = rot;
  for (let i = 0; i < len; i++) g.add(bx(0.32, 0.06, 1.1, 0xb07b47, { roughness: 0.85 }, false, i * 0.38, 0.55, 0));
  for (let i = 0; i <= len; i += 2) for (const s of [-0.55, 0.55]) g.add(mk(cylG(0.05, 0.05, 0.9, 6), SCN_MAT.woodDark, false, i * 0.38, 0.35, s));
  scene.add(g); return g;
}

// 배치: 북서 절벽 해안 → 북쪽 해변 마을 → 동쪽 바위 기둥 → 남동 해변·범선 → 남서 절벽 → 서쪽 바위 기둥·범선
cliff(-9, -7.5, 3.6, 6); beach(-5, -3.6, 2.6, 1.7, 2); stiltHut(-4.2, -6.2, 0.4);
beach(17.5, -7.8, 5.8, 2.3, 4); stiltHut(21.2, -8.6, -0.2); stiltHut(14.2, -9.2, 0.25); pier(16.2, -5.6, 6, Math.PI / 2); rowboat(13, -4.6, 0.6);
spire(31, -6.5, 2.1, 8); foamRock(27.8, -2.6, 0.55); foamRock(33.5, -1.2, 0.7);
cliff(34, 14.5, 3.2, 5); beach(30.2, 19.2, 3, 1.9, 2);
beach(21.5, 24.5, 5, 2.4, 3); stiltHut(24.5, 25.6, 3.3); sailboat(15.2, 22.6, 0.35, 1.1);
cliff(-4, 25, 3.8, 7); beach(1.8, 22.8, 2.6, 1.6, 2); foamRock(12.6, 19.8, 0.5);
spire(-10.5, 15.5, 1.8, 6.5); sailboat(-9, 0.8, -0.5, 1); foamRock(-4.2, 12.2, 0.6); foamRock(12.8, -3.4, 0.45); foamRock(28.2, 2.4, 0.5);

function syncScenery(dt) {
  for (const f of foamRings) f.m.material.opacity = 0.42 + Math.sin(G.t * 1.4 + f.ph) * 0.18;
  for (const b of bobbers) {
    b.g.position.y = b.y + Math.sin(G.t * 1.1 + b.ph) * 0.05; b.g.rotation.z = Math.sin(G.t * 0.9 + b.ph) * 0.03;
    if (b.flag) b.flag.rotation.y = Math.sin(G.t * 4 + b.ph) * 0.35;
  }
}

function syncSeaShallows() {
  const b = customerRaftBounds();
  if (Number.isFinite(b.x0)) uRaft.value.set(b.x0, b.y0, b.x1, b.y1);
  if (uIslN.value !== SCENERY_SHALLOWS.length) {
    SCENERY_SHALLOWS.slice(0, 24).forEach(([x, z, r], i) => uIsl.value[i].set(x, z, r));
    uIslN.value = Math.min(24, SCENERY_SHALLOWS.length);
  }
}
