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
  const a = 1.05 + row * 1.06, side = k === 0 ? 0 : k % 2 ? -0.55 : 0.55;
  return { x: p.x + p.dx * a - p.dy * side, y: p.y + p.dy * a + p.dx * side };
}
function customerDockRect(id) {
  const p = customerBerth(DEFS[id]), a0 = -0.08, a1 = 6.8;
  const xs = [p.x + p.dx * a0, p.x + p.dx * a1], ys = [p.y + p.dy * a0, p.y + p.dy * a1];
  const wx = p.dx ? 0 : 0.95, wy = p.dy ? 0 : 0.95;
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
    const exit = customerExit(d);
    Object.assign(c, exit, { vx: 0, vy: 0, moving: false, exitLane: null, target: customerExit(d) });
  }
}

/* ---------- 손님 방문 → 대기 → 상품 수령·결제 → 퇴장 ---------- */
const CUSTOMER_QUEUE_LIMIT = 6, CUSTOMER_LEAVING_LIMIT = 6;
const CUSTOMER_SERVICE_SECONDS = 2, CUSTOMER_PATIENCE_SECONDS = 35;
function customerExit(d) {
  const p = customerBerth(d);
  return { x: p.x + p.dx * 6.35 - p.dy * 0.46, y: p.y + p.dy * 6.35 + p.dx * 0.46 };
}
function customerEntry(d) {
  const p = customerBerth(d);
  return { x: p.x + p.dx * 6.35 + p.dy * 0.55, y: p.y + p.dy * 6.35 - p.dx * 0.55 };
}
function spawnCustomer(d, r) {
  const entry = customerEntry(d), range = d.want || [1, 2];
  const want = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
  r.queue.push({ ...entry, vx: 0, vy: 0, moving: false, bob: 0, ph: Math.random(),
    alpha: 0, want, got: 0, wait: 0, item: d.item, carry: [],
    shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)], hair: HAIRS[Math.floor(Math.random() * HAIRS.length)] });
}
function departCustomer(d, r, customer) {
  if (r.leaving.length >= CUSTOMER_LEAVING_LIMIT) return false;
  r.queue.splice(r.queue.indexOf(customer), 1);
  customer.target = customerExit(d);
  customer.emote = customer.got ? '🛍️' : '😕';
  // 퇴장 통로로 비켜서 다음 손님과 정면으로 겹치지 않게 합니다.
  const p = customerBerth(d);
  customer.exitLane = { x: customer.x - p.dy * 0.46, y: customer.y + p.dx * 0.46 };
  r.leaving.push(customer);
  return true;
}
function updateCustomerShop(id, dt) {
  if (!(dt > 0) || !Number.isFinite(dt)) return;
  const d = DEFS[id], s = G.st[id], r = runtime[id];
  if (!d || d.type !== 'shop' || !unlocked.has(id) || isBroken(id)) return;
  // 오래된 자동 판매 타이머는 손님 도착 전 이월하지 않습니다.
  if (s.customerSalesVersion !== 1) { s.customerSalesVersion = 1; s.saleElapsed = 0; }
  syncCustomerRoutes(id);
  // 한 프레임 지연으로 대기열이나 결제가 폭증하지 않게 실제 이동과 같은 작은 단계로 진행합니다.
  const step = Math.min(dt, 0.25);
  for (let i = r.leaving.length - 1; i >= 0; i--) {
    const c = r.leaving[i], exit = c.target || customerExit(d);
    let target = c.exitLane || exit;
    if (dist(c.x, c.y, target.x, target.y) < 0.18) { c.exitLane = null; target = exit; }
    moveTo(c, target.x, target.y, 1.8, step);
    c.alpha = Math.min(1, Number.isFinite(c.alpha) ? c.alpha : 1);
    if (dist(c.x, c.y, exit.x, exit.y) < 0.35) {
      c.alpha = Math.max(0, c.alpha - step * 2.5);
      if (c.alpha <= 0) r.leaving.splice(i, 1);
    }
  }
  r.spawn -= step;
  if (r.spawn <= 0 && r.queue.length < CUSTOMER_QUEUE_LIMIT && r.leaving.length < CUSTOMER_LEAVING_LIMIT) {
    spawnCustomer(d, r); r.spawn = 4 + Math.random() * 2;
  }
  for (let i = 0; i < r.queue.length; i++) {
    const c = r.queue[i], target = customerSlotPos(d, i);
    c.alpha = Math.min(1, Math.max(0, Number.isFinite(c.alpha) ? c.alpha : 1) + step * 2);
    c.item = d.item; c.carry = c.carry || Array(Math.max(0, c.got || 0)).fill(d.item);
    if (dist(c.x, c.y, target.x, target.y) > 0.22) moveTo(c, target.x, target.y, 1.65, step);
    else stopMove(c, step);
  }
  const customer = r.queue[0], counter = customerSlotPos(d, 0);
  if (!customer || dist(customer.x, customer.y, counter.x, counter.y) > 0.24) {
    s.saleElapsed = 0; r.serveT = 0; return;
  }
  if (customer.got >= customer.want) {
    departCustomer(d, r, customer); s.saleElapsed = 0; r.serveT = 0; return;
  }
  if (s.stock <= 0) {
    customer.wait = (customer.wait || 0) + step;
    s.saleElapsed = 0; r.serveT = 0;
    if (customer.wait >= CUSTOMER_PATIENCE_SECONDS) departCustomer(d, r, customer);
    return;
  }
  customer.wait = 0;
  s.saleElapsed = Math.min(CUSTOMER_SERVICE_SECONDS, Math.max(0, Number.isFinite(s.saleElapsed) ? s.saleElapsed : 0) + step);
  r.serveT = s.saleElapsed;
  if (s.saleElapsed + 1e-9 < CUSTOMER_SERVICE_SECONDS) return;
  s.saleElapsed = 0; r.serveT = 0;
  const price = priceOf(d);
  s.stock--; s.cash += price; customer.got++; customer.carry.push(d.item);
  expeditionCustomerSale(d, s, customer);
  addXp(price); earn(price);
  G.stats.sold = (G.stats.sold || 0) + 1;
  G.stats['sold_' + d.item] = (G.stats['sold_' + d.item] || 0) + 1;
  floatText(counter.x, counter.y, `+$${price}`, '#b8ffbf');
  if (customer.got >= customer.want) departCustomer(d, r, customer);
}

/* ---------- 외부 구매대·대기열: 갑판 위에는 물류 시설만 남깁니다 ---------- */
const customerDockLayouts = new Map();
function buildCustomerDock(d) {
  const p = customerBerth(d), g = new THREE.Group();
  g.name = 'customer-dock:' + d.id; g.position.set(p.x, 0, p.y); g.rotation.y = Math.atan2(p.dx, p.dy);
  const wood = 0xaa7c4d, trim = 0xffe6b6, accent = DISTRICT_COLORS[d.item] || 0x59b5c5;
  g.add(bx(1.9, 0.14, 6.88, wood, { roughness: 0.9 }, false, 0, -0.1, 3.36));
  for (let z = 0.12; z < 6.8; z += 0.42) {
    g.add(bx(1.86, 0.025, 0.025, 0xd4a367, {}, false, 0, -0.016, z));
  }
  for (const x of [-0.87, 0.87]) {
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
