/* ---------- 3D 장면 ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('world').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const SKY_DAY = new THREE.Color(0x8fd8ef), SKY_DUSK = new THREE.Color(0xd99a7c), SKY_NIGHT = new THREE.Color(0x1a2740);
scene.background = SKY_DAY.clone();
scene.fog = new THREE.Fog(0x8fbfcc, 20, 54);
// 직교 아이소메트릭: 멀리 있는 시설도 같은 비율로 보여 주는 모바일 타이쿤 구도.
const camera = new THREE.OrthographicCamera(-6, 6, 8, -8, 0.1, 160);
const cameraFocus = new THREE.Vector3(5, 0.3, 3.75);
const cameraOffset = new THREE.Vector3(12, 16, 12);
camera.position.copy(cameraFocus).add(cameraOffset); camera.lookAt(cameraFocus);
const hemi = new THREE.HemisphereLight(0xeafaff, 0xb8b08a, 0.8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffedcc, 0.85);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
sun.shadow.radius = 2.5;
scene.add(sun, sun.target);
// 밤에 켜지는 불빛: 화로, 등대, 주인공 주변
const lampGrill = new THREE.PointLight(0xffa04a, 0, 7), lampTower = new THREE.PointLight(0xffe2a0, 0, 16), lampPlayer = new THREE.PointLight(0xffd9a0, 0, 6);
scene.add(lampGrill, lampTower, lampPlayer);
// 뗏목과 그 위의 모든 것: 파도에 함께 들썩임
const world = new THREE.Group(); scene.add(world);
let raftY = 0, frameDt = 0.016;
let DPR = 1;
const viewportHost = $('world');
// Safari의 주소창·회전으로 CSS 화면 크기가 바뀌어도 캔버스가 예전 px 폭에 묶이지 않게 합니다.
const viewportHeight = window.CSS?.supports('height', '100dvh') ? '100dvh' : '100%';
viewportHost.style.height = cv.style.height = viewportHeight;
renderer.domElement.style.width = renderer.domElement.style.height = '100%';
renderer.domElement.style.position = 'absolute'; renderer.domElement.style.inset = '0';
function resize() {
  // 핀치 확대 시 visualViewport.width는 줄어듭니다. 렌더 크기는 CSS 레이아웃을 기준으로 유지합니다.
  const bounds = viewportHost.getBoundingClientRect();
  const width = Math.max(1, Math.round(bounds.width || document.documentElement.clientWidth || innerWidth));
  const height = Math.max(1, Math.round(bounds.height || innerHeight));
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  if (W === width && H === height && DPR === pixelRatio &&
      cv.width === Math.floor(width * pixelRatio) && cv.height === Math.floor(height * pixelRatio) &&
      cv.style.width === `${width}px` && cv.style.height === `${height}px` &&
      renderer.domElement.width === cv.width && renderer.domElement.height === cv.height &&
      renderer.domElement.style.width === '100%' && renderer.domElement.style.height === '100%') return;
  W = width; H = height; DPR = pixelRatio;
  cv.style.width = `${W}px`; cv.style.height = `${H}px`;
  cv.width = Math.floor(W * DPR); cv.height = Math.floor(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  Z = Math.max(0.92, Math.min(1.2, W / 390));
  const aspect = W / H;
  // 세로 화면에서는 약 8칸 폭을 유지해 캐릭터가 실제 휴대폰에서도 큼직하게 보입니다.
  const viewHeight = aspect < 0.8 ? 8.3 / aspect : aspect > 1.8 ? 10 : 13;
  camera.left = -viewHeight * aspect / 2; camera.right = -camera.left;
  camera.top = viewHeight / 2; camera.bottom = -camera.top;
  if (renderer.getPixelRatio() !== DPR) renderer.setPixelRatio(DPR);
  renderer.setSize(W, H, false); camera.updateProjectionMatrix();
  renderer.domElement.style.width = renderer.domElement.style.height = '100%';
  window.dispatchEvent(new Event('gameviewportresize'));
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
window.addEventListener('pageshow', resize);
window.visualViewport?.addEventListener('resize', resize);
window.visualViewport?.addEventListener('scroll', resize);
document.addEventListener('visibilitychange', () => { if (!document.hidden) resize(); });
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(viewportHost);
function watchPixelRatio() {
  window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener?.('change', () => {
    resize(); watchPixelRatio();
  }, { once: true });
}
watchPixelRatio();
resize();
