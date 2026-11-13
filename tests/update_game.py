"""Independent browser regressions for logistics, progression, saves and mobile UI.

Start the game server on port 8000. Run all sections (each still runs if another
fails), or select one with --section progression. Outputs stay outside checkout.
"""
import argparse
import math
import sys
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:8000/raft-village-3d.html"
SECTIONS = ("logistics", "progression", "persistence", "visual", "mobile")

HOOK=r'''
window.updateTest={
 reset(wave=0){const d=freshState();d.unlocked.push('expand1','tent1','grill','diner','water','waterShop','garden','veggieShop');d.wave=wave;d.money=10000;build(d);paused=true;},
 state(){return {assignments:{...G.workerAssignments},workers:workers.map(w=>({id:w.assignment,hp:w.hp,carry:w.carry})),hero:{...G.hero},heroHp:heroMaxHp(),heroAttack:heroAttack(),crewHp:crewHpMax(),crewAttack:crewAttack(),level:pirateLevel(),wave:G.wave};},
 set:setWorkerAssignment, save, serialize, build, startRaid, updateShop, balanceAssignments, spawnWorker, killCrew, updateWorker, sync3D, update, render, hud, objective, slotPos, syncCustomerRoutes,
 get G(){return G},get workers(){return workers},get runtime(){return runtime},get defs(){return DEFS},get shops(){return assignmentShops()},get enemies(){return enemies},
 price:id=>priceOf(DEFS[id]),bossDue:bossDueNextRaid,spawnBoss,spawnBossBoarder,pirateLevel,pirateAttack,normalPirateHp,normalPirateAttack,
 route:assignmentRoute,pickJob, sourceInfo,destInfo,workerSlot,separateWorkers,
 carry(){G.stack=['fish','tomato'];workers[0].carry=['water','grilled'];sync3D(.016);const pm=charModel(player,()=>mkChar('player',player)),wm=charModel(workers[0],()=>mkChar('worker',workers[0]));return [pm,wm].map(m=>({height:m.carry.position.y,depth:m.carry.position.z,scales:m.carry.children.map(c=>c.scale.x),ys:m.carry.children.map(c=>c.position.y)}));},
 legacy(){this.reset(24);const d=serialize();d.pirateProgressVersion=1;d.hero.level=38;d.hero.hp=100;d.training={hero:23,crew:19};d.cards={crewHp:3,crewPower:4,villageHp:2,playerGun:2};d.crewRoster[0].hp=31;build(d);return this.state();},
 legacy51(){this.reset(51);G.training.hero=11;G.cards={...G.cards,playerGun:2};G.hero.level=51;delete G.hero.legacyAttackBonus;delete G.hero.legacyHpBonus;const attack=(4+2*50)*Math.pow(ALLY_GROWTH,50)+4+3*11;const maxHp=(40+6*50)*Math.pow(ALLY_GROWTH,50)+10*11;player.hp=maxHp-17;save();return {attack,maxHp,hp:player.hp};},
 resume(){paused=false;assignmentPanel.hidden=true;},get ready(){return GL.ready},
 move(){player.x=5;player.y=4;return {x:player.x,y:player.y};},pos(){return {x:player.x,y:player.y};},step(){for(let i=0;i<15;i++)update(.05);},
};
'''


