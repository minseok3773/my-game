/* ---------- 3D: 동작이 들어 있는 캐릭터 (Quaternius Pirate Kit, CC0) ---------- */
// 모형을 불러오기 전이나 불러오지 못하면 기존 도형 캐릭터로 그대로 진행
const GL = { ready: false, models: {} };
if (THREE.GLTFLoader && THREE.SkeletonUtils) {
  const loader = new THREE.GLTFLoader();
  Promise.all(['henry', 'captain', 'mako', 'sharky', 'shark'].map(n => loader.loadAsync(`models/${n}.json`).then(g => [n, g])))
    .then(list => {
      for (const [n, g] of list) {
        g.scene.traverse(o => {
          if (!o.isMesh) return;
          o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false;
          // 색상표는 칸마다 한 색이라 번지지 않게, 다른 재질과 같은 색 공간으로
          if (o.material.map) { o.material.map.encoding = THREE.sRGBEncoding; o.material.map.magFilter = THREE.NearestFilter; o.material.map.needsUpdate = true; }
        });
        const box = new THREE.Box3().setFromObject(g.scene);
        GL.models[n] = { scene: g.scene, clips: g.animations, h: box.max.y - box.min.y, len: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) };
      }
      GL.ready = true;
      for (const m of models.values()) world.remove(m.root);
      models.clear();
    })
    .catch(e => console.warn('캐릭터 모형을 불러오지 못해 도형 캐릭터로 진행합니다', e));
}
// 해적선 위의 작은 장식 선원용 해골. 실제 플레이 캐릭터는 아래 원본 모델을 사용합니다.
function makeSkull(v = 1) {
  const g = new THREE.Group(), bone = mat(0xeee4cf, { roughness: 0.55 }), dark = mat(0x121216, { roughness: 0.9 });
  const cr = mk(sphG(0.27, 20, 14), bone, true, 0, 0.2, 0); cr.scale.set(1, 0.92, 1); g.add(cr);
  const face = mk(sphG(0.2, 16, 12), bone, true, 0, 0.07, 0.08); face.scale.set(1.08, 0.8, 0.9); g.add(face);
  for (const d of [-1, 1]) {
    const eye = mk(sphG(0.088, 12, 10), dark, false, d * 0.105, 0.14, 0.21); eye.scale.set(1.15, 1, 0.55); eye.rotation.z = d * 0.35; g.add(eye);
    const cheek = mk(sphG(0.07, 10, 8), bone, true, d * 0.16, 0.04, 0.15); cheek.scale.set(1, 0.7, 0.8); g.add(cheek);
    const brow = mk(sphG(0.06, 10, 8), bone, true, d * 0.1, 0.225, 0.2); brow.scale.set(1.5, 0.5, 0.6); brow.rotation.z = -d * 0.4; g.add(brow);
  }
  const nose = mk(coneG(0.035, 0.06, 3), dark, false, 0, 0.06, 0.255); nose.rotation.x = Math.PI; g.add(nose);
  g.add(bx(0.28, 0.09, 0.17, 0xeee4cf, { roughness: 0.55 }, true, 0, -0.03, 0.07));
  g.add(bx(0.21, 0.07, 0.02, 0x121216, {}, false, 0, -0.025, 0.152));
  for (let i = 0; i < 6; i++) g.add(bx(0.03, 0.06, 0.02, 0xfaf6ea, { roughness: 0.4 }, false, -0.088 + i * 0.035, -0.025, 0.16));
  // 삼각 해적 모자
  const hat = new THREE.Group(); hat.position.set(0, 0.32, -0.02); hat.rotation.x = -0.15; hat.scale.setScalar(1.12); g.add(hat);
  const black = mat(0x1a1a20, { roughness: 0.7 }), gold = mat(0xd9a640, { metalness: 0.6, roughness: 0.35 });
  if (v === 2) { const band = mk(new THREE.TorusGeometry(0.255, 0.05, 8, 22), mat(0xd9732a, { roughness: 0.8 }), true, 0, -0.03, 0); band.rotation.x = Math.PI / 2; hat.add(band); }
  const crown = mk(cylG(0.2, 0.25, 0.2, 16), black, true, 0, 0.08, 0); hat.add(crown);
  const brim = mk(cylG(0.4, 0.4, 0.035, 3), black, true, 0, -0.01, 0); brim.rotation.y = Math.PI / 6; hat.add(brim);
  for (const a of [0, Math.PI * 2 / 3, -Math.PI * 2 / 3]) {
    const f = new THREE.Group(); f.rotation.y = a; hat.add(f);
    const flap = bx(0.46, 0.2, 0.035, 0x1a1a20, { roughness: 0.7 }, true, 0, 0.08, 0.2); flap.rotation.x = -0.3; f.add(flap);
    if (v === 2) { const tr = mk(boxG(), gold, false, 0, 0.18, 0.17); tr.scale.set(0.48, 0.03, 0.045); tr.rotation.x = -0.3; f.add(tr); }
    else for (const x of [-0.14, 0.14]) f.add(mk(sphG(0.022, 8, 6), mat(0xd8d8de, { metalness: 0.7, roughness: 0.3 }), false, x, 0.1, 0.23));
  }
  if (v === 2) { // 앞면 해골 문장
    hat.add(mk(sphG(0.045, 10, 8), bone, false, 0, 0.11, 0.245));
    for (const d of [-1, 1]) { const b = bx(0.13, 0.018, 0.015, 0xeee4cf, {}, false, 0, 0.06, 0.25); b.rotation.z = d * 0.6; hat.add(b); }
  } else { // 모자 위 작은 해골
    const sk = mk(sphG(0.07, 12, 10), bone, true, 0.03, 0.2, 0.06); hat.add(sk);
    for (const d of [-1, 1]) hat.add(mk(sphG(0.016, 6, 5), dark, false, 0.03 + d * 0.025, 0.2, 0.125));
  }
  return g;
}

