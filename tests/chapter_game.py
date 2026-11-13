"""섬 정착(챕터): 미션 잠금, 섬의 주인 도전·승패, 일반 보스 미룸, 출항 시 유지/초기화, 도착 적응 기간,
잘못된 저장 값, 새로고침 보존, 미션 창 키보드 포커스, 아이폰 드래그(터치 기본 동작 차단)."""
import functools
import http.server
import json
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HOOK = r'''
window.chapterTest = {
  run(code){ return eval(code); }, // 게임 내부 함수는 이 범위 안에서만 보입니다.
  get G(){return G},
  fresh(){ resetStorageState(); build(freshState()); paused=true; document.getElementById('helpPanel').hidden=true; return true; },
  unlock(ids){ for (const id of ids) if (DEFS[id] && !unlocked.has(id)) { unlocked.add(id); applyUnlock(id); } },
  completeMissions(){
    this.unlock(PADS.map(p=>p.id).slice(0,12));
    while (aliveWorkers() < 8) spawnWorker('tent1', 1);
    G.defended=(G.defended||0)+8; G.stats.sold=(G.stats.sold||0)+400; G.slv.fishing=5;
    for (const k of ['kelp','medic','compass','shell','anchor']) expeditionState().rewards[k]=true;
  },
  missions(){ return chapterMissions().map(m=>({id:m.id,done:m.done})); },
  winRaid(){ for(let i=0;i<200 && raidOn;i++){ for (const e of [...enemies]) { if (!alive(e)) continue; e.hp=0; if (e.kind==='boarder') killBoarder(e); else sinkEnemy(e); } update(0.25); } return !raidOn; },
  loseRaid(){ G.raidHeroDowns=3; for (const w of workers) w.hp=0; workers.length=0; soldiers.length=0; for(let i=0;i<800 && raidOn;i++) update(0.25); return !raidOn && looted === false; },
  state(){ return {chapter:G.chapter, bossDone:G.chapterBossDone, bossRaid:G.chapterBossRaid, raidOn, money:G.money, unlocked:[...unlocked],
    workers:workers.length, wave:G.wave, training:G.training, kelp:!!G.expedition?.rewards?.kelp, grace:G.arrivalGrace,
    bosses:enemies.filter(e=>e.boss).map(e=>({chapter:!!e.chapterBoss,name:e.bossName||null})), ships:enemies.filter(e=>e.kind!=='boarder').length}; },
  touchPrevented(target){ const el=target==='map'?document.getElementById('expeditionCanvas'):cv; const t=new Touch({identifier:1,target:el,clientX:50,clientY:50});
    const ev=new TouchEvent('touchmove',{cancelable:true,bubbles:true,touches:[t],targetTouches:[t],changedTouches:[t]}); el.dispatchEvent(ev); return ev.defaultPrevented; }
};
'''

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