def check_logistics(page, screenshots):
    t = page.evaluate
    t('updateTest.reset()')
    result=t('''()=>{const t=updateTest;for(const id of t.shops)t.set(id,0);t.set('fishShop',1);t.set('diner',1);const before=t.state();const dead=t.workers.find(w=>w.assignment==='fishShop');t.killCrew(dead);t.balanceAssignments();const vacancy=t.state();t.spawnWorker('tent1',1);t.balanceAssignments();const after=t.state();return {before,vacancy,after,tooMany:t.set('fishShop',3),dinerFeed:t.route(t.workers.find(w=>w.assignment==='diner'),{from:'fishing',to:'grill'}),wrong:t.route(t.workers[0],{from:'water',to:'waterShop'})};}''')
    assert result['vacancy']['assignments']==result['before']['assignments']==result['after']['assignments'],result
    assert sorted(w['id'] for w in result['after']['workers'])==['diner','fishShop'],result
    assert not result['tooMany'] and result['dinerFeed'] and not result['wrong'],result
    t('updateTest.save()'); expected=t('updateTest.state().assignments');page.reload(wait_until='networkidle');assert t('updateTest.state().assignments')==expected
    print('PASS quotas, route restriction, diner supply, death/recruit vacancy, cap, save/reload',flush=True)
    check_customer_purchases(page)
    result=t("""()=>{const t=updateTest;t.reset();for(const id of t.shops)t.set(id,0);t.set('fishShop',2);t.G.st.fishing.pile=100;t.G.st.fishShop.stock=0;t.G.st.fishShop.cash=0;for(let i=0;i<1800;i++){for(const w of t.workers)t.updateWorker(w,.05);t.separateWorkers(.05);}const supplied=t.G.st.fishShop.stock;const w=t.workers[0];w.carry=['water'];t.G.st.water.pile=0;w.x=t.sourceInfo('water').x;w.y=t.sourceInfo('water').y;for(let i=0;i<100;i++)t.updateWorker(w,.05);const returned=t.G.st.water.pile;w.carry=[];w.job=null;const d=t.defs.fishShop;w.x=d.cx;w.y=d.cy;t.G.st.fishShop.cash=77;const money=t.G.money;for(let i=0;i<10;i++)t.updateWorker(w,.05);return {supplied,returned,collected:t.G.money-money,cash:t.G.st.fishShop.cash};}""")
    assert result['supplied']>0 and result['returned']==1 and result['collected']==77 and result['cash']==0,result
    print('PASS physical worker delivery, cash collection and incompatible cargo returned after reassignment',flush=True)


