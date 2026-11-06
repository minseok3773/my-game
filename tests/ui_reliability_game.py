"""Browser regressions for HUD spacing, notice priority and assignment keyboard use.

Run the repository's HTTP server on 127.0.0.1:8000 first.
"""

import subprocess
from itertools import combinations
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HOOK = r"""
window.uiReliabilityTest = {
  reset() {
    const data = freshState();
    data.unlocked.push('expand1', 'tent1', 'grill', 'diner', 'water', 'waterShop');
    data.money = 10000;
    build(data); raidOn = false; paused = true;
    toastTimer = 0; toastMessage = ''; toastPriority = 1;
  },
  notify: toast,
  hud() { hud(objective()); },
  expire() { toastTimer = 0; },
  raid() { startRaid(); raidOn = true; toastTimer = 0; },
  recover() { player.hp = 0; player.dead = true; G.hero.downT = 8; toastTimer = 0; },
  resume() { paused = false; },
  set: setWorkerAssignment,
  get shops() { return assignmentShops(); }
};
"""


def main():
    errors = []
    source = (ROOT / 'raft-village-3d.html').read_text().replace(
        '})();\n</script>', HOOK + '})();\n</script>'
    )
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path='/usr/bin/chromium',
            args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        )
        page = browser.new_page(viewport={'width': 768, 'height': 1024})
        page.add_init_script('requestAnimationFrame = () => 0')
        page.on('pageerror', lambda error: errors.append(error.stack))
        cache = {}

        def external(route):
            url = route.request.url
            if not url.startswith('https://cdn.jsdelivr.net/'):
                route.abort()
                return
            if url not in cache:
                cache[url] = subprocess.check_output(['curl', '-fsS', '--max-time', '30', url])
            route.fulfill(body=cache[url], content_type='application/javascript')

        page.route('https://**', external)
        page.route('**/raft-village-3d.html', lambda route: route.fulfill(body=source, content_type='text/html'))
        page.goto('http://127.0.0.1:8000/raft-village-3d.html', wait_until='networkidle')
        page.wait_for_function('!!window.uiReliabilityTest')
        page.evaluate('uiReliabilityTest.reset(); uiReliabilityTest.hud()')

        for width, height in [(320, 568), (390, 844), (700, 900), (768, 1024), (820, 1180), (900, 900), (940, 900), (1280, 800), (844, 390)]:
            page.set_viewport_size({'width': width, 'height': height})
            boxes = page.evaluate("""() => Object.fromEntries(['quest','goal','money','level'].map(id => {
              const r = document.getElementById(id).getBoundingClientRect();
              return [id, {left:r.left, right:r.right, top:r.top, bottom:r.bottom}];
            }))""")
            for (first_id, first), (second_id, second) in combinations(boxes.items(), 2):
                assert not (
                    min(first['right'], second['right']) > max(first['left'], second['left']) + 1
                    and min(first['bottom'], second['bottom']) > max(first['top'], second['top']) + 1
                ), (width, height, first_id, second_id, boxes)
            assert all(box['left'] >= 0 and box['right'] <= width for box in boxes.values()), boxes
        print('PASS nonoverlapping HUD at nine mobile/tablet/desktop viewports', flush=True)

        goal = page.locator('#goal')
        page.evaluate("uiReliabilityTest.notify('어군 탐지 — 물고기 떼 접근 중'); uiReliabilityTest.hud()")
        assert goal.inner_text() == '어군 탐지 — 물고기 떼 접근 중'
        page.evaluate('uiReliabilityTest.expire(); uiReliabilityTest.hud()')
        assert '어군 탐지' not in goal.inner_text()
        page.evaluate("uiReliabilityTest.raid(); uiReliabilityTest.hud()")
        combat = goal.inner_text()
        assert '해적' in combat and goal.get_attribute('data-kind') == 'danger'
        page.evaluate("uiReliabilityTest.notify('어군 탐지 — 물고기 떼 접근 중')")
        assert goal.inner_text() == combat, 'A normal notice must not briefly replace combat guidance'
        page.evaluate('uiReliabilityTest.hud()')
        assert goal.inner_text() == combat
        page.evaluate("uiReliabilityTest.notify('☠️ 상어 대장 상륙!'); uiReliabilityTest.hud()")
        assert goal.inner_text() == '☠️ 상어 대장 상륙!' and goal.get_attribute('data-kind') == 'danger'
        page.evaluate("uiReliabilityTest.notify('가방을 비웠습니다 · 3개'); uiReliabilityTest.hud()")
        assert goal.inner_text() == '☠️ 상어 대장 상륙!', 'Normal notice replaced an active emergency'
        page.evaluate("uiReliabilityTest.recover(); uiReliabilityTest.hud()")
        recovery = goal.inner_text()
        assert '선장 회복 중' in recovery
        page.evaluate("uiReliabilityTest.notify('어군 탐지 — 물고기 떼 접근 중'); uiReliabilityTest.hud()")
        assert goal.inner_text() == recovery
        assert page.locator('#toast').count() == 0
        print('PASS normal notice expiry, combat/recovery priority, emergency retention, no bottom notice', flush=True)

        page.set_viewport_size({'width': 768, 'height': 1024})
        page.evaluate("uiReliabilityTest.reset(); for (const id of uiReliabilityTest.shops) uiReliabilityTest.set(id, 0); uiReliabilityTest.set('fishShop', 1); uiReliabilityTest.resume()")
        page.locator('#assignmentBtn').click()
        dialog = page.get_by_role('dialog', name='판매소 일꾼 배정')
        close = dialog.get_by_role('button', name='닫기', exact=True)
        assert close.evaluate('(button) => button === document.activeElement')
        page.keyboard.press('Shift+Tab')
        assert dialog.evaluate('(element) => element.contains(document.activeElement)')
        page.keyboard.press('Tab')
        assert close.evaluate('(button) => button === document.activeElement')
        decrease = dialog.get_by_role('button', name='생선 가판대 감소', exact=True)
        decrease.focus()
        page.keyboard.press('Enter')
        increase = dialog.get_by_role('button', name='생선 가판대 증가', exact=True)
        assert increase.evaluate('(button) => button === document.activeElement'), 'Disabled decrease must transfer focus within the same row'
        page.keyboard.press('Enter')
        assert increase.evaluate('(button) => button === document.activeElement'), 'Rerender discarded the active assignment control'
        for _ in range(16):
            page.keyboard.press('Tab')
            assert dialog.evaluate('(element) => element.contains(document.activeElement)')
        page.keyboard.press('Escape')
        assert not dialog.is_visible()
        assert page.locator('#assignmentBtn').evaluate('(button) => button === document.activeElement')
        assert page.locator('#assignmentBtn').get_attribute('aria-expanded') == 'false'
        print('PASS assignment dialog focus entry, rerender, disabled fallback, Tab trap and close restoration', flush=True)
        assert not errors, errors
        browser.close()


if __name__ == '__main__':
    main()
