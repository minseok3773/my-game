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
          if (o.material.map) { o.material.map.encoding = THREE.LinearEncoding; o.material.map.magFilter = THREE.NearestFilter; o.material.map.needsUpdate = true; }
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
// 색상표의 특정 칸 색만 바꾼 사본 (주인공: 빨간 두건 → 분홍 / 해골 해적: 피부 → 뼈, 외투·바지 → 검정)
const _recol = {};
function recolorTex(map, key, pairs) {
  if (_recol[key]) return _recol[key];
  const img = map.image, cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0);
  const d = cx.getImageData(0, 0, cv.width, cv.height), a = d.data;
  for (let i = 0; i < a.length; i += 4) for (const [f, t] of pairs) if (Math.abs(a[i] - f[0]) < 8 && Math.abs(a[i + 1] - f[1]) < 8 && Math.abs(a[i + 2] - f[2]) < 8) { a[i] = t[0]; a[i + 1] = t[1]; a[i + 2] = t[2]; break; }
  cx.putImageData(d, 0, 0);
  const tx = new THREE.CanvasTexture(cv); tx.flipY = map.flipY; tx.encoding = THREE.LinearEncoding; tx.magFilter = THREE.NearestFilter;
  return (_recol[key] = tx);
}
const PINK_PAIRS = [[[139, 30, 31], [244, 169, 191]]];
const SKEL_PAIRS = [[[192, 154, 119], [232, 224, 206]], [[65, 50, 39], [30, 32, 46]], [[87, 65, 44], [44, 46, 64]], [[139, 30, 31], [26, 26, 32]], [[44, 44, 44], [26, 26, 32]], [[129, 122, 127], [196, 196, 204]], [[131, 119, 94], [196, 196, 204]]];
// 해골 머리 + 삼각 해적 모자 (v=1: 모자 위 작은 해골·은 장식 / v=2: 금테·해골 문장·주황 두건)
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

