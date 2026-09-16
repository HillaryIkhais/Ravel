/**
 * RAVEL Recording & Replay Harness
 *
 * Injected into every generated game to enable:
 * 1. Event capture via postMessage to parent
 * 2. Deterministic replay via scripted event injection
 * 3. Game state snapshots for pass/fail detection
 */

export function injectRecordingHarness(code: string): string {
  return `
// === RAVEL HARNESS START ===
(function() {
  const __pl = {
    events: [],
    snapshots: [],
    frame: 0,
    recording: false,
    replaying: false,
    replayQueue: [],
    gameState: null,
  };

  // Capture keyboard events
  window.addEventListener('keydown', function(e) {
    if (__pl.replaying) return;
    __pl.events.push({
      type: 'keydown',
      key: e.key,
      code: e.code,
      timestamp: Date.now(),
      frame: __pl.frame,
    });
    // Report to parent
    window.parent.postMessage({ type: 'pl-event', event: __pl.events[__pl.events.length - 1] }, '*');
  });

  window.addEventListener('keyup', function(e) {
    if (__pl.replaying) return;
    __pl.events.push({
      type: 'keyup',
      key: e.key,
      code: e.code,
      timestamp: Date.now(),
      frame: __pl.frame,
    });
    window.parent.postMessage({ type: 'pl-event', event: __pl.events[__pl.events.length - 1] }, '*');
  });

  // Capture mouse events on canvas
  var canvas = document.getElementById('gameCanvas');
  if (canvas) {
    canvas.addEventListener('mousedown', function(e) {
      if (__pl.replaying) return;
      var rect = canvas.getBoundingClientRect();
      __pl.events.push({
        type: 'mousedown',
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        button: e.button,
        timestamp: Date.now(),
        frame: __pl.frame,
      });
      window.parent.postMessage({ type: 'pl-event', event: __pl.events[__pl.events.length - 1] }, '*');
    });

    canvas.addEventListener('mouseup', function(e) {
      if (__pl.replaying) return;
      var rect = canvas.getBoundingClientRect();
      __pl.events.push({
        type: 'mouseup',
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        button: e.button,
        timestamp: Date.now(),
        frame: __pl.frame,
      });
      window.parent.postMessage({ type: 'pl-event', event: __pl.events[__pl.events.length - 1] }, '*');
    });
  }

  // Frame counter (called by game loop if available)
  window.__plIncrementFrame = function() { __pl.frame++; };

  // State snapshot reporter — game code can call this
  window.__plReportState = function(state) {
    __pl.gameState = state;
    window.parent.postMessage({
      type: 'pl-snapshot',
      snapshot: { frame: __pl.frame, timestamp: Date.now(), state: state }
    }, '*');
  };

  // Game over detector — game code can call this
  window.__plGameOver = function(result) {
    window.parent.postMessage({
      type: 'pl-gameover',
      result: result  // 'win', 'lose', 'error', or custom string
    }, '*');
  };

  // === ORACLE STATE EXPOSURE ===
  // Periodically capture game state for oracle evaluation
  var __plStatePoller = null;

  function __plCloneVar(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(function (x) { return __plCloneVar(x); });
    // capture functions by name, never by source
    if (typeof v === 'function') return String(v.name || '').length ? v.name : undefined;
    var out = {};
    var keys = Object.keys(v).slice(0, 40);
    for (var i = 0; i < keys.length; i++) {
      var val = v[keys[i]];
      if (val === null || typeof val !== 'object') {
        if (typeof val !== 'function') out[keys[i]] = val;
      } else if (typeof val === 'object') {
        out[keys[i]] = __plCloneVar(val);
      }
    }
    return out;
  }

  function __plCaptureState() {
    var state = {};
    // Read common game variables
    var candidates = [
      'score', 'lives', 'health', 'hp', 'player', 'enemy', 'enemies',
      'target', 'targets', 'gameOver', 'gameWon', 'gamePaused',
      'playerX', 'playerY', 'enemyX', 'enemyY', 'bullets', 'projectiles',
      'level', 'wave', 'combo', 'multiplier', 'ammo', 'shield',
      'speed', 'damage', 'power', 'coins', 'gems', 'items',
      '__tracking', '__trackDead', '__homingActive', '__homingTotal'
    ];
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (typeof window[candidates[i]] !== 'undefined' && window[candidates[i]] !== null) {
          state[candidates[i]] = __plCloneVar(window[candidates[i]]);
        }
      } catch(e) {}
    }
    // Game-declared oracle variables (window.__plExpose)
    try {
      var extra = window.__plExpose;
      if (Array.isArray(extra)) {
        for (var xi = 0; xi < extra.length; xi++) {
          var name = extra[xi];
          try {
            if (typeof window[name] !== 'undefined' && window[name] !== null) {
              state[name] = __plCloneVar(window[name]);
            }
          } catch(e) {}
        }
      }
    } catch(e) {}
    // Also check nested common patterns
    return state;
  }

  // Start polling for state
  __plStatePoller = setInterval(function() {
    try {
      var state = __plCaptureState();
      window.__plLastState = state;
      window.parent.postMessage({ type: 'pl-state', state: state }, '*');
    } catch(e) {}
  }, 200);

  // Parent can request immediate state snapshot
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'pl-request-state') {
      var state = __plCaptureState();
      window.__plLastState = state;
      window.parent.postMessage({ type: 'pl-state', state: state }, '*');
    }
  });

  // Error catcher
  window.addEventListener('error', function(e) {
    window.__plError = e.message;
    window.parent.postMessage({
      type: 'pl-error',
      error: e.message,
      filename: e.filename,
      lineno: e.lineno,
    }, '*');
  });

  // Request events from parent (for replay mode)
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'pl-replay-events') {
      __pl.replaying = true;
      __pl.replayQueue = e.data.events;
      __pl.replayIndex = 0;
      __pl.replayStartTime = Date.now();

      function replayNext() {
        if (__pl.replayIndex >= __pl.replayQueue.length) {
          window.parent.postMessage({ type: 'pl-replay-done' }, '*');
          return;
        }

        var evt = __pl.replayQueue[__pl.replayIndex];
        var delay = evt.timestamp - (__pl.replayIndex > 0 ? __pl.replayQueue[__pl.replayIndex - 1].timestamp : 0);

        setTimeout(function() {
          if (evt.type === 'keydown') {
            canvas.dispatchEvent(new KeyboardEvent('keydown', { key: evt.key, code: evt.code, bubbles: true }));
          } else if (evt.type === 'keyup') {
            canvas.dispatchEvent(new KeyboardEvent('keyup', { key: evt.key, code: evt.code, bubbles: true }));
          } else if (evt.type === 'mousedown') {
            canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: evt.x, clientY: evt.y, button: evt.button, bubbles: true }));
          } else if (evt.type === 'mouseup') {
            canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: evt.x, clientY: evt.y, button: evt.button, bubbles: true }));
          }
          __pl.replayIndex++;
          replayNext();
        }, Math.min(delay, 50)); // Cap delay for speed
      }

      replayNext();
    }
  });

  // Expose for manual replay
  window.__plStartReplay = function(events) {
    __pl.replaying = true;
    __pl.replayQueue = events;
    __pl.replayIndex = 0;

    function next() {
      if (__pl.replayIndex >= events.length) {
        window.parent.postMessage({ type: 'pl-replay-done' }, '*');
        return;
      }
      var evt = events[__pl.replayIndex];
      var delay = evt.timestamp - (__pl.replayIndex > 0 ? events[__pl.replayIndex - 1].timestamp : 0);
      setTimeout(function() {
        if (evt.type === 'keydown' && canvas) {
          canvas.dispatchEvent(new KeyboardEvent('keydown', { key: evt.key, code: evt.code, bubbles: true }));
        } else if (evt.type === 'keyup' && canvas) {
          canvas.dispatchEvent(new KeyboardEvent('keyup', { key: evt.key, code: evt.code, bubbles: true }));
        } else if (evt.type === 'mousedown' && canvas) {
          canvas.dispatchEvent(new MouseEvent('mousedown', { clientX: evt.x, clientY: evt.y, button: evt.button, bubbles: true }));
        } else if (evt.type === 'mouseup' && canvas) {
          canvas.dispatchEvent(new MouseEvent('mouseup', { clientX: evt.x, clientY: evt.y, button: evt.button, bubbles: true }));
        }
        __pl.replayIndex++;
        next();
      }, Math.min(delay, 50));
    }
    next();
  };
})();
// === RAVEL HARNESS END ===

${code}`;
}
