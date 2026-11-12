/* 표류 뗏목 마을 오프라인 캐시 (서비스 워커)
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
