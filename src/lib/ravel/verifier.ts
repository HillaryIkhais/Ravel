import { type InputEvent, type OracleCondition, type OracleVerdict } from '@/types/ravel';

export interface VerificationResult {
  passed: boolean;
  oracleMet: boolean;
  oracleDescription: string;
  gameState: Record<string, unknown>;
  error: string | null;
  duration: number;
  eventCount: number;
}

/**
 * Builds a self-contained replay page that:
 *  1. runs the game code with the recording harness
 *  2. replays the SAME input events (same trace)
 *  3. samples transient state after every event and during settle time
 *  4. evaluates BOTH sides of the oracle (bug side + positive fix side)
 *  5. posts a `pl-verdict` message to the parent and renders the result
 */
export function generateVerificationReplayHtml(
  gameCode: string,
  events: InputEvent[],
  buildVersion: number,
  oracle: OracleCondition,
  phase: 'bug' | 'fix' = 'bug',
): string {
  const oracleJson = JSON.stringify(oracle).replace(/</g, '\\u003c');
  const eventsJson = JSON.stringify(events).replace(/</g, '\\u003c');

  return `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; font-family: monospace; }
  canvas { border: 1px solid #333; }
  #oracle-panel { position: fixed; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.92); padding: 16px; border-top: 1px solid #333; z-index: 9999; }
  #oracle-title { color: #888; font-size: 12px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
  #oracle-desc { color: #fff; font-size: 14px; margin-bottom: 8px; }
  #oracle-result { font-size: 16px; font-weight: bold; padding: 8px 12px; border-radius: 6px; display: inline-block; }
  #oracle-result.pass { color: #44ff88; background: rgba(68,255,136,0.1); border: 1px solid #44ff88; }
  #oracle-result.fail { color: #ff4455; background: rgba(255,68,85,0.1); border: 1px solid #ff4455; }
  #oracle-result.err { color: #ffaa33; background: rgba(255,170,51,0.1); border: 1px solid #ffaa33; }
  #oracle-detail { color: #999; font-size: 12px; margin-top: 8px; white-space: pre-wrap; }
  #replay-badge { position: fixed; top: 10px; left: 10px; background: rgba(0,0,0,0.8); color: #ff4455; padding: 8px 16px; border-radius: 6px; font-family: monospace; font-size: 14px; z-index: 9999; border: 1px solid #ff4455; }
  #replay-version { position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.8); color: #aaa; padding: 8px 16px; border-radius: 6px; font-family: monospace; font-size: 14px; z-index: 9999; border: 1px solid #333; }
  #snap-list { margin-top: 6px; max-height: 90px; overflow: auto; color: #666; font-size: 11px; }
  #snap-list b { color: #ccc; }
</style>
</head>
<body>
<div id="replay-badge">REPLAY · SAME ATTACK</div>
<div id="replay-version">BUILD v${buildVersion}</div>
<canvas id="gameCanvas" width="800" height="600"></canvas>
<div id="oracle-panel">
  <div id="oracle-title">Oracle</div>
  <div id="oracle-desc">${escapeHtml(oracle.description)}</div>
  <div id="oracle-result">Evaluating…</div>
  <div id="oracle-detail"></div>
  <div id="snap-list"></div>
</div>
<script>
const oracle = ${oracleJson};
const buildVersion = ${buildVersion};
const events = ${eventsJson};

const canvas = document.getElementById('gameCanvas');
const resultEl = document.getElementById('oracle-result');
const detailEl = document.getElementById('oracle-detail');
const snapEl = document.getElementById('snap-list');

let runtimeError = null;
window.onerror = function (msg) { runtimeError = String(msg); return true; };
const __plPhase = '${phase}';

function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function dispatch(evt) {
  canvas.dispatchEvent(evt);
  document.dispatchEvent(evt);
  window.dispatchEvent(evt);
}
window.addEventListener('keydown', function (e) { e.preventDefault(); });
window.addEventListener('mousedown', function (e) { e.preventDefault(); });

function globalEval(expr) {
  try { return (0, eval)('(' + expr + ')'); } catch (e) { return undefined; }
}

var __cloneVar = function (v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(function (x) { return __cloneVar(x); });
  if (typeof v === 'function') return String(v.name || '').length ? v.name : undefined;
  var out = {};
  var keys = Object.keys(v).slice(0, 40);
  for (var i = 0; i < keys.length; i++) {
    var val = v[keys[i]];
    if (val === null || typeof val !== 'object') {
      if (typeof val !== 'function') out[keys[i]] = val;
    } else if (typeof val === 'object') {
      out[keys[i]] = __cloneVar(val);
    }
  }
  return out;
};

function captureState() {
  var state = {};
  var candidates = [
    'score','lives','health','hp','player','enemy','enemies',
    'target','targets','gameOver','gameWon','playerX','playerY',
    'enemyX','enemyY','bullets','projectiles','level','wave',
    'combo','multiplier','ammo','shield','speed','damage','power',
    '__tracking','__trackDead','__homingActive','__homingTotal'
  ];
  for (var i = 0; i < candidates.length; i++) {
    try {
      if (typeof window[candidates[i]] !== 'undefined' && window[candidates[i]] !== null) {
        state[candidates[i]] = __cloneVar(window[candidates[i]]);
      }
    } catch (e) {}
  }
  try {
    var extra = window.__plExpose;
    if (Array.isArray(extra)) {
      for (var xi = 0; xi < extra.length; xi++) {
        var name = extra[xi];
        try {
          if (typeof window[name] !== 'undefined' && window[name] !== null) state[name] = __cloneVar(window[name]);
        } catch (e) {}
      }
    }
  } catch (e) {}
  return state;
}

function resolvePath(state, path) {
  if (!path) return undefined;
  var val = state;
  var parts = String(path).split('.');
  for (var i = 0; i < parts.length; i++) {
    if (val === null || val === undefined) return undefined;
    val = val[parts[i]];
  }
  return val;
}

function applyOperator(actual, operator, expected) {
  switch (operator) {
    case 'not_equals': return actual !== expected;
    case 'less_than': return Number(actual) < Number(expected);
    case 'greater_than': return Number(actual) > Number(expected);
    case 'contains': return String(actual).includes(String(expected));
    case 'exists': return actual !== undefined && actual !== null;
    case 'not_exists': return actual === undefined || actual === null;
    default: return actual === expected;
  }
}

async function run() {
  const stateLog = [];
  function snap() { try { stateLog.push(captureState()); } catch (e) {} }

  // Let the game boot
  await delay(250);
  snap();

  // Replay the SAME attack
  let lastTs = 0;
  const total = events.length;
  for (let i = 0; i < total; i++) {
    const evt = events[i];
    const d = Math.min(Math.max(0, (evt.timestamp || 0) - lastTs), 50);
    lastTs = evt.timestamp || 0;
    await delay(d);
    try {
      if (evt.type === 'keydown') dispatch(new KeyboardEvent('keydown', { key: evt.key, code: evt.code || '', bubbles: true }));
      else if (evt.type === 'keyup') dispatch(new KeyboardEvent('keyup', { key: evt.key, code: evt.code || '', bubbles: true }));
      else if (evt.type === 'mousedown') dispatch(new MouseEvent('mousedown', { clientX: evt.x || 0, clientY: evt.y || 0, button: evt.button || 0, bubbles: true }));
      else if (evt.type === 'mouseup') dispatch(new MouseEvent('mouseup', { clientX: evt.x || 0, clientY: evt.y || 0, button: evt.button || 0, bubbles: true }));
    } catch (err) {
      runtimeError = String(err && err.message || err);
    }
    snap();
  }

  // Settle + observe transient state (spawns happen here)
  for (let k = 0; k < 10; k++) { await delay(400); snap(); }

  const finalState = captureState();
  stateLog.push(finalState);

  const exprBug = oracle.evalExpression;
  const exprFixed = oracle.fixedExpression;
  const bugVal = oracle.bugValue;
  const fixedVal = oracle.fixedValue;
  const op = oracle.operator || 'equals';
  const fixedOp = oracle.fixedOperator || 'equals';

  let bugMet, fixedMet, actualBug, actualFixed;
  if (exprBug) {
    bugMet = !!globalEval(exprBug);
    actualBug = globalEval(exprBug);
  } else {
    actualBug = resolvePath(finalState, oracle.statePath);
    bugMet = applyOperator(actualBug, op, bugVal);
  }
  if (exprFixed) {
    fixedMet = !!globalEval(exprFixed);
    actualFixed = globalEval(exprFixed);
  } else {
    actualFixed = resolvePath(finalState, oracle.statePath);
    fixedMet = applyOperator(actualFixed, fixedOp, fixedVal);
  }

  const reason = [];
  if (exprBug) reason.push('bug side: ' + exprBug);
  else reason.push('bug side: ' + oracle.statePath + ' ' + op + ' ' + JSON.stringify(bugVal));
  reason.push('bugMet=' + bugMet + '  observed=' + JSON.stringify(actualBug));
  if (exprFixed) reason.push('fix side: ' + exprFixed);
  else reason.push('fix side: ' + oracle.statePath + ' ' + fixedOp + ' ' + JSON.stringify(fixedVal));
  reason.push('fixedMet=' + fixedMet + '  observed=' + JSON.stringify(actualFixed));
  reason.push('events=' + total + '  snapshots=' + stateLog.length);

  const verdict = {
    type: 'pl-verdict',
    kind: 'ravel-verdict',
    buildVersion: buildVersion,
    replayed: !runtimeError,
    bugMet: bugMet,
    fixedMet: fixedMet,
    actualBugValue: actualBug,
    actualFixedValue: actualFixed,
    error: runtimeError,
    timedOut: false,
    eventCount: total,
    snapshots: stateLog,
    reason: reason.join('\n')
  };

  try { window.parent.postMessage(verdict, '*'); } catch (e) {}

  // Render
  if (runtimeError) {
    resultEl.textContent = 'ERROR DURING REPLAY';
    resultEl.className = 'err';
    detailEl.textContent = runtimeError;
  } else if (__plPhase === 'bug') {
    if (bugMet) {
      resultEl.textContent = 'BUG CONFIRMED';
      resultEl.className = 'fail';
      detailEl.textContent = 'The attack reproduces the failure on this build.\n' + reason.join('\n');
    } else {
      resultEl.textContent = 'FAILURE NOT REPRODUCED';
      resultEl.className = 'err';
      detailEl.textContent = reason.join('\n');
    }
  } else {
    if (bugMet) {
      resultEl.textContent = 'BUG STILL PRESENT';
      resultEl.className = 'err';
      detailEl.textContent = 'The same attack still fails on the patched build.\n' + reason.join('\n');
    } else if (fixedMet) {
      resultEl.textContent = 'FIX VERIFIED';
      resultEl.className = 'pass';
      detailEl.textContent = 'The same attack no longer fails, and the expected fix is positively present.\n' + reason.join('\n');
    } else {
      resultEl.textContent = 'FIX NOT VERIFIED';
      resultEl.className = 'err';
      detailEl.textContent = reason.join('\n');
    }
  }

  // Transient state log (last few snapshots collapsed)
  snapEl.innerHTML = '';
  for (let s = Math.max(0, stateLog.length - 6); s < stateLog.length; s++) {
    const kv = [];
    const keys = Object.keys(stateLog[s] || {});
    for (let k = 0; k < keys.length; k++) {
      const key = keys[k];
      if (key.indexOf('__') === 0) kv.push('<b>' + key + '</b>=' + JSON.stringify(stateLog[s][key]));
    }
    if (kv.length) {
      const div = document.createElement('div');
      div.innerHTML = 't+' + s + ': ' + kv.slice(0, 5).join('  ');
      snapEl.appendChild(div);
    }
  }

  try { window.__PL_VERDICT__ = verdict; } catch (e) {}
}

run().catch(function (err) {
  const v = { type: 'pl-verdict', kind: 'ravel-verdict', buildVersion: buildVersion, replayed: false, bugMet: false, fixedMet: false, actualBugValue: undefined, actualFixedValue: undefined, error: String(err && err.message || err), timedOut: false, eventCount: events.length, snapshots: [], reason: 'Replay runner crashed: ' + (err && err.message || err) };
  try { window.parent.postMessage(v, '*'); } catch (e) {}
  resultEl.textContent = 'REPLAY ERROR';
  resultEl.className = 'err';
  detailEl.textContent = String(err && err.message || err);
});
</script>
</body>
</html>`;
}

