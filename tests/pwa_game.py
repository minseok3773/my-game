"""PWA navigation, Cloudflare redirects, cache updates and old-worker upgrade.

Runs isolated local servers and browser profiles; no production saves are changed.
"""
import functools
import http.server
import json
import threading
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
# Archived worker fixture; tests also work in shallow checkouts without old Git objects.
LEGACY_SW = r"""/* 표류 뗏목 마을 오프라인 캐시 (서비스 워커)
 * - 처음 설치할 때 게임 실행에 필요한 파일을 휴대폰에 저장합니다.
 * - 게임 페이지(HTML)는 인터넷이 되면 항상 최신본을 받아 오고, 안 되면 저장본으로 실행합니다.
 * - 엔진·모형·그림은 저장본을 바로 쓰고, 뒤에서 새 버전이 있으면 다음 실행 때를 위해 갱신합니다.
 */
const CACHE = 'raft-village-v1';
const CORE = [
  './',
  'index.html',
  'raft-village-3d.html',
  'manifest.webmanifest',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/apple-touch-icon.png',
  'models/henry.json',
  'models/captain.json',
  'models/mako.json',
  'models/sharky.json',
  'models/shark.json',
  'vendor/three-r128/build/three.min.js',
  'vendor/three-r128/examples/js/loaders/GLTFLoader.js',
  'vendor/three-r128/examples/js/utils/SkeletonUtils.js',
  'vendor/three-r128/examples/js/postprocessing/EffectComposer.js',
  'vendor/three-r128/examples/js/postprocessing/RenderPass.js',
  'vendor/three-r128/examples/js/postprocessing/ShaderPass.js',
  'vendor/three-r128/examples/js/postprocessing/UnrealBloomPass.js',
  'vendor/three-r128/examples/js/shaders/CopyShader.js',
  'vendor/three-r128/examples/js/shaders/LuminosityHighPassShader.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('raft-village-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 글꼴 등 외부 파일은 브라우저 기본 동작

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isPage) {
    // 페이지: 최신본 우선, 인터넷이 없으면 저장본
    event.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(url.pathname.endsWith('/') ? req : new Request(url.pathname), copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || caches.match('raft-village-3d.html'))));
    return;
  }
  // 그 밖의 파일: 저장본 먼저, 뒤에서 갱신
  event.respondWith(caches.open(CACHE).then(cache => cache.match(req, { ignoreSearch: true }).then(hit => {
    const update = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || update;
  })));
});
""".encode()


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        url = urlparse(self.path)
        self.server.hits.append(url.path)
        if self.server.redirect and url.path == '/raft-village-3d.html':
            self.send_response(308)
            self.send_header('Location', '/raft-village-3d' + ('?' + url.query if url.query else ''))
            self.end_headers()
            return
        path = url.path
        if self.server.redirect and path == '/raft-village-3d':
            path = '/raft-village-3d.html'
        if path == '/sw.js':
            content = (LEGACY_SW if self.server.legacy else (ROOT / 'sw.js').read_bytes()) + self.server.sw_suffix.encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/javascript')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(content)
            return
        if path == '/pwa-probe.txt':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.end_headers()
            self.wfile.write(self.server.probe.encode())
            return
        if self.server.missing and path == '/assets/icon-192.png':
            self.send_error(503)
            return
        if path == '/raft-village-3d.html':
            content = (ROOT / 'raft-village-3d.html').read_text().replace(
                '</head>', f'<meta name="pwa-test-version" content="{self.server.revision}"></head>')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(content.encode())
            return
        return super().do_GET()


def server_for(redirect, legacy=False):
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(ROOT)))
    server.redirect = redirect
    server.legacy = legacy
    server.revision = 'one'
    server.probe = 'one'
    server.missing = False
    server.hits = []
    server.sw_suffix = ''
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    return server, worker


def wait_for(page, expression):
    page.wait_for_function(expression, polling=100, timeout=30000)


def game_ready(page):
    wait_for(page, '!!document.querySelector("#world canvas") && !document.getElementById("startBtn").disabled')
    assert page.locator('#bootFailure').count() == 0


