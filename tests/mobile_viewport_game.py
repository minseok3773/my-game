"""Keep the renderer, overlay and postprocessing in sync with a changing mobile viewport."""

import argparse
import functools
import http.server
import io
import threading
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HOOK = r"""
window.mobileViewportTest = {
  seed(expanded) {
    build(freshState()); paused = true;
    if (expanded) for (const id of ['expand1','expand2','expand3','tent1','tent2','tent3','grill','diner','water','waterShop','garden','veggieShop','heroForge','crewDojo']) {
      if (!unlocked.has(id)) { unlocked.add(id); applyUnlock(id); }
    }
    G.t = expanded ? 3600 : 0;
    sync3D(.016); render(.016); hud(objective());
  },
  sizes() {
    const box = element => { const r=element.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}; };
    const buffer=renderer.getDrawingBufferSize(new THREE.Vector2());
    return {world:box(document.getElementById('world')),canvas:box(renderer.domElement),overlay:box(cv),
      width:W,height:H,dpr:DPR,buffer:[buffer.x,buffer.y],overlayBuffer:[cv.width,cv.height],
      effect:composer ? [composer.renderTarget1.width,composer.renderTarget1.height] : null,
      scale:visualViewport?.scale || 1,viewport:[document.documentElement.clientWidth,innerHeight],
      pixelStyles:[renderer.domElement.style.width,renderer.domElement.style.height]};
  },
  solidEdge() {
    const old=scene.background,visible=scene.children.map(child=>child.visible);
    scene.children.forEach(child=>child.visible=false);scene.background=new THREE.Color(0xf24f66);
    ctx.clearRect(0,0,W,H);renderer.render(scene,camera);
    scene.background=old;scene.children.forEach((child,i)=>child.visible=visible[i]);
  }
};
"""


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def assert_sizes(page, full_viewport=True):
    values = page.evaluate('mobileViewportTest.sizes()')
    world = values['world']
    assert values['pixelStyles'] == ['100%', '100%'], values
    assert abs(values['canvas']['width'] - world['width']) < 1, values
    assert abs(values['canvas']['height'] - world['height']) < 1, values
    assert abs(values['overlay']['width'] - world['width']) < 1, values
    assert abs(values['overlay']['height'] - world['height']) < 1, values
    assert values['width'] == round(world['width']) and values['height'] == round(world['height']), values
    expected = [int(values['width'] * values['dpr']), int(values['height'] * values['dpr'])]
    assert values['buffer'] == values['overlayBuffer'] == expected, values
    assert values['effect'] is None or values['effect'] == expected, values
    if full_viewport:
        assert world['x'] == world['y'] == 0 and world['width'] == values['viewport'][0], values
        assert abs(values['scale'] - 1) < .01, values
    return values


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--screenshots', type=Path, default=Path('/tmp/my-game-mobile-viewport'))
    args = parser.parse_args()
    args.screenshots.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    source = (ROOT / 'raft-village-3d.html').read_text().replace('})();\n</script>', HOOK + '})();\n</script>')
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
            page = browser.new_page(viewport={'width':390,'height':844}, is_mobile=True, has_touch=True, device_scale_factor=2)
            page.add_init_script('requestAnimationFrame=()=>0')
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('https://**', lambda route: route.abort())
            page.route('**/raft-village-3d.html', lambda route: route.fulfill(body=source, content_type='text/html'))
            page.goto(f'http://127.0.0.1:{server.server_port}/raft-village-3d.html', wait_until='networkidle')
            page.wait_for_function('!!window.mobileViewportTest')
            for expanded in [False, True]:
                page.evaluate('(expanded)=>mobileViewportTest.seed(expanded)', expanded)
                for width,height in [(390,844),(430,740),(430,932),(844,390),(390,660),(390,844)]:
                    page.set_viewport_size({'width':width,'height':height})
                    page.wait_for_function('mobileViewportTest.sizes().width===document.documentElement.clientWidth && mobileViewportTest.sizes().height===Math.round(document.getElementById("world").getBoundingClientRect().height)', polling=50)
                    assert_sizes(page)
                    page.evaluate('mobileViewportTest.solidEdge()')
                    screenshot = page.screenshot()
                    pixels = Image.open(io.BytesIO(screenshot)).convert('RGB')
                    red,green,blue = pixels.getpixel((pixels.width-2,pixels.height//2))
                    assert red > green * 1.4 and red > blue * 1.2, (expanded,width,height,(red,green,blue))
                print('PASS full-width WebGL/overlay/effects through toolbar-size changes, rotation and '+('expanded hour-long state' if expanded else 'fresh state'),flush=True)

            # A CSS container resize does not emit window.resize. The observer must still resize all buffers.
            page.evaluate('document.getElementById("world").style.width="calc(100% - 36px)"')
            page.wait_for_function('mobileViewportTest.sizes().width===document.documentElement.clientWidth-36', polling=50)
            assert_sizes(page, full_viewport=False)
            page.evaluate('document.getElementById("world").style.width="100%";visualViewport.dispatchEvent(new Event("resize"))')
            page.wait_for_function('mobileViewportTest.sizes().width===document.documentElement.clientWidth', polling=50)
            assert_sizes(page)
            session = page.context.new_cdp_session(page)
            # CDP density-only overrides do not dispatch browser resize/media-query events.
            # Change real device metrics together, as on a device/viewport transition.
            for device_scale,device_width,device_height in [(1,414,896),(2,390,844)]:
                session.send('Emulation.setDeviceMetricsOverride', {
                    'width':device_width,'height':device_height,'deviceScaleFactor':device_scale,'mobile':True,
                })
                page.wait_for_function('(scale)=>devicePixelRatio===scale && mobileViewportTest.sizes().dpr===scale', arg=device_scale, polling=50)
                assert_sizes(page)
            print('PASS actual device-pixel-ratio changes keep CSS canvas and drawing buffers synchronized',flush=True)
            page.evaluate('mobileViewportTest.seed(true)')
            page.screenshot(path=str(args.screenshots/'expanded-mobile.png'))
            assert not errors, errors
            browser.close()
            print('PASS CSS-only viewport resize updates renderer, overlay and composer; no JavaScript errors',flush=True)
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)


if __name__ == '__main__':
    main()
