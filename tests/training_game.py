"""Exercise one-second recruiting, minute raids and paid training facilities.

Start the repository HTTP server on port 8000 first. Private hooks are inserted
only into test responses; neither the game file nor user saves are modified.
"""

import argparse
import math
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:8000/raft-village-3d.html"
HOOK = r"""
window.trainingTest = {
  reset(expand=true,tent=true) {
    build(freshState());
    if(expand){unlocked.add('expand1');applyUnlock('expand1');}
    if(tent){unlocked.add('tent1');applyUnlock('tent1');}
    G.money=500;G.wave=0;G.raidT=60;G.cards={};G.tactic=null;G.preparedWave=null;
    workers.length=0;soldiers.length=0;enemies.length=0;shots.length=0;fallenCrew.length=0;
    raidOn=false;looted=false;paused=false;player.x=5;player.y=4;
    player.vx=player.vy=0;player.cd=10000;
    G.hero.level=1;G.hero.xp=0;G.hero.hp=heroMaxHp();G.hero.downT=0;restoreHeroRuntime();
    for(const id of ['helpPanel','cardPanel','strategyPanel','trainingPanel'])$(id).hidden=true;
    floaters.length=0;fx.length=0;confetti.length=0;raidIntro=null;
    Math.random=()=>.5;
  },
  standRecruit() {const p=recruitmentPads().find(p=>p.tent==='tent1');player.x=p.x;player.y=p.y;},
  leave() {player.x=5;player.y=4;player.vx=player.vy=0;},
  recruit(seconds) {
    for(let remaining=seconds;remaining>1e-9;remaining-=.05)tickRecruitment(Math.min(.05,remaining));
    return this.recruitState();
  },
  recruitState() {return {money:G.money,count:workers.length,job:G.recruitment.tent1||null,
    duration:RECRUIT_SECONDS,pad:recruitmentPads().find(p=>p.tent==='tent1')};},
  oldPaidJob() {
    this.reset();G.money=470;G.recruitment.tent1={remaining:4.3,paid:30};
    const data=serialize();build(data);this.leave();return this.recruitState();
  },
  partialPaidJob() {this.reset();this.standRecruit();this.recruit(.6);save();return this.recruitState();},
  raidState() {return {seconds:G.raidT,wave:G.wave,active:raidOn,marker:G.raidIntervalVersion,
    tactic:G.tactic,money:G.money,damage:strategyDamage()};},
  // 습격 카운트다운은 살아 있는 일꾼이 6명 이상일 때만 흐름
  minuteBoundary() {
    this.reset();while(workers.length<RAID_MIN_CREW)spawnWorker('tent1',1);const start=this.raidState();
    for(let i=0;i<1199;i++)updateMilitary(.05);
    const before=this.raidState();updateMilitary(.1);return {start,before,after:this.raidState()};
  },
  raidGate() {
    this.reset();while(workers.length>RAID_MIN_CREW-1)workers.pop();while(workers.length<RAID_MIN_CREW-1)spawnWorker('tent1',1);
    const t0=G.raidT;for(let i=0;i<40;i++)updateMilitary(.05);const held=G.raidT;
    spawnWorker('tent1',1);for(let i=0;i<40;i++)updateMilitary(.05);return {t0,held,after:G.raidT,alive:aliveWorkers()};
  },
  expandTimer() {
    this.reset(false,false);G.raidT=7;
    unlock('expand1',PADS.find(p=>p.id==='expand1'));return this.raidState();
  },
  finishTimer() {
    this.reset();G.cards.smuggler=2;G.wave=3;raidOn=true;enemies.length=0;
    updateMilitary(0);const state=this.raidState();cardPanel.hidden=true;paused=false;return state;
  },
  legacyTimer(active=false) {
    const data=freshState();data.unlocked.push('expand1');data.raidT=17;
    delete data.raidIntervalVersion;
    if(active)data.combat={raidOn:true,looted:false,enemies:[],balanceVersion:PIRATE_BALANCE_VERSION};
    build(data);return this.raidState();
  },
  partialTimer() {this.reset();G.raidT=37.25;save();return this.raidState();},
  scoutSetup() {this.reset();hud(objective());},
  facility(kind) {return Object.values(TRAINING_FACILITIES).find(f=>f.kind===kind);},
  standFacility(kind) {const f=this.facility(kind);player.x=f.pad.x;player.y=f.pad.y;player.vx=player.vy=0;},
  addFacility(kind) {const f=this.facility(kind);unlocked.add(f.id);applyUnlock(f.id);},
  state() {return {money:G.money,training:{...G.training},hero:{attack:heroAttack(),max:heroMaxHp(),hp:player.hp},
    crew:{attack:crewAttack(),max:crewHpMax(),hp:workers.map(w=>w.hp)},navy:soldiers.map(s=>s.hp),
    pads:trainingPads(),unlocked:[...unlocked],paid:{...G.trainPaid}};},
  buildFacility(kind) {
    this.reset();const f=this.facility(kind),p=visiblePads().find(p=>p.id===f.id);
    const before=G.money;player.x=p.x;player.y=p.y;
    for(let i=0;i<100&&!unlocked.has(f.id);i++)update(.05);
    this.standFacility(kind);sync3D(.016);trainingHud();
    const obj=trainingObjs.get(f.id);
    return {built:unlocked.has(f.id),spent:before-G.money,cost:p.cost,
      accessible:walkable(f.x,f.y)&&walkable(f.pad.x,f.pad.y),
      rendered:!!obj&&obj.g.parent===world&&!!obj.g.getObjectByName('station-details'),
      constructorPadGone:!visiblePads().some(p=>p.id===f.id),
      entranceIsSeparate:trainingPads().some(p=>p.facility===f.id)&&!visiblePads().some(p=>p.train)};
  },
  upgradeGuards() {
    this.reset();this.standFacility('hero');const initial=G.money;
    const unbuilt=upgradeTraining('hero');this.addFacility('hero');this.leave();
    const distant=upgradeTraining('hero');this.standFacility('hero');
    G.money=trainingCost('hero')-1;const poor=upgradeTraining('hero');
    G.money=initial;player.hp=0;player.dead=true;G.hero.downT=8;
    const down=upgradeTraining('hero');G.hero.downT=0;player.dead=false;player.hp=heroMaxHp();
    G.training.hero=TRAINING_MAX_LEVEL;const capped=upgradeTraining('hero');
    return {unbuilt,distant,poor,down,capped,money:G.money};
  },
  upgradeHero() {
    this.reset();this.addFacility('hero');this.standFacility('hero');
    player.hp=heroMaxHp()-7;const before=this.state();const cost=trainingCost('hero');
    const bought=upgradeTraining('hero');const after=this.state();
    player.x=5;player.y=4;player.cd=0;raidOn=true;
    const e=this.enemy(5.5,4);updateHeroCombat(0);
    return {before,after,bought,cost,actualDamage:1000-e.hp};
  },
  enemy(x,y) {
    const e={kind:'boarder',type:'normal',x,y,hp:1000,max:1000,state:'walk',atkT:10000,
      bob:0,vx:0,vy:0,sinkT:0,ang:0,ph:.1,goal:{x,y},home:{x,y}};
    enemies.push(e);return e;
  },
  upgradeCrew() {
    this.reset();this.addFacility('crew');spawnWorker('tent1',2);
    Object.assign(workers[0],{x:5,y:4,hp:crewHpMax()-4,cd:0});
    Object.assign(workers[1],{x:9,y:7,hp:crewHpMax(),cd:10000});
    spawnSoldier(0);soldiers[0].hp=9;this.leave();player.x=9;player.y=7;
    const e=this.enemy(5.5,4);raidOn=true;updateDefenders(0,1,1);
    const firstDamage=1000-e.hp;raidOn=false;
    this.standFacility('crew');const before=this.state(),cost=trainingCost('crew');
    const bought=upgradeTraining('crew'),after=this.state();
    player.x=9;player.y=7;workers[0].cd=0;raidOn=true;
    const prior=e.hp;updateDefenders(0,1,1);const actualDamage=prior-e.hp;
    spawnWorker('tent1',1);const recruitHp=workers[workers.length-1].hp;
    workers.length=0;enemies.length=0;const navy=soldiers[0];Object.assign(navy,{x:5,y:4,hp:9,cd:0});
    const target=this.enemy(5.5,4);updateDefenders(0,1,1);
    return {before,after,bought,cost,firstDamage,actualDamage,recruitHp,navyDamage:1000-target.hp};
  },
  // 게이지 방식: 칸에 서 있으면 돈이 조금씩 들어가고, 다 차면 한 단계 강화 (화면은 열리지 않음)
  gaugeTraining() {
    this.reset();this.addFacility('hero');this.addFacility('crew');this.standFacility('hero');
    const before=this.state(),cost=trainingCost('hero');
    update(.05);const partial=this.state();
    for(let i=0;i<30;i++){trainingHud();sync3D(.05);update(.05);}
    const after=this.state();this.leave();const away=G.money;
    for(let i=0;i<10;i++)update(.05);
    return {before,partial,after,cost,stillAway:G.money===away,rendered:trainingObjs.size,
      paused,panelHidden:trainingPanel.hidden,buttonHidden:trainingBtn.hidden};
  },
  saveTraining() {
    this.reset();this.addFacility('hero');this.addFacility('crew');G.money=10000;
    this.standFacility('hero');upgradeTraining('hero');upgradeTraining('hero');
    this.standFacility('crew');upgradeTraining('crew');upgradeTraining('crew');upgradeTraining('crew');
    spawnWorker('tent1',1);workers[0].hp=crewHpMax()-3;player.hp=heroMaxHp()-9;save();
    return this.state();
  },
  legacyFacilities() {
    const data=freshState();data.unlocked.push('expand1','tent1');delete data.training;
    build(data);sync3D(.016);
    return {training:{...G.training},accessible:Object.values(TRAINING_FACILITIES).every(f=>walkable(f.x,f.y)&&walkable(f.pad.x,f.pad.y)),
      offered:visiblePads().filter(p=>Object.hasOwn(TRAINING_FACILITIES,p.id)).map(p=>p.id),
      stationsSeparate:!STATION_IDS.some(id=>Object.hasOwn(TRAINING_FACILITIES,id))};
  },
  ui(kind) {this.reset();this.addFacility('hero');this.addFacility('crew');this.standFacility(kind);this.draw();},
  uiState() {return {money:G.money,levels:{...G.training},paused,panel:trainingPanel.hidden};},
  draw() {
    resize();resizeFx();
    for(let i=0;i<20;i++)sync3D(.05);
    render(.016);hud(objective());
  },
  cleanupModels() {this.reset(false,false);sync3D(.016);return trainingObjs.size;},
  save() {save();},
  tick(n) {for(let i=0;i<n;i++)update(.05);this.draw();},
  resume() {paused=false;for(const id of ['helpPanel','cardPanel','trainingPanel'])$(id).hidden=true;},
  get ready() {return GL.ready;}
};
"""


