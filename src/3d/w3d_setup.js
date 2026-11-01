/* ---------- 3D 장면 ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('world').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const SKY_DAY = new THREE.Color(0x7cc6e0), SKY_DUSK = new THREE.Color(0xd99a7c), SKY_NIGHT = new THREE.Color(0x1a2740);
scene.background = SKY_DAY.clone();
scene.fog = new THREE.Fog(0x8fbfcc, 20, 54);
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 240);
const hemi = new THREE.HemisphereLight(0xd6eeff, 0x2a4656, 0.45); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d8, 1.05);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.025;
scene.add(sun, sun.target);
// 밤에 켜지는 불빛: 화로, 등대, 주인공 주변
const lampGrill = new THREE.PointLight(0xffa04a, 0, 7), lampTower = new THREE.PointLight(0xffe2a0, 0, 16), lampPlayer = new THREE.PointLight(0xffd9a0, 0, 6);
scene.add(lampGrill, lampTower, lampPlayer);
// 뗏목과 그 위의 모든 것: 파도에 함께 들썩임
const world = new THREE.Group(); scene.add(world);
let raftY = 0, frameDt = 0.016;
let DPR = 1;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  Z = Math.max(0.72, Math.min(1.3, Math.min(W, H * 0.7) / 500));
  renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