const _hv = new THREE.Vector3();
const clipName = c => c.name.split('|').pop();
// 동작 전환: 새 동작은 서서히 켜고 이전 동작은 서서히 끔
function playClip(m, name, fade = 0.2) {
  const a = m.actions[name];
  if (!a || m.cur === a) return;
  a.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (m.cur) m.cur.fadeOut(fade);
  m.cur = a;
}
// 렌더 동기화는 로딩 중인 임시 모형에도 운반물·물총 그룹이 있다고 가정합니다.
function attachCharacterGear(m, parent = m.root, height = 0.95, depth = 0.38) {
  if (!m.carry) { m.carry = new THREE.Group(); m.carry.position.set(0, 1.95, 0); parent.add(m.carry); }
  if (!m.rifle) {
    m.rifle = new THREE.Group(); m.rifle.position.set(0, height, depth); m.rifle.visible = false; parent.add(m.rifle);
    m.rifle.add(bx(0.05, 0.06, 0.55, 0x2b2b30, { metalness: 0.5, roughness: 0.35 }, true, 0, 0, 0.12));
    m.rifle.add(bx(0.06, 0.09, 0.22, 0x7a5232, { roughness: 0.7 }, true, 0, -0.02, -0.12));
  }
  if (!m.sword) {
    m.sword = new THREE.Group(); m.sword.position.set(0.25, height, depth); parent.add(m.sword);
    m.sword.add(bx(0.065, 0.48, 0.025, 0xe0edf1, { metalness: 0.45, roughness: 0.4 }, true, 0, 0.23, 0));
    m.sword.add(bx(0.18, 0.035, 0.05, 0xf0bd49, {}, true, 0, 0, 0));
    m.sword.add(bx(0.045, 0.13, 0.045, 0x775237, {}, true, 0, -0.07, 0));
    m.sword.visible = false;
  }
  if (!m.slash) {
    m.slash = new THREE.Mesh(geo('sword-arc', () => new THREE.RingGeometry(0.32, 0.39, 14, 1, -1.1, 2.2)), new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    m.slash.position.set(0, 0.85, 0.4); m.slash.rotation.x = -0.8; m.slash.visible = false; m.root.add(m.slash);
  }
  return m;
}
function makeGL(name, o = {}) {
  const src = GL.models[name], root = new THREE.Group(), body = THREE.SkeletonUtils.clone(src.scene);
  body.scale.setScalar((o.height || 1.6) / src.h); root.add(body);
  const mixer = new THREE.AnimationMixer(body), actions = {};
  for (const c of src.clips) actions[clipName(c)] = mixer.clipAction(c);
  for (const k of ['Death']) if (actions[k]) { actions[k].setLoop(THREE.LoopOnce, 1); actions[k].clampWhenFinished = true; }
  const weapons = []; let head = null, hand = null;
  body.traverse(x => {
    if (x.isMesh && /weapon/i.test(x.name)) weapons.push(x);
    if (x.isBone && !head && /^head/i.test(x.name)) head = x;
    if (x.isBone && !hand && /(fist|hand|wrist).*(r|right)|(r|right).*(fist|hand)|lowerarm\.r/i.test(x.name)) hand = x;
  });
  const m = { root, body, gl: true, mixer, actions, cur: null, heading: 0, ph: rnd(0, 6), idleT: 0, weapons, head, hand, weaponMode: o.weapon || 'never', walk: o.walk && actions[o.walk] ? o.walk : 'Walk' };
  playClip(m, 'Idle', 0);
  return attachCharacterGear(m, root);
}
function animateGL(m, ent, dt, st = {}) {
  const vx = ent.vx || 0, vy = ent.vy || 0, spd = Math.hypot(vx, vy), t = G.t;
  if (spd > 0.12) { m.idleT = 0; m.rest = undefined; } else m.idleT += dt;
  if (m.rest === undefined && spd <= 0.12) m.rest = m.heading;
  const look = m.idleT > 3 && ent.aimYaw === undefined ? m.rest + Math.sin(t * 0.6 + m.ph) * 0.5 : undefined;
  const tg = (st.fighting || ent.fighting) ? ent.aimYaw : spd > 0.12 ? Math.atan2(vx, vy) : ent.aimYaw ?? look;
  if (tg !== undefined) m.heading += Math.atan2(Math.sin(tg - m.heading), Math.cos(tg - m.heading)) * Math.min(1, dt * (spd > 0.12 ? 14 : 5));
  m.root.rotation.y = m.heading;
  m.root.position.set(ent.x, 0, ent.y);
  // 상태에 맞는 동작 고르기: 멈춤 → 걷기 → 달리기, 싸움, 쓰러짐
  let clip = spd < 0.15 ? 'Idle' : spd < 2.1 || m.walk !== 'Walk' ? m.walk : 'Run';
  if (st.fighting || ent.fighting || ent.swingT > 0) clip = 'Sword';
  if (st.dead) clip = 'Death';
  playClip(m, clip, st.dead ? 0.1 : 0.22);
  if (m.actions.Walk) m.actions.Walk.timeScale = Math.max(0.6, Math.min(1.6, spd / 1.5));
  if (m.walk !== 'Walk') m.actions[m.walk].timeScale = Math.max(0.7, Math.min(2.2, spd / (m.walkSpd || 1.6)));
  if (m.actions.Run) m.actions.Run.timeScale = Math.max(0.7, Math.min(1.5, spd / 3.3));
  m.mixer.update(dt);
  const armed = m.weaponMode === 'always' || (m.weaponMode === 'raid' && raidOn);
  for (const w of m.weapons) w.visible = armed;
  if (m.melee || (armed && m.weapons.length)) m.rifle.visible = false; // 원본 커틀러스와 물총이 겹치지 않게 함
  if (m.rifle.visible && m.hand) { m.hand.getWorldPosition(_hv); m.root.worldToLocal(_hv); m.rifle.position.copy(_hv); }
  if (m.melee && m.sword && m.hand && m.weaponMode !== 'always') {
    m.hand.getWorldPosition(_hv); m.root.worldToLocal(_hv); m.sword.position.copy(_hv);
    m.sword.rotation.set(0.5, 0, -0.55 + Math.sin((1 - Math.min(0.4, ent.swingT || 0) / 0.4) * Math.PI) * 1.3);
  }
}

// 주인공: 오리지널 "바다 수호 기사". Henry 모형의 색을 바꾸고 은빛 갑옷 부품을 뼈대에 붙여 동작을 그대로 따라갑니다.
const _recol = {};
function recolorTex(map, key, pairs) {
  if (_recol[key]) return _recol[key];
  const img = map.image, cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, cv.width, cv.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) for (const [f, t] of pairs) if (Math.abs(a[i] - f[0]) < 6 && Math.abs(a[i + 1] - f[1]) < 6 && Math.abs(a[i + 2] - f[2]) < 6) { a[i] = t[0]; a[i + 1] = t[1]; a[i + 2] = t[2]; break; }
  cx.putImageData(d, 0, 0);
  const tx = new THREE.CanvasTexture(cv); tx.flipY = map.flipY; tx.encoding = map.encoding; tx.magFilter = THREE.NearestFilter;
  return (_recol[key] = tx);
}
const HERO_PAIRS = [
  [[90, 63, 40], [238, 198, 162]], [[85, 59, 35], [226, 184, 148]], // 피부
  [[27, 27, 27], [96, 62, 38]], [[139, 30, 31], [96, 62, 38]], [[32, 26, 16], [74, 48, 30]],     // 머리카락·눈, 두건 자리는 갈색 머리로
  [[131, 119, 94], [38, 58, 108]], [[68, 67, 58], [30, 44, 84]], [[58, 92, 97], [42, 64, 118]], // 남색 옷
];
// 뼈대의 처음 자세 기준으로 캐릭터 좌표(미터)에서 만든 부품을 붙임 → 이후 뼈를 따라 움직임
const _bp = new THREE.Vector3(), _bq = new THREE.Quaternion(), _bs = new THREE.Vector3();
function boneMount(bone, build) {
  bone.updateWorldMatrix(true, false); bone.matrixWorld.decompose(_bp, _bq, _bs);
  const holder = new THREE.Group(); holder.quaternion.copy(_bq).invert(); holder.scale.set(1 / _bs.x, 1 / _bs.y, 1 / _bs.z);
  const g = new THREE.Group(); holder.add(g); bone.add(holder); build(g); return g;
}
function makeHero() {
  const m = makeGL('henry', { height: 1.66, weapon: 'never' });
  m.body.traverse(x => { if (x.isMesh && x.material.map) { x.material = x.material.clone(); x.material.map = recolorTex(x.material.map, 'hero', HERO_PAIRS); } });
  const B = {}; m.body.traverse(x => { if (x.isBone) B[x.name] = x; });
  m.root.updateMatrixWorld(true);
  const silver = mat(0xdde3ea, { metalness: 0.55, roughness: 0.3 }), steel = mat(0xb9c2cc, { metalness: 0.55, roughness: 0.35 });
  const gold = mat(0xf0c050, { metalness: 0.7, roughness: 0.28 }), teal = mat(0x2fd0c8, { metalness: 0.2, roughness: 0.15, emissive: 0x0a5a58, emissiveIntensity: 0.5 });
  const coral = mat(0xf07a5a, { roughness: 0.75 });
  const H = (n, f) => B[n] && boneMount(B[n], f);
  // 투구: 둥근 은빛 덮개 + 금 테 + 정면 청록 보석 + 귀 보호대 + 위쪽 조개 볏
  H('Head', g => {
    const dome = mk(sphG(0.3, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), silver, true, 0, 0.2, 0.06); dome.scale.set(1.08, 1.02, 1.1); g.add(dome);
    const band = mk(new THREE.TorusGeometry(0.3, 0.032, 8, 30), gold, true, 0, 0.19, 0.06); band.rotation.x = Math.PI / 2; band.scale.set(1.08, 1.1, 1); g.add(band);
    const gem = mk(sphG(0.045, 12, 10), teal, false, 0, 0.23, 0.39); gem.scale.set(1, 1.2, 0.6); g.add(gem);
    g.add(mk(new THREE.TorusGeometry(0.05, 0.012, 6, 14), gold, false, 0, 0.23, 0.38));
    for (const d of [-1, 1]) { const ear = mk(sphG(0.085, 12, 10), steel, true, d * 0.31, 0.12, 0.08); ear.scale.set(0.45, 1, 1); g.add(ear); g.add(mk(sphG(0.03, 8, 6), gold, false, d * 0.345, 0.12, 0.08)); }
    const crest = new THREE.Group(); crest.position.set(0, 0.47, 0.02); g.add(crest);
    for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.33, r = mk(sphG(0.05, 10, 8), gold, true, Math.sin(a) * 0.1, Math.cos(a) * 0.1, 0); r.scale.set(0.55, 1.9, 0.45); r.rotation.z = -a; crest.add(r); }
    crest.add(mk(sphG(0.04, 10, 8), gold, true, 0, 0, 0));
  });
  // 가슴판 + 둥근 금 버클 문장, 산호색 목도리
  H('Torso', g => {
    const plate = mk(sphG(0.24, 20, 12, -Math.PI / 2, Math.PI, 0.25, Math.PI * 0.7), silver, true, 0, 0.02, 0.05); plate.scale.set(1.05, 0.95, 0.8); g.add(plate);
    const emb = mk(new THREE.TorusGeometry(0.055, 0.016, 8, 18), gold, false, 0, 0.05, 0.245); g.add(emb);
    g.add(mk(sphG(0.04, 12, 10), teal, false, 0, 0.05, 0.248));
    const scarf = mk(new THREE.TorusGeometry(0.12, 0.05, 8, 18), coral, true, 0, 0.21, 0.02); scarf.rotation.x = Math.PI / 2; scarf.scale.set(1.15, 1, 1); g.add(scarf);
    const tail = mk(sphG(0.05, 8, 6), coral, true, 0.07, 0.12, -0.11); tail.scale.set(0.8, 2, 0.5); tail.rotation.z = 0.3; g.add(tail);
  });
  // 어깨 보호대
  for (const [n, d] of [['UpperArmL', 1], ['UpperArmR', -1]]) H(n, g => {
    const pad = mk(sphG(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), silver, true, d * 0.02, 0.02, 0); pad.scale.set(1.15, 0.85, 1.05); g.add(pad);
    const rim = mk(new THREE.TorusGeometry(0.14, 0.022, 6, 20), gold, false, d * 0.02, 0.0, 0); rim.rotation.x = Math.PI / 2; rim.scale.set(1.15, 1.05, 1); g.add(rim);
  });
  // 팔 보호대 + 큰 은빛 주먹
  for (const [n, d] of [['LowerArmL', 1], ['LowerArmR', -1]]) H(n, g => {
    const bracer = mk(cylG(0.085, 0.07, 0.2, 14), silver, true, d * 0.14, 0, 0); bracer.rotation.z = Math.PI / 2; g.add(bracer);
    const cuff = mk(new THREE.TorusGeometry(0.075, 0.018, 6, 16), gold, false, d * 0.05, 0, 0); cuff.rotation.y = Math.PI / 2; g.add(cuff);
    const fist = mk(sphG(0.14, 16, 12), silver, true, d * 0.37, 0, 0); fist.scale.set(1.25, 0.95, 1.1); g.add(fist);
  });
  // 은빛 벨트 + 둥근 금 버클
  H('Hips', g => {
    const belt = mk(new THREE.TorusGeometry(0.2, 0.04, 8, 26), steel, true, 0, 0.04, 0.03); belt.rotation.x = Math.PI / 2; belt.scale.set(1.08, 0.92, 1); g.add(belt);
    const buckle = mk(cylG(0.06, 0.06, 0.03, 16), gold, false, 0, 0.04, 0.22); buckle.rotation.x = Math.PI / 2; g.add(buckle);
    g.add(mk(sphG(0.03, 10, 8), teal, false, 0, 0.04, 0.24));
  });
  // 장화: 정강이 덮개 + 금 띠 + 발등 덮개
  for (const n of ['LowerLegL', 'LowerLegR']) H(n, g => {
    g.add(mk(cylG(0.1, 0.112, 0.25, 14), silver, true, 0, -0.13, 0));
    const ring = mk(new THREE.TorusGeometry(0.103, 0.022, 6, 18), gold, false, 0, -0.01, 0); ring.rotation.x = Math.PI / 2; g.add(ring);
  });
  for (const n of ['FootL', 'FootR']) H(n, g => { const toe = mk(sphG(0.12, 14, 10), silver, true, 0, 0.04, 0.11); toe.scale.set(1.0, 0.62, 1.65); g.add(toe); });
  m.armor = true;
  return m;
}

