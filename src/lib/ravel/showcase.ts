import { injectRecordingHarness } from './harness';
import { wrapGameHtml } from './html';
import { type OracleCondition } from '@/types/ravel';

export const SHOWCASE_VERSION_BASE = 6;
export const SHOWCASE_HUNT_BASE = 3; 

const SHOWCASE_GAME_CODE = `
(function () {
  var canvas = document.getElementById('gameCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = 800, H = 600;

  window.__plExpose = ['__decoyAttacked', '__playerAttacked', '__enemyTargetingPlayer'];
  window.__decoyAttacked = false;
  window.__playerAttacked = false;
  window.__enemyTargetingPlayer = false;

  var player = { x: 400, y: 300, r: 15, alive: true };
  var speed = 4;
  var keys = {};
  var enemies = [];
  var decoys = [];
  var spawnTimer = 0;
  
  // The boundary function. AI will patch this.
  // state: { enemies, decoys, player }
  // memory: persistent object per enemy
  window.enemyDecision = function(enemy, state, memory) {
    // Current Bug: Enemy always targets the nearest entity, even if it's a decoy.
    var target = state.player;
    var minDist = Infinity;
    
    // Check decoys
    for (var i = 0; i < state.decoys.length; i++) {
      var d = state.decoys[i];
      var dist = Math.hypot(d.x - enemy.x, d.y - enemy.y);
      if (dist < minDist) {
        minDist = dist;
        target = d;
      }
    }
    
    // Check player
    var pDist = Math.hypot(state.player.x - enemy.x, state.player.y - enemy.y);
    if (pDist < minDist) {
      target = state.player;
    }
    
    return { targetX: target.x, targetY: target.y, isPlayer: target === state.player };
  };

  window.addEventListener('keydown', function (e) {
    keys[e.key] = true;
    if (e.key.indexOf('Arrow') === 0 || e.key === ' ' || 'wasd'.indexOf(e.key) >= 0) e.preventDefault();
    
    // Space to deploy decoy
    if (e.key === ' ' && decoys.length < 3 && player.alive) {
      decoys.push({ x: player.x, y: player.y, timer: 300 });
    }
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });

  function spawnEnemy() {
    var side = Math.floor(Math.random() * 4);
    var x = 0, y = 0;
    if (side === 0) { x = Math.random() * W; y = -30; }
    else if (side === 1) { x = W + 30; y = Math.random() * H; }
    else if (side === 2) { x = Math.random() * W; y = H + 30; }
    else { x = -30; y = Math.random() * H; }
    enemies.push({ x: x, y: y, r: 12, speed: 2.5, memory: {} });
  }

  // Spawn an initial enemy quickly
  spawnEnemy();

  function update() {
    if (player.alive) {
      if (keys.ArrowLeft || keys.a) player.x -= speed;
      if (keys.ArrowRight || keys.d) player.x += speed;
      if (keys.ArrowUp || keys.w) player.y -= speed;
      if (keys.ArrowDown || keys.s) player.y += speed;
      player.x = Math.max(20, Math.min(W - 20, player.x));
      player.y = Math.max(20, Math.min(H - 20, player.y));
    }

    // Update decoys
    for (var i = decoys.length - 1; i >= 0; i--) {
      decoys[i].timer--;
      if (decoys[i].timer <= 0) decoys.splice(i, 1);
    }

    spawnTimer++;
    if (spawnTimer > 120 && enemies.length < 3) { spawnEnemy(); spawnTimer = 0; }

    var targetingPlayer = false;
    
    var state = { player: player, decoys: decoys, enemies: enemies };

    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      var decision = window.enemyDecision(e, state, e.memory);
      
      var dx = decision.targetX - e.x, dy = decision.targetY - e.y;
      var d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * e.speed;
      e.y += (dy / d) * e.speed;
      
      if (decision.isPlayer) targetingPlayer = true;

      // Collisions
      if (player.alive && Math.hypot(player.x - e.x, player.y - e.y) < player.r + e.r) {
        window.__playerAttacked = true;
        player.alive = false;
      }
      
      for (var j = decoys.length - 1; j >= 0; j--) {
        if (Math.hypot(decoys[j].x - e.x, decoys[j].y - e.y) < 15 + e.r) {
          window.__decoyAttacked = true;
          decoys.splice(j, 1);
          enemies.splice(i, 1);
          break;
        }
      }
    }
    
    window.__enemyTargetingPlayer = targetingPlayer;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (var gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    // Decoys
    for (var i = 0; i < decoys.length; i++) {
      var dc = decoys[i];
      ctx.fillStyle = 'rgba(34,211,238,0.3)';
      ctx.beginPath(); ctx.arc(dc.x, dc.y, 15, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#22d3ee'; ctx.stroke();
      ctx.fillStyle = '#22d3ee';
      ctx.font = '10px monospace';
      ctx.fillText('DECOY', dc.x - 14, dc.y - 20);
    }

    // Player
    if (player.alive) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.fillStyle = '#22d3ee';
      ctx.beginPath();
      ctx.moveTo(0, -15); ctx.lineTo(12, 12); ctx.lineTo(0, 5); ctx.lineTo(-12, 12);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = '#ef4444';
      ctx.font = '24px monospace';
      ctx.fillText('DESTROYED', W/2 - 60, H/2);
    }

    // Enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px monospace';
    ctx.fillText('ARROWS to move. SPACE to drop decoy.', 16, H - 16);
  }

  function loop() {
    update();
    draw();
    if (window.__plIncrementFrame) window.__plIncrementFrame();
    requestAnimationFrame(loop);
  }

  function boot() {
    if (window.__plReportState) window.__plReportState({ tracking: window.__enemyTargetingPlayer });
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
    'Enemy targets decoy instead of player. After fix, enemy should ignore decoys and go straight for player.',
  statePath: '',
  operator: 'equals',
  bugValue: null,
  fixedValue: null,
  fixedOperator: 'equals',
  evalExpression: 'window.__decoyAttacked === true', // BUG side: Decoy is attacked
  fixedExpression: 'window.__decoyAttacked === false && window.__playerAttacked === true', // FIX side: Player is attacked, decoy ignored
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
    gameTitle: 'AI Survival Arena',
    code,
    html: wrapGameHtml(code),
    versionBase: SHOWCASE_VERSION_BASE,
    huntBase: SHOWCASE_HUNT_BASE,
    huntTitle: 'BREAK THE ENEMY AI',
    huntObjective:
      'Bait the enemy into attacking your decoy. When you see it fall for the decoy, you win.',
    huntDifficulty: 'medium',
    huntReward: 2.4,
    huntExpectedBehavior: 'Enemy ignores decoys and relentlessly pursues the player.',
    oracle: SHOWCASE_ORACLE,
  };
}
