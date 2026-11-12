/* 표류 뗏목 마을 오프라인 캐시 (서비스 워커)
 * - 처음 설치할 때 게임 실행에 필요한 파일을 휴대폰에 저장합니다.
 * - 게임 페이지(HTML)는 인터넷이 되면 항상 최신본을 받아 오고, 안 되면 저장본으로 실행합니다.
 * - 엔진·모형·그림은 저장본을 바로 쓰고, 뒤에서 새 버전이 있으면 다음 실행 때를 위해 갱신합니다.
 * - 공개 서버(Cloudflare Pages)는 /raft-village-3d.html 을 /raft-village-3d 로 리디렉션합니다.
 *   리디렉션을 거친 응답은 페이지로 돌려줄 수 없으므로, 저장할 때 깨끗한 응답으로 다시 만들고
 *   페이지는 주소 끝의 .html 유무와 상관없이 같은 이름(예: /raft-village-3d)으로 찾습니다.
 */
const CACHE = 'raft-village-v3';
const PAGES = ['./', 'index.html', 'raft-village-3d.html'];
const FILES = [
  'manifest.webmanifest',
  'fonts/fonts.css', // 글꼴 파일(fonts/files)은 처음 쓰일 때 저장됩니다
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
const GAME_PAGE = 'raft-village-3d.html';

// 페이지 저장 이름: '/index.html' → '/', '/raft-village-3d.html' → '/raft-village-3d'
const scopePath = rel => new URL(rel, self.registration.scope).pathname;
const pageKey = path => {
  const p = path.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
  return new URL(p, self.location.origin).href;
};
// 리디렉션을 거친 응답을 리디렉션 표시가 없는 응답으로 다시 만듭니다.
async function clean(res) {
  if (!res.redirected) return res;
  return new Response(await res.blob(), { status: 200, statusText: 'OK', headers: res.headers });
}
async function fetchClean(rel) {
  const res = await fetch(new Request(rel, { cache: 'reload' }));
  if (!res.ok) throw new Error('precache ' + rel + ' ' + res.status);
  return clean(res);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all([
      ...PAGES.map(async rel => cache.put(pageKey(scopePath(rel)), await fetchClean(rel))),
      ...FILES.map(async rel => cache.put(new URL(rel, self.registration.scope).href, await fetchClean(rel))),
    ]);
    await self.skipWaiting();
  })());
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
  if (url.origin !== self.location.origin) return; // 외부 주소는 브라우저 기본 동작

  const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isPage) {
    // 페이지: 최신본 우선(서버 리디렉션은 브라우저가 그대로 따라감), 인터넷이 없으면 저장본
    event.respondWith(fetch(req).then(res => {
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        event.waitUntil(clean(copy).then(c => caches.open(CACHE).then(cache => cache.put(pageKey(url.pathname), c))));
      }
      return res;
    }).catch(() => caches.open(CACHE).then(async cache =>
      (await cache.match(pageKey(url.pathname))) || (await cache.match(pageKey(scopePath(GAME_PAGE))))
      || new Response('<meta charset="utf-8"><p style="font:18px sans-serif;padding:24px">인터넷에 연결한 뒤 한 번 열어 주세요.</p>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))));
    return;
  }
  // 그 밖의 파일: 저장본 먼저, 뒤에서 갱신
  event.respondWith(caches.open(CACHE).then(cache => cache.match(req, { ignoreSearch: true }).then(hit => {
    const update = fetch(req).then(async res => {
      if (res.ok && res.type === 'basic') await cache.put(req, await clean(res.clone()));
      return res;
    }).catch(() => hit);
    if (hit) { event.waitUntil(update); return hit; }
    return update;
  })));
});
