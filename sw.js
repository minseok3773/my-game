/* 표류 뗏목 마을 오프라인 캐시
 * HTML은 최신본 우선, 엔진·모형은 저장본 우선으로 실행합니다.
 * Cloudflare의 .html → 확장자 없는 주소 리디렉션도 오프라인에서 재사용합니다.
 */
const CACHE = 'raft-village-v2';
const META_CACHE = CACHE + '-meta';
const ACTIVE_KEY = new URL('__pwa_active__', self.registration.scope).href;
const GENERATION_PREFIX = CACHE + '-gen-';
const GAME_URL = new URL('raft-village-3d.html', self.registration.scope);
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

// 앱 시작 쿼리·기존 즐겨찾기·정규 주소는 같은 게임 저장본을 사용합니다.
function cacheKey(input) {
  const url = new URL(typeof input === 'string' ? input : input.url, self.registration.scope);
  url.search = ''; url.hash = '';
  if (url.pathname === GAME_URL.pathname.replace(/\.html$/, '')) url.pathname = GAME_URL.pathname;
  return url.href;
}
function isPage(request, url) {
  return request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/') ||
    url.pathname === GAME_URL.pathname.replace(/\.html$/, '');
}
async function navigationResponse(response) {
  // 리디렉션된 Response를 내비게이션에 재사용하면 Chromium에서 ERR_FAILED가 납니다.
  // 네트워크 응답의 내용과 헤더를 보존해 재사용 가능한 일반 응답으로 저장합니다.
  const headers = new Headers(response.headers);
  headers.delete('content-encoding'); headers.delete('content-length');
  return new Response(await response.arrayBuffer(), {
    status: response.status, statusText: response.statusText, headers,
  });
}

// 실행 중인 저장본을 덮어쓰지 않고 완성된 세대를 한 번에 공개합니다.
// 작업자가 다시 시작되어도 같은 세대를 찾도록 포인터는 별도 캐시에 보관합니다.
async function activeCacheName() {
  const metadata = await caches.open(META_CACHE);
  const pointer = await metadata.match(ACTIVE_KEY);
  if (pointer) {
    const name = await pointer.text();
    if (name.startsWith(GENERATION_PREFIX) && (await caches.keys()).includes(name)) return name;
  }
  return CACHE; // 이전 v2 작업자의 저장본도 이어받을 수 있습니다.
}
let activeCachePromise;
function openActiveCache() {
  return activeCachePromise ||= activeCacheName().then(name => caches.open(name));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const nonce = [...crypto.getRandomValues(new Uint32Array(2))].map(n => n.toString(16)).join('-');
    const generation = GENERATION_PREFIX + Date.now() + '-' + nonce;
    const staged = await caches.open(generation);
    try {
      await Promise.all(CORE.map(async path => {
        const url = new URL(path, self.registration.scope);
        const response = await fetch(new Request(url, { cache: 'reload', redirect: 'follow' }));
        if (!response.ok) throw new Error(`Offline file unavailable: ${url.pathname} (${response.status})`);
        const stored = isPage(new Request(url), url) ? await navigationResponse(response) : response;
        await staged.put(cacheKey(url.href), stored);
      }));
      // 이 작은 쓰기가 성공하기 전에는 기존 세대의 내용과 포인터를 바꾸지 않습니다.
      // 중간 캐시 쓰기·용량 부족·포인터 확정 실패도 실행 중인 저장본에 영향을 주지 않습니다.
      const metadata = await caches.open(META_CACHE);
      await metadata.put(ACTIVE_KEY, new Response(generation, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      }));
    } catch (error) {
      await caches.delete(generation);
      throw error;
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const active = await activeCacheName();
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('raft-village-') &&
      name !== active && name !== META_CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

async function pageResponse(request, cache) {
  const key = cacheKey(request);
  try {
    // 내비게이션의 manual 설정 대신 리디렉션을 따라 정규 주소까지 가져옵니다.
    const response = await fetch(new Request(request, { redirect: 'follow' }));
    if (!response.ok) throw new Error(`Page unavailable: ${response.status}`);
    const normalized = await navigationResponse(response);
    // 저장 공간이 부족해도 정상 네트워크 페이지는 그대로 실행합니다.
    try { await cache.put(key, normalized.clone()); } catch (error) { /* 이전 오프라인 저장 유지 */ }
    return normalized;
  } catch (error) {
    return (await cache.match(key)) || (await cache.match(GAME_URL.href)) || Response.error();
  }
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const opened = openActiveCache();
  if (isPage(request, url)) {
    event.respondWith(opened.then(cache => pageResponse(request, cache)));
    return;
  }
  const key = cacheKey(request);
  const update = fetch(request).then(async response => {
    if (response.ok) {
      try { await (await opened).put(key, response.clone()); } catch (error) { /* 네트워크 응답은 유지 */ }
    }
    return response;
  });
  // 저장본을 반환한 뒤에도 갱신을 완료해 다음 실행에서 최신 파일을 사용합니다.
  event.waitUntil(update.then(() => undefined).catch(() => {}));
  event.respondWith(opened.then(async cache => (await cache.match(key)) || update));
});
