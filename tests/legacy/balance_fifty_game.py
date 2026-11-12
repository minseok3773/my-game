"""Verify level-50 training, slower pirate growth, fivefold bosses and old saves.

Serve the repository on port 8000. Hooks are inserted only in browser responses;
production code and actual player saves are untouched.
"""

import math
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASELINE = "02af211"
HOOK = r"""
window.balanceTest = {
  reset(wave=0) {
    build(freshState());
    for(const id of ['expand1','tent1','heroForge','crewDojo']) {
      if(!unlocked.has(id)){unlocked.add(id);applyUnlock(id);}
    }
    G.wave=wave;G.money=9263;G.cards={};G.tactic=null;G.preparedWave=null;
    G.lastBossLevel=0;G.raidT=60;
    workers.length=0;soldiers.length=0;enemies.length=0;shots.length=0;fallenCrew.length=0;
    player.x=5;player.y=4;player.vx=player.vy=0;player.cd=10000;
    raidOn=false;looted=false;paused=false;Math.random=()=>.9;
    for(const id of ['helpPanel','cardPanel','strategyPanel','trainingPanel'])$(id).hidden=true;
    if(typeof resetTrainingInteraction==='function')resetTrainingInteraction();
  },
  facility(kind){return Object.values(TRAINING_FACILITIES).find(f=>f.kind===kind);},
  snapshot(){return {wave:G.wave,level:typeof pirateLevel==='function'?pirateLevel():G.wave,
    money:G.money,training:{...G.training},hero:{level:heroLevel(),xp:G.hero.xp,hp:player.hp,max:heroMaxHp(),attack:heroAttack()},
    crew:workers.map(w=>({hp:w.hp,max:crewHpMax(),attack:crewAttack()})),
    navy:soldiers.map(s=>s.hp),stats:{...G.stats},lastBoss:G.lastBossLevel,
    enemies:enemies.map(e=>({id:e.testCase,kind:e.kind,type:e.type,big:!!e.big,champion:!!e.champion,boss:!!e.boss,
      hp:e.hp,max:e.max,state:e.state,level:e.level,fromBigShip:e.fromBigShip}))};},
  prepareTier(kind,tier){
    this.reset();G.training.hero=G.training.crew=tier;
    G.hero.level=20;G.hero.xp=123;G.hero.hp=heroMaxHp()-7;restoreHeroRuntime();
    spawnWorker('tent1',1);workers[0].hp=crewHpMax()-4;
    spawnSoldier(0);soldiers[0].hp=9;
    const f=this.facility(kind);player.x=f.pad.x;player.y=f.pad.y;
    tickTrainingInteraction();hud(objective());
    return {cost:trainingCost(kind),before:this.snapshot()};
  },
  capAttempt(kind){const before=G.money;const result=upgradeTraining(kind);return {result,before,after:G.money};},
  save(){save();return serialize();},
  restore(data){build(data);return this.snapshot();},
  capCombat(){
    this.reset();G.hero.level=49;G.hero.xp=heroXpNeed()-2;player.hp=heroMaxHp()-9;
    const before=this.snapshot().hero;gainCombatXp(2);const after=this.snapshot().hero;
    gainCombatXp(1e9);G.hero.engagedWave=1;G.wave=1;awardHeroVictory();
    const capped=this.snapshot().hero;awardHeroVictory();hud(objective());
    return {before,after,capped,repeated:this.snapshot().hero,xpBar:parseFloat($('xpBar').style.width),rewarded:G.hero.rewardedWave};
  },
  schedule(){
    this.reset();const rows=[];
    for(let i=0;i<31;i++){
      enemies.length=0;startRaid();
      rows.push({wave:G.wave,level:pirateLevel(),bosses:enemies.filter(e=>e.boss&&e.kind!=='boarder').length});
      const before=enemies.length;spawnBoss();
      if(enemies.length!==before)throw Error('duplicate boss on same wave');
    }
    return rows;
  },
  bossPower(level,tactic=null,cards={}){
    this.reset(1+3*(level-1));G.tactic=tactic;G.cards=cards;raidOn=true;
    player.x=9;player.y=7;spawnWorker('tent1',1);
    const w=workers[0];Object.assign(w,{x:4,y:4,hp:1000000,cd:10000});
    const pick=pickPirateType;pickPirateType=()=> 'normal';
    spawnBoarder({x:-2,y:5,big:false});pickPirateType=pick;
    const normal=enemies[enemies.length-1];
    spawnBossBoarder({x:-2,y:5,big:true,boss:true,level});
    const boss=enemies.find(e=>e.champion);
    const hp={normal:normal.max,boss:boss.max};
    for(const e of [normal,boss])Object.assign(e,{x:4.5,y:4,atkT:0});
    updateBoarder(normal,0);const ordinaryDamage=1000000-w.hp;
    w.hp=1000000;updateBoarder(boss,0);
    return {...hp,ordinaryDamage,bossDamage:1000000-w.hp,level:boss.level};
  },
  bossReload(){
    this.reset(12);startRaid();raidOn=true;
    const ship=enemies.find(e=>e.boss&&e.kind!=='boarder');
    spawnBossBoarder(ship);const boss=enemies.find(e=>e.champion);
    boss.hp=boss.max*.4;save();return this.snapshot();
  },
  bossAfterReload(){
    const ship=enemies.find(e=>e.boss&&e.kind!=='boarder');
    spawnBossBoarder(ship);spawnBoss();
    return {champions:enemies.filter(e=>e.champion).length,carriers:enemies.filter(e=>e.boss&&e.kind!=='boarder').length,
      hp:enemies.find(e=>e.champion)?.hp,last:G.lastBossLevel};
  },
  legacy(withBoss){
    this.reset(28);G.training={hero:10,crew:10};
    G.hero.level=20;G.hero.xp=123;G.hero.hp=heroMaxHp()-13;restoreHeroRuntime();
    spawnWorker('tent1',1);workers[0].hp=crewHpMax()-7;
    G.stats.kept=37;startRaid();raidOn=true;
    const normal=enemies.find(e=>!e.big),big=enemies.find(e=>e.big);
    enemies=[normal,big];normal.testCase='ship/normal';big.testCase='ship/big';
    const pick=pickPirateType;
    for(const fromBig of [false,true])for(const type of ['normal','bomber','thief','sniper']){
      pickPirateType=()=>type;spawnBoarder({x:-2,y:5,big:fromBig});
      enemies[enemies.length-1].testCase=`boarder/${fromBig}/${type}`;
    }
    pickPirateType=pick;
    if(withBoss){
      spawnBoss();const ship=enemies[enemies.length-1];ship.testCase='boss/ship';
      spawnBossBoarder(ship);enemies[enemies.length-1].testCase='boss/champion';
    }
    for(const e of enemies)e.hp=e.max*.4;
    return serialize();
  },
  nextBoss(){enemies.length=0;startRaid();return {wave:G.wave,level:pirateLevel(),bosses:enemies.filter(e=>e.boss&&e.kind!=='boarder').length};},
  forecast(){this.reset(29);offerCards();return cardPanel.querySelector('.sub').textContent;},
  draw(){resize();resizeFx();cameraFocus.set(player.x-.45,.3,player.y-.45);sync3D(.016);render(.016);hud(objective());},
  get ready(){return GL.ready;}
};
"""


