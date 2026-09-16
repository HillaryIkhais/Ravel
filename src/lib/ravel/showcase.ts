import { injectRecordingHarness } from './harness';
import { wrapGameHtml } from './html';
import { type OracleCondition } from '@/types/ravel';

/**
 * RAVEL Showcase — a deterministic, known-good demo.
 *
 * The demo must NOT depend on GPT randomly producing a perfect game.
 * This is the seed used by "LAUNCH DEMO": a hand-written buggy build,
 * a fixed hunt, and a machine-checkable two-sided oracle.
 *
 * Bug: enemies are supposed to chase your ship. In v0 they lock onto a
 * stale corner forever, so they stream away from you. The oracle proves
 * it both ways:
 *   - bug side:  3+ enemies exist and ZERO are targeting you (__trackDead)
 *   - fix side:  3+ enemies exist and ALL are chasing you (__tracking)
 */

export const SHOWCASE_VERSION_BASE = 11;
export const SHOWCASE_HUNT_BASE = 3; // first demo hunt displays as HUNT #04

const SHOWCASE_GAME_CODE = `
(function () {
  var canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 800, H = 600;

  // RAVEL: expose oracle state to the verification harness
  window.__plExpose = ['__tracking', '__trackDead', '__homingActive', '__homingTotal'];
  window.__tracking = false;
  window.__trackDead = false;
  window.__homingActive = 0;
  window.__homingTotal = 0;

  var player = { x: 400, y: 330, r: 15 };
  var speed = 3.4;
  var keys = {};
  var enemies = [];
  var maxEnemies = 6;
  var spawnTimer = 0;

  // THE BUG: enemies lock onto a fixed corner and never re-target the player.
  var CORNER = { x: W - 30, y: 30 };

  window.addEventListener('keydown', function (e) {
    keys[e.key] = true;
    if (e.key.indexOf('Arrow') === 0 || e.key === ' ' || 'wasd'.indexOf(e.key) >= 0) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });

  function spawnEnemy() {
    var side = Math.floor(Math.random() * 4);
    var x = 0, y = 0;
    if (side === 0) { x = 40 + Math.random() * (W - 80); y = -30; }
    else if (side === 1) { x = W + 30; y = 40 + Math.random() * (H - 80); }
    else if (side === 2) { x = 40 + Math.random() * (W - 80); y = H + 30; }
    else { x = -30; y = 40 + Math.random() * (H - 80); }
    enemies.push({ x: x, y: y, r: 13, speed: 1.4 + Math.random() * 0.7, tx: CORNER.x, ty: CORNER.y });
  }

  function update() {
    if (keys.ArrowLeft || keys.a) player.x -= speed;
    if (keys.ArrowRight || keys.d) player.x += speed;
    if (keys.ArrowUp || keys.w) player.y -= speed;
    if (keys.ArrowDown || keys.s) player.y += speed;
    player.x = Math.max(24, Math.min(W - 24, player.x));
    player.y = Math.max(24, Math.min(H - 24, player.y));

    spawnTimer++;
    if (spawnTimer > 55 && enemies.length < maxEnemies) { spawnEnemy(); spawnTimer = 0; }

    // BUG: every enemy flies toward its locked corner target (tx/ty),
    // never re-targeting the player.
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      var dx = e.tx - e.x, dy = e.ty - e.y;
      var d = Math.sqrt(dx * dx + dy * dy) || 1;
      e.x += (dx / d) * e.speed;
      e.y += (dy / d) * e.speed;
    }

    // Oracle bookkeeping
    var live = enemies.length;
    var homing = 0;
    for (var j = 0; j < live; j++) {
      var b = enemies[j];
      var vx = b.tx - b.x, vy = b.ty - b.y;
      var hx = player.x - b.x, hy = player.y - b.y;
      var vn = Math.sqrt(vx * vx + vy * vy) || 1;
      var hn = Math.sqrt(hx * hx + hy * hy) || 1;
      if ((vx * hx + vy * hy) / (vn * hn) > 0.85) homing++;
    }
    window.__homingTotal = live;
    window.__homingActive = homing;
    window.__tracking = live > 0 && homing >= live;
    window.__trackDead = live > 0 && homing === 0;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    // player ship
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(0, -20); ctx.lineTo(14, 14); ctx.lineTo(0, 6); ctx.lineTo(-14, 14);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(34,211,238,0.12)';
    ctx.beginPath(); ctx.arc(player.x, player.y, 26, 0, Math.PI * 2); ctx.fill();

    // where the bugs are actually flying (stale target)
    ctx.strokeStyle = 'rgba(248,113,113,0.4)';
    ctx.setLineDash([4, 6]);
    ctx.strokeRect(CORNER.x - 22, CORNER.y - 22, 44, 44);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(248,113,113,0.75)';
    ctx.font = '10px monospace';
    ctx.fillText('STALE TARGET', CORNER.x - 62, CORNER.y - 30);

    // enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      ctx.save();
      ctx.translate(e.x, e.y);
      var ang = Math.atan2(e.ty - e.y, e.tx - e.x);
      ctx.rotate(ang);
      ctx.fillStyle = '#f87171';
      ctx.beginPath();
      ctx.moveTo(16, 0); ctx.lineTo(-9, 9); ctx.lineTo(-9, -9);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(248,113,113,0.5)';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px monospace';
    ctx.fillText('ARROWS / WASD to fly. Enemies should HUNT YOU.', 16, H - 16);
  }

  function loop() {
    update();
    draw();
    if (window.__plIncrementFrame) window.__plIncrementFrame();
    requestAnimationFrame(loop);
  }

  function boot() {
    if (window.__plReportState) window.__plReportState({ tracking: window.__tracking });
    requestAnimationFrame(loop);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
`;

export const SHOWCASE_ORACLE: OracleCondition = {
  description:
    '3+ enemies exist and NONE are targeting your ship (bug proven). After the fix, 3+ enemies exist and ALL are chasing you.',
  statePath: '',
  operator: 'equals',
  bugValue: null,
  fixedValue: null,
  fixedOperator: 'equals',
  evalExpression: 'window.__homingTotal >= 3 && window.__trackDead === true',
  fixedExpression: 'window.__homingTotal >= 3 && window.__tracking === true',
};

export interface ShowcaseSeed {
  gameTitle: string;
  code: string;
  html: string;
  versionBase: number;
  huntBase: number;
  huntTitle: string;
  huntObjective: string;
  huntDifficulty: 'easy' | 'medium' | 'hard';
  huntReward: number;
  huntExpectedBehavior: string;
  oracle: OracleCondition;
}

export function createShowcaseSeed(): ShowcaseSeed {
  const code = injectRecordingHarness(SHOWCASE_GAME_CODE);
  return {
    gameTitle: 'Enemy Targeting',
    code,
    html: wrapGameHtml(code),
    versionBase: SHOWCASE_VERSION_BASE,
    huntBase: SHOWCASE_HUNT_BASE,
    huntTitle: 'Break the enemy targeting',
    huntObjective:
      'Enemies are supposed to chase your ship. Fly anywhere, then hold still and let 3 enemies spawn. If they stream to the top-right corner and never come for you, you have found the bug.',
    huntDifficulty: 'medium',
    huntReward: 2.4,
    huntExpectedBehavior: 'Enemies continuously re-target your ship and chase it across the screen.',
    oracle: SHOWCASE_ORACLE,
  };
}