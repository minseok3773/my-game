"""Render original pirate roles and model-load fallbacks in a mobile browser.

Start the repository HTTP server on port 8000 first. Tests inject a private
fixture into the browser response; application files and user saves stay intact.
"""
from pathlib import Path
import argparse
import os
import subprocess
import tempfile
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--screenshots',type=Path)
args=parser.parse_args()
screenshots=args.screenshots or Path(tempfile.mkdtemp(prefix='my-game-characters-'))
screenshots.mkdir(parents=True,exist_ok=True)
HOOK='''
window.characterTest = {
  GL, models,
  get player(){ return player; }, get workers(){ return workers; }, get enemies(){return enemies;},
  fixture(){
    paused=true;build(freshState());paused=true;
    for(const id of ['grill','diner','expand1','water','waterShop','expand2','garden','veggieShop','tent1']){
      if(!unlocked.has(id)){unlocked.add(id);applyUnlock(id);}
    }
    player.x=6;player.y=6;
    for(let i=0;i<workers.length;i++){workers[i].x=4.8+i*.65;workers[i].y=6.5;workers[i].vx=workers[i].vy=0;}
    enemies=[{kind:'boarder',type:'normal',x:7.1,y:6.1,hp:16,max:16,state:'walk',atkT:999,bob:0,vx:0,vy:0,sinkT:0,ang:0,ph:.11,goal:{x:6,y:6}},
             {kind:'boarder',type:'normal',x:7.7,y:5.1,hp:16,max:16,state:'walk',atkT:999,bob:0,vx:0,vy:0,sinkT:0,ang:0,ph:.22,goal:{x:6,y:6}}];
    raidOn=true;G.wave=1;G.money=500;G.hp=100;G.raidT=180;
    for(let i=0;i<24;i++)sync3D(.05);
    render(.016);hud(objective());
  },
  inspect(){
    return [player,...workers,...enemies].map(ent=>{
      const m=models.get(ent);const meshes=[];m.body.traverse(o=>{if(o.isMesh)meshes.push(o.name)});
      return {kind:ent===player?'player':workers.includes(ent)?'worker':'boarder',gl:!!m.gl,gear:!!m.carry&&!!m.rifle,
        meshes,bunny:!!m.earPiv,skull:!!m.skull,rifleVisible:m.rifle.visible,nativeVisible:!!m.weapons?.some(w=>w.visible),armor:!!m.armor,swordVisible:!!m.sword?.visible};
    });
  }
};
'''
cache={}
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
 for block_models in [True,False]:
  page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2)
  page.add_init_script('requestAnimationFrame = () => 0')
  errors=[];page.on('pageerror',lambda e:errors.append(e.stack))
  def external(r):
   u=r.request.url
   if not u.startswith('https://cdn.jsdelivr.net/'):r.abort();return
   if u not in cache:cache[u]=subprocess.check_output(['curl','-fsS','--max-time','20',u])
   r.fulfill(body=cache[u],content_type='application/javascript')
  page.route('https://**',external)
  page.route('**/raft-village-3d.html',lambda r:r.fulfill(body=(root/'raft-village-3d.html').read_text().replace('})();\n</script>',HOOK+'})();\n</script>'),content_type='text/html'))
  if block_models:page.route('**/models/*.json',lambda r:r.abort())
  page.goto('http://127.0.0.1:8000/raft-village-3d.html',wait_until='networkidle')
  page.wait_for_function('!!window.characterTest',polling=100)
  if not block_models:page.wait_for_function('characterTest.GL.ready',polling=100,timeout=30000)
  page.evaluate('characterTest.fixture()')
  data=page.evaluate('characterTest.inspect()')
  assert all(x['gear'] and not x['bunny'] and not x['skull'] for x in data),data
  if block_models:
   assert all(not x['gl'] for x in data),data
  else:
   assert all(x['gl'] for x in data),data
   # 주인공: Henry 몸에 은빛 갑옷을 입힌 오리지널 "바다 수호 기사". 류트는 숨기고 습격 중에는 검을 듦
   assert any('Henry' in n for n in data[0]['meshes']) and data[0]['armor'],data[0]
   assert not data[0]['rifleVisible'] and not data[0]['nativeVisible'] and data[0]['swordVisible'],data[0]
   assert all(any('Henry' in n for n in x['meshes']) for x in data if x['kind']=='worker'),data
   assert any(any(n=='Mako' for n in x['meshes']) for x in data),data
   assert any(any(n=='Sharky' for n in x['meshes']) for x in data),data
  page.screenshot(path=str(screenshots/('fallback-pirates-mobile.png' if block_models else 'original-pirates-mobile.png')))
  assert not errors,errors
  print(('Fallback' if block_models else 'Original asset')+' in-game render PASS; no page errors',flush=True)
  page.close()
 browser.close()
print('Screenshots:',screenshots)