def check_customer_purchases(page):
    """Only visitors who reach a counter may buy; reload never fabricates sales."""
    result = page.evaluate("""() => {
      const t = updateTest;
      t.G.level = 20;
      return t.shops.map(id => {
        const d = t.defs[id], s = t.G.st[id], r = t.runtime[id];
        r.queue.length = 0; r.leaving.length = 0; r.spawn = 10000;
        s.stock = 4; s.cash = 0; s.saleElapsed = 1.99;
        t.syncCustomerRoutes(id);
        for (let i = 0; i < 80; i++) t.updateShop(id, .05);
        const unattended = {stock: s.stock, cash: s.cash, count: r.queue.length};
        r.spawn = 0; t.updateShop(id, .001); r.spawn = 10000;
        const customer = r.queue[0];
        const spawned = !!customer;
        t.updateShop(id, .05);
        const approaching = {stock: s.stock, cash: s.cash, got: customer?.got};
        if (!customer) return {id, spawned, unattended, approaching};
        customer.want = 1;
        Object.assign(customer, t.slotPos(d, 0), {vx: 0, vy: 0, moving: false});
        for (let i = 0; i < 39; i++) t.updateShop(id, .05);
        const early = {stock: s.stock, cash: s.cash, got: customer.got};
        t.updateShop(id, .05);
        return {id, spawned, unattended, approaching, early,
          stock: s.stock, cash: s.cash, price: t.price(id), got: customer.got,
          carry: customer.carry, item: d.item,
          departed: r.leaving.includes(customer) && !r.queue.includes(customer)};
      });
    }""")
    for shop in result:
        assert shop["spawned"], shop
        assert shop["unattended"] == {"stock": 4, "cash": 0, "count": 0}, shop
        assert shop["approaching"] == {"stock": 4, "cash": 0, "got": 0}, shop
        assert shop["early"] == {"stock": 4, "cash": 0, "got": 0}, shop
        assert shop["stock"] == 3 and shop["cash"] == shop["price"], shop
        assert shop["got"] == 1 and shop["carry"] == [shop["item"]] and shop["departed"], shop
    print('PASS all four shops: no automatic or pre-arrival sales, actual visitors buy once after two seconds at the counter and leave carrying goods', flush=True)

    pending = page.evaluate("""() => {
      const t = updateTest, id = 'fishShop', s = t.G.st[id], r = t.runtime[id];
      r.spawn = 0; t.updateShop(id, .001); r.spawn = 10000;
      const customer = r.queue[0]; customer.want = 1;
      Object.assign(customer, t.slotPos(t.defs[id], 0), {vx: 0, vy: 0});
      for (let i = 0; i < 25; i++) t.updateShop(id, .05);
      t.save();
      return {stock: s.stock, cash: s.cash, elapsed: s.saleElapsed};
    }""")
    assert math.isclose(pending["elapsed"], 1.25, abs_tol=1e-9), pending
    reload_game(page)
    restored = page.evaluate("""() => {
      const t = updateTest, s = t.G.st.fishShop, r = t.runtime.fishShop;
      const before = {stock: s.stock, cash: s.cash, count: r.queue.length};
      r.spawn = 10000;
      for (let i = 0; i < 80; i++) t.updateShop('fishShop', .05);
      return {before, stock: s.stock, cash: s.cash, elapsed: s.saleElapsed};
    }""")
    assert restored["before"] == {"stock": pending["stock"], "cash": pending["cash"], "count": 0}, restored
    assert restored["stock"] == pending["stock"] and restored["cash"] == pending["cash"], (pending, restored)
    assert restored["elapsed"] == 0, restored

    purchase = page.evaluate("""() => {
      const t = updateTest, id = 'fishShop', s = t.G.st[id], r = t.runtime[id];
      r.spawn = 0; t.updateShop(id, .001); r.spawn = 10000;
      const customer = r.queue[0]; customer.want = 1;
      Object.assign(customer, t.slotPos(t.defs[id], 0), {vx: 0, vy: 0});
      for (let i = 0; i < 39; i++) t.updateShop(id, .05);
      const early = {stock: s.stock, cash: s.cash, got: customer.got};
      t.updateShop(id, .05); t.save();
      return {early, stock: s.stock, cash: s.cash, price: t.price(id), got: customer.got};
    }""")
    assert purchase["early"] == {"stock": pending["stock"], "cash": pending["cash"], "got": 0}, purchase
    assert purchase["stock"] == pending["stock"] - 1 and purchase["cash"] == pending["cash"] + purchase["price"], purchase
    assert purchase["got"] == 1, purchase
    for _ in range(2):
        reload_game(page)
        restored = page.evaluate("""() => {
          const t = updateTest, s = t.G.st.fishShop, r = t.runtime.fishShop;
          r.spawn = 10000;
          for (let i = 0; i < 80; i++) t.updateShop('fishShop', .05);
          t.save(); return {stock: s.stock, cash: s.cash};
        }""")
        assert restored == {"stock": purchase["stock"], "cash": purchase["cash"]}, (purchase, restored)
    print('PASS partial service reload preserves inventory and cash; a fresh visitor must complete a new service, and completed purchases never repeat across reloads', flush=True)


def check_progression(page, screenshots):
    t = page.evaluate
    result=t('''()=>{const t=updateTest;t.reset();const out=[];for(let wave=1;wave<=55;wave++){t.startRaid();const boss=t.enemies.find(e=>e.boss&&!e.kind&&e.level===t.pirateLevel());if(boss&&!boss.bossBoarded){t.spawnBossBoarder(boss);}out.push({wave,level:t.pirateLevel(),hero:t.G.hero.level,boss:t.G.lastBossLevel,spawned:!!boss});t.enemies.length=0;}return out;}''')
    assert all(r['level']==r['wave'] and r['hero']==min(50,r['wave']) for r in result),result
    assert [r['wave'] for i,r in enumerate(result) if r['boss'] and (i==0 or r['boss']!=result[i-1]['boss'])]==list(range(5,56,5)),result
    assert [r['wave'] for r in result if r['spawned']]==list(range(5,56,5)),result
    result=t('''()=>{const t=updateTest;t.reset(4);t.startRaid();const ship=t.enemies.find(e=>e.boss);t.spawnBossBoarder(ship);const boss=t.enemies.find(e=>e.champion);return {hp:boss.max,normalHp:t.normalPirateHp(),atk:t.pirateAttack(boss),normalAtk:t.normalPirateAttack()};}''')
    assert result['hp']==5*result['normalHp'] and abs(result['atk']-5*result['normalAtk'])<1e-8,result
    check_progression_reloads(page)
    print('PASS raids 1–55, unbounded pirate growth, hero cap 50, bosses every five levels and exact 5x boss stats', flush=True)