// 일꾼: 오리지널 "뼈다귀 곰 선원". Henry 몸을 머리와 같은 하얀색으로 칠하고, 원래 머리는 숨긴 뒤
// 둥근 곰 해골 머리·하얀 뼈 무늬·청록 선원 스카프를 뼈대에 붙여 원본 동작을 그대로 따라갑니다.
function makeBoneBear(height = 1.58) {
  const m = makeGL('henry', { height, weapon: 'never' });
  // 원래 재질을 복사해 색만 바꿈 (뼈대를 따라 변형되는 skinning 설정 유지)
  m.body.traverse(x => { if (x.isMesh && !/weapon/i.test(x.name)) { x.material = x.material.clone(); x.material.map = null; x.material.color.setHex(0xf3f0f5); x.material.roughness = 0.45; x.material.metalness = 0; x.material.needsUpdate = true; } });
  const B = {}; m.body.traverse(x => { if (x.isBone) B[x.name] = x; });
  m.root.updateMatrixWorld(true);
  const bone = mat(0xb9abd2, { roughness: 0.5 }), white = mat(0xf6f4f1, { roughness: 0.35 }), dark = mat(0x2b2631, { roughness: 0.6 });
  const earIn = mat(0xf6b3c6, { roughness: 0.6 }), scarf = mat(0x2fb7b0, { roughness: 0.7 });
  const blush = mat(0xffa6bf, { roughness: 0.7 }), shine = mat(0xffffff, { roughness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.4 });
  const H = (n, f) => B[n] && boneMount(B[n], f);
  const cap = (g, x, y, z, sx, sy, sz, rz = 0) => { const c = mk(sphG(1, 12, 8), bone, false, x, y, z); c.scale.set(sx, sy, sz); c.rotation.z = rz; g.add(c); return c; };
  // 곰 해골 머리 (목에 붙임: 원래 머리 뼈는 매 프레임 숨김)
  H('Neck', root => {
    const g = new THREE.Group(); g.scale.setScalar(1.16); root.add(g); // 몸보다 큰 머리로 아기자기하게
    const head = mk(sphG(0.33, 24, 18), white, true, 0, 0.3, 0.05); head.scale.set(1.06, 0.96, 0.96); g.add(head);
    const muzzle = mk(sphG(0.17, 18, 12), white, true, 0, 0.13, 0.2); muzzle.scale.set(1.25, 0.7, 0.85); g.add(muzzle);
    for (const d of [-1, 1]) {
      const ear = mk(sphG(0.13, 16, 12), white, true, d * 0.27, 0.56, 0.0); ear.scale.set(1, 1, 0.6); g.add(ear);
      const inner = mk(sphG(0.08, 12, 10), earIn, false, d * 0.27, 0.55, 0.06); inner.scale.set(1, 1, 0.35); g.add(inner);
      const eye = mk(sphG(0.092, 16, 12), dark, false, d * 0.125, 0.3, 0.33); eye.scale.set(1, 1.08, 0.45); g.add(eye);
      g.add(mk(sphG(0.03, 10, 8), shine, false, d * 0.125 + 0.03, 0.34, 0.37));   // 눈 반짝임
      g.add(mk(sphG(0.014, 8, 6), shine, false, d * 0.125 - 0.025, 0.27, 0.372));
      const cheek = mk(sphG(0.058, 12, 10), blush, false, d * 0.215, 0.19, 0.28); cheek.scale.set(1.2, 0.65, 0.35); g.add(cheek); // 볼터치
    }
    const nose = mk(sphG(0.036, 12, 10), mat(0x5d4b62, { roughness: 0.5 }), false, 0, 0.185, 0.365); nose.scale.set(1.3, 0.85, 0.7); g.add(nose);
    for (const x of [-0.05, 0, 0.05]) g.add(bx(0.01, 0.04, 0.02, 0xcfc4dc, {}, false, x, 0.075, 0.335));
    const knot = mk(new THREE.TorusGeometry(0.11, 0.04, 8, 18), scarf, true, 0, 0.0, 0.0); knot.rotation.x = Math.PI / 2; g.add(knot);
    const tip = mk(coneG(0.07, 0.12, 4), scarf, true, 0, -0.05, 0.11); tip.rotation.x = Math.PI; g.add(tip);
  });
  // 갈비뼈·척추
  H('Torso', g => {
    cap(g, 0, 0.03, 0.2, 0.022, 0.11, 0.022);
    for (let i = 0; i < 3; i++) for (const d of [-1, 1]) cap(g, d * 0.08, 0.11 - i * 0.065, 0.19 - i * 0.006, 0.065, 0.022, 0.024, d * 0.12);
  });
  // 골반 (가운데 구멍 두 개)
  H('Hips', g => {
    cap(g, 0, 0.09, 0.22, 0.03, 0.035, 0.02);
    for (const d of [-1, 1]) { cap(g, d * 0.065, 0.02, 0.22, 0.065, 0.045, 0.02); const hole = mk(sphG(0.018, 8, 6), mat(0xf3f0f5), false, d * 0.065, 0.02, 0.237); hole.scale.z = 0.4; g.add(hole); }
    g.add(mk(sphG(0.085, 12, 10), white, false, 0, 0.04, -0.2)); // 동그란 곰 꼬리
  });
  // 팔뼈·손가락 마디 (처음 자세에서 팔은 옆으로 뻗어 있음)
  for (const [n, d] of [['UpperArmL', 1], ['UpperArmR', -1]]) H(n, g => cap(g, d * 0.1, 0.0, 0.085, 0.075, 0.022, 0.022));
  for (const [n, d] of [['LowerArmL', 1], ['LowerArmR', -1]]) H(n, g => {
    cap(g, d * 0.12, 0.0, 0.08, 0.09, 0.02, 0.02);
    for (const z of [-0.02, 0.02]) cap(g, d * 0.29, 0.0, 0.06 + z, 0.03, 0.016, 0.016);
  });
  // 다리뼈·발가락 마디
  for (const n of ['UpperLegL', 'UpperLegR']) H(n, g => cap(g, 0, -0.12, 0.11, 0.022, 0.09, 0.022));
  for (const n of ['LowerLegL', 'LowerLegR']) H(n, g => cap(g, 0, -0.13, 0.1, 0.02, 0.09, 0.02));
  for (const n of ['FootL', 'FootR']) H(n, g => { for (const x of [-0.03, 0.03]) cap(g, x, 0.03, 0.15, 0.025, 0.018, 0.03); });
  m.hideHead = true; m.boneBear = true;
  return m;
}

