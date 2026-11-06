"""Verify the shipped local runtime and actionable dependency/WebGL failures."""

import functools
import http.server
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


def main():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    url = f'http://127.0.0.1:{server.server_port}/raft-village-3d.html'
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path='/usr/bin/chromium', headless=True,
                args=['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
            )

            # Nothing from a CDN is available: all nine runtime scripts must ship locally.
            page = browser.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.route('https://**', lambda route: route.abort())
            page.goto(url, wait_until='networkidle')
            page.wait_for_function("document.querySelector('#world canvas') && !document.getElementById('startBtn').disabled")
            assert page.locator('script[src^="vendor/three-r128/"]').count() == 9
            assert page.locator('#bootFailure').count() == 0
            assert not errors, errors
            print('PASS local runtime starts with all external HTTPS requests blocked', flush=True)
            page.close()

            # An actual required local script fails, rather than optional fonts/models.
            page = browser.new_page()
            page.route('https://**', lambda route: route.abort())
            page.route('**/vendor/three-r128/examples/js/postprocessing/RenderPass.js', lambda route: route.abort())
            page.goto(url, wait_until='networkidle')
            assert page.locator('#bootFailure').is_visible()
            assert '게임 파일' in page.locator('#bootFailureMessage').inner_text()
            assert page.locator('#startBtn').is_disabled()
            assert page.locator('#bootRetry').is_enabled()
            # Restoring access and pressing the provided retry action must recover.
            page.unroute('**/vendor/three-r128/examples/js/postprocessing/RenderPass.js')
            page.locator('#bootRetry').click()
            page.wait_for_function("document.querySelector('#world canvas') && !document.getElementById('startBtn').disabled")
            assert page.locator('#bootFailure').count() == 0
            print('PASS missing local engine file shows failure, disables start, retry recovers', flush=True)
            page.close()

            # Simulate a device/browser where WebGL contexts cannot be created.
            page = browser.new_page()
            page.route('https://**', lambda route: route.abort())
            page.add_init_script("""const originalGetContext = HTMLCanvasElement.prototype.getContext;
              HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                if (/^(webgl2?|experimental-webgl)$/.test(type)) return null;
                return originalGetContext.call(this, type, ...args);
              };""")
            page.goto(url, wait_until='networkidle')
            assert page.locator('#bootFailure').is_visible()
            assert 'WebGL' in page.locator('#bootFailureMessage').inner_text()
            assert page.locator('#startBtn').is_disabled()
            assert page.locator('#bootRetry').is_enabled()
            print('PASS unavailable WebGL shows supported-browser/hardware-acceleration guidance', flush=True)
            page.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=5)


if __name__ == '__main__':
    main()
