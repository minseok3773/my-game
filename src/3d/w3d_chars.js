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
// 원본 Pirate Kit의 모자·머리·몸 비율과 색을 그대로 사용합니다.
// Captain Barbarossa: 주인공 / Henry: 선원·손님 / Mako·Sharky: 상륙 해적.
function mkChar(kind, ent) {
  if (!GL.ready) {
    // 로딩 중에도 토끼 모자나 동물 후드 대신 단순한 두건 해적 실루엣을 표시합니다.
    const colors = kind === 'player'
      ? { shirt: '#634832', pants: '#9e302b', hair: '#b95d28', skin: '#efbd8c' }
      : kind === 'boarder'
        ? { shirt: '#547f91', pants: '#8f7b52', hair: '#354d61', skin: '#7ba6b7' }
        : { shirt: ent.shirt || '#66777b', pants: '#637c86', hair: ent.hair || '#3c291d', skin: '#bf946e' };
    const m = makeAdult3({ ...colors, bandana: true });
    m.melee = kind !== 'customer';
    if (ent.champion) m.root.scale.multiplyScalar(1.42);
    return attachCharacterGear(m, m.body, 1.08, 0.32);
  }
  const n = Math.floor((ent.ph || 0) * 10);
  if (kind === 'player') { const m = makeGL('captain', { height: 1.78, weapon: 'always' }); m.melee = true; return m; }
  if (kind === 'worker') { const m = makeGL('henry', { height: 1.58, weapon: 'never' }); m.melee = true; return m; }
  if (kind === 'customer') return makeGL(n % 3 === 0 ? 'captain' : 'henry', { height: 1.55, weapon: 'never' });
  const m = makeGL(ent.champion ? 'mako' : n % 2 ? 'mako' : 'sharky', { height: ent.champion ? 2.35 : 1.65, weapon: 'always' });
  m.melee = true;
  return m;
}
function animChar(m, ent, dt, st = {}) {
  if (m.gl) animateGL(m, ent, dt, st); else animate3(m, ent, dt, !!(st.fighting || ent.fighting));
  if (m.melee) {
    m.rifle.visible = false;
    m.sword.visible = !st.dead && (raidOn || ent.fighting) && !(m.gl && m.weaponMode === 'always');
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