const _hv = new THREE.Vector3(), _hq0 = new THREE.Quaternion(), _hq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
const clipName = c => c.name.split('|').pop();
// 동작 전환: 새 동작은 서서히 켜고 이전 동작은 서서히 끔
function playClip(m, name, fade = 0.2) {
  const a = m.actions[name];
  if (!a || m.cur === a) return;
  a.reset().setEffectiveWeight(1).fadeIn(fade).play();
  if (m.cur) m.cur.fadeOut(fade);
  m.cur = a;
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
  if (o.bunny) {
    body.traverse(x => { if (x.isMesh && x.material.map) { x.material = x.material.clone(); x.material.map = recolorTex(x.material.map, 'pink', PINK_PAIRS); } });
    // 분홍 토끼 모자: 머리를 덮는 둥근 모자 + 흰 테두리 + 솜뭉치 + 귀 두 개
    m.ears = new THREE.Group(); root.add(m.ears); m.earPiv = [];
    const pink = mat(0xf4a9bf, { roughness: 0.8 }), inner = mat(0xffe3ec, { roughness: 0.85 }), white = mat(0xfff8f2, { roughness: 0.9 });
    const hat = new THREE.Group(); hat.rotation.x = -0.28; hat.position.z = 0.02; m.ears.add(hat);
    const cap = mk(sphG(0.3, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.6), pink, true, 0, -0.06, -0.05); cap.scale.set(1.12, 1.0, 1.25); hat.add(cap);
    const rim = mk(new THREE.TorusGeometry(0.3, 0.05, 8, 26), white, true, 0, -0.12, -0.05); rim.rotation.x = Math.PI / 2 - 0.12; rim.scale.set(1.13, 1.27, 1); hat.add(rim);
    const pom = mk(sphG(0.08, 10, 8), white, true, 0, -0.02, -0.42); hat.add(pom);
    for (const d of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(d * 0.13, 0.15, -0.06); piv.rotation.z = -d * 0.22; m.ears.add(piv);
      const e = mk(sphG(0.085, 14, 10), pink, true, 0, 0.24, 0); e.scale.set(1, 3.2, 0.5); piv.add(e);
      const ei = mk(sphG(0.055, 10, 8), inner, false, 0, 0.23, 0.03); ei.scale.set(1, 3.5, 0.35); piv.add(ei);
      m.earPiv.push({ piv, d });
    }
    m.earA = 0; m.earV = 0; m.hatS = o.hatS || 1; m.ears.scale.setScalar(m.hatS);
  }
  if (o.skull) {
    body.traverse(x => {
      if (!x.isMesh) return;
      if (/ernest/i.test(x.name)) x.visible = false; // 앵무새 빼기
      else if (x.material.map) { x.material = x.material.clone(); x.material.map = recolorTex(x.material.map, 'skel', SKEL_PAIRS); }
    });
    m.skull = makeSkull(o.skull); m.skull.scale.setScalar(o.skullS || 1.15); root.add(m.skull);
    if (head) { // 머리 뼈의 처음 방향을 기준으로 해골이 같이 끄덕이게
      body.updateMatrixWorld(true); head.getWorldQuaternion(_hq0); m.headQ0 = _hq0.clone().invert();
    }
  }
  m.carry = new THREE.Group(); m.carry.position.set(0, 0.95, 0.38); root.add(m.carry);
  m.rifle = new THREE.Group(); m.rifle.visible = false; root.add(m.rifle);
  m.rifle.add(bx(0.05, 0.06, 0.55, 0x2b2b30, { metalness: 0.5, roughness: 0.35 }, true, 0, 0, 0.12));
  m.rifle.add(bx(0.06, 0.09, 0.22, 0x7a5232, { roughness: 0.7 }, true, 0, -0.02, -0.12));
  return m;
}
function animateGL(m, ent, dt, st = {}) {
  const vx = ent.vx || 0, vy = ent.vy || 0, spd = Math.hypot(vx, vy), t = G.t;
  if (spd > 0.12) { m.idleT = 0; m.rest = undefined; } else m.idleT += dt;
  if (m.rest === undefined && spd <= 0.12) m.rest = m.heading;
  const look = m.idleT > 3 && ent.aimYaw === undefined ? m.rest + Math.sin(t * 0.6 + m.ph) * 0.5 : undefined;
  const tg = spd > 0.12 ? Math.atan2(vx, vy) : ent.aimYaw ?? look;
  if (tg !== undefined) m.heading += Math.atan2(Math.sin(tg - m.heading), Math.cos(tg - m.heading)) * Math.min(1, dt * (spd > 0.12 ? 14 : 5));
  m.root.rotation.y = m.heading;
  m.root.position.set(ent.x, 0, ent.y);
  // 상태에 맞는 동작 고르기: 멈춤 → 걷기 → 달리기, 싸움, 쓰러짐
  let clip = spd < 0.15 ? 'Idle' : spd < 2.1 || m.walk !== 'Walk' ? m.walk : 'Run';
  if (st.fighting && spd < 0.6) clip = 'Sword';
  if (st.dead) clip = 'Death';
  playClip(m, clip, st.dead ? 0.1 : 0.22);
  if (m.actions.Walk) m.actions.Walk.timeScale = Math.max(0.6, Math.min(1.6, spd / 1.5));
  if (m.walk !== 'Walk') m.actions[m.walk].timeScale = Math.max(0.7, Math.min(2.2, spd / (m.walkSpd || 1.6)));
  if (m.actions.Run) m.actions.Run.timeScale = Math.max(0.7, Math.min(1.5, spd / 3.3));
  m.mixer.update(dt);
  if (m.skull && m.head) {
    m.head.scale.setScalar(0.001); // 원래 머리(수염·모자)는 숨기고 해골로
    m.root.updateMatrixWorld(true);
    m.head.getWorldPosition(_hv); m.root.worldToLocal(_hv); m.skull.position.set(_hv.x, _hv.y - 0.06, _hv.z);
    m.head.getWorldQuaternion(_hq).multiply(m.headQ0); m.root.getWorldQuaternion(_rq).invert();
    m.skull.quaternion.copy(_rq).multiply(_hq);
  }
  const armed = m.weaponMode === 'always' || (m.weaponMode === 'raid' && raidOn);
  for (const w of m.weapons) w.visible = armed;
  // 토끼 귀는 머리 뼈를 따라가며 한 박자 늦게 흔들림
  if (m.ears && m.head) {
    m.head.getWorldPosition(_hv); m.root.worldToLocal(_hv);
    m.ears.position.set(_hv.x, _hv.y + (m.hatY ?? 0.22), _hv.z + (m.hatZ ?? 0));
    const target = -0.5 * Math.min(1, spd / 3) + (spd > 0.15 ? Math.sin(t * 9) * 0.12 : 0) + Math.pow(Math.max(0, Math.sin(t * 0.9 + m.ph * 3)), 14) * 0.3;
    m.earV += ((target - m.earA) * 80 - m.earV * 8) * dt; m.earA += m.earV * dt;
    for (const e of m.earPiv) e.piv.rotation.x = m.earA;
  }
  if (m.rifle.visible && m.hand) { m.hand.getWorldPosition(_hv); m.root.worldToLocal(_hv); m.rifle.position.copy(_hv); }
}
// 역할별 캐릭터: 주인공은 토끼 귀를 단 헨리, 선원은 선장과 헨리, 상륙 해적은 상어 인간
function mkChar(kind, ent) {
  if (!GL.ready) {
    if (kind === 'player') return makeKid3(PLAYER_LOOK);
    if (kind === 'worker') return makeKid3(ent.look);
    if (kind === 'customer') return makeAdult3(ent);
    return makeAdult3({ shirt: '#6e2b2b', pants: '#2e2a26', hair: '#1d1d1d', skin: '#d9a87e', bandana: true });
  }
  const n = (ent.ph || 0) * 10 | 0;
  if (kind === 'player') return makeGL('henry', { bunny: true, height: 1.62, walk: 'WalkHuman' });
  if (kind === 'worker') return makeGL(n % 2 ? 'captain' : 'henry', { height: 1.5, weapon: n % 2 ? 'raid' : 'never' });
  if (kind === 'customer') return makeGL(n % 2 ? 'henry' : 'captain', { height: 1.55 });
  const ty = ent.type || 'normal';
  const m = makeGL('captain', { height: 1.6, weapon: ty === 'normal' ? 'always' : 'never', skull: ty === 'bomber' || ty === 'sniper' ? 2 : ty === 'thief' ? 1 : (n % 2 ? 1 : 2) });
  if (ty === 'bomber') { // 불붙은 폭탄을 안고 달림
    const bomb = mk(sphG(0.17, 14, 10), mat(0x15151a, { metalness: 0.4, roughness: 0.4 }), true, 0, -0.1, 0.05); m.carry.add(bomb);
    m.carry.add(mk(cylG(0.015, 0.015, 0.12, 6), mat(0x8a6a40), false, 0, 0.1, 0.05));
    m.spark = mk(sphG(0.05, 8, 6), mat(0xffd060, { emissive: 0xff9020, emissiveIntensity: 3 }), false, 0, 0.17, 0.05); m.carry.add(m.spark);
  }
  if (ty === 'thief') { // 등에 멘 자루, 훔치면 금화 주머니로
    m.sack = mk(sphG(0.2, 12, 10), mat(0x8a6a3a, { roughness: 0.9 }), true, 0, 0.95, -0.3); m.sack.scale.set(1, 1.1, 0.8); m.root.add(m.sack);
    m.coin = mk(sphG(0.21, 12, 10), mat(0xf2c240, { metalness: 0.6, roughness: 0.3, emissive: 0x6a4a00, emissiveIntensity: 0.6 }), true, 0, 0.95, -0.3); m.coin.visible = false; m.root.add(m.coin);
  }
  if (ty === 'sniper') m.sniper = true;
  return m;
}
function animChar(m, ent, dt, st) {
  if (m.gl) animateGL(m, ent, dt, st); else animate3(m, ent, dt, st && st.fighting);
  if (m.spark) m.spark.scale.setScalar(0.7 + Math.random() * 0.8);
  if (m.coin) { m.coin.visible = !!ent.loot; m.sack.visible = !ent.loot; }
  if (m.sniper) { m.rifle.visible = ent.state !== 'sink'; if (m.hand) m.rifle.rotation.y = 0; }
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