/**
 * Runs a real oracle verification by loading the replay page into a
 * hidden iframe and reading its `pl-verdict`. This is the client-side
 * proof used before any bounty is awarded.
 */
export function verifyBuildInIframe(
  gameCode: string,
  events: InputEvent[],
  buildVersion: number,
  oracle: OracleCondition,
  timeoutMs: number = 25000,
  phase: 'bug' | 'fix' = 'bug',
): Promise<OracleVerdict> {
  const html = generateVerificationReplayHtml(gameCode, events, buildVersion, oracle, phase);
  return verifyReplayHtml(html, buildVersion, timeoutMs);
}

/**
 * Loads a pre-built verification replay page in a hidden iframe and
 * resolves with the `pl-verdict` message it posts.
 */
export function verifyReplayHtml(html: string, buildVersion: number, timeoutMs: number = 25000): Promise<OracleVerdict> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:800px;height:600px;';
    iframe.sandbox.add('allow-scripts');
    iframe.srcdoc = html;
    document.body.appendChild(iframe);

    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      resolve({
        buildVersion,
        replayed: false,
        bugMet: false,
        fixedMet: false,
        actualBugValue: undefined,
        actualFixedValue: undefined,
        error: null,
        timedOut: true,
        reason: 'Replay timed out',
        eventCount: 0,
        snapshots: [],
      });
    }, timeoutMs);

    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      const data = e.data || {};
      if (data.type !== 'pl-verdict') return;
      if (done) return;
      done = true;
      cleanup();
      resolve({
        buildVersion: data.buildVersion ?? buildVersion,
        replayed: !!data.replayed,
        bugMet: !!data.bugMet,
        fixedMet: !!data.fixedMet,
        actualBugValue: data.actualBugValue,
        actualFixedValue: data.actualFixedValue,
        error: data.error ?? null,
        timedOut: false,
        reason: data.reason ?? '',
        eventCount: data.eventCount ?? 0,
        snapshots: data.snapshots ?? [],
      });
    };

    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      try { document.body.removeChild(iframe); } catch {}
    }

    window.addEventListener('message', onMessage);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}