"""Save-code/file import validation and transactional rollback without touching player saves."""
import argparse
import functools
import http.server
import json
from pathlib import Path
import threading

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HOOK = r'''
window.transferTest = {
  key:KEY, backupKey:STORAGE_BACKUP_KEY, save, load, serialize, build,
  code:saveCode, parse:parseSaveCode, importText:importSaveText, importData:importSaveData,
  get G(){return G}, get workers(){return workers}, get status(){return {...storageState}},
  reset(){resetStorageState();const d=freshState();d.money=4321;d.unlocked.push('tent1');build(d);paused=true;save();G.money=4322;save();},
  snapshot(){return {game:serialize(),primary:localStorage.getItem(KEY),backup:localStorage.getItem(STORAGE_BACKUP_KEY),meta:{...storageState}};},
  checkpoint(){window.transferRefs={G,workers,runtime,player};workers[0].job={cash:'fishShop'};workers[0].timer=.73;runtime.fishShop.queue=[{x:1,y:2,got:0,want:2,carry:[]}];},
  refsIntact(){return G===transferRefs.G&&workers===transferRefs.workers&&runtime===transferRefs.runtime&&player===transferRefs.player&&workers[0].job.cash==='fishShop'&&workers[0].timer===.73&&runtime.fishShop.queue.length===1;},
  brokenBuild(text){const original=build;build=d=>{original(d);throw new Error('injected build failure')};try{return importSaveText(text,false)}finally{build=original}},
  brokenSave(text,write=false){const original=save;save=()=>{if(write){localStorage.setItem(KEY,'partial-write');localStorage.setItem(STORAGE_BACKUP_KEY,'partial-backup')}return false};try{return importSaveText(text,false)}finally{save=original}},
};
'''

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html', type=Path, default=ROOT/'raft-village-3d.html')
    args = parser.parse_args()
    source = args.html.read_text().replace('})();\n</script>', HOOK+'})();\n</script>')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=[
                '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
            context = browser.new_context(accept_downloads=True)
            context.add_init_script('requestAnimationFrame=()=>0')
            context.route('https://**', lambda route: route.abort())
            context.route('**/raft-village-3d.html', lambda route: route.fulfill(body=source, content_type='text/html'))
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            url = f'http://127.0.0.1:{server.server_port}/raft-village-3d.html'
            page.goto(url, wait_until='networkidle')
            page.wait_for_function('!!window.transferTest')
            page.evaluate('transferTest.reset()')
            initial = page.evaluate('transferTest.snapshot()')
            # All malformed imports must leave both raw persisted checkpoints and current village unchanged.
            mutations = [
                "g.unlocked.push('futureBuilding')", "delete g.st.fishing", "g.money=-10",
                "g.st.fishing.pile='many'", "g.hero.hp=null", "g.crewRoster[0].hp='healthy'",
                "g.combat={raidOn:true,enemies:{}}", "g.recruitment={tent1:{remaining:'soon'}}",
                "g.expedition={phase:'exploring',run:{x:1,y:1,hp:20,maxHp:20,time:60,party:[],rescued:[],collected:[],hazards:'bad'}}",
                "g.st=[]", "g.paid={'futureBuilding':10}",
                "g.raidEvent='unknown-event'", "g.lastRaidEvent='unknown-event'", "g.cardOffer='not-an-array'",
            ]
            for mutation in mutations:
                result = page.evaluate('''mutation => {
                  const t=transferTest,before=t.snapshot(),g=t.serialize();
                  Function('g',mutation)(g);
                  const raw=JSON.stringify(g),code='RAFT1:'+btoa(unescape(encodeURIComponent(raw)));
                  const a=t.importText(raw,false),b=t.importText(code,false);
                  return {a,b,after:t.snapshot(),before};
                }''', mutation)
                assert result['a'] is False and result['b'] is False, (mutation,result)
                assert result['after']==result['before'], (mutation,result)
            assert not page.evaluate('transferTest.importText("RAFT1:not base64!",false)')
            assert not page.evaluate('transferTest.importText("{broken JSON",false)')
            page.reload(wait_until='networkidle')
            page.wait_for_function('!!window.transferTest')
            assert page.evaluate('transferTest.G.money') == 4322
            assert page.evaluate('transferTest.workers.length') == 2
            assert page.locator('#bootFailure').count() == 0
            print('PASS malformed JSON/RAFT1 imports preserve raw primary, backup and village across reload', flush=True)

            # A genuine legacy export can omit later optional fields, and Unicode stays intact.
            result = page.evaluate('''() => {
              const t=transferTest,g=t.serialize();g.money=6789;g.note='나의 뗏목 🐬';
              for(const key of ['hero','training','trainPaid','workerAssignments','tavern','expedition','crewRoster','navyRoster'])delete g[key];
              const code='RAFT1:'+btoa(unescape(encodeURIComponent(JSON.stringify(g))));
              const before=localStorage.getItem(t.key),ok=t.importText(code,false);
              return {ok,money:t.G.money,note:t.G.note,crew:t.workers.length,backup:JSON.parse(localStorage.getItem(t.backupKey)).money,roundTrip:t.parse(t.code()).note};
            }''')
            assert result == {'ok':True,'money':6789,'note':'나의 뗏목 🐬','crew':2,'backup':4322,'roundTrip':'나의 뗏목 🐬'}, result
            print('PASS legacy optional defaults and Unicode save-code round trip; prior village backed up', flush=True)

            # Exercise the actual file input and its confirmation, rather than only a helper API.
            file_game = page.evaluate('transferTest.serialize()')
            file_game['money'] = 9001
            file_game['note'] = '파일로 불러온 마을'
            page.on('dialog', lambda dialog: dialog.accept())
            page.locator('#storageFile').set_input_files({'name':'village.json','mimeType':'application/json','buffer':json.dumps(file_game,ensure_ascii=False).encode()})
            page.wait_for_function('transferTest.G.money===9001')
            assert '✅' in page.locator('#storageNote').inner_text()
            assert page.evaluate('JSON.parse(localStorage.getItem(transferTest.backupKey)).money') == 6789
            print('PASS actual JSON file import confirms and preserves the previous checkpoint', flush=True)

            # Runtime references include unfinished collection and visitors; a failed preflight cannot reset them.
            for kind in ['build','save','postwrite','quota']:
                page.evaluate('transferTest.reset();transferTest.checkpoint()')
                result = page.evaluate('''kind => {
                  const t=transferTest,before=t.snapshot(),g=t.serialize();g.money=111;
                  const text=JSON.stringify(g);let ok;
                  if(kind==='build')ok=t.brokenBuild(text);
                  else if(kind==='save'||kind==='postwrite')ok=t.brokenSave(text,kind==='postwrite');
                  else {
                    const original=Storage.prototype.setItem;
                    Storage.prototype.setItem=function(key,value){if(key===t.key)throw new DOMException('full','QuotaExceededError');return original.call(this,key,value)};
                    try{ok=t.importText(text,false)}finally{Storage.prototype.setItem=original}
                  }
                  return {ok,before,after:t.snapshot(),refs:t.refsIntact(),notice:document.getElementById('storageNote').textContent};
                }''', kind)
                assert result['ok'] is False and result['refs'], (kind,result)
                assert result['after']==result['before'], (kind,result)
                assert '✅' not in result['notice'], (kind,result)
            page.reload(wait_until='networkidle')
            page.wait_for_function('!!window.transferTest')
            assert page.evaluate('transferTest.G.money') == 4322
            assert page.locator('#bootFailure').count() == 0
            print('PASS build/write/partial-write failures restore primary, backup, metadata and live jobs/visitors', flush=True)

            # A semantically invalid primary now selects the valid backup rather than reaching a boot crash.
            result = page.evaluate('''() => {
              const t=transferTest,good=t.serialize();good.money=2222;
              localStorage.setItem(t.backupKey,JSON.stringify(good));
              localStorage.setItem(t.key,JSON.stringify({money:55,st:{},unlocked:['fishing','futureBuilding']}));
              const loaded=t.load();return {money:loaded.money,recovered:t.status.recovered,blocked:t.status.loadBlocked};
            }''')
            assert result == {'money':2222,'recovered':True,'blocked':False}, result
            assert not errors, errors
            print('PASS structurally invalid primary recovers valid prior backup without startup corruption', flush=True)
            browser.close()
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)

if __name__ == '__main__':
    main()
