"""Later pirates grow faster without taking earned ally stats from older saves.

Uses the actual previous committed game to produce a wounded high-level save,
then loads the current generated game in the same isolated browser profile.
"""
import functools
import http.server
import math
from pathlib import Path
import subprocess
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PREVIOUS_GAME = 'efc973d2bf11b0945a4a38282e3a0fd4c76b20cc:raft-village-3d.html'
HOOK = r'''
window.lateBalanceTest = {
  get G(){return G}, get workers(){return workers},
  build, save, serialize,
  stats(){return {money:G.money,wave:G.wave,crewMax:crewHpMax(),crewAttack:crewAttack(),
    heroMax:heroMaxHp(),heroAttack:heroAttack(),heroHp:player.hp,
    workers:workers.map(w=>({hp:w.hp,carry:[...w.carry],assignment:w.assignment})),
    cards:{...G.cards},training:{...G.training},unlocked:[...unlocked]};},
  oldSave(){
    const d=freshState();d.unlocked.push('expand1','tent1','water');d.money=4567;d.wave=100;d.level=25;
    d.cards={crewHp:2,crewPower:3,villageHp:2,playerGun:2};d.training={hero:11,crew:19};
    d.expedition={phase:'idle',rewards:{kelp:true,medic:false,compass:true,shell:true,anchor:false}};
    build(d);paused=true;raidOn=false;
    workers[0].hp=crewHpMax()-17;workers[0].carry=['water','fish'];workers[1].hp=31;
    player.hp=heroMaxHp()-11;save();return this.stats();
  },
  newGame(){resetStorageState();build(freshState());paused=true;raidOn=false;
    G.unlocked.push('tent1');unlocked.add('tent1');applyUnlock('tent1');return true;},
  advance(level){G.wave=level;initializePirateProgression();return {level,
    multiplier:allyMultiplier(level),pirateMultiplier:pirateMultiplier(level),
    crewAttack:crewAttack(),crewMax:crewHpMax(),pirateHp:normalPirateHp(),pirateAttack:normalPirateAttack(),
    hero50Attack:heroBaseAttack(50),hero50Hp:heroBaseHp(50)};},
  bossDue:bossDueNextRaid,
};
'''


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    previous = subprocess.check_output(['git','show',PREVIOUS_GAME],cwd=ROOT,text=True)
    current = (ROOT/'raft-village-3d.html').read_text()
    assert 'PIRATE_LATE_GROWTH' in current and 'crewAllyMultiplier' not in current, 'Reassemble the merged growth rules before running this test'
    handler=functools.partial(QuietHandler,directory=str(ROOT))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=[
                '--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
            context.add_init_script('requestAnimationFrame=()=>0')
            context.route('https://**',lambda route:route.abort())
            source={'html':previous}
            context.route('**/raft-village-3d.html',lambda route:route.fulfill(
                body=source['html'].replace('})();\n</script>',HOOK+'})();\n</script>'),content_type='text/html'))
            page=context.new_page();errors=[]
            page.on('pageerror',lambda error:errors.append(str(error)))
            url=f'http://127.0.0.1:{server.server_port}/raft-village-3d.html'
            page.goto(url,wait_until='networkidle');page.wait_for_function('!!window.lateBalanceTest',polling=100)
            earned=page.evaluate('lateBalanceTest.oldSave()')
            assert earned['crewMax']>100000 and earned['workers'][0]['hp']==earned['crewMax']-17
            source['html']=current
            page.reload(wait_until='networkidle');page.wait_for_function('!!window.lateBalanceTest',polling=100)
            restored=page.evaluate('lateBalanceTest.stats()')
            assert restored==earned, (earned,restored)
            print('PASS genuine old Lv100 save retains crew/captain stats, wounded HP, cards, training, cargo and money',flush=True)

            for _ in range(3):
                assert page.evaluate('lateBalanceTest.save()')
                page.reload(wait_until='networkidle');page.wait_for_function('!!window.lateBalanceTest',polling=100)
                assert page.evaluate('lateBalanceTest.stats()')==earned
            first=page.evaluate('lateBalanceTest.advance(100)')
            next_level=page.evaluate('lateBalanceTest.advance(101)')
            assert math.isclose(next_level['multiplier']/first['multiplier'],1.06,rel_tol=1e-12)
            assert math.isclose(next_level['pirateMultiplier']/first['pirateMultiplier'],1.07,rel_tol=1e-12)
            assert next_level['crewAttack']>first['crewAttack']
            assert next_level['crewAttack']/next_level['pirateHp'] < first['crewAttack']/first['pirateHp']
            print('PASS three real reloads preserve earned ally stats; later pirate growth exceeds ally growth',flush=True)

            assert page.evaluate('lateBalanceTest.newGame()')
            rows=[page.evaluate('(n)=>lateBalanceTest.advance(n)',n) for n in [1,14,15,16,25,50,100,150]]
            for row in rows:
                assert math.isclose(row['multiplier'],math.pow(1.06,row['level']-1),rel_tol=1e-12)
                expected=math.pow(1.03,min(row['level'],15)-1)*math.pow(1.07,max(0,row['level']-15))
                assert math.isclose(row['pirateMultiplier'],expected,rel_tol=1e-12)
            assert rows[-1]['crewAttack']/rows[-1]['pirateHp'] < rows[-2]['crewAttack']/rows[-2]['pirateHp']
            assert rows[-2]['crewAttack']/rows[-2]['pirateHp'] < rows[-3]['crewAttack']/rows[-3]['pirateHp']
            assert all(row['hero50Attack']==rows[0]['hero50Attack'] and row['hero50Hp']==rows[0]['hero50Hp'] for row in rows)
            print('PASS allies retain6% growth, pirates transition3%to7% after15, and late relative crew dominance declines',flush=True)
            print('Growth table:',[(r['level'],r['crewMax'],round(r['crewAttack'],2),r['pirateHp'],round(r['pirateAttack'],2)) for r in rows],flush=True)
            assert not errors,errors
            browser.close()
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)


if __name__=='__main__':
    main()