def cache_info(page):
    return page.evaluate('''async () => {
      const names=await caches.keys(), c=await window.openPwaTestCache(), keys=await c.keys();
      const r=await c.match('raft-village-3d.html');
      return {names,count:keys.length,redirected:r.redirected,status:r.status};
    }''')


def page_for(browser, origin):
    context = browser.new_context(viewport={'width':390, 'height':844}, is_mobile=True, has_touch=True)
    context.add_init_script("""requestAnimationFrame=()=>0;
      window.openPwaTestCache=async()=>{
        const meta=await caches.open('raft-village-v4-meta'),p=await meta.match('__pwa_active__');
        return caches.open(p?await p.text():'raft-village-v4');
      };""")
    context.route('https://**', lambda route: route.abort())
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    response = page.goto(origin + '/raft-village-3d.html?sw=1', wait_until='networkidle')
    assert response.status == 200
    game_ready(page)
    wait_for(page, '!!navigator.serviceWorker.controller')
    return context, page, errors


def offline_start(context, page, origin, path):
    context.set_offline(True)
    response = page.goto(origin + path, wait_until='networkidle')
    assert response.status == 200
    game_ready(page)
    assert page.locator('meta[name="pwa-test-version"]').get_attribute('content') in ('one', 'two')


def test_current(browser, redirect):
    server, thread = server_for(redirect)
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        context, page, errors = page_for(browser, origin)
        state = cache_info(page)
        assert state['count'] == 23 and state['redirected'] is False and state['status'] == 200, state
        manifest = json.loads((ROOT / 'manifest.webmanifest').read_text())
        start = '/' + manifest['start_url'].removeprefix('./')
        offline_start(context, page, origin, start)
        offline_start(context, page, origin, '/raft-village-3d.html?source=old-bookmark')
        offline_start(context, page, origin, '/raft-village-3d?source=canonical')
        context.set_offline(False)
        server.revision = 'two'
        page.goto(origin + '/raft-village-3d.html?source=updated', wait_until='networkidle')
        game_ready(page)
        assert page.locator('meta[name="pwa-test-version"]').get_attribute('content') == 'two'
        offline_start(context, page, origin, start)
        assert page.locator('meta[name="pwa-test-version"]').get_attribute('content') == 'two'
        context.set_offline(False)
        assert page.evaluate("fetch('pwa-probe.txt').then(r=>r.text())") == 'one'
        server.probe = 'two'
        assert page.evaluate("fetch('pwa-probe.txt').then(r=>r.text())") == 'one'
        wait_for(page, "(async()=>{const c=await window.openPwaTestCache(),r=await c.match('pwa-probe.txt');return !!r&&(await r.text())==='two';})()")
        context.set_offline(True)
        assert page.evaluate("fetch('pwa-probe.txt?source=app').then(r=>r.text())") == 'two'
        assert not errors, errors
        print('PASS offline manifest/legacy/canonical game starts, fresh HTML and background asset update; Cloudflare redirects=' + str(redirect), flush=True)
        context.close()
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=5)


def test_upgrade(browser, failed=False):
    server, thread = server_for(True, legacy=True)
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        context, page, errors = page_for(browser, origin)
        before = page.evaluate("caches.open('raft-village-v1').then(c=>c.match('raft-village-3d.html')).then(r=>r.redirected)")
        assert before is True
        server.legacy = False
        server.missing = failed
        result = page.evaluate('''async () => {
          const reg=await navigator.serviceWorker.getRegistration();await reg.update();const w=reg.installing;
          if(!w)return 'none';
          return await new Promise(resolve=>{const done=()=>{if(['activated','redundant'].includes(w.state))resolve(w.state);};w.addEventListener('statechange',done);done();});
        }''')
        if failed:
            assert result == 'redundant', result
            names = page.evaluate('caches.keys()')
            assert 'raft-village-v1' in names and 'raft-village-v4' not in names, names
            print('PASS incomplete new-worker install keeps old offline cache and active worker', flush=True)
        else:
            wait_for(page, "(async()=>{const n=await caches.keys();return n.some(k=>k.startsWith('raft-village-v4-gen-'))&&!n.includes('raft-village-v1');})()")
            state = cache_info(page)
            assert state['redirected'] is False and state['count'] == 23, state
            offline_start(context, page, origin, '/raft-village-3d.html?source=app')
            assert not errors, errors
            print('PASS old redirected v1 cache upgrades to normalized v4 and offline app starts', flush=True)
        context.close()
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=5)


