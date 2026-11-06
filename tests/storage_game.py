"""Browser checks for saved progress, write failures, retry and file backup.

Run a local HTTP server on 127.0.0.1:8000 before this script.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from update_game import HOOK

ROOT = Path(__file__).resolve().parents[1]
STORAGE_HOOK = """
window.storageTest = {save, load, retryStorage, resetStorageState, exportSave, serialize,
  get status(){ return {...storageState}; }, key:KEY, backupKey:STORAGE_BACKUP_KEY};
"""


def main():
    errors = []
    source = (ROOT / 'raft-village-3d.html').read_text().replace(
        '})();\n</script>', HOOK + STORAGE_HOOK + '})();\n</script>')
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path='/usr/bin/chromium', args=[
            '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        page = browser.new_page(accept_downloads=True)
        page.add_init_script('requestAnimationFrame=()=>0')
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('https://**', lambda route: route.abort())
        page.route('**/raft-village-3d.html', lambda route: route.fulfill(
            body=source, content_type='text/html'))
        page.goto('http://127.0.0.1:8000/raft-village-3d.html', wait_until='networkidle')
        page.wait_for_function('!!window.storageTest')
        page.evaluate('updateTest.reset();updateTest.G.money=321')
        assert page.evaluate('storageTest.save()')
        for error_name in ['QuotaExceededError', 'SecurityError']:
            result = page.evaluate("""name => {
              const t=storageTest, before=localStorage.getItem(t.key);
              updateTest.G.money=654;
              const original=Storage.prototype.setItem;
              Storage.prototype.setItem=function(){throw new DOMException('blocked',name)};
              let ok;
              try {ok=t.save()} finally {Storage.prototype.setItem=original}
              return {ok,failed:t.status.failed,prior:localStorage.getItem(t.key)===before,
                message:document.getElementById('storageStatus').textContent,
                menu:document.getElementById('menuBtn').dataset.storageFailed};
            }""", error_name)
            assert result['ok'] is False and result['failed'] and result['prior'], result
            assert result['message'] and result['menu'] == 'true', result
            page.evaluate('updateTest.hud(updateTest.objective())')
            assert page.locator('#goal').get_attribute('data-kind') == 'danger'
            assert '저장하지 못했습니다' in page.locator('#goal').inner_text()
            with page.expect_download() as download_info:
                assert page.evaluate('storageTest.exportSave()')
            downloaded = json.loads(Path(download_info.value.path()).read_text())
            assert downloaded['money'] == 654, downloaded['money']
            page.evaluate("document.getElementById('helpPanel').hidden=false")
            page.locator('#storageRetry').click()
            assert not page.evaluate('storageTest.status.failed')
            assert page.evaluate('JSON.parse(localStorage.getItem(storageTest.key)).money') == 654
            print('PASS saved value preserved, visible failure, file backup and retry', error_name, flush=True)

        # A backup quota error must not downgrade a successful primary write.
        assert page.evaluate("""() => {
          const t=storageTest, original=Storage.prototype.setItem;
          updateTest.G.money=777;
          Storage.prototype.setItem=function(key,value){
            if(key===t.backupKey)throw new DOMException('quota','QuotaExceededError');
            return original.call(this,key,value);
          };
          let ok;try{ok=t.save()}finally{Storage.prototype.setItem=original}
          return ok&&!t.status.failed&&JSON.parse(localStorage.getItem(t.key)).money===777;
        }""")
        print('PASS optional backup failure preserves primary save success', flush=True)

        # If the primary data is corrupt, recover a valid prior checkpoint.
        assert page.evaluate("""() => {
          const t=storageTest, backup=t.serialize();backup.money=555;
          localStorage.setItem(t.backupKey,JSON.stringify(backup));
          localStorage.setItem(t.key,'invalid json');
          const restored=t.load();return restored.money===555&&t.status.recovered&&!t.status.loadBlocked;
        }""")
        print('PASS malformed primary recovers prior backup', flush=True)

        # Read failure must not silently replace existing progress with a new game.
        result = page.evaluate("""() => {
          const t=storageTest, original=Storage.prototype.getItem;
          const prior=original.call(localStorage,t.key);
          Storage.prototype.getItem=function(){throw new DOMException('blocked','SecurityError')};
          let restored;try{restored=t.load()}finally{Storage.prototype.getItem=original}
          const ok=t.save();return {restored,ok,blocked:t.status.loadBlocked,
            prior:localStorage.getItem(t.key)===prior};
        }""")
        assert result['restored'] is None and not result['ok'] and result['blocked'] and result['prior'], result
        print('PASS unreadable save blocks destructive overwrite', flush=True)
        assert page.evaluate("""() => {
          storageTest.resetStorageState();updateTest.reset();updateTest.G.money=888;
          return storageTest.save()&&!storageTest.status.loadBlocked&&
            JSON.parse(localStorage.getItem(storageTest.key)).money===888;
        }""")
        print('PASS explicit new-game reset allows a fresh save', flush=True)
        assert not errors, errors
        browser.close()


if __name__ == '__main__':
    main()
