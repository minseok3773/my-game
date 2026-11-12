"""Check automatic training-pad entry and customers buying outside the raft.

Run the local asset server on port 8000. Hooks are private test responses only;
real game code and player saves are never instrumented or replaced on disk.
"""
import argparse
import math
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
URL = 'http://127.0.0.1:8000/raft-village-3d.html'
HOOK = r'''
window.padCustomerTest = {
 reset() {
  build(freshState());
  for(const id of ['expand1','expand2','expand3','tent1','grill','diner','water','waterShop','garden','veggieShop','heroForge','crewDojo']) {
   if(!unlocked.has(id)){unlocked.add(id);applyUnlock(id);}
  }
  G.money=5000;G.level=20;G.raidT=10000;G.cards={};G.stats={};G.qi=0;G.qBase={};
  workers.length=0;soldiers.length=0;enemies.length=0;shots.length=0;fallenCrew.length=0;
  raidOn=false;looted=false;paused=false;player.x=5;player.y=4;player.vx=player.vy=0;
  G.hero.downT=0;G.hero.hp=heroMaxHp();restoreHeroRuntime();resetTrainingInteraction();
  keys.clear();joy.on=false;joy.dx=joy.dy=0;joy.id=null;
  for(const id of ['helpPanel','cardPanel','strategyPanel','trainingPanel'])$(id).hidden=true;
  floaters.length=0;fx.length=0;confetti.length=0;raidIntro=null;
  Math.random=()=>.5;
 },
 facility(kind){return Object.values(TRAINING_FACILITIES).find(f=>f.kind===kind);},
 place(kind,dx=0,dy=0){const f=this.facility(kind);player.x=f.pad.x+dx;player.y=f.pad.y+dy;player.vx=player.vy=0;},
 state(){return {panel:!trainingPanel.hidden,paused,money:G.money,levels:{...G.training},kind:trainingPanel.dataset.kind,
  x:player.x,y:player.y,joy:joy.on,keys:keys.size,vx:player.vx||0,vy:player.vy||0};},
 enter(kind,dx=0,dy=0){this.reset();this.place(kind,dx,dy);update(.05);hud(objective());return this.state();},
 closeHold(){closeTraining();for(let i=0;i<10;i++)update(.05);hud(objective());return this.state();},
 reenter(kind){player.x=5;player.y=4;update(.05);this.place(kind);update(.05);return this.state();},
 blocked(kind,reason){
  this.reset();this.place(kind);
  if(reason==='unbuilt')unlocked.delete(this.facility(kind).id);
  if(reason==='down'){player.hp=0;player.dead=true;G.hero.downT=8;}
  if(reason==='paused'){paused=true;$('helpPanel').hidden=false;tickTrainingInteraction();}
  else update(.05);
  const before=this.state();
  if(reason==='paused'){paused=false;$('helpPanel').hidden=true;update(.05);}
  return {before,after:this.state()};
 },
 manual(){this.reset();this.place('crew',1.05,0);update(.05);hud(objective());return this.state();},
 startTouch(kind){this.reset();this.place(kind,-1.25,0);this.draw();return this.state();},
 step(){if(!paused)update(.05);this.draw();return this.state();},
 outside(c){return !hasTile(Math.floor(c.x),Math.floor(c.y));},
 shopIds(){return STATION_IDS.filter(id=>DEFS[id].type==='shop');},
 queueGeometry(){
  this.reset();const results=[];
  for(const id of this.shopIds()){
   const d=DEFS[id];
   results.push({id,points:Array.from({length:12},(_,k)=>slotPos(d,k)).map(c=>({...c,outside:this.outside(c)}))});
  }
  return results;
 },
 migrateQueue(){
  this.reset();const id='waterShop',d=DEFS[id],r=runtime[id];syncCustomerRoutes(id);
  r.queue=Array.from({length:10},(_,k)=>({...slotPos(d,k),want:k+7,got:k%3,wait:k*.3,bob:0,moving:false,alpha:1,ph:.1}));
  r.leaving=[{...slotPos(d,2),want:9,got:9,wait:2,alpha:1,ph:.1,target:slotPos(d,11)}];
  G.st[id].stock=17;G.st[id].cash=23;
  const metadata=()=>({money:G.money,stock:G.st[id].stock,cash:G.st[id].cash,queue:r.queue.map(c=>[c.want,c.got,c.wait]),leaving:r.leaving.map(c=>[c.want,c.got,c.wait])});
  const before=metadata();addRect([25,0,30,8]);
  const newlyInside=r.queue.some(c=>!this.outside(c));syncCustomerRoutes(id);syncCustomerDocks();
  return {before,after:metadata(),newlyInside,allOutside:[...r.queue,...r.leaving].every(c=>this.outside(c)),
   targetsOutside:r.leaving.every(c=>this.outside(c.target))};
 },
 earlyPurchaseGuard(id){
  this.reset();const d=DEFS[id],s=G.st[id],r=runtime[id];syncCustomerRoutes(id);
  r.spawn=10000;s.stock=5;s.cash=0;r.serveT=0;
  const c={...slotPos(d,11),want:100,got:0,wait:0,bob:0,moving:false,alpha:1,ph:.1};r.queue=[c];
  updateShop(id,.0001);const far={stock:s.stock,cash:s.cash,got:c.got};
  Object.assign(c,slotPos(d,0),{vx:0,vy:0,moving:false});updateShop(id,.0001);
  return {far,arrived:{stock:s.stock,cash:s.cash,got:c.got}};
 },
 shopLifecycle(id){
  this.reset();const d=DEFS[id],s=G.st[id],r=runtime[id];s.stock=20;r.spawn=0;
  let outside=true,sawArrival=false,sawLeaving=false;
  for(let i=0;i<700;i++){
   G.t+=.05;updateShop(id,.05);
   outside &&= [...r.queue,...r.leaving].every(c=>this.outside(c));
   sawArrival ||=r.queue.length>0;sawLeaving ||=r.leaving.length>0;
  }
  const cash=s.cash,sold=G.stats['sold_'+d.item]||0;
  s.stock=0;G.stats.sold_fish=0;player.x=d.cx;player.y=d.cy;player.vx=player.vy=0;
  const before=G.money;update(.05);
  return {outside,sawArrival,sawLeaving,cash,sold,collected:s.cash===0,walletDelta:G.money-before};
 },
 customerScene(){
  this.reset();
  for(const id of this.shopIds()){
   const d=DEFS[id],r=runtime[id];syncCustomerRoutes(id);r.spawn=10000;
   r.queue=Array.from({length:10},(_,k)=>({...slotPos(d,k),want:8,got:0,wait:0,bob:0,moving:false,alpha:1,ph:k*.1}));
  }
  G.raidT=60;player.x=21.65;player.y=4.75;player.vx=player.vy=0;this.draw();
  const fields=Object.values(TRAINING_FACILITIES);
  return {outside:this.shopIds().every(id=>runtime[id].queue.every(c=>this.outside(c))),
   clear:this.shopIds().every(id=>runtime[id].queue.every(c=>fields.every(f=>Math.abs(c.x-f.pad.x)>1.2||Math.abs(c.y-f.pad.y)>1.2))),
   docks:this.shopIds().every(id=>!!docks[id])};
 },
 draw(){resize();resizeFx();cameraFocus.set(player.x-.45,.3,player.y-.45);sync3D(.016);render(.016);hud(objective());},
 resume(){paused=false;for(const id of ['helpPanel','cardPanel','trainingPanel'])$(id).hidden=true;},
 save(){save();},get ready(){return GL.ready;}
};
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    shots = args.screenshots or Path(tempfile.mkdtemp(prefix='my-game-pad-customers-'))
    shots.mkdir(parents=True, exist_ok=True)
    source = (ROOT/'raft-village-3d.html').read_text()
    cache, errors = {}, []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width':390,'height':844}, is_mobile=True,has_touch=True,device_scale_factor=2)
        page.add_init_script('requestAnimationFrame = () => 0')
        page.on('pageerror',lambda error:errors.append(error.stack))
        def external(route):
            url=route.request.url
            if not url.startswith('https://cdn.jsdelivr.net/'):
                route.abort();return
            if url not in cache:cache[url]=subprocess.check_output(['curl','-fsS','--max-time','20',url])
            route.fulfill(body=cache[url],content_type='application/javascript')
        page.route('https://**',external)
        page.route('**/raft-village-3d.html',lambda route:route.fulfill(body=source.replace('})();\n</script>',HOOK+'})();\n</script>'),content_type='text/html'))
        page.goto(URL,wait_until='networkidle')
        page.wait_for_function('!!window.padCustomerTest && padCustomerTest.ready',polling=100,timeout=30000)
        for kind in ('hero','crew'):
            for dx,dy in ((0,0),(.6,.6),(-.6,-.6)):
                state=page.evaluate('([kind,dx,dy])=>padCustomerTest.enter(kind,dx,dy)',[kind,dx,dy])
                assert state['panel'] and state['paused'] and state['kind']==kind and state['money']==5000 and state['levels']=={'hero':0,'crew':0},state
                assert not page.evaluate('padCustomerTest.closeHold().panel')
                assert page.evaluate('kind=>padCustomerTest.reenter(kind).panel',kind)
            for reason in ('unbuilt','down','paused'):
                state=page.evaluate('([kind,reason])=>padCustomerTest.blocked(kind,reason)',[kind,reason])
                assert not state['before']['panel'],state
                if reason=='paused':assert state['after']['panel'],state
        page.evaluate('padCustomerTest.manual()')
        assert page.locator('#trainingBtn').is_visible() and page.locator('#trainingPanel').is_hidden()
        page.locator('#trainingBtn').tap()
        assert page.locator('#trainingPanel').is_visible()
        print('Actual update auto-opens center/corner pads once per entry, guards and manual fallback PASS',flush=True)
        geometry=page.evaluate('padCustomerTest.queueGeometry()')
        assert len(geometry)==4 and all(p['outside'] for shop in geometry for p in shop['points']),geometry
        migrated=page.evaluate('padCustomerTest.migrateQueue()')
        assert migrated['newlyInside'] and migrated['allOutside'] and migrated['targetsOutside'] and migrated['before']==migrated['after'],migrated
        for id in page.evaluate('padCustomerTest.shopIds()'):
            guard=page.evaluate('id=>padCustomerTest.earlyPurchaseGuard(id)',id)
            assert guard['far']=={'stock':5,'cash':0,'got':0},(id,guard)
            assert guard['arrived']['stock']==4 and guard['arrived']['got']==1 and guard['arrived']['cash']>0,(id,guard)
            sale=page.evaluate('id=>padCustomerTest.shopLifecycle(id)',id)
            assert sale['outside'] and sale['sawArrival'] and sale['sawLeaving'] and sale['sold']>0 and sale['cash']>0 and sale['collected'],(id,sale)
            assert math.isclose(sale['walletDelta'],sale['cash'],abs_tol=1e-7),(id,sale)
        scene=page.evaluate('padCustomerTest.customerScene()')
        assert all(scene.values()),scene
        page.screenshot(path=str(shots/'outside-customers-390.png'))
        print('All four shops spawn/queue/buy/leave outside; expansion migration and paid sales/collection PASS',flush=True)
        for width,height,kind in ((390,844,'hero'),(320,568,'crew'),(844,390,'hero')):
            if page.viewport_size!={'width':width,'height':height}:
                page.evaluate("() => {window.resizeDone=new Promise(resolve=>addEventListener('resize',resolve,{once:true}));}")
                page.set_viewport_size({'width':width,'height':height});page.evaluate('resizeDone')
            page.evaluate('kind=>padCustomerTest.startTouch(kind)',kind)
            cdp=page.context.new_cdp_session(page)
            x,y=width*.4,height*.5
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
            cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+45,'y':y+45}]})
            for _ in range(30):
                state=page.evaluate('padCustomerTest.step()')
                if state['panel']:break
            assert state['panel'] and state['kind']==kind and state['money']==5000,state
            assert not state['joy'] and not state['keys'] and abs(state['vx'])<1e-8 and abs(state['vy'])<1e-8,state
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});cdp.detach()
            page.locator('#trainingUpgrade').tap()
            bought=page.evaluate('padCustomerTest.state()')
            assert bought['levels'][kind]==1 and bought['money']==5000-(60 if kind=='hero' else 50),bought
            page.evaluate('padCustomerTest.draw()')
            page.screenshot(path=str(shots/f'auto-training-{width}.png'))
            page.locator('#trainingPanel .close').tap()
            held=page.evaluate('padCustomerTest.closeHold()')
            assert not held['panel'] and math.hypot(held['x']-bought['x'],held['y']-bought['y'])<1e-7,held
            page.evaluate('padCustomerTest.save()');page.reload(wait_until='networkidle')
            page.wait_for_function('!!window.padCustomerTest && padCustomerTest.ready',polling=100,timeout=30000)
            page.evaluate('padCustomerTest.resume()')
            saved=page.evaluate('padCustomerTest.state()')
            assert saved['levels'][kind]==1 and saved['money']==bought['money'],saved
            print(f'Touch-drag pad entry, stopped input, one paid upgrade and reload PASS {width}x{height}',flush=True)
        assert not errors,errors
        browser.close()
    print('Screenshots:',shots)

if __name__=='__main__':main()
