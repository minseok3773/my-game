"""Validate stand-to-recruit pads, reduced damage, landed bosses and hero growth.

Start the repository HTTP server on port 8000 first. Hooks are inserted only in
test responses, so the application and actual player saves remain untouched.
"""

import math
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASELINE = "2dda007"
HOOK = r"""
window.progressTest = {
  reset(wave = 1, tents = false) {
    build(freshState());
    unlocked.add('expand1'); applyUnlock('expand1');
    if (tents) { unlocked.add('tent1'); applyUnlock('tent1'); }
    G.wave = wave; G.money = 500; G.raidT = 10000; G.tactic = null; G.cards = {};
    enemies.length = 0; soldiers.length = 0; shots.length = 0; fallenCrew.length = 0;
    workers.length = 0; raidOn = false; looted = false; paused = false;
    player.x = 5; player.y = 4; player.vx = player.vy = 0; player.cd = 10000;
    Math.random = () => .5;
    if (typeof restoreHeroRuntime === 'function') {
      G.hero.level = 1; G.hero.xp = 0; G.hero.downT = 0; G.hero.kills = 0;
      G.hero.engagedWave = 0; G.hero.rewardedWave = 0; G.hero.hp = heroMaxHp();
      restoreHeroRuntime(); player.dead = false; player.cd = 10000;
    }
  },
  worker(x = 4, y = 4) {
    spawnWorker('tent1', 1); const w = workers[workers.length - 1];
    Object.assign(w, {x, y, hp: 1000, cd: 10000, vx: 0, vy: 0}); return w;
  },
  pirate(type = 'normal', x = 5.7, y = 4) {
    const e = {kind:'boarder', type, x, y, hp:10000, max:10000,
      state:'walk', atkT:0, bob:0, vx:0, vy:0, sinkT:0, ang:0, ph:.1,
      goal:{x,y}, home:{x,y}};
    enemies.push(e); return e;
  },
  damageCases() {
    const result = {};
    for (const wave of [1, 5, 10]) for (const type of ['normal','bomber','thief','sniper']) {
      this.reset(wave); player.x = 9; player.y = 7;
      const w = this.worker(); updateBoarder(this.pirate(type,4,4),0);
      result[wave+'/'+type] = 1000 - w.hp;
    }
    return result;
  },
  pad(tent='tent1') { return recruitmentPads().find(p => p.tent === tent); },
  stand(tent='tent1') { const p = this.pad(tent); player.x=p.x; player.y=p.y; },
  leave() { player.x=5; player.y=4; },
  tickRecruit(seconds) { for(let t=0;t<seconds-1e-8;t+=.05) tickRecruitment(Math.min(.05,seconds-t)); },
  recruitState() { return {money:G.money,count:workers.length,job:G.recruitment.tent1 || null,
    cost:recruitmentCost('tent1'),capacity:tentCapacity('tent1')}; },
  highLevelPad(level) { this.reset(1,true); G.slv.tent1=level; this.stand(); this.tickRecruit(.05); return this.recruitState(); },
  fullPad() { this.reset(1,true); spawnWorker('tent1',tentCapacity('tent1'));this.stand();this.tickRecruit(1);return this.recruitState(); },
  brokePad() { this.reset(1,true);G.money=29;this.stand();this.tickRecruit(1);return this.recruitState(); },
  milestone(wave) {
    this.reset(wave-1);startRaid();raidOn=true;
    return {wave:G.wave,carriers:enemies.filter(e => e.boss && e.kind!=='boarder').length,
      champions:enemies.filter(e=>e.kind==='boarder'&&e.champion).length};
  },
  landBoss(wave=5) {
    this.reset(wave-1);startRaid();raidOn=true;
    const carrier=enemies.find(e=>e.boss&&e.kind!=='boarder');
    enemies=enemies.filter(e=>e===carrier);
    Object.assign(carrier,{x:-4,y:5,hp:1000000,max:1000000,fireT:10000,boardT:0});
    let boss;
    for(let i=0;i<200&&!boss;i++) {
      updateMilitary(.05);boss=enemies.find(e=>e.kind==='boarder'&&e.champion);
    }
    if(!boss)return {landed:false};
    boss.atkT=10000;
    const countBefore=enemies.filter(e=>e.kind==='boarder'&&e.champion).length;
    for(let i=0;i<20;i++) {boss.atkT=10000;updateMilitary(.05);}
    return {landed:walkable(boss.x,boss.y),countBefore,
      countAfter:enemies.filter(e=>e.kind==='boarder'&&e.champion).length,
      carrierState:carrier.state,bossHp:boss.hp,bossMax:boss.max};
  },
  bossCombat() {
    this.reset(5); raidOn=true;
    const ship={x:-2,y:5,big:true,boss:true};
    spawnBossBoarder(ship);const boss=enemies.find(e=>e.kind==='boarder'&&e.champion);
    Object.assign(boss,{x:5.5,y:4,hp:10000,max:10000,atkT:0});
    const before=player.hp;updateBoarder(boss,0);
    const heroHurt=player.hp<before;
    const worker=this.worker(4.8,4);worker.cd=0;player.cd=0;boss.atkT=10000;
    const hp=boss.hp;const attack=heroAttack();
    updateDefenders(.05,1,1);updateHeroCombat(.05);
    return {heroHurt,bothFight:worker.fighting&&player.fighting,
      damage:hp-boss.hp,heroAttack:attack,xp:G.hero.xp,heroLevel:heroLevel()};
  },
  navyVersusBoss() {
    this.reset(5); raidOn=true; player.x=9; player.y=7;
    spawnBossBoarder({x:-2,y:5,big:true,boss:true});
    const boss=enemies.find(e=>e.kind==='boarder'&&e.champion);
    Object.assign(boss,{x:4.5,y:4,hp:10000,max:10000,atkT:0});
    spawnSoldier(0);const navy=soldiers[0];Object.assign(navy,{x:4,y:4,hp:1000,cd:0});
    updateBoarder(boss,0);const navyHurt=navy.hp<1000;
    updateDefenders(.05,1,1);return {navyHurt,bossHurt:boss.hp<10000,fighting:navy.fighting};
  },
  sunkBossStillLands() {
    this.milestone(5);const ship=enemies.find(e=>e.boss&&e.kind!=='boarder');
    sinkEnemy(ship);return enemies.filter(e=>e.kind==='boarder'&&e.champion).length;
  },
  cappedBossStillLands() {
    this.milestone(5);const ship=enemies.find(e=>e.boss&&e.kind!=='boarder');
    enemies=[ship];Object.assign(ship,{state:'attack',x:-2,y:5,boardT:0});
    for(let i=0;i<16;i++)this.pirate('normal',8,7);
    updateMilitary(0);updateMilitary(0);
    return enemies.filter(e=>e.kind==='boarder'&&e.champion).length;
  },
  defeatedBossStaysDefeated() {
    this.landBoss();const ship=enemies.find(e=>e.boss&&e.kind!=='boarder');
    const boss=enemies.find(e=>e.kind==='boarder'&&e.champion);
    killBoarder(boss);spawnBossBoarder(ship);spawnBossBoarder({x:-2,y:5,big:true,boss:true});
    return enemies.filter(e=>e.kind==='boarder'&&e.champion&&alive(e)).length;
  },
  heroState() { return {level:heroLevel(),xp:G.hero.xp,hp:player.hp,max:heroMaxHp(),attack:heroAttack(),
    downT:G.hero.downT,kills:G.hero.kills,money:G.money}; },
  attackOnce() {
    this.reset();raidOn=true;player.cd=0;this.pirate();
    const before=this.heroState();updateHeroCombat(0);
    return {before,after:this.heroState(),damage:10000-enemies[0].hp};
  },
  levelByFighting() {
    this.reset();raidOn=true;player.cd=0;const enemy=this.pirate();
    const before=this.heroState();
    for(let i=0;i<100 && heroLevel()===before.level;i++) updateHeroCombat(.7);
    const after=this.heroState();player.cd=0;const hp=enemy.hp;updateHeroCombat(0);
    return {before,after,nextDamage:hp-enemy.hp};
  },
  sales() {this.reset();const before=this.heroState();addXp(100);return {before,after:this.heroState()};},
  killAndRepeat() {
    this.reset();raidOn=true;player.cd=0;const enemy=this.pirate();enemy.hp=1;
    updateHeroCombat(0);const after=this.heroState();
    for(let i=0;i<10;i++){player.cd=0;updateHeroCombat(1);}
    return {after,repeated:this.heroState(),state:enemy.state};
  },
  victory() {
    this.reset();raidOn=true;player.cd=0;this.pirate();updateHeroCombat(0);
    const before=this.heroState();finishStrategyRaid(false);const after=this.heroState();
    finishStrategyRaid(false);return {before,after,repeated:this.heroState()};
  },
  idleVictory() {this.reset();const before=this.heroState();finishStrategyRaid(false);return {before,after:this.heroState()};},
  legacyHero() {
    const data=freshState();data.level=4;data.xp=77;delete data.hero;
    build(data);return {cityLevel:G.level,cityXp:G.xp,hero:this.heroState()};
  },
  woundedSave() {
    this.reset();gainCombatXp(50);player.hp=heroMaxHp()-7;save();return this.heroState();
  },
  save() {save();return serialize();},
  importData(data) {build(data);return this.heroState();},
  prepareBossSave() {
    this.landBoss(); const boss=enemies.find(e=>e.kind==='boarder'&&e.champion);
    boss.atkT=10000;save();return {count:enemies.filter(e=>e.kind==='boarder'&&e.champion).length,
      carrier:enemies.find(e=>e.boss&&e.kind!=='boarder')?.state};
  },
  continueBossSave() {
    const carrier=enemies.find(e=>e.boss&&e.kind!=='boarder');
    if(carrier){carrier.state='attack';carrier.boardT=0;}
    for(const e of enemies)if(e.champion)e.atkT=10000;
    updateMilitary(.01);
    return enemies.filter(e=>e.kind==='boarder'&&e.champion).length;
  },
  bossBarState() {
    const boss=enemies.find(e=>e.kind==='boarder'&&e.champion);
    boss.hp=boss.max*.37;bossHud();
    return {width:parseFloat(bossBar.querySelector('.fill').style.width),hidden:bossBar.hidden};
  },
  knockout() {
    this.reset(5);raidOn=true;const e=this.pirate('normal',5.5,4);e.champion=true;e.boss=true;
    player.hp=1;e.atkT=0;updateBoarder(e,0);
    const down=this.heroState();tickHeroState(8.1);return {down,recovered:this.heroState(),alive:isHeroAvailable()};
  },
  heroHealthUI() {
    this.reset();player.hp=heroMaxHp()/2;hud(objective());
    const width=parseFloat($('hpFill').style.width);
    G.cardOffer=['villageHp'];offerCards();takeCard(CARDS.find(c=>c.id==='villageHp'));
    return {width,healed:player.hp===heroMaxHp(),level:heroLevel()};
  },
  knockoutActions() {
    this.reset();
    const pad=visiblePads().find(p=>!p.up);
    G.paid[pad.id]=pad.cost-1;knockOutHero();player.x=pad.x;player.y=pad.y;
    update(.05);const constructionDown={money:G.money,paid:G.paid[pad.id],built:unlocked.has(pad.id)};
    tickHeroState(8.1);player.x=pad.x;player.y=pad.y;update(.05);
    const constructionAlive={money:G.money,built:unlocked.has(pad.id)};
    this.reset();
    const shop=DEFS.fishShop;G.st.fishShop.cash=100;knockOutHero();player.x=shop.cx;player.y=shop.cy;
    update(.05);const cashDown={money:G.money,cash:G.st.fishShop.cash};
    tickHeroState(8.1);player.x=shop.cx;player.y=shop.cy;update(.05);
    const cashAlive={money:G.money,cash:G.st.fishShop.cash};
    this.reset();
    const fishing=DEFS.fishing;G.st.fishing.pile=3;knockOutHero();player.x=fishing.zx;player.y=fishing.zy;
    update(.05);const stationDown={stack:G.stack.length,pile:G.st.fishing.pile};
    tickHeroState(8.1);player.x=fishing.zx;player.y=fishing.zy;player.timer=0;update(.05);
    return {constructionDown,constructionAlive,cashDown,cashAlive,stationDown,
      stationAlive:{stack:G.stack.length,pile:G.st.fishing.pile}};
  }
};
"""


