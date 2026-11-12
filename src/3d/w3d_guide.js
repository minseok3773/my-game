/* ---------- 미션 길 안내: 바닥 점선 · 화면 밖 화살표 · 안내문 눌러 위치 미리 보기 ---------- */
const GUIDE_ARRIVE_DIST = 1.3;        // 이만큼 가까우면 점선을 숨깁니다(목표 칸 위)
const GUIDE_PEEK_SECONDS = 2.2;       // 안내문을 누르면 카메라가 목표를 비추는 시간(이동·복귀 포함)
// 카메라 미리 보기 상태: 화면 갱신 중 언제든 읽히므로 var로 둡니다.
var guidePeek = { t: 0, x: 0, y: 0 };

function guideColor(obj, a) {
  const rgb = raidOn ? '255,130,110' : /짓기|업그레이드/.test(obj.text) ? '255,200,90' : '90,225,215';
  return `rgba(${rgb},${a})`;
}
function guideActive(obj) {
  return obj && isHeroAvailable() && dist(player.x, player.y, obj.x, obj.y) > GUIDE_ARRIVE_DIST;
}

// 1) 주인공 → 목표 칸까지 바닥에 흐르는 점선 (가까워질수록 짧아짐)
function drawGuidePath(obj) {
  if (!guideActive(obj)) return;
  const d = dist(player.x, player.y, obj.x, obj.y);
  const k0 = Math.min(0.45, d * 0.3) / d, k1 = 1 - Math.min(0.55, d * 0.3) / d;
  const ax = player.x + (obj.x - player.x) * k0, ay = player.y + (obj.y - player.y) * k0;
  const bx = player.x + (obj.x - player.x) * k1, by = player.y + (obj.y - player.y) * k1;
  const a = S(ax, ay, 1), b = S(bx, by, 1);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.setLineDash([3 * Z, 13 * Z]); ctx.lineDashOffset = -G.t * 34 * Z;
  ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 9 * Z;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.strokeStyle = guideColor(obj, 1); ctx.lineWidth = 5.5 * Z;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.restore();
}

// 2) 목표가 화면 밖이면 가장자리에 방향 화살표 + 남은 거리
function drawGuideEdge(obj) {
  if (!guideActive(obj)) return;
  const t = S(obj.x, obj.y), pad = 34 * Z;
  const top = Math.min(220, H * 0.3), bottom = H - Math.min(230, H * 0.3);
  if (t.x > pad && t.x < W - pad && t.y > top && t.y < bottom) return;
  const p = S(player.x, player.y);
  const ang = Math.atan2(t.y - p.y, t.x - p.x);
  const cx = Math.max(pad, Math.min(W - pad, t.x)), cy = Math.max(top, Math.min(bottom, t.y));
  const meters = Math.max(1, Math.round(dist(player.x, player.y, obj.x, obj.y)));
  const pulse = 1 + Math.sin(G.t * 6) * 0.08, r = 21 * Z;
  ctx.save(); ctx.translate(cx, cy);
  ctx.save(); ctx.rotate(ang); ctx.scale(pulse, pulse);
  ctx.fillStyle = guideColor(obj, 1); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * Z; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(r + 13 * Z, 0); ctx.lineTo(r - 2 * Z, -11 * Z); ctx.lineTo(r - 2 * Z, 11 * Z); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.96)'; ctx.strokeStyle = guideColor(obj, 1); ctx.lineWidth = 3 * Z;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
  const icon = [...(obj.text || '').trim()][0] || '⭐';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${14 * Z}px sans-serif`; ctx.fillText(/\p{Extended_Pictographic}/u.test(icon) ? icon : '⭐', 0, -4 * Z);
  ctx.font = `${10 * Z}px "Do Hyeon", sans-serif`; ctx.fillStyle = '#2c4a52'; ctx.fillText(`${meters}m`, 0, 11 * Z);
  ctx.restore();
}

// 3) 위쪽 안내문을 누르면 카메라가 목표 칸을 잠깐 비추고 돌아옵니다.
function startGuidePeek() {
  if (typeof objective !== 'function') return;
  const obj = objective();
  if (!obj) return;
  guidePeek.x = obj.x; guidePeek.y = obj.y; guidePeek.t = GUIDE_PEEK_SECONDS;
}
// 카메라가 따라갈 지점: 미리 보기 중이면 목표, 아니면 주인공
function guideCameraTarget(dt) {
  if (guidePeek.t > 0) {
    guidePeek.t = Math.max(0, guidePeek.t - dt);
    // 마지막 0.6초는 주인공에게 돌아오는 구간
    if (guidePeek.t > 0.6) return { x: guidePeek.x, y: guidePeek.y, speed: 5 };
    return { x: player.x, y: player.y, speed: 5 };
  }
  return { x: player.x, y: player.y, speed: 8 };
}
(() => {
  const goal = $('goal');
  goal.classList.add('peekable');
  goal.title = '눌러서 목표 위치 보기';
  goal.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); startGuidePeek(); });
})();