def check_persistence(page, screenshots):
    t = page.evaluate
    legacy=t('updateTest.legacy()');assert legacy['hero']['level']==38 and legacy['hero']['hp']==100 and legacy['workers'][0]['hp']==31,legacy
    assert legacy['heroAttack']>=4+2*37+4+3*23 and legacy['heroHp']>=40+6*37+10*23,legacy
    assert legacy['crewAttack']>=3*2.6+19 and legacy['crewHp']>=round(15*2.5)+20+95,legacy
    before=t('updateTest.state()');t('updateTest.save()');page.reload(wait_until='networkidle');after=t('updateTest.state()');assert before==after,(before,after)
    print('PASS legacy stats and assignments retained across actual reload',flush=True)
    check_legacy_overcap_reload(page)

def check_visual(page, screenshots):
    t = page.evaluate
    t('updateTest.reset()')
    carry=t('updateTest.carry()');assert all(r['height']==1.95 and r['depth']==0 and r['scales']==[3,3] and r['ys'][1]>r['ys'][0] for r in carry),carry
    result=t('''()=>{const t=updateTest;t.reset();for(const id of t.shops)t.set(id,0);t.set('fishShop',2);for(const w of t.workers){w.x=5;w.y=4;}for(let i=0;i<30;i++)t.separateWorkers(.05);return Math.hypot(t.workers[0].x-t.workers[1].x,t.workers[0].y-t.workers[1].y);}''');assert result>.5,result
    print('PASS actual character carry groups above head, 3x meshes and stack spacing; overlapping workers separate',flush=True)

def check_mobile(page, screenshots):
    t = page.evaluate
    t('updateTest.reset()')
    for width,height in [(390,844),(320,568),(844,390)]:
     page.set_viewport_size({'width':width,'height':height});t('updateTest.reset();updateTest.resume();updateTest.render(.016);updateTest.hud(updateTest.objective())')
     page.locator('#assignmentBtn').tap();assert page.locator('#assignmentPanel').is_visible()
     assert page.locator('#assignmentPanel .assignment-row').count()==4
     for b in page.locator('#assignmentPanel .assignment-row button').all():
      box=b.bounding_box();assert box['width']>=44 and box['height']>=44 and box['x']>=0 and box['x']+box['width']<=width+1,box
     page.locator('#assignmentPanel .assignment-row').first.locator('button').first.tap()
     assert t('updateTest.G.workerAssignments.fishShop')==0
     page.locator('#assignmentPanel .assignment-row').first.locator('button').last.tap();assert t('updateTest.G.workerAssignments.fishShop')==1
     page.screenshot(path=str(screenshots / f'assignment-{width}.png'))
     page.locator('#assignmentPanel .close').tap()
     assert t('document.documentElement.scrollWidth<=innerWidth')
     start=t('updateTest.move()');page.keyboard.down('d');t('updateTest.step()');page.keyboard.up('d');assert t('updateTest.pos().x')>start['x']
     # 실제 pointer 입력을 이동 스틱에 전달하고 게임 루프를 진행합니다.
     start=t('updateTest.move()');page.mouse.move(width*.48,height*.75);page.mouse.down();page.mouse.move(width*.48+45,height*.75,steps=5);t('updateTest.step()');page.mouse.up();end=t('updateTest.pos()');assert abs(end['x']-start['x'])+abs(end['y']-start['y'])>.05,(start,end)
     print(f'PASS mobile {width}x{height}: touch quota buttons, close, viewport, keyboard and drag movement',flush=True)


def reload_game(page):
    page.reload(wait_until="networkidle")
    page.wait_for_function("!!window.updateTest")


def stable_hero_state(state):
    return {key: state[key] for key in ("hero", "heroHp", "heroAttack", "wave", "level")}


