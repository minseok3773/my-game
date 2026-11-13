"""Staged expedition rewards, upgrade migration and distinct telegraphed hazards.

Uses isolated browser storage and a private server; production save files are untouched.
"""
import functools
import http.server
import subprocess
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
HOOK=r'''
window.stageTest={
 get G(){return G},get e(){return expeditionState()},get r(){return expeditionState().run},get workers(){return workers},get soldiers(){return soldiers},get player(){return player},
 reset(n=1,tier=null,pearls=0){
  resetStorageState();const d=freshState();d.money=3000;d.ws=1;d.level=3;d.defended=5;d.expeditionWon=true;
  d.unlocked.push('expand1','water','tent1','tent2','tent3');build(d);paused=false;raidOn=false;document.getElementById('helpPanel').hidden=true;
  const e=expeditionState();for(let i=0;i<(tier===null?n-1:5);i++)e.rewards[ISLANDS[i].reward]=true;
  e.island=n;e.challengeMode=tier!==null;e.tier=tier||0;e.pearls=pearls;expeditionOpen();
 },
 open:expeditionOpen,close:expeditionClose,depart:expeditionDepart,finish:expeditionFinish,back:expeditionReturn,save,serialize,build,
 island:runIsland,rewardIsland:expeditionRewardIsland,guide:expeditionRewardGuide,
 hazard:makeExpeditionHazard,hits:expeditionHazardHits,drawHazard:drawExpeditionHazard,step:expeditionUpdate,
 complete(){const r=expeditionState().run,isl=runIsland(r);r.rescued=isl.survivors.map((_,i)=>i);r.collected=isl.crates.map((_,i)=>i);r.x=50;r.y=450;return expeditionFinish('success');},
 hpMax:crewHpMax,heroMax:heroMaxHp,
 oldReset(){resetStorageState();const d=freshState();d.money=3000;d.ws=1;d.level=3;d.defended=5;d.unlocked.push('expand1','water','tent1','tent2','tent3');build(d);paused=false;raidOn=false;document.getElementById('helpPanel').hidden=true;}
};
'''
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*_):pass

def current_source():
 # Parent assembles the final HTML after independent module work. Exercise this module
 # immediately as well, keeping the rest of the checked-in runtime unchanged.
 src=(ROOT/'raft-village-3d.html').read_text()
 start=src.index('/* 원정은 마을 시계를 멈추는')
 end=src.index('/* 선술집:',start)
 src=src[:start]+(ROOT/'src/3d/w3d_expedition.js').read_text()+'\n'+src[end:]
 return src.replace('})();\n</script>',HOOK+'})();\n</script>')

