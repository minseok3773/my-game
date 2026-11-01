"""Compare combat tuning with the prior release and exercise landing/deck combat.

Run with the repository's local HTTP server on port 8000. Requires Playwright,
/usr/bin/chromium, and curl. The test injects private hooks into HTTP responses;
production files and actual player saves are not modified.
"""

import math
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASELINE_COMMIT = "2dda007"
HOOK = r"""
window.combatTest = {
  get G() { return G; },
  get enemies() { return enemies; },
  reset(wave = 1) {
    build(freshState());
    unlocked.add('expand1'); applyUnlock('expand1');
    G.wave = wave; G.hp = 10000; G.raidT = 180;
    player.x = 5; player.y = 4; player.cd = 10000;
    // Crew-only regression fixtures isolate the new hero from targeting.
    if (typeof isHeroAvailable === 'function') { G.hero.downT = 8; player.hp = 0; player.dead = true; }
    workers.length = 0; soldiers.length = 0;
    enemies.length = 0; shots.length = 0;
    raidOn = false; looted = false; paused = false;
    Math.random = () => .5;
  },
  worker(x = 4, y = 4) {
    spawnWorker('tent1', 1);
    const w = workers[workers.length - 1];
    Object.assign(w, { x, y, hp: 1000, vx: 0, vy: 0, cd: 10000 });
    return w;
  },
  ship(state = 'approach', big = false, boss = false) {
    const e = { x: -10, y: 5, hp: 100000, max: 100000, big, boss,
      state, fireT: 10000, boardT: 10000, bob: 0, sinkT: 0, ang: 0,
      salvoT: 10000, summonT: 10000 };
    enemies.push(e); return e;
  },
  boarder(type = 'normal', x = 4, y = 4) {
    const e = {kind: 'boarder', type, x, y, hp: 10000, max: 10000,
      goal: {x, y}, home: {x, y}, state: 'walk', atkT: 0, bob: 0,
      vx: 0, vy: 0, sinkT: 0, ang: 0};
    enemies.push(e); return e;
  },
  hpCases() {
    const results = [];
    const originalPick = pickPirateType;
    try {
      for (const wave of [1, 2, 3, 4, 5, 8]) {
        for (const big of [false, true]) {
          for (const type of ['normal', 'bomber', 'thief', 'sniper']) {
            this.reset(wave); pickPirateType = () => type;
            spawnBoarder({x: -2, y: 5, big});
            const e = enemies[enemies.length - 1];
            results.push({key: `${wave}/${big}/${type}`, hp: e.hp, max: e.max,
              onDeck: walkable(e.x, e.y)});
          }
        }
        this.reset(wave - 1); startRaid();
        enemies.forEach((e, i) => results.push({key: `${wave}/ship/${i}/${!!e.boss}`,
          hp: e.hp, max: e.max}));
      }
    } finally { pickPirateType = originalPick; }
    return results;
  },
  damageCases() {
    const results = {};
    for (const wave of [1,5,8]) {
      this.reset(wave); const w = this.worker(); updateBoarder(this.boarder(), 0);
      results[`${wave}/melee`] = 1000 - w.hp;
      shots.length = 0; shoot(player, {x:7,y:4}, 'water', 7, .3, 4, 24);
      results[`${wave}/friendly-shot`] = shots[0].dmg;
    }
    return results;
  },
  movementCases() {
    const results = {};
    for (const state of ['approach', 'flee']) {
      for (const kind of ['normal', 'big', 'boss']) {
        this.reset(4); const e = this.ship(state, kind !== 'normal', kind === 'boss');
        raidOn = state === 'approach'; const before = {x:e.x, y:e.y};
        updateMilitary(.1);
        results[`${state}/${kind}`] = Math.hypot(e.x - before.x, e.y - before.y);
      }
    }
    for (const [shoes, solar, strike] of [[1,false,false], [3,false,false], [5,true,false], [3,true,true]]) {
      this.reset(); G.slv.crewShoes = shoes; G.strike = strike;
      if (solar) unlocked.add('solar');
      const w = this.worker(); const before = {x:w.x, y:w.y};
      moveTo(w, 8, 4, workerSpeed(), .1);
      results[`worker/${shoes}/${solar}/${strike}`] = Math.hypot(w.x - before.x, w.y - before.y);
    }
    this.reset(); const w = this.worker(); const e = this.boarder('normal', 7, 4);
    e.goal = {x:9, y:4}; raidOn = true;
    updateMilitary(.1); results['worker/battle'] = Math.hypot(w.x - 4, w.y - 4);
    this.reset(); spawnSoldier(0);
    Object.assign(soldiers[0], {x:4, y:4, hp:1000, cd:10000, vx:0, vy:0});
    const pirate = this.boarder('normal', 7, 4); pirate.goal = {x:9, y:4}; raidOn = true;
    updateMilitary(.1); results['navy/battle'] = Math.hypot(soldiers[0].x - 4, soldiers[0].y - 4);
    this.reset();
    if (typeof isHeroAvailable === 'function') { G.hero.downT = 0; player.hp = heroMaxHp(); player.dead = false; }
    const start = {x: player.x, y: player.y};
    keys.add('d'); update(.1); keys.delete('d');
    results['hero'] = Math.hypot(player.x - start.x, player.y - start.y);
    return results;
  },
  landingAndFight() {
    this.reset(6); const w = this.worker(1, 6.6); w.cd = 0;
    const ship = this.ship('approach'); ship.x = -4; delete ship.boardT;
    raidOn = true;
    const originalPick = pickPirateType; pickPirateType = () => 'normal';
    let arrived = false, immediateBoarding = false, landed = false, pirateHurt = false, crewHurt = false;
    try {
      for (let i = 0; i < 600; i++) {
        const previous = ship.state;
        updateMilitary(.05);
        const boarders = enemies.filter(e => e.kind === 'boarder' && alive(e));
        if (previous === 'approach' && ship.state === 'attack') {
          arrived = true;
          updateMilitary(.05);
          immediateBoarding = enemies.some(e => e.kind === 'boarder' && alive(e));
        }
        landed ||= boarders.some(e => walkable(e.x, e.y));
        pirateHurt ||= boarders.some(e => e.hp < e.max);
        crewHurt ||= w.hp < 1000;
        if (landed && pirateHurt && crewHurt) break;
      }
    } finally { pickPirateType = originalPick; }
    return {arrived, immediateBoarding, landed, pirateHurt, crewHurt, workerHp:w.hp,
      boarders:enemies.filter(e => e.kind === 'boarder').map(e => ({x:e.x,y:e.y,hp:e.hp,max:e.max}))};
  },
  legacySave() {
    this.reset(3); const ship = this.ship('attack'); ship.hp = 17; ship.max = 34;
    const e = this.boarder('bomber'); e.hp = 4; e.max = 8;
    raidOn = true; return serialize();
  },
  importSave(data) { build(data); save(); return serialize(); },
  snapshot() { return {enemies: enemies.map(e => ({hp:e.hp,max:e.max})), combat:G.combat}; }
};
"""


