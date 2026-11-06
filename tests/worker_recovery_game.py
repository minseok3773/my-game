"""Real-browser regression checks for cargo delivery and building repair recovery.

Uses the game's local JavaScript assets and blocks external network requests.
Run from the repository root after assembling raft-village-3d.html.
"""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright


HOOK = r"""
window.workerRecoveryTest = {
  reset(sourceBroken, destinationBroken, staleJob) {
    const data = freshState();
    data.unlocked.push('expand1', 'tent1', 'water', 'waterShop');
    build(data); paused = true;
    for (const id of assignmentShops()) setWorkerAssignment(id, 0);
    setWorkerAssignment('waterShop', 2);
    G.broken = {};
    if (sourceBroken) G.broken.water = true;
    if (destinationBroken) G.broken.waterShop = true;
    G.repairWork = {};
    G.st.water.pile = destinationBroken ? 0 : 12;
    G.st.waterShop.stock = 0; G.st.waterShop.cash = 0;
    for (const w of workers) {
      w.carry = ['water', 'water', 'water'];
      w.job = staleJob ? { from: 'water', to: 'waterShop' } : null;
      if (destinationBroken) {
        w.x = DEFS.waterShop.x; w.y = DEFS.waterShop.y;
      }
    }
    return this.state();
  },
  step(seconds, stopAtDelivery = false) {
    for (let i = 0; i < Math.ceil(seconds / .05); i++) {
      for (const w of workers) updateWorker(w, .05);
      separateWorkers(.05);
      if (stopAtDelivery && G.st.waterShop.stock > 0) break;
    }
    return this.state();
  },
  state() {
    return {
      sourceBroken: !!G.broken.water,
      destinationBroken: !!G.broken.waterShop,
      sourceStock: G.st.water.pile,
      delivered: G.st.waterShop.stock,
      carried: workers.reduce((sum, w) => sum + w.carry.length, 0),
      assigned: workers.map(w => w.assignment),
    };
  },
  snapshot: serialize,
  restore(data) { build(data); paused = true; return this.state(); },
};
"""


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()
    source = (root / 'raft-village-3d.html').read_text()
    marker = '})();\n</script>'
    assert source.count(marker) == 1, 'Game test hook insertion point changed'
    source = source.replace(marker, HOOK + marker)
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(root)))
    Thread(target=server.serve_forever, daemon=True).start()
    errors = []
    external_requests = []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path='/usr/bin/chromium',
                args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
            )
            page = browser.new_page()
            page.add_init_script('requestAnimationFrame = () => 0')
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('**/raft-village-3d.html', lambda route: route.fulfill(body=source, content_type='text/html'))

            def block_external(route):
                external_requests.append(route.request.url)
                route.abort()

            page.route('https://**', block_external)
            url = f'http://127.0.0.1:{server.server_port}/raft-village-3d.html'
            page.goto(url, wait_until='networkidle')
            page.wait_for_function('!!window.workerRecoveryTest')

            for stale_job in [False, True]:
                page.evaluate('(stale) => workerRecoveryTest.reset(true, false, stale)', stale_job)
                state = page.evaluate('workerRecoveryTest.step(40, true)')
                assert state['delivered'] > 0 and state['sourceBroken'], state
                assert state['sourceStock'] == 12 and state['carried'] + state['delivered'] == 6, state
                state = page.evaluate('workerRecoveryTest.step(60)')
                assert not state['sourceBroken'], state
                assert state['sourceStock'] + state['carried'] + state['delivered'] == 18, state
                print(f'PASS broken source: deliver carried stock before repairs; stale job={stale_job}', flush=True)

            for source_broken in [False, True]:
                page.evaluate('(broken) => workerRecoveryTest.reset(broken, true, true)', source_broken)
                state = page.evaluate('workerRecoveryTest.step(.5)')
                assert state['destinationBroken'] and state['carried'] == 6, state
                snapshot = page.evaluate('workerRecoveryTest.snapshot()')
                page.reload(wait_until='networkidle')
                page.wait_for_function('!!window.workerRecoveryTest')
                restored = page.evaluate('(data) => workerRecoveryTest.restore(data)', snapshot)
                assert restored == state, (state, restored)
                state = page.evaluate('workerRecoveryTest.step(60)')
                assert not state['sourceBroken'] and not state['destinationBroken'], state
                assert state['delivered'] == 6 and state['carried'] == 0 and state['sourceStock'] == 0, state
                assert state['assigned'] == ['waterShop', 'waterShop'], state
                print(f'PASS broken destination: preserve cargo through reload, repair and deliver; source broken={source_broken}', flush=True)

            assert not errors, errors
            assert not external_requests, f'Game still requests external resources: {external_requests}'
            browser.close()
            print('PASS offline worker recovery without JavaScript errors', flush=True)
    finally:
        server.shutdown()
        server.server_close()


if __name__ == '__main__':
    main()
