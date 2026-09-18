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

  var player = { x: 400, y: 300, r: 18, alive: true, vx: 0, vy: 0, squish: 1, angle: 0, dashCooldown: 0, dashTime: 0, trail: [], color: '#22d3ee' };
  var speed = 5, maxSpeed = 8;
  var keys = {};
  var enemies = [];
  var decoys = [];
  var particles = [];
  var screenShake = 0;
  var hitPause = 0;
  var score = 0;
  var spawnTimer = 0;
  var decoysUsed = 0;
  
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

  function spawnParticles(x, y, color, count, speed) {
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var spd = speed * (0.5 + Math.random() * 0.5);
      particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: 1, maxLife: 0.5 + Math.random() * 0.5,
        size: 3 + Math.random() * 4,
        color: color,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.3
      });
    }
  }

  function spawnEnemy() {
    var side = Math.floor(Math.random() * 4);
    var x = 0, y = 0;
    if (side === 0) { x = Math.random() * W; y = -40; }
    else if (side === 1) { x = W + 40; y = Math.random() * H; }
    else if (side === 2) { x = Math.random() * W; y = H + 40; }
    else { x = -40; y = Math.random() * H; }
    enemies.push({ 
      x: x, y: y, r: 14, speed: 2.8, memory: {}, 
      angle: 0, wobble: Math.random() * Math.PI * 2,
      confused: 0, targetDecoy: null,
      eyeOffset: 0, blinkTimer: 0
    });
  }

  function createDecoy(x, y) {
    decoys.push({ 
      x: x, y: y, timer: 300, 
      pulse: 0, wobble: 0,
      face: Math.random() > 0.5 ? 'wink' : 'smile'
    });
  }

  window.addEventListener('keydown', function (e) {
    keys[e.key] = true;
    if (e.key.indexOf('Arrow') === 0 || e.key === ' ' || 'wasd'.indexOf(e.key) >= 0) e.preventDefault();
    
    // Space to deploy decoy
    if (e.key === ' ' && decoys.length < 3 && player.alive) {
      createDecoy(player.x, player.y);
      decoysUsed++;
      // Little puff
      spawnParticles(player.x, player.y, '#22d3ee', 8, 3);
    }
    // Shift to dash
    if ((e.key === 'Shift' || e.key === 'Control') && player.dashCooldown <= 0 && player.alive) {
      player.dashTime = 0.15;
      player.dashCooldown = 1.5;
      var angle = Math.atan2(player.vy, player.vx) || 0;
      player.vx = Math.cos(angle) * 25;
      player.vy = Math.sin(angle) * 25;
      // Dash trail
      for (var i = 0; i < 12; i++) {
        var a = Math.atan2(player.vy, player.vx) + (Math.random() - 0.5) * 0.5;
        var s = 8 + Math.random() * 6;
        particles.push({
          x: player.x, y: player.y,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: 1, maxLife: 0.3, size: 4 + Math.random() * 3,
          color: '#22d3ee', rot: 0, rotSpeed: 0
        });
      }
    }
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });

  // Initial enemies - spawn more and closer to center so player sees them immediately
  for (var i = 0; i < 4; i++) {
    var angle = (i / 4) * Math.PI * 2;
    var dist = 200 + Math.random() * 100;
    enemies.push({
      x: 400 + Math.cos(angle) * dist,
      y: 300 + Math.sin(angle) * dist,
      r: 14, speed: 2.8, memory: {},
      angle: 0, wobble: Math.random() * Math.PI * 2,
      confused: 0, targetDecoy: null,
      eyeOffset: 0, blinkTimer: 0
    });
  }

  function update(dt) {
    if (hitPause > 0) { hitPause -= dt; return; }

    // Screen shake decay
    if (screenShake > 0) screenShake = Math.max(0, screenShake - dt * 15);

    // Player dash cooldown
    if (player.dashCooldown > 0) player.dashCooldown -= dt;

    // Dash time
    if (player.dashTime > 0) {
      player.dashTime -= dt;
      player.squish = 1.5;
    } else {
      player.squish = Math.min(1.2, player.squish + dt * 2);
    }

    // Player movement
    if (player.alive) {
      var ax = 0, ay = 0;
      if (keys.ArrowLeft || keys.a) ax -= 1;
      if (keys.ArrowRight || keys.d) ax += 1;
      if (keys.ArrowUp || keys.w) ay -= 1;
      if (keys.ArrowDown || keys.s) ay += 1;
      
      if (ax !== 0 || ay !== 0) {
        var len = Math.hypot(ax, ay);
        ax /= len; ay /= len;
        player.vx += ax * speed * dt * 60;
        player.vy += ay * speed * dt * 60;
        player.angle = Math.atan2(player.vy, player.vx);
      }

      // Friction
      player.vx *= 0.92;
      player.vy *= 0.92;

      // Clamp speed
      var spd = Math.hypot(player.vx, player.vy);
      if (spd > maxSpeed && player.dashTime <= 0) {
        player.vx = (player.vx / spd) * maxSpeed;
        player.vy = (player.vy / spd) * maxSpeed;
      }

      player.x += player.vx * dt * 60;
      player.y += player.vy * dt * 60;

      // Bounds with squish on wall hit
      if (player.x < player.r) { player.x = player.r; player.vx = -player.vx * 0.5; player.squish = 0.7; }
      if (player.x > W - player.r) { player.x = W - player.r; player.vx = -player.vx * 0.5; player.squish = 0.7; }
      if (player.y < player.r) { player.y = player.r; player.vy = -player.vy * 0.5; player.squish = 0.7; }
      if (player.y > H - player.r) { player.y = H - player.r; player.vy = -player.vy * 0.5; player.squish = 0.7; }

      // Trail
      player.trail.unshift({ x: player.x, y: player.y, life: 1, size: player.r });
      if (player.trail.length > 15) player.trail.pop();
    }

    // Update decoys
    for (var i = decoys.length - 1; i >= 0; i--) {
      var d = decoys[i];
      d.timer -= dt * 60;
      d.pulse += dt * 8;
      d.wobble += dt * 5;
      if (d.timer <= 0) {
        // Fade out particles
        spawnParticles(d.x, d.y, '#22d3ee66', 6, 2);
        decoys.splice(i, 1);
      }
    }

    // Update enemies
    spawnTimer += dt * 60;
    if (spawnTimer > 80 && enemies.length < 6) { spawnEnemy(); spawnTimer = 0; }

    var targetingPlayer = false;
    
    var state = { player: player, decoys: decoys, enemies: enemies };

    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      
      // Blink
      e.blinkTimer -= dt;
      if (e.blinkTimer <= 0) {
        e.blinkTimer = 2 + Math.random() * 4;
      }
      
      var decision = window.enemyDecision(e, state, e.memory);
      
      var dx = decision.targetX - e.x, dy = decision.targetY - e.y;
      var d = Math.hypot(dx, dy) || 1;
      
      // Face target
      e.angle = Math.atan2(dy, dx);
      
      // Check if targeting decoy
      var targetingDecoy = false;
      for (var d = 0; d < decoys.length; d++) {
        if (Math.hypot(decoys[d].x - decision.targetX, decoys[d].y - decision.targetY) < 5) {
          targetingDecoy = true;
          e.confused = Math.min(1, e.confused + dt * 3);
          e.targetDecoy = decoys[d];
          break;
        }
      }
      if (!targetingDecoy) e.confused = Math.max(0, e.confused - dt * 2);
      
      if (decision.isPlayer) targetingPlayer = true;

      // Move
      e.x += (dx / d) * e.speed * dt * 60;
      e.y += (dy / d) * e.speed * dt * 60;
      
      e.wobble += dt * 6;
      
      // Collisions
      if (player.alive && Math.hypot(player.x - e.x, player.y - e.y) < player.r + e.r) {
        window.__playerAttacked = true;
        player.alive = false;
        screenShake = 12;
        hitPause = 0.1;
        spawnParticles(player.x, player.y, '#ef4444', 25, 8);
        // Death particles
        for (var p = 0; p < 30; p++) {
          var a = Math.random() * Math.PI * 2;
          particles.push({
            x: player.x, y: player.y,
            vx: Math.cos(a) * (5 + Math.random() * 10),
            vy: Math.sin(a) * (5 + Math.random() * 10),
            life: 1, maxLife: 0.8, size: 3 + Math.random() * 5,
            color: ['#ef4444', '#f97316', '#fbbf24', '#ffffff'][Math.floor(Math.random() * 4)],
            rot: Math.random() * Math.PI * 2, rotSpeed: (Math.random() - 0.5) * 0.5
          });
        }
      }
      
      for (var j = decoys.length - 1; j >= 0; j--) {
        if (Math.hypot(decoys[j].x - e.x, decoys[j].y - e.y) < 18 + e.r) {
          window.__decoyAttacked = true;
          score += 100;
          // Decoy explosion
          spawnParticles(decoys[j].x, decoys[j].y, '#22d3ee', 20, 6);
          // Score popup
          particles.push({
            x: decoys[j].x, y: decoys[j].y - 20,
            vx: 0, vy: -30,
            life: 1, maxLife: 1, size: 0,
            color: '#22d3ee', text: '+100', isText: true
          });
          decoys.splice(j, 1);
          enemies.splice(i, 1);
          screenShake = 4;
          hitPause = 0.05;
          break;
        }
      }
    }

    // Update particles
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      if (p.isText) {
        p.y += p.vy * dt;
        p.vy *= 0.95;
      } else {
        p.x += p.vx * dt * 60;
        p.y += p.vy * dt * 60;
        p.vx *= 0.98; p.vy *= 0.98;
        p.rot += p.rotSpeed * dt * 60;
      }
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    window.__enemyTargetingPlayer = targetingPlayer;
  }

  function draw() {
    // Screen shake
    var shakeX = 0, shakeY = 0;
    if (screenShake > 0) {
      shakeX = (Math.random() - 0.5) * screenShake * 2;
      shakeY = (Math.random() - 0.5) * screenShake * 2;
    }
    
    ctx.save();
    ctx.translate(shakeX, shakeY);
    
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.02)';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    // Player trail
    for (var i = player.trail.length - 1; i >= 0; i--) {
      var t = player.trail[i];
      var alpha = t.life * 0.15;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = player.color;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.size * t.life * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Particles
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var alpha = p.life / p.maxLife;
      if (p.isText) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        for (var s = 0; s < 5; s++) {
          var a = (s / 5) * Math.PI * 2;
          var r = p.size * (p.life / p.maxLife);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;

    // Decoys
    for (var i = 0; i < decoys.length; i++) {
      var d = decoys[i];
      var pulseScale = 1 + Math.sin(d.pulse) * 0.15;
      var wobbleX = Math.sin(d.wobble) * 2;
      
      ctx.save();
      ctx.translate(d.x + wobbleX, d.y);
      ctx.scale(pulseScale, pulseScale);
      
      // Glow
      var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 25);
      grad.addColorStop(0, 'rgba(34,211,238,0.4)');
      grad.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(0, 0, 30, 0, Math.PI * 2); ctx.fill();
      
      // Body
      ctx.fillStyle = 'rgba(34,211,238,0.25)';
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      
      // Face
      ctx.fillStyle = '#22d3ee';
      if (d.face === 'wink') {
        // Wink
        ctx.beginPath(); ctx.arc(-5, -3, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(2, 2); ctx.quadraticCurveTo(5, 0, 8, 2); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        // Smile
        ctx.beginPath(); ctx.arc(-5, -3, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(5, -3, 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-4, 3); ctx.quadraticCurveTo(0, 6, 4, 3); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
      
      // Timer ring
      ctx.strokeStyle = 'rgba(34,211,238,' + (decoys[i].timer / 300) * 0.5 + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(d.x, d.y, 22, -Math.PI/2, -Math.PI/2 + (decoys[i].timer/300)*Math.PI*2); ctx.stroke();
    }

    // Enemies
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.angle);
      
      // Body wobble
      var wobbleScaleX = 1 + Math.sin(e.wobble) * 0.1;
      var wobbleScaleY = 1 - Math.sin(e.wobble) * 0.1;
      ctx.scale(wobbleScaleX, wobbleScaleY);
      
      // Targeting line (debug)
      if (e.targetDecoy) {
        ctx.strokeStyle = 'rgba(239,68,68,0.3)';
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(e.targetDecoy.x - e.x, e.targetDecoy.y - e.y); ctx.stroke();
        ctx.setLineDash([]);
      }
      
      // Body
      var bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 1.5);
      bodyGrad.addColorStop(0, '#ef4444');
      bodyGrad.addColorStop(1, '#7f1d1d');
      ctx.fillStyle = bodyGrad;
      
      // Body shape - rounded diamond
      ctx.beginPath();
      for (var s = 0; s < 8; s++) {
        var a = (s / 8) * Math.PI * 2;
        var r = e.r * (s % 2 === 0 ? 1 : 0.7);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      
      // Glow when confused
      if (e.confused > 0.3) {
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 15 * e.confused;
      }
      
      // Eyes
      var blink = e.blinkTimer > 3.8 || e.blinkTimer < 0.2;
      var eyeY = blink ? 0 : -3;
      var eyeScale = blink ? 0.1 : 1;
      
      // Left eye
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(-5, eyeY, 4 * eyeScale, 5 * eyeScale, 0, 0, Math.PI * 2); ctx.fill();
      // Pupil - looks at target
      var pupilX = Math.cos(e.angle) * 2;
      var pupilY = Math.sin(e.angle) * 2;
      if (!blink) {
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(-5 + pupilX, eyeY + pupilY, 2, 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      
      // Right eye
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(5, eyeY, 4 * eyeScale, 5 * eyeScale, 0, 0, Math.PI * 2); ctx.fill();
      if (!blink) {
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(5 + pupilX, eyeY + pupilY, 2, 2, 0, 0, Math.PI * 2); ctx.fill();
      }
      
      // Confused expression
      if (e.confused > 0.5) {
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 2;
        // Question mark above head
        ctx.font = 'bold 16px monospace';
        ctx.fillStyle = '#f97316';
        ctx.textAlign = 'center';
        ctx.fillText('?', 0, -e.r - 10 + Math.sin(Date.now() * 0.005) * 3);
      }
      
      // Angry eyebrows when targeting player
      if (!e.confused && e.targetDecoy === null) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(-2, -12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(7, -8); ctx.lineTo(2, -12); ctx.stroke();
      }
      
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Player
    if (player.alive) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);
      ctx.scale(player.squish, 1 / player.squish);
      
      // Dash trail glow
      if (player.dashTime > 0) {
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 20;
      }
      
      // Player body - triangle ship
      var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, player.r * 1.5);
      grad.addColorStop(0, player.color);
      grad.addColorStop(1, '#06b6d4');
      ctx.fillStyle = grad;
      
      ctx.beginPath();
      ctx.moveTo(player.r * 1.5, 0);
      ctx.lineTo(-player.r, -player.r);
      ctx.lineTo(-player.r * 0.5, 0);
      ctx.lineTo(-player.r, player.r);
      ctx.closePath();
      ctx.fill();
      
      // Cockpit
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath(); ctx.ellipse(0, 0, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
      
      // Engine glow
      if (Math.hypot(player.vx, player.vy) > 1) {
        var engineGrad = ctx.createRadialGradient(-player.r * 0.8, 0, 0, -player.r * 0.8, 0, 15);
        engineGrad.addColorStop(0, '#22d3ee');
        engineGrad.addColorStop(1, 'rgba(34,211,238,0)');
        ctx.fillStyle = engineGrad;
        ctx.beginPath(); ctx.ellipse(-player.r * 1.2, 0, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
      }
      
      ctx.shadowBlur = 0;
      ctx.restore();
    } else {
      // Dead text
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 32px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('PRESS ENTER TO RESPAWN', W/2, H/2);
    }

    // UI
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('ARROWS/WASD: MOVE  |  SPACE: DECOY (' + (3 - decoys.length) + '/3)  |  SHIFT: DASH', 16, H - 16);
    
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('SCORE: ' + score, W - 16, 36);
    
    ctx.fillStyle = '#ef4444';
    ctx.font = '14px monospace';
    ctx.fillText('DECOYS USED: ' + decoysUsed, W - 16, 56);
    
    if (!player.alive) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 48px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DESTROYED', W/2, H/2 - 20);
      ctx.fillStyle = '#fff';
      ctx.font = '16px monospace';
      ctx.fillText('Press ENTER to respawn', W/2, H/2 + 30);
    }
    
    ctx.restore(); // screen shake
  }

  var lastTime = performance.now();
  function loop(now) {
    var dt = (now - lastTime) / 1000;
    lastTime = now;
    if (dt > 0.1) dt = 0.1;
    
    update(dt);
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
  
  // Respawn on Enter
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !player.alive) {
      player.alive = true;
      player.x = 400; player.y = 300;
      player.vx = 0; player.vy = 0;
      enemies = []; decoys = []; particles = [];
      spawnEnemy(); spawnEnemy();
      window.__playerAttacked = false;
      window.__decoyAttacked = false;
    }
  });
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
