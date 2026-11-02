"""판매 배정·자동 판매·침공 성장·저장 이전·모바일 실제 브라우저 회귀 검사."""
import json
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HOOK=r'''
window.updateTest={
 reset(wave=0){const d=freshState();d.unlocked.push('expand1','tent1','grill','diner','water','waterShop','garden','veggieShop');d.wave=wave;d.money=10000;build(d);paused=true;},
 state(){return {assignments:{...G.workerAssignments},workers:workers.map(w=>({id:w.assignment,hp:w.hp,carry:w.carry})),hero:{...G.hero},heroHp:heroMaxHp(),heroAttack:heroAttack(),crewHp:crewHpMax(),crewAttack:crewAttack(),level:pirateLevel(),wave:G.wave};},
 set:setWorkerAssignment, save, serialize, build, startRaid, updateShop, balanceAssignments, spawnWorker, killCrew, updateWorker, sync3D, update, render, hud, objective,
 get G(){return G},get workers(){return workers},get runtime(){return runtime},get defs(){return DEFS},get shops(){return assignmentShops()},get enemies(){return enemies},
 price:id=>priceOf(DEFS[id]),bossDue:bossDueNextRaid,spawnBoss,spawnBossBoarder,pirateLevel,pirateAttack,normalPirateHp,normalPirateAttack,
 route:assignmentRoute,pickJob, sourceInfo,destInfo,workerSlot,separateWorkers,
 carry(){G.stack=['fish','tomato'];workers[0].carry=['water','grilled'];sync3D(.016);const pm=charModel(player,()=>mkChar('player',player)),wm=charModel(workers[0],()=>mkChar('worker',workers[0]));return [pm,wm].map(m=>({height:m.carry.position.y,depth:m.carry.position.z,scales:m.carry.children.map(c=>c.scale.x),ys:m.carry.children.map(c=>c.position.y)}));},
 legacy(){this.reset(24);const d=serialize();d.pirateProgressVersion=1;d.hero.level=38;d.hero.hp=100;d.training={hero:23,crew:19};d.cards={crewHp:3,crewPower:4,villageHp:2,playerGun:2};d.crewRoster[0].hp=31;build(d);return this.state();},
 resume(){paused=false;assignmentPanel.hidden=true;},get ready(){return GL.ready},
 move(){player.x=5;player.y=4;return {x:player.x,y:player.y};},pos(){return {x:player.x,y:player.y};},step(){for(let i=0;i<15;i++)update(.05);},
};
'''