def same(actual, expected, label):
    assert math.isclose(actual, expected, rel_tol=1e-8, abs_tol=1e-7), (label, actual, expected)


def jsround(number):
    return math.floor(number + .5)


def migrated_max(enemy, level):
    mult = 1.1 ** (level - 1)
    if enemy["id"] == "boss/champion":
        return 5 * 4 * jsround((6 + level * 2) * mult)
    if enemy.get("kind") == "boarder":
        _, big, kind = enemy["id"].split("/")
        hp = jsround((1.6 if big == "true" else 1) * (6 + level * 2) * mult)
        if kind != "normal":
            hp = max(1, jsround(hp * {"bomber": .6, "thief": .75, "sniper": .8}[kind]))
        return 4 * hp
    hp = 4 * jsround(jsround((3 if enemy["big"] else 1) * (12 + level * 5) * mult))
    if enemy["id"] == "boss/ship":
        hp = 5 * 4 * jsround(jsround((12 + level * 5) * mult))
    return hp


def main():
    subprocess.check_call(["curl", "-fsS", "--max-time", "5", "http://127.0.0.1:8000/models/captain.json"], stdout=subprocess.DEVNULL)
    old_source = subprocess.check_output(["git", "show", f"{BASELINE}:raft-village-3d.html"], cwd=ROOT, text=True)
    current_source = (ROOT / "raft-village-3d.html").read_text()
    cache, errors = {}, []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", args=["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pages = []
        for source in (old_source, current_source):
            page = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            page.add_init_script("requestAnimationFrame=()=>0")
            page.on("pageerror", lambda e: errors.append(e.stack))
            def external(route):
                url = route.request.url
                if not url.startswith("https://cdn.jsdelivr.net/"):
                    route.abort();return
                if url not in cache:cache[url]=subprocess.check_output(["curl", "-fsS", "--max-time", "20", url])
                route.fulfill(body=cache[url], content_type="application/javascript")
            page.route("https://**", external)
            def document(body):
                def handle(route):
                    route.fulfill(body=body.replace("})();\n</script>", HOOK + "})();\n</script>"),content_type="text/html")
                return handle
            page.route("**/raft-village-3d.html", document(source))
            page.goto("http://127.0.0.1:8000/raft-village-3d.html", wait_until="networkidle")
            page.wait_for_function("!!window.balanceTest && balanceTest.ready", polling=100, timeout=30000)
            pages.append(page)
        old, page = pages
        for kind in ("hero", "crew"):
            for tier in (10, 49):
                prepared=page.evaluate("([kind,tier])=>balanceTest.prepareTier(kind,tier)",[kind,tier])
                assert page.locator("#trainingPanel").is_visible()
                assert f"{tier}/50" in page.locator("#trainingPanel .level").inner_text()
                page.locator("#trainingUpgrade").tap()
                after=page.evaluate("balanceTest.snapshot()")
                same(prepared["before"]["money"]-after["money"], prepared["cost"], "one tier payment")
                assert after["training"][kind] == tier+1, after
                subject="hero" if kind=="hero" else "crew"
                before_hp=prepared["before"][subject] if kind=="hero" else prepared["before"][subject][0]
                after_hp=after[subject] if kind=="hero" else after[subject][0]
                same(after_hp["hp"]-before_hp["hp"], 10 if kind=="hero" else 5, "wounds retained during training")
                assert after["navy"] == [9],after
                if tier==49:
                    assert page.locator("#trainingUpgrade").is_disabled()
                    rejected=page.evaluate("kind=>balanceTest.capAttempt(kind)",kind)
                    assert not rejected["result"] and rejected["before"]==rejected["after"],rejected
                page.evaluate("balanceTest.save()")
                for _ in range(2):
                    page.reload(wait_until="networkidle")
                    page.wait_for_function("!!window.balanceTest && balanceTest.ready",polling=100,timeout=30000)
                    restored=page.evaluate("balanceTest.snapshot()")
                    for key in ("training","hero","crew","navy","money"):
                        assert restored[key]==after[key],(key,restored,after)
        cap=page.evaluate("balanceTest.capCombat()")
        assert cap["after"]["level"]==cap["capped"]["level"]==50 and cap["capped"]["xp"]==0,cap
        same(cap["after"]["attack"]-cap["before"]["attack"],2,"combat level attack")
        same(cap["after"]["hp"]-cap["before"]["hp"],6,"combat level wound preservation")
        assert cap["after"]==cap["capped"]==cap["repeated"] and cap["xpBar"]==100 and cap["rewarded"]==1,cap
        print("Training 10→11/49→50, finite prices, cap guards and two reloads; hero combat cap50 PASS",flush=True)

        schedule=page.evaluate("balanceTest.schedule()")
        assert [r["level"] for r in schedule]==[math.ceil(w/3) for w in range(1,32)],schedule
        assert [r["wave"] for r in schedule if r["bosses"]]==[13,28],schedule
        assert all(r["bosses"]<=1 for r in schedule),schedule
        for level in (5,10,29):
            for tactic,cards in ((None,{}),("guard",{"glass":2,"bunker":1}),("trade",{"bunker":2})):
                power=page.evaluate("([level,tactic,cards])=>balanceTest.bossPower(level,tactic,cards)",[level,tactic,cards])
                same(power["boss"], power["normal"]*5, "boss actual HP")
                same(power["bossDamage"], power["ordinaryDamage"]*5,"boss actual sword damage")
                assert power["level"]==level,power
        expected=page.evaluate("balanceTest.bossReload()")
        page.reload(wait_until="networkidle");page.wait_for_function("!!window.balanceTest && balanceTest.ready",polling=100,timeout=30000)
        boss=page.evaluate("balanceTest.bossAfterReload()")
        assert boss["champions"]==boss["carriers"]==1 and boss["last"]==5,boss
        same(boss["hp"],next(e["hp"] for e in expected["enemies"] if e["champion"]),"landed boss wounds after reload")
        assert "Lv.10" in page.evaluate("balanceTest.forecast()"),"forecast must use pirate level rather than wave30"
        print("Three raids per pirate level, one boss per fifth level, fivefold real HP/damage PASS",flush=True)

        for with_boss in (False,True):
            legacy=old.evaluate("boss=>balanceTest.legacy(boss)",with_boss)
            before=page.evaluate("data=>balanceTest.restore(data)",legacy)
            assert before["wave"]==29 and before["level"]==10,before
            assert before["money"]==9263 and before["training"]=={"hero":10,"crew":10},before
            assert before["hero"]["level"]==20 and before["hero"]["xp"]==123 and before["stats"]["kept"]==37,before
            same(before["hero"]["hp"],legacy["hero"]["hp"],"legacy hero wounds")
            same(before["crew"][0]["hp"],legacy["crewRoster"][0]["hp"],"legacy crew wounds")
            for enemy in before["enemies"]:
                same(enemy["max"],migrated_max(enemy,10),enemy["id"]+" migrated max")
                same(enemy["hp"]/enemy["max"],.4,enemy["id"]+" health fraction")
                assert enemy["level"]==10,enemy
            page.evaluate("balanceTest.save()")
            for _ in range(2):
                page.reload(wait_until="networkidle");page.wait_for_function("!!window.balanceTest && balanceTest.ready",polling=100,timeout=30000)
                after=page.evaluate("balanceTest.snapshot()")
                assert before==after,(before,after)
            next_raid=page.evaluate("balanceTest.nextBoss()")
            assert next_raid=={"wave":30,"level":10,"bosses":0 if with_boss else 1},next_raid
        print("Authentic old wave29→pirateLv10 migration preserves progress/wounds; no repeat scaling or boss PASS",flush=True)
        assert not errors,errors
        browser.close()


if __name__=="__main__":
    main()