// 원본 Pirate Kit 모형을 사용합니다.
// 주인공: 바다 수호 기사 / 일꾼: 뼈다귀 곰 선원 (둘 다 Henry 바탕) / 손님: Henry / Mako·Sharky: 상륙 해적.
function mkChar(kind, ent) {
  if (!GL.ready) {
    // 로딩 중에도 토끼 모자나 동물 후드 대신 단순한 두건 해적 실루엣을 표시합니다.
    const colors = kind === 'player'
      ? { shirt: '#26407a', pants: '#2a4076', hair: '#603e26', skin: '#eec6a2' }
      : kind === 'boarder'
        ? { shirt: '#547f91', pants: '#8f7b52', hair: '#354d61', skin: '#7ba6b7' }
        : kind === 'worker' ? { shirt: '#f3f0f5', pants: '#f3f0f5', hair: '#f6f4f1', skin: '#f6f4f1' }
        : { shirt: ent.shirt || '#66777b', pants: '#637c86', hair: ent.hair || '#3c291d', skin: '#bf946e' };
    const m = makeAdult3({ ...colors, bandana: true });
    m.melee = kind !== 'customer';
    if (ent.champion) m.root.scale.multiplyScalar(1.42);
    return attachCharacterGear(m, m.body, 1.08, 0.32);
  }
  const n = Math.floor((ent.ph || 0) * 10);
  if (kind === 'player') { const m = makeHero(); m.melee = true; return m; }
  if (kind === 'worker') { const m = makeBoneBear(1.42); m.melee = true; return m; }
  if (kind === 'customer') return makeGL(n % 3 === 0 ? 'captain' : 'henry', { height: 1.55, weapon: 'never' });
  const m = makeGL(ent.champion ? 'mako' : n % 2 ? 'mako' : 'sharky', { height: ent.champion ? 2.35 : 1.65, weapon: 'always' });
  m.melee = true;
  return m;
}
function animChar(m, ent, dt, st = {}) {
  if (m.gl) animateGL(m, ent, dt, st); else animate3(m, ent, dt, !!(st.fighting || ent.fighting));
  if (m.hideHead && m.head) m.head.scale.setScalar(0.001); // 원래 머리(두건·얼굴)는 숨기고 곰 해골 머리로
  if (m.melee) {
    m.rifle.visible = false;
    // 일꾼은 일할 때 칼을 넣어 두고, 해적과 맞붙을 때만 손에 쥠
    m.sword.visible = !st.dead && (m.boneBear ? !!(ent.fighting || ent.swingT > 0 || (raidOn && ent.foe && alive(ent.foe))) : (raidOn || ent.fighting)) && !(m.gl && m.weaponMode === 'always');
  }
  if (m.slash) {
    m.slash.visible = !st.dead && (ent.swingT || 0) > 0;
    m.slash.material.opacity = Math.min(0.85, (ent.swingT || 0) * 2.2);
    m.slash.rotation.z = (ent.swingT || 0) * 2;
  }
}
// 바다의 상어도 헤엄치는 동작으로
const sharkGL = [];
function syncSharks(dt) {
  if (!GL.ready) return false;
  sea.forEach((c, i) => {
    if (c.kind !== 'shark') return;
    let s = sharkGL[i];
    if (!s) { s = makeGL('shark', { height: 0.7 }); s.body.scale.setScalar(2.4 / GL.models.shark.len); playClip(s, 'Swim', 0); scene.add(s.root); sharkGL[i] = s; finModels[i].visible = false; }
    const p = seaPos(c), q = seaPos(c, Math.sign(c.w) * 0.04);
    s.root.position.set(p.x, -0.75, p.y); s.root.rotation.y = Math.atan2(q.x - p.x, q.y - p.y);
    s.mixer.update(dt);
  });
  return true;
}