def check_progression_reloads(page):
    """Exercise real persistence at both sides of the hero's level cap."""
    page.evaluate("updateTest.reset(48)")
    for wave in (49, 50, 51):
        before = page.evaluate("""() => {
          const t = updateTest;
          t.enemies.length = 0;
          t.startRaid(); t.save();
          return t.state();
        }""")
        assert before["wave"] == wave and before["level"] == wave, before
        assert before["hero"]["level"] == min(wave, 50), before
        reload_game(page)
        after = page.evaluate("updateTest.state()")
        assert stable_hero_state(before) == stable_hero_state(after), (before, after)
    print('PASS actual save/reload at raids 49, 50 and 51 retains hero level, attack, health and raid state', flush=True)


def check_legacy_overcap_reload(page):
    """Old saves may contain level 51; normalize once without losing earned stats."""
    # Stage both runtime and disk: visibilitychange can save again during reload.
    expected = page.evaluate("updateTest.legacy51()")
    migrated = None
    for attempt in range(3):
        reload_game(page)
        actual = page.evaluate("updateTest.state()")
        assert actual["wave"] == 51 and actual["hero"]["level"] == 50, actual
        assert math.isclose(actual["heroAttack"], expected["attack"], rel_tol=1e-12), (expected, actual)
        assert math.isclose(actual["heroHp"], expected["maxHp"], rel_tol=1e-12), (expected, actual)
        assert math.isclose(actual["hero"]["hp"], expected["hp"], rel_tol=1e-12), (expected, actual)
        if migrated is None:
            migrated = stable_hero_state(actual)
            assert actual["hero"]["legacyAttackBonus"] > 0, actual
            assert actual["hero"]["legacyHpBonus"] > 0, actual
        else:
            assert stable_hero_state(actual) == migrated, (attempt, migrated, actual)
        page.evaluate("updateTest.save()")
    print('PASS legacy hero level 51 normalizes to 50, retaining earned attack and wounded health through three actual reloads', flush=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--section", action="append", choices=("all",) + SECTIONS,
                        help="Select independent sections; may be repeated. Default: all.")
    parser.add_argument("--screenshots", type=Path, default=Path("/tmp/my-game-update"))
    parser.add_argument("--url", default=URL)
    args = parser.parse_args(argv)
    selected = args.section or ["all"]
    sections = SECTIONS if "all" in selected else tuple(dict.fromkeys(selected))
    args.screenshots.mkdir(parents=True, exist_ok=True)
    source = (ROOT / "raft-village-3d.html").read_text().replace(
        "})();\n</script>", HOOK + "})();\n</script>")
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        try:
            for section in sections:
                errors = []
                context = browser.new_context(
                    viewport={"width": 390, "height": 844},
                    is_mobile=True, has_touch=True, device_scale_factor=2,
                )
                page = context.new_page()
                page.add_init_script("requestAnimationFrame=()=>0")
                page.on("pageerror", lambda e: errors.append(e.stack))
                # The shipped game vendors its required scripts. Tests must also
                # boot without third-party CDN access; fonts are cosmetic.
                page.route("https://**/*", lambda route: route.abort())
                page.route("**/raft-village-3d.html", lambda route: route.fulfill(
                    body=source, content_type="text/html"))
                try:
                    page.goto(args.url, wait_until="networkidle")
                    page.wait_for_function("!!window.updateTest", timeout=30000)
                    if section in ("visual", "mobile"):
                        page.wait_for_function("updateTest.ready", timeout=30000, polling=100)
                    globals()[f"check_{section}"](page, args.screenshots)
                    assert not errors, errors
                    print(f"PASS section {section}; no JavaScript runtime errors", flush=True)
                except Exception as error:
                    failures.append(section)
                    print(f"FAIL section {section}: {error}", file=sys.stderr, flush=True)
                    traceback.print_exc()
                    if errors:
                        print(f"JavaScript errors: {errors}", file=sys.stderr, flush=True)
                finally:
                    context.close()
        finally:
            browser.close()
    print(f"Sections: {len(sections) - len(failures)} passed, {len(failures)} failed", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
