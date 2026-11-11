"""Playable expedition lifecycle and save/accounting regression in a private browser.

Runs its own HTTP server; all storage belongs to isolated browser contexts.
"""
import functools
import http.server
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HOOK = r"""
window.expeditionTest = {
 get G(){return G},get workers(){return workers},get run(){return expeditionState().run},
 get state(){return expeditionState()},get paused(){return paused},
 stateOfVillage(){return JSON.stringify({t:G.t,raidT:G.raidT,money:G.money,st:G.st,
    workers:workers.map(w=>({x:w.x,y:w.y,hp:w.hp,carry:w.carry})),recruitment:G.recruitment});},
 reset(ready=true){
  resetStorageState(); const d=freshState();d.money=1000;d.level=3;d.ws=1;
  d.unlocked.push('tent1','tent2','tent3');
  if(ready){d.unlocked.push('expand1','water');d.defended=5;d.expeditionWon=true;}
  build(d);paused=false;raidOn=false;document.getElementById('helpPanel').hidden=true;
  return workers.length;
 },
 open:expeditionOpen,depart:expeditionDepart,finish:expeditionFinish,back:expeditionReturn,
 step(dt=.05){update(dt)},tick(n){for(let i=0;i<n;i++)update(.05)},
 save,serialize,build,load,expeditionState, product:expeditionVillageTick, specialSale:expeditionCustomerSale,
 workerAvailable:expeditionWorkerAvailable,
 close:expeditionClose,
 get storage(){return {...storageState}}, key:KEY,
 setRaid(v){raidOn=v},get heroAttack(){return heroAttack()},get workerSpeed(){return workerSpeed()},
 closeHelp(){document.getElementById('helpPanel').hidden=true;paused=false;},
};
"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        source = (ROOT / 'raft-village-3d.html').read_text().replace(
            '})();\n</script>', HOOK + '})();\n</script>')
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=[
                '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            errors = []
            context = browser.new_context(viewport={'width':390,'height':844},
                is_mobile=True, has_touch=True, device_scale_factor=2)
            context.add_init_script('requestAnimationFrame=()=>0')
            context.route('https://**', lambda route: route.abort())
            context.route('**/raft-village-3d.html', lambda route: route.fulfill(
                body=source, content_type='text/html'))
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            url = f'http://127.0.0.1:{server.server_port}/raft-village-3d.html'
            page.goto(url, wait_until='networkidle')
            page.wait_for_function('!!window.expeditionTest')

            def assert_panel_layout(stage):
                for width,height in [(320,740),(390,844),(844,390)]:
                    page.set_viewport_size({'width':width,'height':height})
                    metrics = page.evaluate('''() => {
                      const p=document.getElementById('expeditionPanel'),c=document.getElementById('expeditionContent');
                      const bounds=[...p.querySelectorAll('button,select,canvas')].map(el=>{
                        const r=el.getBoundingClientRect();return {id:el.id,left:r.left,right:r.right,width:r.width,height:r.height};
                      });
                      return {innerWidth,doc:document.documentElement.scrollWidth,
                        content:c.scrollWidth,client:c.clientWidth,bounds};
                    }''')
                    assert metrics['doc'] <= width and metrics['content'] <= metrics['client']+1, (stage,width,metrics)
                    for bound in metrics['bounds']:
                        assert bound['left'] >= 0 and bound['right'] <= width+1, (stage,width,bound)
                        assert bound['height'] >= 43, (stage,width,bound)
                page.set_viewport_size({'width':390,'height':844})

            # Legacy save migration preserves the existing village, not a fresh game.
            result = page.evaluate("""() => {
              const t=expeditionTest;t.reset(false);t.G.money=456;t.G.st.fishing.pile=11;
              const before=t.serialize();delete before.expedition;t.build(before);
              return {money:t.G.money,pile:t.G.st.fishing.pile,crew:t.workers.length,
                level:t.G.level,version:t.state.version,phase:t.state.phase};
            }""")
            assert result == {'money':456,'pile':11,'crew':6,'level':3,'version':1,'phase':'idle'}, result
            page.evaluate('expeditionTest.open()')
            assert page.locator('#expeditionPanel').is_visible()
            assert page.locator('#expeditionDepart').is_disabled()
            assert '5' in page.locator('#expeditionPanel').inner_text()
            print('PASS legacy migration preserves resources, facilities, crew and growth; locked goal is visible', flush=True)

            # Departure guards cannot charge money or detach crew.
            result = page.evaluate('''() => {
              const t=expeditionTest;t.reset();t.open();t.setRaid(true);
              const before=t.serialize(),blocked=t.depart();t.setRaid(false);t.G.money=0;
              const poor=t.depart();return {blocked,poor,money:t.G.money,crew:t.workers.length,
                phase:t.state.phase};
            }''')
            assert result == {'blocked':False,'poor':False,'money':0,'crew':6,'phase':'idle'}, result
            print('PASS combat and insufficient-money guards preserve crew and expedition state', flush=True)

            # UI choices must persist before departure and account for village crew.
            page.evaluate('expeditionTest.reset();expeditionTest.open()')
            page.locator('#expeditionFood').select_option('2')
            page.locator('#expeditionWater').select_option('3')
            page.locator('#expeditionCrew').select_option('2')
            assert_panel_layout('preparation')
            page.reload(wait_until='networkidle')
            page.wait_for_function('!!window.expeditionTest')
            page.evaluate('expeditionTest.closeHelp();expeditionTest.open()')
            assert page.locator('#expeditionFood').input_value() == '2'
            assert page.locator('#expeditionWater').input_value() == '3'
            assert page.locator('#expeditionCrew').input_value() == '2'
            before = page.evaluate('({money:expeditionTest.G.money,crew:expeditionTest.workers.length})')
            page.locator('#expeditionDepart').click()
            assert page.evaluate('expeditionTest.state.phase') == 'exploring'
            after = page.evaluate('({money:expeditionTest.G.money,crew:expeditionTest.workers.length,party:expeditionTest.run.party.length})')
            assert after == {'money':before['money']-105,'crew':before['crew']-2,'party':2}, after
            assert not page.evaluate('expeditionTest.depart()'), 'repeat departure must be rejected'
            frozen = page.evaluate('expeditionTest.stateOfVillage()')
            page.evaluate('expeditionTest.tick(30)')
            assert page.evaluate('expeditionTest.stateOfVillage()') == frozen
            page.reload(wait_until='networkidle')
            page.wait_for_function('!!window.expeditionTest')
            page.evaluate('expeditionTest.closeHelp()')
            assert page.evaluate('expeditionTest.state.phase') == 'exploring'
            assert page.evaluate('expeditionTest.workers.length') == after['crew']
            assert page.evaluate('expeditionTest.run.party.length') == 2
            assert page.evaluate('expeditionTest.G.money') == after['money']
            print('PASS preparation, one-time cost, actual crew removal and village freeze survive reload', flush=True)

            # Keyboard and touchscreen pointer inputs both move the exploration avatar.
            start = page.evaluate('({x:expeditionTest.run.x,y:expeditionTest.run.y})')
            page.keyboard.down('d')
            page.evaluate('expeditionTest.tick(10)')
            page.keyboard.up('d')
            moved = page.evaluate('({x:expeditionTest.run.x,y:expeditionTest.run.y})')
            assert moved['x'] > start['x']+1, (start,moved)
            canvas = page.locator('#expeditionCanvas')
            assert canvas.is_visible()
            box = canvas.bounding_box()
            assert box and box['x'] >= 0 and box['x']+box['width'] <= 391, box
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            before_touch = page.evaluate('({x:expeditionTest.run.x,y:expeditionTest.run.y})')
            cdp = context.new_cdp_session(page)
            touch = {'x':box['x']+box['width']*.45,'y':box['y']+box['height']*.65}
            cdp.send('Input.dispatchTouchEvent', {'type':'touchStart','touchPoints':[touch]})
            touch['x'] += min(65,box['width']*.2)
            cdp.send('Input.dispatchTouchEvent', {'type':'touchMove','touchPoints':[touch]})
            page.evaluate('expeditionTest.tick(10)')
            cdp.send('Input.dispatchTouchEvent', {'type':'touchEnd','touchPoints':[]})
            after_touch = page.evaluate('({x:expeditionTest.run.x,y:expeditionTest.run.y})')
            assert abs(after_touch['x']-before_touch['x'])+abs(after_touch['y']-before_touch['y'])>1, (before_touch,after_touch)
            assert_panel_layout('exploration')
            page.screenshot(path='/tmp/my-game-expedition-mobile.png', full_page=True)
            print('PASS actual keyboard and touchscreen drag movement; mobile canvas fits', flush=True)

            # Staying in a warned circle causes one hit; leaving it before impact avoids damage.
            result = page.evaluate('''() => {
              const t=expeditionTest,r=t.run;r.nextHazard=999;
              r.hazards=[{x:r.x,y:r.y,radius:48,t:.2,hit:false}];const hp=r.hp;
              t.tick(6);const hit=r.hp;t.tick(5);const once=r.hp;
              r.hazards=[{x:r.x-150,y:r.y,radius:48,t:.2,hit:false}];t.tick(6);
              return {hp,hit,once,dodged:r.hp};
            }''')
            assert result['hit'] == result['hp']-12 and result['once'] == result['hit'] == result['dodged'], result
            print('PASS telegraphed attack hits once and safe ground avoids damage', flush=True)

            def walk_to(x, y):
                # Send real keyboard events, stepping the actual game update between events.
                for axis,target,positive,negative in [('x',x,'d','a'),('y',y,'s','w')]:
                    current = page.evaluate(f'expeditionTest.run.{axis}')
                    delta = target-current
                    if abs(delta) < 4:
                        continue
                    key = positive if delta>0 else negative
                    page.keyboard.down(key)
                    page.evaluate('(n)=>expeditionTest.tick(n)', round(abs(delta)/6.75))
                    page.keyboard.up(key)

            # Traverse the whole island through the same input path used by players.
            for target in [(110,300),(125,130),(385,110),(285,240),(405,365),(50,450)]:
                walk_to(*target)
            assert page.evaluate('expeditionTest.state.phase') == 'result'
            assert page.evaluate('expeditionTest.state.result.outcome') == 'success'
            assert page.evaluate('expeditionTest.run.rescued.length') == 2
            assert page.evaluate('expeditionTest.run.collected.length') == 3
            assert_panel_layout('result')
            page.screenshot(path='/tmp/my-game-expedition-return.png',full_page=True)
            page.reload(wait_until='networkidle')
            page.wait_for_function('!!window.expeditionTest')
            assert page.evaluate('expeditionTest.state.phase') == 'result'
            assert page.evaluate('expeditionTest.workers.length') == after['crew']
            assert not page.evaluate('expeditionTest.state.rewards.kelp')
            # A failed return write rolls back both crew and rewards before a retry.
            result = page.evaluate('''() => {
              const t=expeditionTest,prior=localStorage.getItem(t.key),money=t.G.money;
              const original=Storage.prototype.setItem;
              Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')};
              let ok;try{ok=t.back()}finally{Storage.prototype.setItem=original}
              return {ok,money:t.G.money===money,crew:t.workers.length,phase:t.state.phase,
                reward:t.state.rewards.kelp,unchanged:prior===localStorage.getItem(t.key),failed:t.storage.failed};
            }''')
            assert result == {'ok':False,'money':True,'crew':after['crew'],'phase':'result','reward':False,'unchanged':True,'failed':True}, result
            page.locator('#expeditionReturn').click()
            assert not page.evaluate('expeditionTest.back()')
            assert page.evaluate('expeditionTest.workers.length') == before['crew']
            assert page.evaluate('expeditionTest.G.money') == after['money']+120
            assert page.evaluate('expeditionTest.state.completed') == 1
            assert page.evaluate('expeditionTest.state.rewards.kelp')
            page.reload(wait_until='networkidle')
            page.wait_for_function('!!window.expeditionTest')
            assert page.evaluate('expeditionTest.state.phase') == 'idle'
            assert page.evaluate('expeditionTest.workers.length') == before['crew']
            assert page.evaluate('expeditionTest.G.money') == after['money']+120
            print('PASS full playable rescue/recovery/boat success, result reload, atomic return retry and one-time reward',flush=True)

            # The first reward changes actual inventory and checkout revenue.
            result = page.evaluate('''() => {
              const t=expeditionTest;t.G.st.fishing.pile=5;t.G.st.water.pile=5;
              t.state.production=0;t.state.specialty=0;t.product(12);
              const made=t.state.specialty,s={cash:0},c={};t.specialSale({id:'fishShop'},s,c);
              return {made,left:t.state.specialty,fish:t.G.st.fishing.pile,water:t.G.st.water.pile,
                cash:s.cash,ration:c.expeditionRation};
            }''')
            assert result == {'made':1,'left':0,'fish':4,'water':4,'cash':18,'ration':True}, result
            print('PASS unlocked food consumes fish/water and earns money only at customer checkout',flush=True)

            # Departure write failure must leave the pre-departure party and money intact.
            result = page.evaluate('''() => {
              const t=expeditionTest;t.closeHelp();t.open();const money=t.G.money,count=t.workers.length;
              const original=Storage.prototype.setItem;
              Storage.prototype.setItem=function(){throw new DOMException('blocked','SecurityError')};
              let ok;try{ok=t.depart()}finally{Storage.prototype.setItem=original}
              return {ok,money:t.G.money===money,count:t.workers.length===count,phase:t.state.phase};
            }''')
            assert result == {'ok':False,'money':True,'count':True,'phase':'idle'}, result
            print('PASS departure save failure rolls back crew and cost',flush=True)

            # Later successful journeys change the crew and captain, and retain party cargo.
            page.evaluate('expeditionTest.open()')
            page.locator('#expeditionCrew').select_option('1')
            result = page.evaluate('''() => {
              const t=expeditionTest,w=t.workers[t.workers.length-1];
              w.carry=['fish','water'];w.assignment='fishShop';
              const attack=t.heroAttack;
              if(!t.depart())throw Error('second departure rejected');
              const r=t.run;r.rescued=[0,1];r.collected=[0,1,2];r.x=50;r.y=450;
              if(!t.finish('success')||!t.back())throw Error('second return rejected');
              const returned=t.workers[t.workers.length-1],cargo=[...returned.carry],assignment=returned.assignment;
              t.workers[0].hp=1;t.product(1);const healed=t.workers[0].hp;
              const medic=t.state.rewards.medic;
              if(!t.depart())throw Error('third departure rejected');
              Object.assign(t.run,{rescued:[0,1],collected:[0,1,2],x:50,y:450});
              if(!t.finish('success')||!t.back())throw Error('third return rejected');
              const once=t.heroAttack;t.back();
              return {medic,healed,cargo,assignment,compass:t.state.rewards.compass,attack,
                boosted:once,afterRepeat:t.heroAttack,completed:t.state.completed,crew:t.workers.length};
            }''')
            assert result['medic'] and result['healed'] == 2, result
            assert result['cargo'] == ['fish','water'] and result['assignment'] == 'fishShop', result
            assert result['compass'] and result['boosted'] == result['attack']*1.2 == result['afterRepeat'], result
            assert result['completed'] == 3 and result['crew'] == 6, result
            assert not page.evaluate('expeditionTest.workerAvailable(expeditionTest.workers[0])')
            page.locator('#expeditionMedic').click()
            result = page.evaluate('''() => {
              const t=expeditionTest;t.workers[0].hp=1;t.product(1);
              return {hp:t.workers[0].hp,available:t.workerAvailable(t.workers[0]),enabled:t.state.medicEnabled};
            }''')
            assert result == {'hp':1,'available':True,'enabled':False}, result
            page.locator('#expeditionMedic').click()
            assert not page.evaluate('expeditionTest.workerAvailable(expeditionTest.workers[0])')
            page.reload(wait_until='networkidle')
            page.wait_for_function('!!window.expeditionTest')
            assert page.evaluate('expeditionTest.state.medicEnabled') is True
            assert page.evaluate('expeditionTest.state.rewards.compass')
            print('PASS dedicated medic toggle, healing, captain ability, cargo/assignment preservation and repeat-return protection',flush=True)

            # Retreat and time/health failure return everyone without granting success loot.
            for outcome in ['retreat','failure']:
                page.evaluate('expeditionTest.reset();expeditionTest.open()')
                page.locator('#expeditionCrew').select_option('3')
                page.locator('#expeditionDepart').click()
                if outcome == 'retreat':
                    page.locator('#expeditionRetreat').click()
                else:
                    page.evaluate('expeditionTest.run.time=.01;expeditionTest.step(.05)')
                assert page.evaluate('expeditionTest.state.result.outcome') == outcome
                page.reload(wait_until='networkidle')
                page.wait_for_function('!!window.expeditionTest')
                page.locator('#expeditionReturn').click()
                assert page.evaluate('expeditionTest.workers.length') == 6
                assert page.evaluate('expeditionTest.G.money') == 935
                assert page.evaluate('expeditionTest.state.completed') == 0
                assert not page.evaluate('expeditionTest.state.rewards.kelp')
                page.evaluate('expeditionTest.close();expeditionTest.closeHelp()')
                clock = page.evaluate('expeditionTest.G.t')
                page.evaluate('expeditionTest.step(.1)')
                assert page.evaluate('expeditionTest.G.t') > clock
            print('PASS retreat and timeout failure preserve the village and crew; normal play resumes',flush=True)
            assert not errors, errors
            context.close()
            # Exercise the actual requestAnimationFrame loop as well as deterministic ticks.
            live = browser.new_context(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True)
            live.route('https://**', lambda route: route.abort())
            live.route('**/raft-village-3d.html', lambda route: route.fulfill(body=source, content_type='text/html'))
            live_page = live.new_page()
            live_page.on('pageerror', lambda error: errors.append(str(error)))
            live_page.goto(url, wait_until='networkidle')
            live_page.wait_for_function('!!window.expeditionTest')
            live_page.evaluate('expeditionTest.reset();expeditionTest.open()')
            live_page.locator('#expeditionDepart').click()
            clock = live_page.evaluate('expeditionTest.G.t')
            live_page.keyboard.down('d')
            live_page.wait_for_function('expeditionTest.run.x>80', timeout=15000)
            live_page.keyboard.up('d')
            assert live_page.evaluate('expeditionTest.G.t') == clock
            assert live_page.evaluate('expeditionTest.run.time') < 90
            live_page.locator('#expeditionRetreat').click()
            live_page.locator('#expeditionReturn').click()
            assert live_page.evaluate('expeditionTest.workers.length') == 6
            assert not errors, errors
            print('PASS actual animation-loop mobile movement, expedition clock and frozen village; return UI', flush=True)
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__ == '__main__':
    main()
