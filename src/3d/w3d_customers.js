/* ---------- 손님은 생활 갑판 밖의 구매 부두만 이용합니다 ---------- */
let customerBoundsTiles = null, customerBoundsCount = -1, customerBoundsCache = null;
function customerRaftBounds() {
  if (customerBoundsTiles === tiles && customerBoundsCount === tiles.size && customerBoundsCache) return customerBoundsCache;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const key of tiles) {
    const [x, y] = key.split(',').map(Number);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1);
  }
  customerBoundsTiles = tiles; customerBoundsCount = tiles.size;
  customerBoundsCache = { x0, y0, x1, y1, signature: `${x0},${y0},${x1},${y1}` };
  return customerBoundsCache;
}
function customerBerth(d) {
  const b = customerRaftBounds(), [dx, dy] = d.dir;
  return { x: dx ? (dx > 0 ? b.x1 : b.x0) : d.x,
    y: dy ? (dy > 0 ? b.y1 : b.y0) : d.y,
    dx, dy, signature: `${b.signature}|${d.id}|${d.x},${d.y}|${dx},${dy}` };
}
function customerSlotPos(d, k) {
  const p = customerBerth(d), row = k === 0 ? 0 : 1 + Math.floor((k - 1) / 2);
  const a = 1.05 + row * 0.82, side = k === 0 ? 0 : k % 2 ? -0.36 : 0.36;
  return { x: p.x + p.dx * a - p.dy * side, y: p.y + p.dy * a + p.dx * side };
}
function customerDockRect(id) {
  const p = customerBerth(DEFS[id]), a0 = -0.08, a1 = 6.8;
  const xs = [p.x + p.dx * a0, p.x + p.dx * a1], ys = [p.y + p.dy * a0, p.y + p.dy * a1];
  const wx = p.dx ? 0 : 0.8, wy = p.dy ? 0 : 0.8;
  return [Math.min(...xs) - wx, Math.min(...ys) - wy, Math.max(...xs) + wx, Math.max(...ys) + wy];
}
function syncCustomerRoutes(id) {
  const d = DEFS[id], r = runtime[id], berth = customerBerth(d);
  if (r.customerLayout === berth.signature) return;
  r.customerLayout = berth.signature;
  // 확장 직후의 기존 손님도 내부 시설을 가로질러 걷지 않게 새 외부 대기열로 이관합니다.
  for (const [i, c] of r.queue.entries()) {
    Object.assign(c, customerSlotPos(d, i), { vx: 0, vy: 0, moving: false });
  }
  for (const c of r.leaving) {
    const exit = customerSlotPos(d, 11);
    Object.assign(c, exit, { vx: 0, vy: 0, moving: false, target: exit });
  }
}

/* ---------- 외부 구매대·대기열: 갑판 위에는 물류 시설만 남깁니다 ---------- */
const customerDockLayouts = new Map();
function buildCustomerDock(d) {
  const p = customerBerth(d), g = new THREE.Group();
  g.name = 'customer-dock:' + d.id; g.position.set(p.x, 0, p.y); g.rotation.y = Math.atan2(p.dx, p.dy);
  const wood = 0xaa7c4d, trim = 0xffe6b6, accent = DISTRICT_COLORS[d.item] || 0x59b5c5;
  g.add(bx(1.6, 0.14, 6.88, wood, { roughness: 0.9 }, false, 0, -0.1, 3.36));
  for (let z = 0.12; z < 6.8; z += 0.42) {
    g.add(bx(1.56, 0.025, 0.025, 0xd4a367, {}, false, 0, -0.016, z));
  }
  for (const x of [-0.72, 0.72]) {
    for (const z of [0.35, 2.45, 4.55, 6.55]) {
      g.add(mk(cylG(0.065, 0.08, 0.65, 7), mat(0x735537), false, x, -0.3, z));
      g.add(mk(cylG(0.045, 0.055, 0.48, 7), mat(wood), false, x, 0.23, z));
      g.add(mk(cylG(0.065, 0.065, 0.035, 7), mat(trim), false, x, 0.46, z));
    }
    g.add(bx(0.035, 0.035, 6.15, trim, {}, false, x, 0.36, 3.48));
  }
  // 가게별 색상의 외부 거래대: 첫 손님이 여기서 구매한 뒤 바깥쪽으로 돌아갑니다.
  const counter = new THREE.Group(); counter.name = 'purchase-counter'; g.add(counter);
  counter.add(bx(1.17, 0.52, 0.42, accent, {}, true, 0, 0.26, 0.23));
  counter.add(bx(1.27, 0.08, 0.53, trim, {}, true, 0, 0.55, 0.23));
  counter.add(bx(0.8, 0.13, 0.04, 0xfff4d9, {}, false, 0, 0.32, 0.46));
  for (const x of [-0.55, 0.55]) counter.add(mk(cylG(0.025, 0.025, 0.66, 6), mat(wood), true, x, 0.89, 0.08));
  counter.add(bx(1.28, 0.07, 0.56, accent, {}, true, 0, 1.24, 0.18));
  world.add(g); return g;
}
function syncCustomerDocks() {
  for (const id of Object.keys(docks)) if (!unlocked.has(id)) {
    world.remove(docks[id]); delete docks[id]; customerDockLayouts.delete(id);
  }
  for (const id of STATION_IDS) {
    const d = DEFS[id];
    if (d.type !== 'shop' || !unlocked.has(id)) continue;
    const signature = customerBerth(d).signature;
    if (docks[id]?.parent === world && customerDockLayouts.get(id) === signature) continue;
    if (docks[id]) world.remove(docks[id]);
    docks[id] = buildCustomerDock(d); customerDockLayouts.set(id, signature);
  }
}
