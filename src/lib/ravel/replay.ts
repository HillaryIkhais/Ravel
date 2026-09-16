import { type InputEvent } from '@/types/ravel';

export function generateReplayHtml(gameCode: string, events: InputEvent[]): string {
  const replayScript = buildReplayScript(events);

  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
  canvas { border: 1px solid #333; }
  #replay-overlay {
    position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8);
    color: #ff4444; padding: 8px 16px; border-radius: 6px; font-family: monospace;
    font-size: 14px; z-index: 9999; border: 1px solid #ff4444;
  }
  #replay-status {
    position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.8);
    color: #44ff44; padding: 8px 16px; border-radius: 6px; font-family: monospace;
    font-size: 14px; z-index: 9999; border: 1px solid #44ff44;
  }
</style>
</head>
<body>
<div id="replay-overlay">REPLAY MODE</div>
<div id="replay-status">Replaying ${events.length} events...</div>
<canvas id="gameCanvas" width="800" height="600"></canvas>
<script>
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Suppress real user input during replay
window.addEventListener('keydown', e => e.preventDefault());
window.addEventListener('mousedown', e => e.preventDefault());

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function dispatchEvent(event) {
  canvas.dispatchEvent(event);
  document.dispatchEvent(event);
  window.dispatchEvent(event);
}

// Game code
${gameCode}

// Replay script
(async function() {
  const status = document.getElementById('replay-status');
  try {
    ${replayScript}
    status.textContent = 'Replay complete';
    status.style.color = '#44ff44';
    status.style.borderColor = '#44ff44';
    window.__REPLAY_COMPLETE__ = true;
  } catch(e) {
    status.textContent = 'Replay error: ' + e.message;
    status.style.color = '#ff4444';
    window.__REPLAY_ERROR__ = e.message;
  }
})();
</script>
</body>
</html>`;
}

function buildReplayScript(events: InputEvent[]): string {
  const lines: string[] = [];
  let lastTimestamp = 0;

  for (const event of events) {
    const delayMs = Math.max(0, event.timestamp - lastTimestamp);
    lastTimestamp = event.timestamp;

    if (event.type === 'keydown' && event.key) {
      lines.push(`await delay(${delayMs});`);
      lines.push(`dispatchEvent(new KeyboardEvent('keydown', { key: '${escapeStr(event.key)}', code: '${escapeStr(event.code || '')}', bubbles: true }));`);
    } else if (event.type === 'keyup' && event.key) {
      lines.push(`await delay(${delayMs});`);
      lines.push(`dispatchEvent(new KeyboardEvent('keyup', { key: '${escapeStr(event.key)}', code: '${escapeStr(event.code || '')}', bubbles: true }));`);
    } else if (event.type === 'mousedown') {
      lines.push(`await delay(${delayMs});`);
      lines.push(`dispatchEvent(new MouseEvent('mousedown', { clientX: ${event.x || 0}, clientY: ${event.y || 0}, button: ${event.button || 0}, bubbles: true }));`);
    } else if (event.type === 'mouseup') {
      lines.push(`await delay(${delayMs});`);
      lines.push(`dispatchEvent(new MouseEvent('mouseup', { clientX: ${event.x || 0}, clientY: ${event.y || 0}, button: ${event.button || 0}, bubbles: true }));`);
    }
  }

  return lines.join('\n');
}

function escapeStr(s: string): string {
  return s.replace(/'/g, "\\'").replace(/\\/g, '\\\\');
}