def same(actual, expected, label):
    assert math.isclose(actual, expected, abs_tol=1e-7, rel_tol=1e-9), (label, actual, expected)


def reload(page):
    page.reload(wait_until="networkidle")
    page.wait_for_function("!!window.trainingTest", polling=100)
    page.evaluate("trainingTest.resume()")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    screenshots = args.screenshots or Path(tempfile.mkdtemp(prefix="my-game-training-"))
    screenshots.mkdir(parents=True, exist_ok=True)
    subprocess.check_call(
        ["curl", "-fsS", "--max-time", "5", "http://127.0.0.1:8000/models/captain.json"],
        stdout=subprocess.DEVNULL,
    )
    source = (ROOT / "raft-village-3d.html").read_text()
    assert source.count("})();\n</script>") == 1
    cache, errors = {}, []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path="/usr/bin/chromium",
            args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        page = browser.new_page(
            viewport={"width": 390, "height": 844}, is_mobile=True,
            has_touch=True, device_scale_factor=2,
        )
        page.add_init_script("requestAnimationFrame = () => 0")
        page.on("pageerror", lambda error: errors.append(error.stack))

        def external(route):
            url = route.request.url
            if not url.startswith("https://cdn.jsdelivr.net/"):
                route.abort()
                return
            if url not in cache:
                cache[url] = subprocess.check_output(["curl", "-fsS", "--max-time", "20", url])
            route.fulfill(body=cache[url], content_type="application/javascript")

        page.route("https://**", external)
        page.route("**/raft-village-3d.html", lambda route: route.fulfill(
            body=source.replace("})();\n</script>", HOOK + "})();\n</script>"), content_type="text/html",
        ))
        page.goto(URL, wait_until="networkidle")
        page.wait_for_function("!!window.trainingTest", polling=100)
        page.wait_for_function("trainingTest.ready", polling=100, timeout=30000)

        page.evaluate("trainingTest.reset();trainingTest.standRecruit()")
        before = page.evaluate("trainingTest.recruit(.99)")
        assert before["count"] == 0 and before["money"] == 470, before
        first = page.evaluate("trainingTest.recruit(.01)")
        assert first["count"] == 1 and first["money"] == 470, first
        second = page.evaluate("trainingTest.recruit(1)")
        assert second["count"] == 2 and second["money"] == 440 and not second["job"], second
        same(second["duration"], 1, "one-second recruitment")
        page.evaluate("trainingTest.reset();trainingTest.standRecruit();trainingTest.recruit(.4);trainingTest.leave()")
        left = page.evaluate("trainingTest.recruit(2)")
        assert left["count"] == 1 and left["money"] == 470 and not left["job"], left
        migrated = page.evaluate("trainingTest.oldPaidJob()")
        assert migrated["money"] == 470 and migrated["job"]["remaining"] <= 1, migrated
        finished = page.evaluate("trainingTest.recruit(1)")
        assert finished["count"] == 1 and finished["money"] == 470, finished
        expected = page.evaluate("trainingTest.partialPaidJob()")
        for _ in range(2):
            reload(page)
            state = page.evaluate("trainingTest.recruitState()")
            same(state["job"]["remaining"], expected["job"]["remaining"], "paid remaining time")
            assert state["count"] == 0 and state["money"] == 470, state
        print("One worker per second, leave/full guards and paid-job migrations/reloads PASS", flush=True)

        gate = page.evaluate("trainingTest.raidGate()")
        assert gate["held"] == gate["t0"] and gate["after"] < gate["held"] and gate["alive"] >= 6, gate
        timing = page.evaluate("trainingTest.minuteBoundary()")
        same(timing["start"]["seconds"], 60, "minute interval")
        assert not timing["before"]["active"] and timing["before"]["wave"] == 0, timing
        assert timing["after"]["active"] and timing["after"]["wave"] == 1, timing
        same(page.evaluate("trainingTest.expandTimer().seconds"), 60, "first expansion")
        same(page.evaluate("trainingTest.finishTimer().seconds"), 60, "post-raid, two smuggler cards")
        same(page.evaluate("trainingTest.legacyTimer().seconds"), 60, "legacy idle schedule")
        active = page.evaluate("trainingTest.legacyTimer(true)")
        assert active["active"] and active["seconds"] == 17, active
        page.evaluate("trainingTest.partialTimer()")
        for _ in range(2):
            reload(page)
            same(page.evaluate("trainingTest.raidState().seconds"), 37.25, "saved countdown")
        page.evaluate("trainingTest.scoutSetup()")
        page.locator("#strategyBtn").click()
        page.locator("#strategyPanel button").filter(has_text="정찰 파견").click()
        scout = page.evaluate("trainingTest.raidState()")
        assert scout["tactic"] == "scout" and scout["money"] == 485, scout
        same(scout["seconds"], 60, "scouting preserves minute interval")
        same(scout["damage"], .85, "scouting damage reduction")
        print("Minute raid boundary, expansion/victory resets, cards/scout and old-save countdown PASS", flush=True)

        legacy = page.evaluate("trainingTest.legacyFacilities()")
        assert legacy["training"] == {"hero": 0, "crew": 0} and legacy["accessible"], legacy
        assert sorted(legacy["offered"]) == ["crewDojo", "heroForge"] and legacy["stationsSeparate"], legacy
        for kind in ("hero", "crew"):
            construction = page.evaluate("kind=>trainingTest.buildFacility(kind)", kind)
            assert all(construction[key] for key in ("built", "accessible", "rendered", "constructorPadGone", "entranceIsSeparate")), construction
            same(construction["spent"], construction["cost"], "construction payment")
        guards = page.evaluate("trainingTest.upgradeGuards()")
        assert not any(guards[key] for key in ("unbuilt", "distant", "poor", "down", "capped")), guards
        assert guards["money"] == 500, guards
        gauge = page.evaluate("trainingTest.gaugeTraining()")
        assert gauge["partial"]["training"]["hero"] == 0 and 0 < gauge["partial"]["paid"]["hero"] < gauge["cost"], gauge
        same(gauge["before"]["money"] - gauge["partial"]["money"], gauge["partial"]["paid"]["hero"], "gauge holds paid money")
        assert gauge["after"]["training"] == {"hero": 1, "crew": 0} and gauge["rendered"] == 2, gauge
        same(gauge["before"]["money"] - gauge["after"]["money"], gauge["cost"] + gauge["after"]["paid"]["hero"], "gauge payment")
        assert gauge["stillAway"] and not gauge["paused"] and gauge["panelHidden"] and gauge["buttonHidden"], gauge

        hero = page.evaluate("trainingTest.upgradeHero()")
        assert hero["bought"] and hero["after"]["training"]["hero"] == 1, hero
        same(hero["before"]["money"] - hero["after"]["money"], hero["cost"], "hero payment")
        same(hero["after"]["hero"]["max"] - hero["before"]["hero"]["max"], 10, "hero max HP")
        same(hero["after"]["hero"]["hp"] - hero["before"]["hero"]["hp"], 10, "wounded hero missing HP preserved")
        same(hero["actualDamage"], hero["before"]["hero"]["attack"] + 3, "trained hero real sword hit")
        crew = page.evaluate("trainingTest.upgradeCrew()")
        assert crew["bought"] and crew["after"]["training"]["crew"] == 1, crew
        same(crew["before"]["money"] - crew["after"]["money"], crew["cost"], "crew payment")
        same(crew["actualDamage"], crew["firstDamage"] + 1, "trained worker real sword hit")
        assert crew["after"]["crew"]["hp"] == [hp + 5 for hp in crew["before"]["crew"]["hp"]], crew
        assert crew["after"]["navy"] == crew["before"]["navy"] == [9], crew
        same(crew["recruitHp"], crew["after"]["crew"]["max"], "new worker inherits training")
        same(crew["navyDamage"], 4.5, "navy attack unchanged")
        print("Buildable/rendered facilities, payment guards, gauge payment and real hero/worker combat improvements PASS", flush=True)

        expected = page.evaluate("trainingTest.saveTraining()")
        for _ in range(2):
            reload(page)
            state = page.evaluate("trainingTest.state()")
            assert state["training"] == expected["training"] == {"hero": 2, "crew": 3}, state
            assert state["hero"] == expected["hero"] and state["crew"] == expected["crew"], state
            assert state["money"] == expected["money"] and len(state["crew"]["hp"]) == 1, state
            assert {"heroForge", "crewDojo"}.issubset(state["unlocked"]), state
        print("Training tiers, upgraded wounded roster and facility ownership survive two reloads PASS", flush=True)

        for width, height in ((390, 844), (320, 568), (844, 390)):
            if page.viewport_size != {"width": width, "height": height}:
                page.evaluate("() => {window.resizeDone=new Promise(resolve=>addEventListener('resize',resolve,{once:true}));}")
                page.set_viewport_size({"width": width, "height": height})
                page.evaluate("resizeDone")
            for kind in ("hero", "crew"):
                page.evaluate("kind=>trainingTest.ui(kind)", kind)
                before = page.evaluate("trainingTest.uiState()")
                page.evaluate("trainingTest.tick(34)")
                after = page.evaluate("trainingTest.uiState()")
                assert after["levels"][kind] == 1 and before["levels"][kind] == 0, (before, after)
                assert page.locator("#trainingBtn").is_hidden() and page.locator("#trainingPanel").is_hidden() and not after["paused"], after
                page.screenshot(path=str(screenshots / f"{kind}-training-{width}.png"))
            print(f"Actual mobile training pads fill and upgrade by standing PASS {width}x{height}", flush=True)
        assert page.evaluate("trainingTest.cleanupModels()") == 0
        assert not errors, errors
        browser.close()
    print("Screenshots:", screenshots)


if __name__ == "__main__":
    main()