def main():
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
 thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
 try:
  old=subprocess.check_output(['git','show','f15ba84:raft-village-3d.html'],cwd=ROOT,text=True)
  oldhook=r'''window.stageTest={oldReset(){resetStorageState();const d=freshState();d.money=3000;d.ws=1;d.level=3;d.defended=5;d.unlocked.push('expand1','water','tent1','tent2','tent3');build(d);paused=false;raidOn=false;document.getElementById('helpPanel').hidden=true;},get G(){return G},get e(){return expeditionState()},get r(){return expeditionState().run},get workers(){return workers},open:expeditionOpen,depart:expeditionDepart,finish:expeditionFinish,save};'''
  versions=[current_source(),old.replace('})();\n</script>',oldhook+'})();\n</script>')];active=[0]
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
   ctx=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
   ctx.add_init_script('requestAnimationFrame=()=>0');ctx.route('https://**',lambda r:r.abort())
   ctx.route('**/raft-village-3d.html',lambda r:r.fulfill(body=versions[active[0]],content_type='text/html'))
   page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   url=f'http://127.0.0.1:{server.server_port}/raft-village-3d.html'
   page.goto(url,wait_until='networkidle');page.wait_for_function('!!window.stageTest')
   keys=['kelp','medic','compass','shell','anchor'];money=[120,120,120,240,360]
   for n in range(1,6):
    page.evaluate('(n)=>stageTest.reset(n)',n)
    page.locator('#expeditionWater').select_option('1');page.locator('#expeditionCrew').select_option('2')
    summary=page.locator('#expeditionCost').inner_text()
    before=page.evaluate('stageTest.G.money');page.locator('#expeditionDepart').click()
    seconds=page.evaluate('stageTest.r.time');assert f'활동 시간 {seconds}초' in summary,(n,summary,seconds)
    phase=page.evaluate('stageTest.r')
    assert phase['hazardVersion']==2 and len(phase['party'])==2
    assert page.evaluate('stageTest.complete()')
    text=page.locator('#expeditionContent').inner_text();count=2 if n<=3 else 3
    assert f'생존자 {count}명' in text and f'자원 {3 if n<=3 else 4}개' in text
    assert ['해초 보존식','의무','나침반','거북','황금'][n-1] in text
    page.reload(wait_until='networkidle');page.wait_for_function('!!window.stageTest')
    page.locator('#expeditionReturn').click()
    assert page.evaluate('(key)=>!!stageTest.e.rewards[key]',keys[n-1])
    assert page.evaluate('stageTest.G.money')==before-55+money[n-1]
    assert page.evaluate('stageTest.workers.length')==6
    assert not page.evaluate('stageTest.back()')
   print('PASS all five staged rewards, actual time summaries, rescue counts, result reload and one-time return',flush=True)

   # Hazard geometry differs: leave the circle, wait in safe ring center,
   # cross a strip perpendicularly and escape a cross in both axes.
   result=page.evaluate('''() => {
    const t=stageTest;return [1,2,3,4,5].map(n=>{t.reset(n);t.depart();const a=t.hazard(t.r,t.island(t.r)),b=t.hazard(t.r,t.island(t.r));
      return {n,first:a.kind,second:b.kind,delay:a.t,center:t.hits(a,a.x,a.y),away:t.hits(a,a.x+100,a.y+100)};});
   }''')
   assert [x['first'] for x in result]==['circle','ring','lane','circle','cross'],result
   assert result[3]['second']=='ring'
   assert all(x['delay']==1.3 and not x['away'] for x in result)
   assert [x['center'] for x in result]==[True,False,True,True,True]
   assert page.evaluate('stageTest.hits({kind:"lane",axis:"x",x:200,y:200,width:30},200,450)')
   assert not page.evaluate('stageTest.hits({kind:"lane",axis:"x",x:200,y:200,width:30},250,200)')
   assert page.evaluate('stageTest.hits({kind:"cross",x:200,y:200,width:25},450,200)')
   assert not page.evaluate('stageTest.hits({kind:"cross",x:200,y:200,width:25},250,250)')
   assert page.evaluate('stageTest.hits({kind:"ring",x:200,y:200,radius:60,innerRadius:25},240,200)')

   pixels=page.evaluate('''() => {
    const c=document.createElement('canvas');c.width=c.height=500;const x=c.getContext('2d');
    x.fillStyle='#fff';x.fillRect(0,0,500,500);stageTest.drawHazard(x,{kind:'cross',x:200,y:200,width:25});
    const center=[...x.getImageData(210,210,1,1).data],arm=[...x.getImageData(210,280,1,1).data];
    return {center,arm};
   }''')
   assert pixels['center'][1]<240 and pixels['arm'][1]<240,pixels

   print('PASS circles, safe-center rings, perpendicular lanes, alternating eruptions and diagonal cross escape',flush=True)

   page.evaluate('stageTest.reset(3);stageTest.depart();stageTest.r.nextHazard=0;stageTest.step(.05);stageTest.save()')
   saved=page.evaluate('stageTest.r.hazards')
   assert saved[0]['kind']=='lane'
   page.reload(wait_until='networkidle');page.wait_for_function('!!window.stageTest')
   assert page.evaluate('stageTest.r.hazards')==saved
   # A pre-pattern saved hazard remains a circle and the old run keeps its old pattern.
   old=page.evaluate('''() => {const d=stageTest.serialize();delete d.expedition.run.hazardVersion;d.expedition.run.hazards=[{x:50,y:450,radius:40,t:.5,hit:false}];stageTest.build(d);return stageTest.hazard(stageTest.r,stageTest.island(stageTest.r)).kind;}''')
   assert old=='circle'
   print('PASS hazard shape/axis survive reload; existing in-flight circles retain their original rules',flush=True)

   # A real previous-version departure/result uses the original map and the
   # next promised reward, even when the player already learned the recipe.
   for prior_phase in ['exploring','result']:
    active[0]=1;page.reload(wait_until='networkidle');page.wait_for_function('!!window.stageTest')
    before=page.evaluate('''() => {const t=stageTest;t.oldReset();t.e.rewards.kelp=true;t.e.completed=1;t.e.draft={food:2,water:2,crew:2};t.open();t.depart();t.r.x=125;t.r.y=130;t.r.rescued=[0];t.r.collected=[1];t.r.time=71;t.r.elapsed=19;t.r.hazards=[{x:300,y:300,radius:48,t:.8,hit:false}];t.workers[0].carry=['fish'];t.save();return {money:t.G.money,run:JSON.parse(JSON.stringify(t.r))};}''')
    if prior_phase=='result':page.evaluate('stageTest.r.rescued=[0,1];stageTest.r.collected=[0,1,2];stageTest.r.x=50;stageTest.r.y=450;stageTest.finish("success")')
    active[0]=0;page.reload(wait_until='networkidle');page.wait_for_function('!!window.stageTest')
    assert page.evaluate('stageTest.r.island')==1
    assert page.evaluate('stageTest.r.rewardIsland')==2
    if prior_phase=='exploring':
     r=page.evaluate('stageTest.r');assert r['time']==71 and r['elapsed']==19 and r['x']==125 and r['rescued']==[0] and r['collected']==[1] and r['hazards']==before['run']['hazards']
     assert len(r['party'])==2 and page.evaluate('stageTest.complete()')
    assert '선원 의무 담당' in page.locator('#expeditionContent').inner_text()
    page.locator('#expeditionReturn').click()
    assert page.evaluate('stageTest.e.rewards.medic')
    assert page.evaluate('stageTest.workers.length')==6
    assert page.evaluate('stageTest.G.money')==before['money']+120
    assert not page.evaluate('stageTest.back()')
   print('PASS genuine f15ba84 active/result saves preserve map, progress, party and promised medic reward',flush=True)

   # Deep summary and reward choice are both frozen into the run.
   page.evaluate('stageTest.reset(1,5);stageTest.open()')
   summary=page.locator('#expeditionCost').inner_text();page.locator('#expeditionDepart').click()
   assert page.evaluate('stageTest.r.time')==50 and '활동 시간 50초' in summary
   page.evaluate('stageTest.complete()');page.locator('#expeditionReturn').click()
   assert page.evaluate('stageTest.e.pearls')==1 and page.evaluate('stageTest.e.tier')==6
   print('PASS deep time penalty, pearl and next-floor progression',flush=True)

   for choice in ['trade','supplies']:
    page.evaluate('stageTest.reset(1,10,10)')
    page.locator('#expeditionDeepReward').select_option(choice)
    page.evaluate('stageTest.workers[0].hp=1;stageTest.player.hp=1;stageTest.save()')
    before=page.evaluate('stageTest.G.money');page.locator('#expeditionDepart').click()
    assert page.evaluate('stageTest.r.deepReward')==choice
    page.reload(wait_until='networkidle');page.wait_for_function('!!window.stageTest');page.evaluate('stageTest.complete()')
    if choice=='supplies':
     page.evaluate('() => {window.realSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException("full","QuotaExceededError")};}')
     assert not page.evaluate('stageTest.back()')
     assert page.evaluate('stageTest.workers[0].hp')==1 and page.evaluate('stageTest.player.hp')==1
     assert page.evaluate('stageTest.e.specialty')==0 and page.evaluate('stageTest.e.phase')=='result'
     page.evaluate('() => {Storage.prototype.setItem=window.realSet;}')
    page.locator('#expeditionReturn').click()
    assert page.evaluate('stageTest.G.money')==before-35+1300+(200 if choice=='trade' else 0)
    assert page.evaluate('stageTest.e.pearls')==10 and page.evaluate('stageTest.e.tier')==11
    if choice=='supplies':
     assert page.evaluate('stageTest.workers[0].hp===stageTest.hpMax() && stageTest.player.hp===stageTest.heroMax()')
     assert page.evaluate('stageTest.e.specialty')==5
    assert not page.evaluate('stageTest.back()')
   print('PASS pearl-cap trade/support choice, saved selection, health rollback and one-time village support',flush=True)

   assert not errors,errors
   browser.close()
 finally:server.shutdown();server.server_close();thread.join(timeout=5)
if __name__=='__main__':main()
