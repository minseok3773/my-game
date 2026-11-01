"""Check mobile HUD layout, station dressing, and combat camera. Requires the local server."""
import ast,subprocess,tempfile
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--screenshots',type=Path,default=Path(tempfile.mkdtemp(prefix='my-game-visual-')))
args=parser.parse_args()
args.screenshots.mkdir(parents=True,exist_ok=True)
node=ast.parse((root/'tests/smoke_game.py').read_text());hook=next(ast.literal_eval(x.value) for x in node.body if isinstance(x,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='HOOK' for t in x.targets))
hook += '''window.visualTest = {camera,renderer,objs,zoneRings,padObjs,sync3D,DEFS, get player(){return player}, get paused(){return paused}, pause(v){paused=v}, shake(){shake=.4} };'''
cache={}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(e.stack))
 def external(r):
  url=r.request.url
  if 'cdn.jsdelivr.net' not in url:r.abort();return
  if url not in cache:cache[url]=subprocess.check_output(['curl','-fsS','--max-time','20',url])
  r.fulfill(body=cache[url],content_type='application/javascript')
 page.route('https://**',external)
 page.route('**/raft-village-3d.html',lambda r:r.fulfill(body=(root/'raft-village-3d.html').read_text().replace('})();\n</script>',hook+'})();\n</script>'),content_type='text/html'))
 page.goto('http://127.0.0.1:8000/raft-village-3d.html',wait_until='networkidle')
 page.wait_for_function('!!window.visualTest')
 page.evaluate('''async () => {for(let i=0;i<10;i++) {visualTest.sync3D(.05);await new Promise(requestAnimationFrame)} }''')
 page.screenshot(path=str(args.screenshots/'start.png'))
 page.evaluate('''() => {const t=gameTest;for(const id of ['grill','diner','expand1','water','waterShop','expand2','garden','veggieShop','tent1','tent2','tent3','lighthouse','towerA','towerB','solar']) t.unlock(id);t.G.money=500;t.G.hp=85;visualTest.player.x=6;visualTest.player.y=6;t.hud(t.objective());}''')
 for size in [{'width':390,'height':844},{'width':320,'height':568},{'width':844,'height':390},{'width':1280,'height':800}]:
  page.set_viewport_size(size)
  page.evaluate('''async () => {for(let i=0;i<12;i++){visualTest.sync3D(.05);await new Promise(requestAnimationFrame)}}''')
  rects=page.evaluate('''() => Object.fromEntries(['quest','money','level','goal','bag','menuBtn','defense','strategyBtn'].map(id=>{let r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,w:r.width,h:r.height}]}))''')
  def overlap(a,b):return min(a['x']+a['w'],b['x']+b['w'])>max(a['x'],b['x']) and min(a['y']+a['h'],b['y']+b['h'])>max(a['y'],b['y'])
  for a,bb in [('quest','money'),('quest','goal'),('goal','level'),('strategyBtn','defense'),('bag','defense'),('menuBtn','defense')]:assert not overlap(rects[a],rects[bb]),(size,a,bb,rects)
  assert all(r['x']>=0 and r['x']+r['w']<=size['width']+1 and r['y']>=0 and r['y']+r['h']<=size['height']+1 for r in rects.values()),(size,rects)
  page.screenshot(path=str(args.screenshots/f"village-{size['width']}.png"))
  print('HUD no overlaps PASS',size,flush=True)
 page.evaluate('''() => {visualTest.sync3D(.016);visualTest.shake();visualTest.sync3D(.016)}''')
 assert page.evaluate('visualTest.camera.position.y > 15')
 assert page.evaluate("Object.values(visualTest.objs).every(o=>o.g.getObjectByName('station-details'))")
 page.evaluate("gameTest.startRaid();gameTest.setRaid(true);gameTest.hud(gameTest.objective());visualTest.sync3D(.016)")
 assert page.locator('#goal').get_attribute('data-kind')=='danger'
 assert page.locator('#strategyBtn').is_hidden()
 page.screenshot(path=str(args.screenshots/'raid.png'))
 print('Station dressing, stable combat camera, raid priority PASS',flush=True)
 print('Screenshots:',args.screenshots,flush=True)
 assert not errors,errors
 b.close()
