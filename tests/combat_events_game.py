"""Combat events, deferred bosses and small-screen action controls.

Uses a private static server and isolated browser storage. Does not change player
saves or rely on the game's animation loop to advance combat.
"""
import functools
import http.server
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HOOK = r'''
const combatNotices=[];
const combatOriginalToast=toast;
toast=function(message,...args){combatNotices.push(String(message));return combatOriginalToast(message,...args);};
window.combatEventsTest={
 reset(wave=0){
  resetStorageState();const d=freshState();
  d.unlocked.push('expand1','water','tent1','tent2','tent3');
  d.money=1000;d.wave=wave;d.pirateProgressVersion=2;d.lastBossLevel=0;d.ws=1;
  build(d);paused=false;raidOn=false;combatNotices.length=0;lastHud='';
  document.getElementById('helpPanel').hidden=true;
 },
 get G(){return G},get enemies(){return enemies},get workers(){return workers},
 get hero(){return player},get notices(){return [...combatNotices]},
 scout(){launchScoutRaid();},
 normal(){enemies=[];raidOn=false;G.scoutRaid=false;startRaid();raidOn=true;},
 endRaid(){enemies=[];raidOn=false;G.scoutRaid=false;},
 save,load,build,serialize,skill:useHeroSkill,
 hud(){hud(objective());},
 paused(value){paused=value;},
 loadSaved(){build(load());paused=false;document.getElementById('helpPanel').hidden=true;},
 skillFixture(){
  this.reset(6);raidOn=true;G.raidEventWave=G.wave;G.skillCd=0;player.x=5;player.y=4;
  enemies=[
   {kind:'boarder',type:'normal',x:5.5,y:4,hp:100,max:100,state:'walk',atkT:.1},
   {kind:'boarder',type:'normal',x:8.5,y:4,hp:100,max:100,state:'walk',atkT:.1},
   {kind:'boarder',type:'tentacle',x:5,y:4.5,hp:100,max:100,state:'walk',atkT:.1}
  ];return heroAttack();
 },
 cooldown(dt){tickRaidEvents(dt);},
 layout(boss=false){
  this.reset(6);raidOn=true;G.raidEvent='storm';G.raidEventWave=G.wave;
  if(boss)enemies=[{kind:'boarder',champion:true,boss:true,x:5,y:4,hp:100,max:100,state:'walk',level:6}];
  bossHud();hud(objective());
  const ids=['skillBtn','quest','money','level','goal','assignmentBtn','expeditionBtn','defense','bag','menuBtn','strategyBtn','bossBar','recruitHint'];
  return ids.map(id=>{
   const e=document.getElementById(id),r=e.getBoundingClientRect();
   return {id,hidden:e.hidden,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
  });
 },
 freeRecruit(){
  this.reset();workers=[];soldiers=[];G.soldiers=0;G.money=0;
  const p=recruitmentPads()[0];player.x=p.x;player.y=p.y;hud(objective());
  return {tent:p.tent,cost:p.cost,available:p.canRecruit,money:G.money,
   hint:document.getElementById('recruitHint').textContent,defense:document.getElementById('defInfo').textContent};
 },
 recruit(dt){tickRecruitment(dt);},
 pads(){return recruitmentPads();}
};
'''


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    server = http.server.ThreadingHTTPServer(
        ('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        source = (ROOT / 'raft-village-3d.html').read_text()
        assert 'function positionSkillButton()' in source, 'Reassemble the current game first'
        source = source.replace('})();\n</script>', HOOK + '})();\n</script>')
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=[
                '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            context = browser.new_context(viewport={'width':390,'height':844},
                                          is_mobile=True, has_touch=True)
            context.add_init_script('requestAnimationFrame=()=>0')
            context.route('https://**', lambda route: route.abort())
            context.route('**/raft-village-3d.html', lambda route: route.fulfill(
                body=source, content_type='text/html'))
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(f'http://127.0.0.1:{server.server_port}/raft-village-3d.html',
                      wait_until='networkidle')
            page.wait_for_function('!!window.combatEventsTest')

            # A scout crossing Lv5 must not construct or record a regular boss.
            scout = page.evaluate('''() => {
              const t=combatEventsTest;t.reset(4);t.workers.splice(3);t.scout();t.save();
              return {wave:t.G.wave,last:t.G.lastBossLevel,scout:t.G.scoutRaid,
                enemies:t.enemies.map(e=>({boss:!!e.boss,big:!!e.big,budget:e.landingBudget}))};
            }''')
            assert scout == {'wave':5,'last':0,'scout':True,
                             'enemies':[{'boss':False,'big':False,'budget':2}]}, scout
            page.wait_for_timeout(1750)
            assert not page.evaluate('combatEventsTest.notices.some(m=>m.includes("보스 침공"))')
            page.evaluate('combatEventsTest.loadSaved();combatEventsTest.normal()')
            boss = page.evaluate('''() => ({wave:combatEventsTest.G.wave,last:combatEventsTest.G.lastBossLevel,
              milestones:combatEventsTest.enemies.filter(e=>e.boss).map(e=>e.bossMilestone)})''')
            assert boss == {'wave':6,'last':5,'milestones':[5]}, boss
            page.wait_for_timeout(1750)
            assert page.evaluate('combatEventsTest.notices.some(m=>m.includes("Lv.5 단계에서 이월된 보스"))')
            print('PASS scout preserves Lv5 boss and produces no phantom alert; next normal raid after reload receives deferred boss', flush=True)

            # Crossing two milestones with scouts must not discard either one.
            pending = page.evaluate('''() => {
              const t=combatEventsTest;t.reset(4);
              while(t.G.wave<10){t.endRaid();t.scout();}
              const before=t.G.lastBossLevel;t.save();t.loadSaved();t.normal();
              const first=t.enemies.filter(e=>e.boss).map(e=>e.bossMilestone);
              t.save();t.loadSaved();t.normal();
              const second=t.enemies.filter(e=>e.boss).map(e=>e.bossMilestone);
              return {before,first,second,last:t.G.lastBossLevel,wave:t.G.wave};
            }''')
            assert pending == {'before':0,'first':[5],'second':[10],'last':10,'wave':12}, pending
            print('PASS multiple scouts preserve pending Lv5/Lv10 milestones across real reloads, one boss per normal raid', flush=True)

            # The real skill hits in-range targets once and respects the shared cooldown.
            attack = page.evaluate('combatEventsTest.skillFixture()')
            assert page.evaluate('combatEventsTest.skill()')
            damage = page.evaluate('combatEventsTest.enemies.map(e=>({hp:e.hp,x:e.x,y:e.y,atk:e.atkT}))')
            assert damage[0]['hp'] == damage[2]['hp'] == 100-attack*2.5, damage
            assert damage[1]['hp'] == 100, damage
            assert damage[0]['x'] > 5.5 and damage[0]['atk'] >= .9, damage
            assert damage[2]['x'] == 5 and damage[2]['y'] == 4.5, damage
            assert not page.evaluate('combatEventsTest.skill()')
            assert page.evaluate('combatEventsTest.G.skillCd') == 8
            page.evaluate('combatEventsTest.cooldown(8);combatEventsTest.paused(true)')
            assert not page.evaluate('combatEventsTest.skill()')
            page.evaluate('combatEventsTest.hud()')
            assert page.locator('#skillBtn').is_hidden()
            page.evaluate('combatEventsTest.paused(false);combatEventsTest.hud()')
            assert page.locator('#skillBtn').is_visible()
            assert page.locator('#skillBtn').is_enabled()
            page.locator('#skillBtn').click()
            assert page.evaluate('combatEventsTest.G.skillCd') == 8
            assert page.evaluate('combatEventsTest.enemies[0].hp') == 100-attack*5
            print('PASS actual skill damage, radius, knockback exception, cooldown, pause guard and action-button click', flush=True)

            # Check the final DOM after ONE hud call, including boss and ordinary raids.
            for width,height in [(320,480),(320,568),(390,844),(844,390)]:
                page.set_viewport_size({'width':width,'height':height})
                for with_boss in [False,True]:
                    boxes=page.evaluate('(value)=>combatEventsTest.layout(value)',with_boss)
                    skill=next(r for r in boxes if r['id']=='skillBtn')
                    assert not skill['hidden'] and skill['width'] >= 44 and skill['height'] >= 44, skill
                    assert skill['left']>=0 and skill['top']>=0 and skill['right']<=width and skill['bottom']<=height, skill
                    for r in boxes:
                        if r['id']=='skillBtn' or r['hidden'] or r['width']==0 or r['height']==0:
                            continue
                        overlap=(skill['left']<r['right'] and skill['right']>r['left'] and
                                 skill['top']<r['bottom'] and skill['bottom']>r['top'])
                        assert not overlap, {'viewport':[width,height],'boss':with_boss,'skill':skill,'obstacle':r}
                    if with_boss:
                        boss=next(r for r in boxes if r['id']=='bossBar')
                        for r in boxes:
                            if r['id']=='bossBar' or r['hidden'] or r['width']==0 or r['height']==0:
                                continue
                            overlap=(boss['left']<r['right'] and boss['right']>r['left'] and boss['top']<r['bottom'] and boss['bottom']>r['top'])
                            assert not overlap,{'viewport':[width,height],'bossBar':boss,'obstacle':r}
                if (width,height) in [(320,480),(844,390)]:
                    page.screenshot(path=f'/tmp/my-game-fixed-skill-{width}x{height}.png',full_page=True)
            print('PASS one-frame skill layout avoids hero/goal/quest/assignment/defense/bag/menu/boss HUD at four mobile viewports', flush=True)

            free=page.evaluate('combatEventsTest.freeRecruit()')
            assert free['cost']==0 and free['available'] and free['money']==0, free
            assert '무료' in free['hint'] and '부족' not in free['hint'], free
            assert '무료' in free['defense'] and '$30' not in free['defense'], free
            page.evaluate('combatEventsTest.recruit(1)')
            assert page.evaluate('combatEventsTest.workers.length')==1
            assert page.evaluate('combatEventsTest.G.money')==0
            assert all(p['cost']==30 for p in page.evaluate('combatEventsTest.pads()'))
            print('PASS emergency free-hire cost, visible hint and defense text match the actual one-second recruitment', flush=True)
            assert not errors,errors
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


if __name__=='__main__':
    main()
