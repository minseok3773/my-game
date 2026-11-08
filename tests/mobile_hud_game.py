"""Keep advanced-game mobile HUD values bounded without changing combat math."""

import argparse
import functools
import http.server
import re
import threading
from itertools import combinations
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HOOK = r"""
window.mobileHudTest = {
  advance(level, money, enormous = false) {
    const data = freshState();
    data.unlocked = [...new Set([...data.unlocked, 'expand1', 'expand2', 'expand3',
      'grill', 'diner', 'water', 'waterShop', 'garden', 'veggieShop',
      'tent1', 'tent2', 'tent3', 'heroForge', 'crewDojo', 'tower1', 'tower2', 'tower3'])];
    build(data); paused = true; raidOn = false; toastTimer = 0;
    G.t = 2500; G.raidT = 1000000; G.hero.level = level;
    G.training = {hero: 1, crew: 3}; G.money = money;
    if (enormous) { G.hero.legacyAttackBonus = 1e90; G.hero.legacyHpBonus = 1e90; }
    player.hp = heroMaxHp(); player.dead = false; G.hero.downT = 0;
    hud(objective()); sync3D(.016); render(.016);
    return this.stats();
  },
  stats() { return {attack:heroAttack(),hp:player.hp,maxHp:heroMaxHp(),money:G.money}; },
  refresh() { const before=this.stats(); hud(objective()); return {before,after:this.stats()}; },
  draw() { sync3D(.016); render(.016); },
  save, get tiles() { return tiles.size; }
};
"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def inspect_hud(page, width, height):
    boxes = page.evaluate("""() => Object.fromEntries(
      ['quest','money','level','goal','bag','defense','menuBtn','strategyBtn'].map(id => {
        const element=document.getElementById(id), r=element.getBoundingClientRect();
        return [id,{left:r.left,right:r.right,top:r.top,bottom:r.bottom,hidden:element.hidden}];
      }))""")
    for name, box in boxes.items():
        if box['hidden']:
            continue
        assert box['left'] >= -1 and box['right'] <= width + 1, (width, height, name, box)
        assert box['top'] >= -1 and box['bottom'] <= height + 1, (width, height, name, box)
    for first, second in combinations(['quest', 'money', 'level', 'goal'], 2):
        a, b = boxes[first], boxes[second]
        assert not (min(a['right'], b['right']) > max(a['left'], b['left']) + 1
                    and min(a['bottom'], b['bottom']) > max(a['top'], b['top']) + 1), (first, second, boxes)
    fits = page.evaluate("""() => ['moneyVal','heroStats',...Array.from(document.querySelectorAll('#heroStats span'))]
      .every(item => {const e=typeof item==='string'?document.getElementById(item):item;
        return e.scrollWidth<=e.clientWidth+1 && e.scrollHeight<=e.clientHeight+1;})""")
    assert fits, (width, height, page.locator('#level').inner_text(), page.locator('#moneyVal').inner_text())
    assert page.locator('#level').evaluate('(e)=>e.scrollHeight<=e.clientHeight+1'), (width,height,page.locator('#level').inner_text())
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth')
    page.evaluate('window.scrollTo(300, 200)')
    assert page.evaluate('scrollX === 0 && scrollY === 0'), 'HUD overflow must not pan the document'
    assert not re.search(r'\d+\.\d{3}', page.locator('#heroStats').inner_text()), 'Raw float leaked into HUD'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--screenshots', type=Path, default=Path('/tmp/my-game-mobile-hud'))
    args = parser.parse_args()
    args.screenshots.mkdir(parents=True, exist_ok=True)
    source = (ROOT/'raft-village-3d.html').read_text().replace('})();\n</script>', HOOK+'})();\n</script>')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', headless=True,
                args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            page = browser.new_page(viewport={'width':390,'height':844}, is_mobile=True,
                                    has_touch=True, device_scale_factor=2)
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.add_init_script('requestAnimationFrame=()=>0')
            page.route('https://**', lambda route: route.abort())
            page.route('**/raft-village-3d.html', lambda route: route.fulfill(body=source,content_type='text/html'))
            url = f'http://127.0.0.1:{server.server_port}/raft-village-3d.html'
            page.goto(url,wait_until='networkidle')
            page.wait_for_function('!!window.mobileHudTest')
            ordinary = page.evaluate('mobileHudTest.advance(6,252)')
            assert ordinary['maxHp'] != int(ordinary['maxHp']), ordinary
            hp_text = page.locator('#heroStats span').last.inner_text()
            current, maximum = hp_text.removeprefix('♥ ').replace(',','').split('/')
            assert int(current) == int(maximum), hp_text
            assert '122.735' not in page.locator('#heroStats').inner_text()
            assert page.evaluate('mobileHudTest.tiles') > 200
            for level, money, enormous in [(6,252,False),(50,1e18,False),(50,1e100,True)]:
                page.evaluate('([l,m,e])=>mobileHudTest.advance(l,m,e)', [level,money,enormous])
                for width,height in [(320,568),(390,844),(430,932),(700,900),(768,1024),(940,900),(844,390)]:
                    page.set_viewport_size({'width':width,'height':height})
                    unchanged = page.evaluate('mobileHudTest.refresh()')
                    assert unchanged['before'] == unchanged['after'], 'Display formatting changed combat/economy values'
                    inspect_hud(page,width,height)
                print('PASS advanced HUD layout, bounded text, HP consistency and unmodified math',level,money,flush=True)
            page.set_viewport_size({'width':390,'height':844})
            page.evaluate('mobileHudTest.advance(6,252);mobileHudTest.save()')
            page.reload(wait_until='networkidle')
            page.wait_for_function('!!window.mobileHudTest')
            page.evaluate('mobileHudTest.refresh()')
            inspect_hud(page,390,844)
            page.evaluate('mobileHudTest.draw()')
            page.screenshot(path=str(args.screenshots/'expanded-mobile.png'))
            assert not errors,errors
            browser.close()
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)
    print('PASS saved expanded city reload stays inside mobile viewport; screenshots:',args.screenshots)


if __name__ == '__main__':
    main()