def main():
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    try:
        source = (ROOT / 'raft-village-3d.html').read_text().replace('})();\n</script>', HOOK + '})();\n</script>')
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            ctx = browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
            ctx.route('https://**', lambda r: r.abort())
            ctx.route('**/raft-village-3d.html', lambda r: r.fulfill(body=source, content_type='text/html'))
            page = ctx.new_page(); errors = []
            page.on('pageerror', lambda e: errors.append(str(e)))
            page.on('dialog', lambda d: d.accept())
            url = f'http://127.0.0.1:{server.server_port}/raft-village-3d.html'
            page.goto(url, wait_until='load'); page.wait_for_function('!!window.chapterTest', polling=100)
            T = lambda c: page.evaluate('(c) => chapterTest.run(c)', c)

            # 1) 미션 전에는 도전 불가, 미션 완료 뒤 도전 가능
            T('chapterTest.fresh()')
            assert T('chapterTest.state().chapter') == 1
            assert not T('startChapterBoss()'), 'boss must be locked before missions'
            T('chapterTest.completeMissions()')
            assert all(m['done'] for m in T('chapterTest.missions()')), T('chapterTest.missions()')
            T('openChapterPanel()')
            assert page.locator('#chapterBoss').is_enabled()
            for _ in range(5):
                page.keyboard.press('Tab')
                assert T("document.getElementById('chapterPanel').contains(document.activeElement)")
            print('PASS missions lock the island lord; panel enables challenge and keeps keyboard focus', flush=True)

            # 2) 도전: 섬의 주인 1척 + 호위 2척, 일반 보스 미룸(보스 단계여도)
            T('chapterTest.G.wave=4; chapterTest.G.lastBossLevel=0')
            assert T('bossDueNextRaid()')
            page.locator('#chapterBoss').click()
            st = T('chapterTest.state()')
            assert st['raidOn'] and st['bossRaid'] and st['bosses'] == [{'chapter': True, 'name': '해초섬의 주인 · 늪지 상어'}] and st['ships'] == 3, st
            assert T('chapterTest.loseRaid()')
            st = T('chapterTest.state()')
            assert not st['bossDone'] and not st['bossRaid'], st
            assert T('bossDueNextRaid()'), 'regular milestone boss stays pending'
            print('PASS challenge brings only the island lord and two escorts; a loss allows retry and keeps the regular boss pending', flush=True)

            # 3) 승리 → 보상, 새로고침 보존
            T('document.getElementById("chapterPanel").hidden=true; chapterTest.completeMissions(); player.hp=heroMaxHp(); player.dead=false; G.hero.downT=0;')
            money = T('chapterTest.G.money')
            why = T('JSON.stringify({ready:chapterBossReady(), raidOn, hero:isHeroAvailable(), busy:expeditionBusy(), missions:chapterTest.missions(), dead:player.dead, hp:player.hp})')
            assert T('startChapterBoss()'), why
            assert T('chapterTest.winRaid()')
            st = T('chapterTest.state()')
            assert st['bossDone'] and st['money'] >= money + 300, (money, st)
            T('save()'); page.reload(wait_until='load'); page.wait_for_function('!!window.chapterTest', polling=100)
            assert T('chapterTest.state().bossDone') and T('chapterTest.state().chapter') == 1
            print('PASS defeating the island lord pays once and survives reload', flush=True)

            # 4) 출항: 건물·일꾼 초기화, 선장·훈련·원정 보상·해적 레벨 유지, 돈 30%(최대 3000)+지원금, 적응 기간
            T('chapterTest.G.training={hero:7,crew:4}; chapterTest.G.money=20000; document.getElementById("helpPanel").hidden=true; paused=false;')
            before = T('chapterTest.state()')
            assert T('sailToNextIsland()')
            st = T('chapterTest.state()')
            assert st['chapter'] == 2 and st['unlocked'] == ['fishing', 'fishShop'] and st['workers'] == 0, st
            assert st['training'] == {'hero': 7, 'crew': 4} and st['kelp'] and st['wave'] == before['wave'], st
            assert st['money'] == 3000 + 300 and st['grace'] == 2, st
            assert T('pirateCrewMultiplier(30)') == 1.5 and T('chapterSaleMul()') == 1.1
            T('save()'); page.reload(wait_until='load'); page.wait_for_function('!!window.chapterTest', polling=100)
            assert T('chapterTest.state().chapter') == 2 and T('chapterTest.state().grace') == 2
            print('PASS sailing resets the village, keeps captain/training/rewards/pirate level, carries 30% money and starts the arrival grace', flush=True)

            # 5) 적응 기간: 해적선 최대 3척·일반 보스 없음, 2번 뒤 끝
            T('chapterTest.unlock(["tent1","expand1"]); while(aliveWorkers()<6) spawnWorker("tent1",1); chapterTest.G.wave=9; chapterTest.G.lastBossLevel=5; paused=true; startRaid(); raidOn=true; update(0.05);')
            st = T('chapterTest.state()')
            assert st['ships'] <= 3 and not st['bosses'], st
            assert T('chapterTest.winRaid()') and T('chapterTest.state().grace') == 1
            T('startRaid(); raidOn=true; update(0.05);'); assert T('chapterTest.winRaid()') and T('chapterTest.state().grace') == 0
            assert T('pirateCrewMultiplier(30)') == 3
            print('PASS arrival grace limits two raids to three ships without the regular boss, then ends', flush=True)

            # 6) 잘못된 저장 값
            for bad in ['"abc"', '-3', 'null', '1e9', '2.7']:
                r = T(f'(()=>{{const d=freshState(); d.chapter={bad}; d.chapterBase="x"; d.arrivalGrace="x"; build(d); return [G.chapter, chapterSaleMul(), G.chapterBase, G.arrivalGrace];}})()')
                assert isinstance(r[0], int) and 1 <= r[0] <= 999 and r[1] <= 1.5 and isinstance(r[2]['sold'], (int, float)) and r[3] == 0, (bad, r)
            print('PASS malformed chapter values are clamped (price bonus at most +50%)', flush=True)

            # 7) 아이폰 드래그: 마을·원정 지도의 터치가 스크롤로 넘어가지 않음
            assert T('chapterTest.touchPrevented("village")')
            T('''(()=>{chapterTest.fresh(); chapterTest.unlock(['expand1','tent1','water']); chapterTest.G.defended=5; chapterTest.G.money=500; spawnWorker('tent1',2); expeditionOpen(); expeditionDepart();})()''')
            assert T('chapterTest.touchPrevented("map")')
            print('PASS village and expedition map cancel touch scrolling so drags are not interrupted', flush=True)
            assert not errors, errors
            browser.close()
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=5)

if __name__ == '__main__':
    main()