def test_same_cache_failed_upgrade(browser):
    server, thread = server_for(True)
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        context, page, errors = page_for(browser, origin)
        server.revision = 'two'
        server.missing = True
        server.sw_suffix = '\n// New worker, same cache name, intentionally incomplete network fixture.\n'
        result = page.evaluate('''async () => {
          const reg=await navigator.serviceWorker.getRegistration();await reg.update();const w=reg.installing;
          if(!w)return 'none';
          return await new Promise(resolve=>{const done=()=>{if(['activated','redundant'].includes(w.state))resolve(w.state);};w.addEventListener('statechange',done);done();});
        }''')
        assert result == 'redundant', result
        state = cache_info(page)
        assert state['count'] == 23 and state['redirected'] is False, state
        assert not any(n.endswith('-install') for n in state['names']), state
        offline_start(context, page, origin, '/raft-village-3d.html?source=app')
        assert page.locator('meta[name="pwa-test-version"]').get_attribute('content') == 'one'
        assert not errors, errors
        print('PASS failed same-cache worker update preserves complete active HTML and offline startup', flush=True)
        context.close()
    finally:
        server.shutdown(); server.server_close(); thread.join(timeout=5)


def test_generation_publish_failure(browser):
    server, thread = server_for(True)
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        context, page, errors = page_for(browser, origin)
        before = page.evaluate('''async()=>{
          const m=await caches.open('raft-village-v4-meta'),p=await m.match('__pwa_active__');
          return await p.text();
        }''')
        server.revision = 'two'
        # All candidate bytes are cached, then quota prevents the one publication write.
        # The active cache is never a destination of candidate writes.
        server.sw_suffix = r"""
const originalOpen = caches.open.bind(caches);
caches.open = async function(name) {
  const cache = await originalOpen(name);
  if (name === 'raft-village-v4-meta') {
    const put = cache.put.bind(cache);
    cache.put = async function(key, response) {
      if (String(key.url || key).endsWith('/__pwa_active__')) {
        throw new DOMException('injected publication quota', 'QuotaExceededError');
      }
      return put(key,response);
    };
  }
  return cache;
};
"""
        result = page.evaluate('''async()=>{
          const reg=await navigator.serviceWorker.getRegistration();await reg.update();const w=reg.installing;
          if(!w)return 'none';
          return await new Promise(resolve=>{const done=()=>{if(['activated','redundant'].includes(w.state))resolve(w.state)};w.addEventListener('statechange',done);done()});
        }''')
        assert result == 'redundant', result
        after = page.evaluate('''async()=>{
          const m=await caches.open('raft-village-v4-meta'),p=await m.match('__pwa_active__');
          const active=await p.text(),names=await caches.keys();
          return {active,generations:names.filter(n=>n.startsWith('raft-village-v4-gen-'))};
        }''')
        assert after == {'active':before,'generations':[before]}, after
        state=cache_info(page)
        assert state['count']==23 and state['redirected'] is False, state
        offline_start(context,page,origin,'/raft-village-3d.html?source=app')
        assert page.locator('meta[name="pwa-test-version"]').get_attribute('content') == 'one'
        assert not errors, errors
        print('PASS final publication quota keeps prior active generation and exact old HTML offline',flush=True)
        context.close()
    finally:
        server.shutdown();server.server_close();thread.join(timeout=5)


def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path='/usr/bin/chromium', args=['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        try:
            test_current(browser, False)
            test_current(browser, True)
            test_upgrade(browser)
            test_upgrade(browser, failed=True)
            test_same_cache_failed_upgrade(browser)
            test_generation_publish_failure(browser)
        finally:
            browser.close()


if __name__ == '__main__':
    main()