def same(actual, expected, label):
    assert math.isclose(actual, expected, abs_tol=1e-7, rel_tol=1e-9), (label, actual, expected)


def main():
    baseline = subprocess.check_output(
        ["git", "show", f"{BASELINE}:raft-village-3d.html"], cwd=ROOT, text=True
    )
    current = (ROOT / "raft-village-3d.html").read_text()
    cache = {}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        pages, errors = [], []
        for label, source in (("baseline", baseline), ("current", current)):
            page = browser.new_page(viewport={"width": 390, "height": 844})
            page.add_init_script("window.requestAnimationFrame = () => 0;")
            page.on("pageerror", lambda error: errors.append(error.stack))

            def external(route):
                url = route.request.url
                if not url.startswith("https://cdn.jsdelivr.net/"):
                    route.abort()
                    return
                if url not in cache:
                    cache[url] = subprocess.check_output(["curl", "-fsS", "--max-time", "20", url])
                route.fulfill(body=cache[url], content_type="application/javascript")

            def document(html):
                def serve(route):
                    route.fulfill(
                        body=html.replace("})();\n</script>", HOOK + "})();\n</script>"),
                        content_type="text/html",
                    )
                return serve

            page.route("https://**", external)
            page.route("**/models/**", lambda route: route.abort())
            page.route(f"**/progress-{label}.html", document(source))
            page.goto(f"http://127.0.0.1:8000/progress-{label}.html", wait_until="networkidle")
            page.wait_for_function("!!window.progressTest")
            pages.append(page)

        old, new = pages
        old_damage = old.evaluate("progressTest.damageCases()")
        new_damage = new.evaluate("progressTest.damageCases()")
        for label, damage in old_damage.items():
            same(new_damage[label], damage / 3, label)
        print(f"Pirate per-hit damage exactly one third of prior release PASS ({len(new_damage)} cases)", flush=True)

        for level in (1, 5, 10):
            state = new.evaluate("level => progressTest.highLevelPad(level)", level)
            assert state["money"] == 470 and state["cost"] == 30 and state["job"], state
        new.evaluate("progressTest.reset(1,true);progressTest.tickRecruit(1)")
        assert new.evaluate("progressTest.recruitState().money") == 500
        new.evaluate("progressTest.stand();progressTest.tickRecruit(2)")
        state = new.evaluate("progressTest.recruitState()")
        assert state["count"] == 2 and state["money"] == 440 and not state["job"], state
        new.evaluate("progressTest.tickRecruit(1)")
        assert new.evaluate("progressTest.recruitState().money") == 440
        for method in ("fullPad", "brokePad"):
            state = new.evaluate(f"progressTest.{method}()")
            assert not state["job"], state
            assert state["money"] == (500 if method == "fullPad" else 29), state
        new.evaluate("progressTest.reset(1,true);progressTest.stand();progressTest.tickRecruit(.1);progressTest.leave();progressTest.tickRecruit(1.1)")
        state = new.evaluate("progressTest.recruitState()")
        assert state["count"] == 1 and state["money"] == 470 and not state["job"], state
        print("Fixed $30 pad auto-fill at one worker/second, leave/full/broke guards PASS", flush=True)

        new.evaluate("progressTest.reset(1,true);progressTest.stand();progressTest.tickRecruit(.4);progressTest.save()")
        expected = new.evaluate("progressTest.recruitState()")
        for _ in range(2):
            new.reload(wait_until="networkidle")
            new.wait_for_function("!!window.progressTest")
            state = new.evaluate("progressTest.recruitState()")
            assert state == expected, (state, expected)
        new.evaluate("progressTest.leave();progressTest.tickRecruit(.7)")
        assert new.evaluate("progressTest.recruitState().count === 1 && progressTest.recruitState().money === 470")
        print("Paid pad job and vacant roster survive two reloads without duplicate payment PASS", flush=True)

        for wave in (4, 5, 10):
            milestone = new.evaluate("wave => progressTest.milestone(wave)", wave)
            assert milestone["carriers"] == (0 if wave == 4 else 1), milestone
        for wave in (5, 10):
            landed = new.evaluate("wave => progressTest.landBoss(wave)", wave)
            assert landed["landed"] and landed["countBefore"] == landed["countAfter"] == 1, landed
        combat = new.evaluate("progressTest.bossCombat()")
        assert combat["heroHurt"] and combat["bothFight"], combat
        assert combat["damage"] > combat["heroAttack"], combat
        navy = new.evaluate("progressTest.navyVersusBoss()")
        assert all(navy.values()), navy
        assert new.evaluate("progressTest.sunkBossStillLands()") == 1
        assert new.evaluate("progressTest.cappedBossStillLands()") == 1
        assert new.evaluate("progressTest.defeatedBossStaysDefeated()") == 0
        print("Every fifth invasion lands exactly one boss; boss/player/crew exchange melee damage PASS", flush=True)

        hit = new.evaluate("progressTest.attackOnce()")
        assert hit["after"]["xp"] > hit["before"]["xp"], hit
        same(hit["damage"], hit["before"]["attack"], "hero real hit damage")
        grown = new.evaluate("progressTest.levelByFighting()")
        assert grown["after"]["level"] > grown["before"]["level"], grown
        assert grown["after"]["attack"] > grown["before"]["attack"] and grown["after"]["max"] > grown["before"]["max"], grown
        same(grown["nextDamage"], grown["after"]["attack"], "levelled hero actual damage")
        sold = new.evaluate("progressTest.sales()")
        assert sold["before"] == sold["after"], sold
        killed = new.evaluate("progressTest.killAndRepeat()")
        assert killed["state"] == "sink" and killed["after"] == killed["repeated"], killed
        victory = new.evaluate("progressTest.victory()")
        assert victory["after"]["level"] >= victory["before"]["level"] + 1, victory
        assert victory["after"] == victory["repeated"], victory
        idle = new.evaluate("progressTest.idleVictory()")
        assert idle["before"] == idle["after"], idle
        knocked = new.evaluate("progressTest.knockout()")
        assert knocked["down"]["hp"] <= 0 and knocked["down"]["downT"] > 0, knocked
        assert knocked["alive"] and knocked["recovered"]["hp"] > 0 and knocked["recovered"]["money"] == 500, knocked
        health_ui = new.evaluate("progressTest.heroHealthUI()")
        same(health_ui["width"], 50, "solo hero defense health bar")
        assert health_ui["healed"] and health_ui["level"] == 1, health_ui
        actions = new.evaluate("progressTest.knockoutActions()")
        assert actions["constructionDown"]["money"] == 500 and not actions["constructionDown"]["built"], actions
        assert actions["constructionAlive"] == {"money": 499, "built": True}, actions
        assert actions["cashDown"] == {"money": 500, "cash": 100}, actions
        assert actions["cashAlive"] == {"money": 600, "cash": 0}, actions
        assert actions["stationDown"] == {"stack": 0, "pile": 3}, actions
        assert actions["stationAlive"] == {"stack": 1, "pile": 2}, actions
        print("Combat-only XP, level/attack/HP growth, one-time rewards and hero recovery PASS", flush=True)

        legacy = new.evaluate("progressTest.legacyHero()")
        assert legacy["cityLevel"] == legacy["hero"]["level"] == 4 and legacy["cityXp"] == 77, legacy

        expected = new.evaluate("progressTest.woundedSave()")
        for _ in range(2):
            new.reload(wait_until="networkidle")
            new.wait_for_function("!!window.progressTest")
            assert new.evaluate("progressTest.heroState()") == expected
        new.evaluate("progressTest.prepareBossSave()")
        new.reload(wait_until="networkidle")
        new.wait_for_function("!!window.progressTest")
        assert new.evaluate("progressTest.continueBossSave()") == 1
        boss_bar = new.evaluate("progressTest.bossBarState()")
        assert not boss_bar["hidden"]
        same(boss_bar["width"], 37, "boss bar tracks landed captain rather than carrier")
        assert not errors, errors
        print("Hero growth/wounds and landed-boss identity persist without duplicate spawn PASS", flush=True)
        browser.close()


if __name__ == "__main__":
    main()
