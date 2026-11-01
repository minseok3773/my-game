"""Exercise deck melee, paid tent production, casualties and save restoration.

Run with a local HTTP server on port8000. Private hooks exist only in test
responses; production code and actual player browser saves are unchanged.
"""
import argparse
import ast
import subprocess
import tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = ast.parse((ROOT / 'tests/combat_game.py').read_text())
HOOK = next(ast.literal_eval(n.value) for n in BASE.body if isinstance(n, ast.Assign) and any(isinstance(t,ast.Name) and t.id=='HOOK' for t in n.targets))
HOOK += r'''
window.crewTest = {
 get workers(){return workers},get corpses(){return fallenCrew},get G(){return G},
 reset(){build(freshState());for(const id of ['tent1','expand1']){unlocked.add(id);applyUnlock(id)}G.money=500;G.raidT=10000;G.wave=1;player.x=5;player.y=4;player.cd=10000;paused=false;},
 cost(id='tent1'){return recruitmentCost(id)},render(){resize();resizeFx();render(.05);hud(objective())},
 kill(){killCrew(workers[0])},recruit(id='tent1'){return recruitWorker(id)},tick(dt){tickRecruitment(dt)},
 elapsed(seconds){for(let t=0;t<seconds;t+=.05)update(.05)},
 data(){return{count:workers.length,hps:workers.map(w=>w.hp),money:G.money,job:G.recruitment.tent1,capacity:tentCapacity('tent1'),corpses:fallenCrew.length}},
 save(){save()},ui(){hud(objective())},
 legacy(){this.reset();const data=serialize();delete data.crewRoster;delete data.crewRosterVersion;data.respawn=[{tent:'tent1',t:G.t+45}];build(data);return this.data()},
 upgrade(){unlock('up:tent1',{up:'tent1',x:DEFS.tent1.x,y:DEFS.tent1.y})},
 fight(type){
  this.reset();workers.splice(1);const w=workers[0];Object.assign(w,{x:4,y:4,hp:1000,cd:0});
  const e=combatTest.boarder(type,12,6);e.goal={x:12,y:6};e.atkT=0;raidOn=true;
  let close=false,swing=false,crewHurt=false,pirateHurt=false;
  for(let i=0;i<240;i++){updateMilitary(.05);close ||=dist(w.x,w.y,e.x,e.y)<1;swing ||=w.fighting&&e.fighting;crewHurt ||=w.hp<1000;pirateHurt ||=e.hp<10000;}
  return{close,swing,crewHurt,pirateHurt,money:G.money,hp:G.hp,shots:shots.length,loot:e.loot||0};
 },
 wipe(){this.reset();workers.splice(1);const w=workers[0];Object.assign(w,{x:4,y:4,hp:1});combatTest.boarder('normal',4.5,4);raidOn=true;G.raidHadCrew=true;updateMilitary(.05);updateMilitary(.05);hud(objective());return{...this.data(),raid:raidOn,defended:G.defended||0,card:!!G.cardOffer,hp:G.hp};},
 health(value){workers[0].hp=value},
 renderFixture(){this.reset();player.x=6;player.y=6;workers.forEach((w,i)=>Object.assign(w,{x:5+i*.8,y:6.5,cd:0}));const e=combatTest.boarder('normal',6.5,6.5);e.hp=e.max=1000;raidOn=true;for(let i=0;i<18;i++){updateMilitary(.05);sync3D(.05)}render(.016);hud(objective());},
 bossUI(){spawnBoss();raidOn=true;crewTest.kill();crewTest.render()},
 deathPose(){this.reset();this.kill();sync3D(.2);render(.1);const m=models.get(fallenCrew[0]);window.deadFixture=fallenCrew[0];return{shown:m.root.parent===world,clip:m.cur?.getClip().name,sword:m.sword.visible,count:fallenCrew.length}},
 clearCorpse(){tickMeleeEffects(2.1);sync3D(.1);return !models.has(window.deadFixture)},
 modelState(){return workers.map(w=>{const m=models.get(w);return{fighting:w.fighting,sword:m.sword.visible,rifle:m.rifle.visible,clip:m.cur?.getClip().name}})}
};
'''


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--screenshots',type=Path)
    args=parser.parse_args()
    output=args.screenshots or Path(tempfile.mkdtemp(prefix='raft-melee-'))
    output.mkdir(parents=True,exist_ok=True)
    cache={}
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page=browser.new_page(viewport={'width':320,'height':568},is_mobile=True,has_touch=True)
        errors=[];page.on('pageerror',lambda e:errors.append(e.stack))
        page.add_init_script('window.requestAnimationFrame=()=>0')
        def external(route):
            url=route.request.url
            if not url.startswith('https://cdn.jsdelivr.net/'):route.abort();return
            if url not in cache:cache[url]=subprocess.check_output(['curl','-fsS','--max-time','20',url])
            route.fulfill(body=cache[url],content_type='application/javascript')
        page.route('https://**',external)
        page.route('**/raft-village-3d.html',lambda r:r.fulfill(body=(ROOT/'raft-village-3d.html').read_text().replace('})();\n</script>',HOOK+'})();\n</script>'),content_type='text/html'))
        page.goto('http://127.0.0.1:8000/raft-village-3d.html',wait_until='networkidle');page.wait_for_function('!!window.crewTest')
        for kind in ['normal','bomber','thief','sniper']:
            result=page.evaluate('type=>crewTest.fight(type)',kind)
            assert all(result[k] for k in ['close','swing','crewHurt','pirateHurt']),result
            assert result['money']==500 and result['hp']==100 and result['shots']==0 and result['loot']==0,result
        print('All pirate types chase distant workers and sword fight without stealing, bombardment or worker shots PASS',flush=True)
        result=page.evaluate('crewTest.wipe()')
        assert result['count']==0 and result['money']==500 and result['corpses']==1,result
        assert not result['raid'] and result['defended']==0 and not result['card'] and result['hp']==100,result
        page.evaluate('crewTest.elapsed(46)')
        assert page.evaluate('crewTest.workers.length')==0
        print('Defeat preserves wallet/facilities, no reward and no automatic46s resurrection PASS',flush=True)
        page.evaluate('crewTest.reset();crewTest.kill();crewTest.health(7);crewTest.ui()')
        assert page.locator('#recruitBtn').is_visible()
        page.evaluate('crewTest.G.money=29;crewTest.ui()');page.locator('#recruitBtn').click()
        button=page.locator('#recruitPanel [data-tent=tent1] button')
        assert button.is_disabled()
        assert not page.evaluate('crewTest.recruit()')
        page.locator('#recruitPanel .close').click()
        page.evaluate('crewTest.G.money=500;crewTest.ui()');page.locator('#recruitBtn').click()
        page.screenshot(path=str(output/'recruitment-320.png'))
        box=page.locator('#recruitPanel > div').bounding_box()
        assert box['x']>=0 and box['y']>=0 and box['x']+box['width']<=320 and box['y']+box['height']<=568,box
        button.click()
        assert page.locator('#recruitPanel').is_hidden()
        assert page.evaluate('crewTest.data().money===470 && crewTest.data().count===1 && !crewTest.recruit()')
        page.evaluate('crewTest.tick(3.7);crewTest.save()')
        for _ in range(2):
            page.reload(wait_until='networkidle');page.wait_for_function('!!window.crewTest')
            result=page.evaluate('crewTest.data()')
            assert result['count']==1 and result['hps']==[7] and result['money']==470,result
            assert abs(result['job']['remaining']-1.3)<1e-6,result
        page.evaluate('crewTest.tick(1.4)')
        result=page.evaluate('crewTest.data()')
        assert result['count']==2 and result['money']==470 and not result.get('job'),result
        assert not page.evaluate('crewTest.recruit()')
        print('Native recruitment UI: insufficient funds, one charge/job,5s completion, preserved wounds/paid timer across2 reloads PASS',flush=True)
        page.evaluate('crewTest.kill();crewTest.upgrade()')
        result=page.evaluate('crewTest.data()')
        assert result['count']==3 and result['capacity']==4,result
        assert page.evaluate("crewTest.cost()") == 40
        result=page.evaluate('crewTest.legacy()')
        assert result['count']==1,result
        page.evaluate('crewTest.elapsed(46)')
        assert page.evaluate('crewTest.data().count')==1
        print('Tent upgrade adds only new slots; legacy pending respawn becomes paid vacancy PASS',flush=True)
        page.evaluate('crewTest.renderFixture()')
        rows=page.evaluate('crewTest.modelState()')
        assert any(r['fighting'] and r['sword'] and not r['rifle'] for r in rows),rows
        assert all(not r.get('clip') or 'Sword' in r.get('clip') for r in rows if r['fighting']),rows
        page.evaluate('crewTest.save()')
        page.evaluate('() => { window.testResize = new Promise(resolve => addEventListener("resize", () => resolve(true), {once:true})); }')
        page.set_viewport_size({'width':390,'height':844})
        page.evaluate('window.testResize')
        page.evaluate('crewTest.render()')
        page.screenshot(path=str(output/'sword-fight-390.png'))
        from PIL import Image
        image=Image.open(output/'sword-fight-390.png').convert('RGB')
        area=image.crop((40,190,350,650))
        assert sum(max(p)>30 for p in area.getdata())>area.width*area.height*.8, 'Rendered game scene must not be blank'
        for size in [(320,568),(390,844),(844,390),(1280,800)]:
            page.set_viewport_size({'width':size[0],'height':size[1]});page.evaluate('crewTest.ui()')
            a=page.locator('#recruitBtn').bounding_box()
            for name in ['defense','bag','menuBtn','strategyBtn']:
                if not page.locator('#'+name).is_visible():continue
                b=page.locator('#'+name).bounding_box()
                assert not(min(a['x']+a['width'],b['x']+b['width'])>max(a['x'],b['x']) and min(a['y']+a['height'],b['y']+b['height'])>max(a['y'],b['y'])),(size,name,a,b)
        page.set_viewport_size({'width':320,'height':568});page.evaluate('crewTest.bossUI()')
        a=page.locator('#recruitBtn').bounding_box();b=page.locator('#bossBar').bounding_box()
        assert a['y']+a['height']<=b['y'] or b['y']+b['height']<=a['y'],(a,b)
        dead=page.evaluate('crewTest.deathPose()');assert dead['shown'] and not dead['sword'] and dead['count']==1,dead
        assert not dead.get('clip') or 'Death' in dead['clip'],dead
        assert page.evaluate('crewTest.clearCorpse()')
        assert not errors,errors
        print('Actual melee sword visibility/animation and mobile render PASS; screenshots:',output,flush=True)
        browser.close()

if __name__=='__main__':main()