def main():
 errors=[];cache={}
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
  page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
  page.add_init_script('requestAnimationFrame=()=>0')
  page.on('pageerror',lambda e:errors.append(e.stack))
  source=(ROOT/'raft-village-3d.html').read_text().replace('})();\n</script>',HOOK+'})();\n</script>')
  def external(r):
   url=r.request.url
   if not url.startswith('https://cdn.jsdelivr.net/'):r.abort();return
   if url not in cache:cache[url]=subprocess.check_output(['curl','-fsS','--max-time','30',url])
   r.fulfill(body=cache[url],content_type='application/javascript')
  page.route('https://**',external)
  page.route('**/raft-village-3d.html',lambda r:r.fulfill(body=source,content_type='text/html'))
  page.goto('http://127.0.0.1:8000/raft-village-3d.html',wait_until='networkidle')
  page.wait_for_function('updateTest.ready',timeout=30000)
  t=lambda js:page.evaluate(js)
  t('updateTest.reset()')
  result=t('''()=>{const t=updateTest;for(const id of t.shops)t.set(id,0);t.set('fishShop',1);t.set('diner',1);const before=t.state();const dead=t.workers.find(w=>w.assignment==='fishShop');t.killCrew(dead);t.balanceAssignments();const vacancy=t.state();t.spawnWorker('tent1',1);t.balanceAssignments();const after=t.state();return {before,vacancy,after,tooMany:t.set('fishShop',3),dinerFeed:t.route(t.workers.find(w=>w.assignment==='diner'),{from:'fishing',to:'grill'}),wrong:t.route(t.workers[0],{from:'water',to:'waterShop'})};}''')
  assert result['vacancy']['assignments']==result['before']['assignments']==result['after']['assignments'],result
  assert sorted(w['id'] for w in result['after']['workers'])==['diner','fishShop'],result
  assert not result['tooMany'] and result['dinerFeed'] and not result['wrong'],result
  t('updateTest.save()'); expected=t('updateTest.state().assignments');page.reload(wait_until='networkidle');assert t('updateTest.state().assignments')==expected
  print('PASS quotas, route restriction, diner supply, death/recruit vacancy, cap, save/reload',flush=True)
  result=t('''()=>{const t=updateTest;t.G.level=20;const results=[];for(const id of t.shops){const s=t.G.st[id];s.stock=4;s.cash=0;s.saleElapsed=0;t.updateShop(id,1.99);const early=s.stock;t.updateShop(id,.01);const first=s.stock;t.updateShop(id,4);results.push({id,early,first,stock:s.stock,cash:s.cash,price:t.price(id),customers:t.runtime[id].queue.length+t.runtime[id].leaving.length});}return results;}''')
  assert all(r['early']==4 and r['first']==3 and r['stock']==1 and r['cash']==r['price']*3 and not r['customers'] for r in result),result
  t("updateTest.G.st.fishShop.saleElapsed=1.25;updateTest.save()")
  page.reload(wait_until='networkidle');assert t('updateTest.G.st.fishShop.saleElapsed')==1.25
  result=t("""()=>{const t=updateTest;t.reset();for(const id of t.shops)t.set(id,0);t.set('fishShop',2);t.G.st.fishing.pile=100;t.G.st.fishShop.stock=0;t.G.st.fishShop.cash=0;for(let i=0;i<1800;i++){for(const w of t.workers)t.updateWorker(w,.05);t.separateWorkers(.05);}const supplied=t.G.st.fishShop.stock;const w=t.workers[0];w.carry=['water'];t.G.st.water.pile=0;w.x=t.sourceInfo('water').x;w.y=t.sourceInfo('water').y;for(let i=0;i<100;i++)t.updateWorker(w,.05);const returned=t.G.st.water.pile;w.carry=[];w.job=null;const d=t.defs.fishShop;w.x=d.cx;w.y=d.cy;t.G.st.fishShop.cash=77;const money=t.G.money;for(let i=0;i<10;i++)t.updateWorker(w,.05);return {supplied,returned,collected:t.G.money-money,cash:t.G.st.fishShop.cash};}""")
  assert result['supplied']>0 and result['returned']==1 and result['collected']==77 and result['cash']==0,result
  print('PASS physical worker delivery, cash collection and incompatible cargo returned after reassignment',flush=True)
  print('PASS every shop sells one per 2 seconds, retained cash, no customers, partial timer reload',flush=True)
  result=t('''()=>{const t=updateTest;t.reset();const out=[];for(let wave=1;wave<=55;wave++){t.startRaid();const boss=t.enemies.find(e=>e.boss&&!e.kind&&e.level===t.pirateLevel());if(boss&&!boss.bossBoarded){t.spawnBossBoarder(boss);}out.push({wave,level:t.pirateLevel(),hero:t.G.hero.level,boss:t.G.lastBossLevel,spawned:!!boss});t.enemies.length=0;}return out;}''')
  assert all(r['level']==min(50,r['wave']) and r['hero']>=r['level'] for r in result),result
  assert [r['wave'] for i,r in enumerate(result) if r['boss'] and (i==0 or r['boss']!=result[i-1]['boss'])]==list(range(5,51,5)),result
  assert [r['wave'] for r in result if r['spawned']]==list(range(5,51,5)),result
  result=t('''()=>{const t=updateTest;t.reset(4);t.startRaid();const ship=t.enemies.find(e=>e.boss);t.spawnBossBoarder(ship);const boss=t.enemies.find(e=>e.champion);return {hp:boss.max,normalHp:t.normalPirateHp(),atk:t.pirateAttack(boss),normalAtk:t.normalPirateAttack()};}''')
  assert result['hp']==5*result['normalHp'] and abs(result['atk']-5*result['normalAtk'])<1e-8,result
  legacy=t('updateTest.legacy()');assert legacy['hero']['level']==38 and legacy['hero']['hp']==100 and legacy['workers'][0]['hp']==31,legacy
  assert legacy['heroAttack']>=4+2*37+4+3*23 and legacy['heroHp']>=40+6*37+10*23,legacy
  assert legacy['crewAttack']>=3*2.6+19 and legacy['crewHp']>=round(15*2.5)+20+95,legacy
  before=t('updateTest.state()');t('updateTest.save()');page.reload(wait_until='networkidle');after=t('updateTest.state()');assert before==after,(before,after)
  print('PASS raids 1–55, level 50 cap, all ten bosses once, exact 5x boss stats, legacy stats retained across reload',flush=True)
  carry=t('updateTest.carry()');assert all(r['height']==1.95 and r['depth']==0 and r['scales']==[3,3] and r['ys'][1]>r['ys'][0] for r in carry),carry
  result=t('''()=>{const t=updateTest;t.reset();for(const id of t.shops)t.set(id,0);t.set('fishShop',2);for(const w of t.workers){w.x=5;w.y=4;}for(let i=0;i<30;i++)t.separateWorkers(.05);return Math.hypot(t.workers[0].x-t.workers[1].x,t.workers[0].y-t.workers[1].y);}''');assert result>.5,result
  print('PASS actual character carry groups above head, 3x meshes and stack spacing; overlapping workers separate',flush=True)
  for width,height in [(390,844),(320,568),(844,390)]:
   page.set_viewport_size({'width':width,'height':height});t('updateTest.reset();updateTest.resume();updateTest.render(.016);updateTest.hud(updateTest.objective())')
   page.locator('#assignmentBtn').tap();assert page.locator('#assignmentPanel').is_visible()
   assert page.locator('#assignmentPanel .assignment-row').count()==4
   for b in page.locator('#assignmentPanel .assignment-row button').all():
    box=b.bounding_box();assert box['width']>=44 and box['height']>=44 and box['x']>=0 and box['x']+box['width']<=width+1,box
   page.locator('#assignmentPanel .assignment-row').first.locator('button').first.tap()
   assert t('updateTest.G.workerAssignments.fishShop')==0
   page.locator('#assignmentPanel .assignment-row').first.locator('button').last.tap();assert t('updateTest.G.workerAssignments.fishShop')==1
   page.screenshot(path=f'/workspace/my-game-validation/assignment-{width}.png')
   page.locator('#assignmentPanel .close').tap()
   assert t('document.documentElement.scrollWidth<=innerWidth')
   start=t('updateTest.move()');page.keyboard.down('d');t('updateTest.step()');page.keyboard.up('d');assert t('updateTest.pos().x')>start['x']
   # 실제 pointer 입력을 이동 스틱에 전달하고 게임 루프를 진행합니다.
   start=t('updateTest.move()');page.mouse.move(width*.48,height*.75);page.mouse.down();page.mouse.move(width*.48+45,height*.75,steps=5);t('updateTest.step()');page.mouse.up();end=t('updateTest.pos()');assert abs(end['x']-start['x'])+abs(end['y']-start['y'])>.05,(start,end)
   print(f'PASS mobile {width}x{height}: touch quota buttons, close, viewport, keyboard and drag movement',flush=True)
  assert not errors,errors
  browser.close()
 print('PASS no JavaScript runtime errors',flush=True)
if __name__=='__main__':main()