def close(actual, expected, label):
    assert math.isclose(actual, expected, rel_tol=1e-9, abs_tol=1e-8), (
        label, actual, expected
    )


def main():
    baseline = subprocess.check_output(
        ["git", "show", f"{BASELINE_COMMIT}:raft-village-3d.html"], cwd=ROOT, text=True
    )
    current = (ROOT / "raft-village-3d.html").read_text()
    cache = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium", headless=True,
            args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        pages = []
        errors = []
        for label, html in (("baseline", baseline), ("current", current)):
            page = browser.new_page(viewport={"width":390, "height":844})
            page.add_init_script("window.requestAnimationFrame = () => 0;")
            page.on("pageerror", lambda error: errors.append(error.stack))

            def external(route):
                url = route.request.url
                if not url.startswith("https://cdn.jsdelivr.net/"):
                    route.abort()
                    return
                if url not in cache:
                    cache[url] = subprocess.check_output(
                        ["curl", "-fsS", "--max-time", "20", url]
                    )
                route.fulfill(body=cache[url], content_type="application/javascript")

            page.route("https://**", external)
            page.route("**/models/**", lambda route: route.abort())
            def document_handler(source):
                def serve(route):
                    route.fulfill(
                        body=source.replace("})();\n</script>", HOOK + "})();\n</script>"),
                        content_type="text/html",
                    )
                return serve

            page.route(f"**/combat-{label}.html", document_handler(html))
            page.goto(f"http://127.0.0.1:8000/combat-{label}.html", wait_until="networkidle")
            page.wait_for_function("!!window.combatTest")
            pages.append(page)

        old, new = pages
        old_hp = old.evaluate("combatTest.hpCases()")
        new_hp = new.evaluate("combatTest.hpCases()")
        assert len(old_hp) == len(new_hp)
        for before, after in zip(old_hp, new_hp):
            assert before["key"] == after["key"]
            close(after["hp"], before["hp"], after["key"])
            close(after["max"], before["max"], after["key"])
            if "onDeck" in after:
                assert after["onDeck"], after
        print(f"Existing HP preserved after all wave/type/armor rounding PASS ({len(new_hp)} cases)", flush=True)

        old_damage = old.evaluate("combatTest.damageCases()")
        new_damage = new.evaluate("combatTest.damageCases()")
        for name, before in old_damage.items():
            multiplier = 1 if name.endswith("friendly-shot") else 1 / 3
            close(new_damage[name], before * multiplier, name)
        print(f"Enemy damage one third and friendly damage unchanged PASS ({len(new_damage)} cases)", flush=True)

        old_speed = old.evaluate("combatTest.movementCases()")
        new_speed = new.evaluate("combatTest.movementCases()")
        for name, before in old_speed.items():
            multiplier = 1
            close(new_speed[name], before * multiplier, name)
        print("Previous ship/worker speed settings and navy/hero movement preserved PASS", flush=True)

        fight = new.evaluate("combatTest.landingAndFight()")
        assert all(fight[key] for key in (
            "arrived", "immediateBoarding", "landed", "pirateHurt", "crewHurt"
        )), fight
        print("Ship approach → immediate landing → reciprocal deck fighting PASS", flush=True)

        legacy = old.evaluate("combatTest.legacySave()")
        migrated = new.evaluate("data => combatTest.importSave(data)", legacy)
        for before, after in zip(legacy["combat"]["enemies"], migrated["combat"]["enemies"]):
            close(after["hp"], before["hp"], "current-version saved HP")
            close(after["max"], before["max"], "current-version saved max HP")
            close(after["hp"] / after["max"], before["hp"] / before["max"], "legacy health ratio")
        assert migrated["combat"]["balanceVersion"] == 2
        expected = [{"hp":e["hp"], "max":e["max"]} for e in migrated["combat"]["enemies"]]
        for _ in range(2):
            new.reload(wait_until="networkidle")
            new.wait_for_function("!!window.combatTest")
            snapshot = new.evaluate("combatTest.snapshot()")
            assert snapshot["enemies"] == expected, snapshot
            assert snapshot["combat"]["balanceVersion"] == 2
        print("Current active-raid HP unchanged across migration and two reloads PASS", flush=True)
        # Earlier version1 saves still need the previous health migration once.
        legacy["combat"]["balanceVersion"] = 1
        migrated = new.evaluate("data => combatTest.importSave(data)", legacy)
        for before, after in zip(legacy["combat"]["enemies"], migrated["combat"]["enemies"]):
            close(after["hp"], before["hp"] * 2, "version1 current HP")
            close(after["max"], before["max"] * 2, "version1 max HP")
        again = new.evaluate("data => combatTest.importSave(data)", migrated)
        assert again["combat"]["enemies"] == migrated["combat"]["enemies"]
        print("Version1 health migration still runs exactly once PASS", flush=True)
        assert not errors, errors
        browser.close()


if __name__ == "__main__":
    main()
