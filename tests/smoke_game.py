import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
HOOK="""
window.gameTest = { get G(){return G}, get enemies(){return enemies}, get raidOn(){return raidOn}, get paused(){return paused}, build, freshState, serialize, save, startRaid, updateMilitary, finishStrategyRaid, hitVillage, priceOf, raidPlan, strategyDamage, strategySale, hud, objective,
 unlock(id){if(!unlocked.has(id)){unlocked.add(id);applyUnlock(id)}},
 skewClock(){last=performance.now()+1000}, step(dt){updateMilitary(dt)}, clear(){enemies=[]}, setRaid(v){raidOn=v},
 get cards(){return typeof CARDS === 'undefined' ? [] : CARDS},
 offer(){offerCards()}, take(c){takeCard(c)}, ck(id){return ck(id)} };
"""
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for version in ['3d']:
  print('Testing',version,flush=True)
  page=browser.new_page(viewport={'width':390,'height':844})
  errors=[]; page.on('pageerror',lambda e:errors.append(e.stack))
  def route(r):
   content=(ROOT/f'raft-village-{version}.html').read_text().replace('})();\n</script>',HOOK+'})();\n</script>')
   r.fulfill(body=content,content_type='text/html')
  cache={}
  def external(r):
   url=r.request.url
   if 'cdn.jsdelivr.net' not in url: r.abort(); return
   if url not in cache: cache[url]=subprocess.check_output(['curl','--fail','--silent','--show-error','--max-time','20',url])
   r.fulfill(body=cache[url],content_type='application/javascript')
  page.route('https://**',external)
  page.route(f'**/raft-village-{version}.html',route)
  page.goto(f'http://127.0.0.1:8000/raft-village-{version}.html',wait_until='networkidle')
  page.wait_for_function('!!window.gameTest',timeout=30000)
  assert page.evaluate('''async () => { const before=gameTest.G.t; gameTest.skewClock(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); return gameTest.G.t >= before; }''')
  page.evaluate("""() => { const t=gameTest; t.unlock('expand1'); t.G.money=500; t.G.hp=50; t.hud(t.objective()); }""")
  page.locator('#strategyBtn').click();page.locator('#strategyPanel .choices button').nth(1).click()
  assert page.evaluate("gameTest.G.money === 480 && gameTest.G.hp >= 70 && gameTest.G.hp < 72 && gameTest.strategyDamage() === .7 && gameTest.strategySale() === .8")
  page.locator('#strategyBtn').click()
  assert page.locator('#strategyPanel .choices button:disabled').count()==3
  page.keyboard.press('Escape')
  page.evaluate('gameTest.save()');page.reload(wait_until='networkidle');page.wait_for_function('!!window.gameTest')
  assert page.evaluate("gameTest.G.tactic === 'guard' && gameTest.G.preparedWave === 1")
  page.evaluate('gameTest.startRaid();gameTest.setRaid(true);gameTest.save()')
  page.reload(wait_until='networkidle');page.wait_for_function('!!window.gameTest')
  assert page.evaluate('gameTest.raidOn && gameTest.enemies.length > 0')
  page.evaluate("""() => { const t=gameTest;t.clear();t.G.defended=4;t.G.money=0;t.G.tactic='guard';t.step(0); }""")
  assert page.evaluate("gameTest.G.defended === 5 && gameTest.G.expeditionWon && gameTest.G.money === 200 && gameTest.G.tactic === null")
  page.evaluate('gameTest.finishStrategyRaid(false)')
  assert page.evaluate('gameTest.G.money === 200')
  page.evaluate('gameTest.finishStrategyRaid(true)')
  assert page.evaluate('gameTest.G.defended === 6')
  if version=='3d':
   page.evaluate("""() => { const t=gameTest; for(const id of ['smuggler','glass','bunker']) { t.G.cardOffer=[id];t.offer();t.take(t.cards.find(c=>c.id===id)); } }""")
   assert page.evaluate("gameTest.ck('smuggler') === 1 && gameTest.ck('glass') === 1 && gameTest.ck('bunker') === 1")
  if version=='3d':
   page.evaluate("gameTest.G.hp=100;gameTest.G.tactic='guard';gameTest.hitVillage({dmg:10,x1:-99,y1:-99})")
   assert page.evaluate('Math.abs(gameTest.G.hp - 93.28) < .15')
   page.evaluate("gameTest.G.cardOffer=null;gameTest.offer()")
   offered=page.evaluate('gameTest.G.cardOffer')
   page.reload(wait_until='networkidle');page.wait_for_function('!!window.gameTest')
   assert page.evaluate('gameTest.G.cardOffer')==offered
   assert page.locator('#cardPanel').is_visible()
   page.locator('#cardPanel button.card').first.click()
   assert page.evaluate('gameTest.G.cardOffer === null && !gameTest.paused')
  else:
   page.evaluate("gameTest.G.hp=100;gameTest.G.tactic='guard';gameTest.hitVillage({dmg:10,x1:-99,y1:-99})")
   assert page.evaluate('Math.abs(gameTest.G.hp - 93) < .15')
  page.set_viewport_size({'width':390,'height':844})
  page.evaluate('gameTest.hud(gameTest.objective())')
  assert page.locator('#strategyBtn').evaluate('(e) => e.getBoundingClientRect().right <= innerWidth')
  assert not errors,errors
  print(version,'PASS: preparation costs/effects, one choice per raid, reload, combat persistence, 5-defense reward, no repeat reward, defeat excluded, runtime errors', errors)
  page.close()
 browser.close()
