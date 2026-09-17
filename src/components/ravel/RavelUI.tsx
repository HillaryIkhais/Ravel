'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug, CheckCircle, XCircle, Trophy,
  ArrowRight, RotateCcw, ShieldX, Target, Crosshair, Sun, Moon, Zap, Terminal,
} from 'lucide-react';
import { verifyReplayHtml } from '@/lib/ravel/verifier';
import { type OracleVerdict, type OracleCondition, type InputEvent } from '@/types/ravel';

type Phase = 'idle' | 'hunting' | 'capturing' | 'patching' | 'verifying' | 'result' | 'refused';

interface Session {
  id: string;
  gameTitle: string;
  currentVersion: number;
  versionBase: number;
  huntBase: number;
  totalBuilds: number;
  totalXp: number;
  totalEarned: number;
}

interface Hunt {
  id: string;
  title: string;
  objective: string;
  difficulty: string;
  reward: number;
  status: string;
  oracle?: OracleCondition;
}

interface PatchRound {
  attempt: number;
  explanation: string;
  oldVersion: number;
  newVersion: number;
  oldReplayHtml: string;
  newReplayHtml: string;
}

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, '0');
}

export function RavelUI() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [gameTitle, setGameTitle] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [gameHtml, setGameHtml] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [currentHunt, setCurrentHunt] = useState<Hunt | null>(null);
  const [huntNumber, setHuntNumber] = useState(1);
  const [ambientProgress, setAmbientProgress] = useState(24);
  const [patchProgress, setPatchProgress] = useState(0);
  const [captureMessage, setCaptureMessage] = useState('');
  const [patchRound, setPatchRound] = useState<PatchRound | null>(null);
  const [oldVerdict, setOldVerdict] = useState<OracleVerdict | null>(null);
  const [newVerdict, setNewVerdict] = useState<OracleVerdict | null>(null);
  const [reward, setReward] = useState<{ xp: number; bounty: number } | null>(null);
  const [refusal, setRefusal] = useState('');
  const [pendingEventCount, setPendingEventCount] = useState(0);
  const [attemptNo, setAttemptNo] = useState(1);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [shaking, setShaking] = useState(false);
  const [glitchKey, setGlitchKey] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [terminalLines, setTerminalLines] = useState<string[]>([]);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState({ x: -100, y: -100 });
  const [cursorHover, setCursorHover] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const recordedEvents = useRef<InputEvent[]>([]);
  const recordingHandlerRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const traceIdRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      setCursorPos({ x: e.clientX, y: e.clientY });
      const tx = (e.clientX / window.innerWidth - 0.5) * 12;
      const ty = (e.clientY / window.innerHeight - 0.5) * 12;
      setTilt({ x: -ty, y: tx });
    };
    const onLeave = () => { mouseRef.current = { x: -1000, y: -1000 }; setCursorPos({ x: -100, y: -100 }); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseleave', onLeave); };
  }, []);

  const triggerShake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
  }, []);

  const triggerGlitch = useCallback(() => {
    setGlitchKey(k => k + 1);
  }, []);

  useEffect(() => {
    if (!captureMessage) return;
    let cancelled = false;
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (!cancelled) setTypedText(captureMessage.slice(0, i));
      if (i >= captureMessage.length) clearInterval(id);
    }, 30);
    return () => { cancelled = true; clearInterval(id); };
  }, [captureMessage]);

  useEffect(() => {
    if (phase !== 'patching') return;
    let cancelled = false;
    const lines = [
      '> Analyzing input trace...',
      '> Reconstructing attack vector...',
      '> Generating counter-measure...',
      '> Patching build...',
      '> Verifying integrity...',
    ];
    let i = 0;
    const id = setInterval(() => {
      if (i < lines.length) {
        if (!cancelled) setTerminalLines(prev => [...prev, lines[i]]);
        i++;
      } else {
        clearInterval(id);
      }
    }, 600);
    return () => { cancelled = true; clearInterval(id); };
  }, [phase]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const onResize = () => { w = window.innerWidth; h = window.innerHeight; canvas.width = w; canvas.height = h; };
    window.addEventListener('resize', onResize);

    interface P { x: number; y: number; vx: number; vy: number; r: number; baseAlpha: number; }
    const ps: P[] = Array.from({ length: 80 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
      r: Math.random() * 1.6 + 0.4,
      baseAlpha: Math.random() * 0.15 + 0.08,
    }));

    let raf: number;
    let frameCount = 0;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      const dark = document.documentElement.classList.contains('dark');
      const lineBase = dark ? 255 : 0;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      frameCount++;

      for (const p of ps) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const mouseRadius = 180;
        if (dist < mouseRadius && dist > 0) {
          const force = (1 - dist / mouseRadius) * 0.8;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.vx += (Math.random() - 0.5) * 0.01;
        p.vy += (Math.random() - 0.5) * 0.01;
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
        const breathe = Math.sin(frameCount * 0.01 + p.x * 0.01) * 0.03;
        const alpha = p.baseAlpha + breathe;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${lineBase},${lineBase},${lineBase},${Math.max(0.02, alpha)})`;
        ctx.fill();
      }

      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const dx = ps[i].x - ps[j].x;
          const dy = ps[i].y - ps[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 120) {
            const alpha = 0.04 * (1 - d / 120);
            ctx.beginPath();
            ctx.moveTo(ps[i].x, ps[i].y); ctx.lineTo(ps[j].x, ps[j].y);
            ctx.strokeStyle = `rgba(${lineBase},${lineBase},${lineBase},${alpha})`;
            ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }

      if (mx > 0 && my > 0) {
        for (const p of ps) {
          const dx = p.x - mx;
          const dy = p.y - my;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 250 && d > 30) {
            const alpha = 0.06 * (1 - d / 250);
            ctx.beginPath();
            ctx.moveTo(mx, my); ctx.lineTo(p.x, p.y);
            const accent = dark ? '200,168,130' : '139,115,85';
            ctx.strokeStyle = `rgba(${accent},${alpha})`;
            ctx.lineWidth = 0.5; ctx.stroke();
          }
        }
      }

      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [theme]);

  useEffect(() => {
    if (phase !== 'hunting' || !session) return;
    const id = setInterval(() => {
      setAmbientProgress(p => {
        const next = p + 0.7 + Math.random() * 1.3;
        return next > 96 ? 6 + Math.random() * 12 : next;
      });
    }, 220);
    return () => clearInterval(id);
  }, [phase, session]);

  useEffect(() => {
    if (phase !== 'patching' && phase !== 'verifying') return;
    const id = setInterval(() => {
      setPatchProgress(p => (p < 92 ? p + 3 + Math.random() * 6 : p));
    }, 260);
    return () => clearInterval(id);
  }, [phase]);

  const stopRecording = useCallback(() => {
    if (recordingHandlerRef.current) {
      recordingHandlerRef.current();
      recordingHandlerRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const startRecording = useCallback(() => {
    recordedEvents.current = [];
    setIsRecording(true);
    const handler = (e: MessageEvent) => {
      const data = e.data || {};
      if (data.type === 'pl-event') recordedEvents.current.push(data.event);
    };
    window.addEventListener('message', handler);
    recordingHandlerRef.current = () => window.removeEventListener('message', handler);
  }, []);

  const enterHunt = useCallback((sess: Session, html: string, hunt: Hunt) => {
    setSession(sess);
    setGameHtml(html);
    setCurrentHunt(hunt);
    setPhase('hunting');
    startRecording();
  }, [startRecording]);

  const launchDemo = useCallback(async () => {
    setPhase('patching');
    setAmbientProgress(24);
    try {
      const res = await fetch('/api/ravel/demo', { method: 'POST' });
      const data = await res.json();
      if (data.error) { setPhase('idle'); setRefusal(data.error); return; }
      sessionIdRef.current = data.sessionId;
      setHuntNumber(data.huntNumber);
      enterHunt(
        { id: data.sessionId, gameTitle: data.title, currentVersion: data.version,
          versionBase: data.versionBase, huntBase: data.huntBase, totalBuilds: 1, totalXp: 0, totalEarned: 0 },
        data.html, data.hunt,
      );
    } catch { setPhase('idle'); setRefusal('Demo failed to load.'); }
  }, [enterHunt]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (!autoStarted.current && phase === 'idle') {
      autoStarted.current = true;
      void launchDemo();
    }
  }, [phase, launchDemo]);

  const launchGenerated = useCallback(async (title: string) => {
    setPhase('patching'); setPatchProgress(6);
    try {
      const res = await fetch('/api/ravel/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (data.error) { setPhase('idle'); setRefusal(data.error); return; }
      sessionIdRef.current = data.sessionId; setHuntNumber(1);
      enterHunt(
        { id: data.sessionId, gameTitle: data.title, currentVersion: data.version,
          versionBase: data.versionBase ?? 0, huntBase: data.huntBase ?? 0, totalBuilds: 1, totalXp: 0, totalEarned: 0 },
        data.html,
        { id: '', title: 'Find a bug', objective: 'Play the game and try to break it. When you are sure the behavior is wrong, capture it.', difficulty: 'medium', reward: 2.4, status: 'active' },
      );
      try {
        const hres = await fetch('/api/ravel/hunt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: data.sessionId }) });
        const hdata = await hres.json();
        if (hdata.hunt) setCurrentHunt(hdata.hunt);
      } catch { /* ignore */ }
    } catch { setPhase('idle'); setRefusal('Failed to generate game'); }
  }, [enterHunt]);

  const handleStart = useCallback(async () => {
    if (!gameTitle.trim()) return;
    await launchGenerated(gameTitle.trim());
  }, [gameTitle, launchGenerated]);

  const runPatchCycle = useCallback(async (attemptIn: number, traceId: string, lastFailureReason?: string) => {
    if (!sessionIdRef.current) return;
    let attempt = attemptIn;
    let failureReason = lastFailureReason;
    while (attempt <= 3) {
      setPhase('patching'); setPatchProgress(8); setCaptureMessage('AI IS STUDYING YOUR ATTACK'); setAttemptNo(attempt);
      try {
        const pres = await fetch('/api/ravel/patch', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, traceId, attempt, lastFailureReason: failureReason ?? null }),
        });
        if (!pres.ok) { const perr = await pres.json(); setRefusal(perr.reason || 'AI patch failed.'); setPhase('refused'); setCaptureMessage('NO PROOF, NO REWARD'); return; }
        const pdata = await pres.json(); setPatchRound(pdata); setPhase('verifying'); setCaptureMessage('REPLAYING YOUR ATTACK...');
        const [oldV, newV] = await Promise.all([verifyReplayHtml(pdata.oldReplayHtml, pdata.oldVersion), verifyReplayHtml(pdata.newReplayHtml, pdata.newVersion)]);
        setOldVerdict(oldV); setNewVerdict(newV);
        const vres = await fetch('/api/ravel/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, traceId, attempt, oldVerdict: oldV, newVerdict: newV }),
        });
        const vdata = await vres.json();
        if (vdata.status === 'verified') {
          setReward({ xp: vdata.decision.xp, bounty: vdata.decision.bounty }); setCaptureMessage('VERIFIED');
          setGameHtml(vdata.html);
          setSession(prev => prev ? { ...prev, currentVersion: vdata.newVersion, totalBuilds: prev.totalBuilds + 1, totalXp: prev.totalXp + vdata.decision.xp, totalEarned: prev.totalEarned + vdata.decision.bounty } : null);
          setPhase('result'); setPatchProgress(100); return;
        }
        if (vdata.status === 'retry') { failureReason = vdata.decision.reason; attempt += 1; setCaptureMessage(`YOUR ATTACK STILL WORKS. RETRY ${attempt}/3`); continue; }
        setRefusal(vdata.reason || 'Verification failed.'); setPhase('refused'); setCaptureMessage('NO PROOF, NO REWARD'); return;
      } catch { setRefusal('Patch/verify cycle failed.'); setPhase('refused'); setCaptureMessage('NO PROOF, NO REWARD'); return; }
    }
  }, []);

  const handleCapture = useCallback(async () => {
    if (!session || !currentHunt) return;
    stopRecording(); setPendingEventCount(recordedEvents.current.length);
    setPhase('capturing'); setPatchProgress(4); setCaptureMessage('YOU BROKE IT.');
    setPatchRound(null); setOldVerdict(null); setNewVerdict(null); setReward(null); setRefusal('');
    triggerShake(); triggerGlitch();
    try {
      const res = await fetch('/api/ravel/attack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, huntId: currentHunt.id, inputEvents: recordedEvents.current, expectedBehavior: currentHunt.objective, observedBehavior: 'Player attacked and observed unexpected behavior' }),
      });
      const data = await res.json();
      if (data.refused) { setRefusal(data.reason); setPhase('refused'); setCaptureMessage('NO PROOF, NO REWARD'); return; }
      traceIdRef.current = data.traceId; setAttemptNo(1); await runPatchCycle(1, data.traceId);
    } catch { setRefusal('Failed to submit your attack.'); setPhase('refused'); setCaptureMessage('CAPTURE FAILED'); }
  }, [session, currentHunt, stopRecording, runPatchCycle, triggerShake, triggerGlitch]);

  const handleNextHunt = useCallback(async () => {
    if (!session) return;
    setPhase('hunting'); setCaptureMessage(''); setPatchRound(null); setOldVerdict(null); setNewVerdict(null);
    setReward(null); setRefusal(''); setAmbientProgress(10);
    recordedEvents.current = []; setIsRecording(true); setHuntNumber(n => n + 1);
    try {
      const res = await fetch('/api/ravel/hunt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: session.id }) });
      const data = await res.json();
      if (data.hunt) setCurrentHunt(data.hunt);
    } catch { /* ignore */ }
  }, [session]);

  const handleReset = useCallback(() => {
    stopRecording(); setGameTitle(''); setSession(null); setGameHtml(''); setIsRecording(false);
    setCurrentHunt(null); setCaptureMessage(''); setPatchRound(null); setOldVerdict(null);
    setNewVerdict(null); setReward(null); setRefusal(''); setPhase('idle');
    sessionIdRef.current = null; traceIdRef.current = null; setAttemptNo(1); setAmbientProgress(24);
  }, [stopRecording]);

  const nextVersion = (session?.currentVersion ?? 0) + 1;
  const huntLabel = pad(huntNumber);
  const building = phase === 'patching' || phase === 'verifying';
  const dk = theme === 'dark';

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }} />

      <header className="relative" style={{ zIndex: 10 }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-editorial text-lg tracking-tight">RAVEL</span>
            <span className="text-[11px] tracking-[0.15em] uppercase" style={{ color: 'var(--muted)' }}>play while AI builds</span>
          </div>
          <div className="flex items-center gap-4">
            {session && (
              <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded-full"
                style={{ background: dk ? 'rgba(200,168,130,0.08)' : 'rgba(139,115,85,0.08)', color: dk ? '#C8A882' : '#8B7355' }}>
                <Trophy className="w-3.5 h-3.5" />
                <span>{session.totalXp} XP</span>
              </motion.div>
            )}
            <button
              onClick={() => setTheme(d => d === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ background: dk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}
              aria-label="Toggle theme"
            >
              {dk ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-6 py-4" style={{ zIndex: 10 }}>
        {!session ? (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <div className="min-h-[85vh] flex flex-col items-center justify-center text-center">
              <div className="relative mb-6">
                <h1 className="font-editorial text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[1.05] tracking-tight max-w-4xl">
                  Break what AI built.
                </h1>
                <div className="absolute inset-0 pointer-events-none" style={{
                  background: 'radial-gradient(ellipse at center, var(--glow) 0%, transparent 70%)',
                  filter: 'blur(40px)', opacity: 0.4,
                }} />
              </div>
              <p className="text-lg sm:text-xl max-w-lg mb-12" style={{ color: 'var(--muted)' }}>
                It learns from every attack.
              </p>
              <div className="relative group">
                <div className="absolute -inset-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" style={{
                  background: dk
                    ? 'linear-gradient(135deg, rgba(200,168,130,0.3), rgba(192,96,96,0.2))'
                    : 'linear-gradient(135deg, rgba(139,115,85,0.2), rgba(192,96,96,0.15))',
                  filter: 'blur(12px)',
                }} />
                <button
                  onClick={launchDemo}
                  className="relative px-12 py-5 text-base font-medium tracking-wide rounded-full transition-all duration-300"
                  style={{
                    background: dk ? '#F5F5F5' : '#111',
                    color: dk ? '#0A0A0A' : '#F8F6F3',
                    boxShadow: dk ? '0 0 30px rgba(200,168,130,0.15)' : '0 0 30px rgba(139,115,85,0.1)',
                  }}
                >
                  <span className="relative z-10 flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    BREAK IT
                  </span>
                </button>
              </div>
              <div className="mt-20 grid grid-cols-2 gap-10 max-w-lg w-full text-left">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <div className="w-2 h-2 rounded-full animate-slowpulse" style={{ background: dk ? '#C8A882' : '#8B7355' }} />
                      <div className="absolute inset-0 w-2 h-2 rounded-full animate-ping" style={{ background: dk ? '#C8A882' : '#8B7355', opacity: 0.3 }} />
                    </div>
                    <span className="text-[10px] font-mono tracking-[0.2em] uppercase" style={{ color: 'var(--muted)' }}>AI building</span>
                  </div>
                  <div className="text-sm font-mono font-bold" style={{ color: dk ? '#C8A882' : '#8B7355' }}>v{nextVersion}</div>
                  <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                    <div className="h-full rounded-full transition-all progress-striped" style={{ width: `${ambientProgress}%`, background: dk ? '#C8A882' : '#8B7355' }} />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Crosshair className="w-3.5 h-3.5" style={{ color: '#C06060' }} />
                    <span className="text-[10px] font-mono tracking-[0.2em] uppercase" style={{ color: 'var(--muted)' }}>You hunting</span>
                  </div>
                  <div className="text-sm font-mono font-bold" style={{ color: 'var(--fg)' }}>v11</div>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Break the enemy targeting.</p>
                </div>
              </div>
              <div className="mt-12 flex flex-col items-center gap-3">
                <div className="w-full flex gap-2 max-w-sm">
                  <input
                    type="text"
                    value={gameTitle}
                    onChange={e => setGameTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleStart()}
                    placeholder="Or describe any game for AI to build..."
                    className="flex-1 px-5 py-3 text-sm rounded-full outline-none transition-all duration-300 focus:ring-2"
                    style={{
                      background: dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                      border: '1px solid var(--border)',
                      color: 'var(--fg)',
                    }}
                  />
                  <button
                    onClick={handleStart}
                    disabled={!gameTitle.trim()}
                    className="px-5 py-3 text-sm font-medium rounded-full transition-all disabled:opacity-30 duration-300"
                    style={{ background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}
                  >
                    Build
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className={`grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 ${shaking ? 'screen-shake' : ''}`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-mono" style={{ color: 'var(--muted)' }}>
                <span>
                  {phase === 'hunting' ? `PLAYING v${session.currentVersion}` :
                   building ? `PATCHING v${session.currentVersion} \u2192 v${nextVersion}` :
                   phase === 'result' ? `SHIPPED v${session.currentVersion}` :
                   phase === 'refused' ? `v${session.currentVersion} UNCHANGED` : 'READY'}
                </span>
                <span className="flex items-center gap-3">
                  {isRecording && !building && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(192,96,96,0.1)', color: '#C06060' }}>
                      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#C06060' }} />
                      REC
                    </motion.span>
                  )}
                  <span className="px-2 py-0.5 rounded-full" style={{ background: dk ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }}>
                    HUNT {huntLabel}
                  </span>
                </span>
              </div>

              <div className="rounded-xl overflow-hidden relative scanlines crt-vignette"
                style={{
                  background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
                  border: `1px solid ${building ? (dk ? 'rgba(200,168,130,0.2)' : 'rgba(139,115,85,0.15)') : 'var(--border)'}`,
                  boxShadow: building
                    ? `0 0 30px ${dk ? 'rgba(200,168,130,0.1)' : 'rgba(139,115,85,0.08)'}, 0 0 60px ${dk ? 'rgba(200,168,130,0.05)' : 'rgba(139,115,85,0.04)'}`
                    : 'none',
                  transition: 'box-shadow 0.5s ease, border-color 0.5s ease',
                }}>
                {building ? (
                  <div className="h-[480px] flex flex-col items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0" style={{
                      background: dk
                        ? 'radial-gradient(ellipse at center, rgba(200,168,130,0.03) 0%, transparent 70%)'
                        : 'radial-gradient(ellipse at center, rgba(139,115,85,0.02) 0%, transparent 70%)',
                    }} />
                    <div className="relative mb-6">
                      <div className="w-16 h-16 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: dk ? '#C8A882' : '#8B7355' }} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Terminal className="w-5 h-5" style={{ color: dk ? '#C8A882' : '#8B7355' }} />
                      </div>
                    </div>
                    <p className="text-sm font-mono font-medium mb-2 typewriter-cursor" style={{ color: dk ? '#C8A882' : '#8B7355' }}>
                      {typedText}
                    </p>
                    <div className="mt-3 w-72 text-left space-y-0.5">
                      {terminalLines.map((line, i) => (
                        <motion.p key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 0.4, x: 0 }}
                          className="text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
                          {line}
                        </motion.p>
                      ))}
                    </div>
                    <p className="text-[10px] font-mono mt-3" style={{ color: 'var(--muted)', opacity: 0.5 }}>
                      {phase === 'verifying'
                        ? `Replaying ${pendingEventCount} events on v${patchRound?.oldVersion} and v${patchRound?.newVersion}`
                        : `attempt ${attemptNo}/3`}
                    </p>
                    <div className="w-56 h-1.5 rounded-full mt-4 overflow-hidden" style={{ background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                      <div className="h-full rounded-full transition-all progress-striped" style={{
                        width: `${Math.min(96, patchProgress)}%`,
                        background: dk ? '#C8A882' : '#8B7355',
                      }} />
                    </div>
                  </div>
                ) : (
                  <iframe ref={iframeRef} srcDoc={gameHtml} className="w-full h-[480px] border-0 crt-flicker" sandbox="allow-scripts" title="Game" />
                )}
              </div>

              <AnimatePresence>
                {phase === 'capturing' && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 flex items-center justify-center"
                    style={{ zIndex: 100, background: dk ? 'rgba(10,10,10,0.92)' : 'rgba(248,246,243,0.92)' }}>
                    <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 200, damping: 15 }} className="text-center">
                      <motion.div initial={{ rotate: -10 }} animate={{ rotate: 0 }}
                        className="mb-6 inline-flex items-center justify-center w-20 h-20 rounded-full danger-glow"
                        style={{ background: 'rgba(192,96,96,0.1)' }}>
                        <Bug className="w-10 h-10" style={{ color: '#C06060' }} />
                      </motion.div>
                      <h2 key={glitchKey} className="font-editorial text-5xl sm:text-6xl md:text-7xl glitch-text mb-4" style={{ color: '#C06060' }}>
                        {captureMessage}
                      </h2>
                      <div className="w-48 h-px mx-auto" style={{ background: 'linear-gradient(90deg, transparent, #C06060, transparent)' }} />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {phase === 'hunting' && (
                <motion.button
                  onClick={handleCapture}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-3.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 group"
                  style={{
                    background: dk ? 'rgba(192,96,96,0.08)' : 'rgba(192,96,96,0.06)',
                    border: `1px solid ${dk ? 'rgba(192,96,96,0.15)' : 'rgba(192,96,96,0.12)'}`,
                    color: '#C06060',
                  }}
                >
                  <Bug className="w-4 h-4 transition-transform group-hover:rotate-12" />
                  CAPTURE BUG
                </motion.button>
              )}

              {phase === 'result' && reward && patchRound && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                  <div className="rounded-xl p-6 animate-scaleburst" style={{
                    background: dk ? 'rgba(200,168,130,0.04)' : 'rgba(139,115,85,0.04)',
                    border: `1px solid ${dk ? 'rgba(200,168,130,0.12)' : 'rgba(139,115,85,0.1)'}`,
                    boxShadow: `0 0 40px ${dk ? 'rgba(200,168,130,0.08)' : 'rgba(139,115,85,0.06)'}`,
                  }}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{
                        background: dk ? 'rgba(200,168,130,0.1)' : 'rgba(139,115,85,0.08)',
                        boxShadow: `0 0 20px ${dk ? 'rgba(200,168,130,0.15)' : 'rgba(139,115,85,0.1)'}`,
                      }}>
                        <CheckCircle className="w-5 h-5" style={{ color: dk ? '#C8A882' : '#8B7355' }} />
                      </div>
                      <div>
                        <div className="font-editorial text-2xl" style={{ color: dk ? '#C8A882' : '#8B7355' }}>The AI survived.</div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>Your attack was real. It adapted.</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="rounded-lg p-3" style={{
                        background: dk ? 'rgba(192,96,96,0.06)' : 'rgba(192,96,96,0.04)',
                        border: `1px solid ${dk ? 'rgba(192,96,96,0.12)' : 'rgba(192,96,96,0.1)'}`,
                      }}>
                        <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: '#C06060' }}>v{patchRound.oldVersion}</div>
                        <div className="flex items-center gap-1.5">
                          {oldVerdict?.bugMet ? <CheckCircle className="w-3.5 h-3.5" style={{ color: '#C06060' }} /> : <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />}
                          <span className="text-xs font-medium" style={{ color: '#C06060' }}>YOU BROKE IT</span>
                        </div>
                      </div>
                      <div className="rounded-lg p-3" style={{
                        background: dk ? 'rgba(200,168,130,0.06)' : 'rgba(139,115,85,0.04)',
                        border: `1px solid ${dk ? 'rgba(200,168,130,0.12)' : 'rgba(139,115,85,0.1)'}`,
                      }}>
                        <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: dk ? '#C8A882' : '#8B7355' }}>v{patchRound.newVersion}</div>
                        <div className="flex items-center gap-1.5">
                          {newVerdict?.fixedMet ? <CheckCircle className="w-3.5 h-3.5" style={{ color: dk ? '#C8A882' : '#8B7355' }} /> : <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />}
                          <span className="text-xs font-medium" style={{ color: dk ? '#C8A882' : '#8B7355' }}>AI COUNTERED</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}>
                      <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>Build {patchRound.newVersion} is ready</span>
                      <button onClick={handleNextHunt} className="px-5 py-2 rounded-full text-xs font-medium flex items-center gap-2 transition-all" style={{ background: dk ? '#F5F5F5' : '#111', color: dk ? '#0A0A0A' : '#F8F6F3' }}>
                        BREAK IT AGAIN <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <details className="rounded-xl p-4 text-xs" style={{ background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}>
                    <summary className="cursor-pointer font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Replay proof</summary>
                    <div className="mt-3 space-y-2">
                      <a href={`data:text/html,${encodeURIComponent(patchRound.oldReplayHtml)}`} target="_blank" rel="noopener noreferrer" className="block p-2 rounded-lg text-xs font-mono transition-colors" style={{ background: dk ? 'rgba(192,96,96,0.06)' : 'rgba(192,96,96,0.04)', color: '#C06060' }}>
                        v{patchRound.oldVersion} &mdash; same attack (confirms bug)
                      </a>
                      <a href={`data:text/html,${encodeURIComponent(patchRound.newReplayHtml)}`} target="_blank" rel="noopener noreferrer" className="block p-2 rounded-lg text-xs font-mono transition-colors" style={{ background: dk ? 'rgba(200,168,130,0.06)' : 'rgba(139,115,85,0.04)', color: dk ? '#C8A882' : '#8B7355' }}>
                        v{patchRound.newVersion} &mdash; same attack (fix verified)
                      </a>
                    </div>
                  </details>
                </motion.div>
              )}

              {phase === 'refused' && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl p-6" style={{ background: dk ? 'rgba(192,96,96,0.06)' : 'rgba(192,96,96,0.04)', border: `1px solid ${dk ? 'rgba(192,96,96,0.15)' : 'rgba(192,96,96,0.12)'}` }}>
                  <div className="flex items-center gap-3 mb-2">
                    <ShieldX className="w-6 h-6" style={{ color: '#C06060' }} />
                    <div className="font-editorial text-2xl" style={{ color: '#C06060' }}>No proof, no reward</div>
                  </div>
                  <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{refusal || captureMessage}</p>
                  <div className="flex gap-3">
                    <button onClick={() => { setPhase('hunting'); setRefusal(''); setCaptureMessage(''); startRecording(); }} className="px-5 py-2 rounded-full text-xs font-medium" style={{ background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                      Try again
                    </button>
                    <button onClick={handleReset} className="px-5 py-2 rounded-full text-xs font-medium" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
                      New session
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl p-4" style={{ background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] font-mono uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--muted)' }}>Session</div>
                <div className="text-sm font-medium mb-3">{session.gameTitle}</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg p-2" style={{ background: dk ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
                    <div style={{ color: 'var(--muted)' }}>Current</div>
                    <div className="text-lg font-bold font-mono">v{session.currentVersion}</div>
                  </div>
                  <div className="rounded-lg p-2" style={{ background: dk ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
                    <div style={{ color: 'var(--muted)' }}>Building</div>
                    <div className="text-lg font-bold font-mono" style={{ color: dk ? '#C8A882' : '#8B7355' }}>v{nextVersion}</div>
                  </div>
                </div>
              </div>

              {currentHunt && (phase === 'hunting' || phase === 'capturing' || building) && (
                <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="rounded-xl p-4" style={{ background: dk ? 'rgba(200,168,130,0.04)' : 'rgba(139,115,85,0.04)', border: `1px solid ${dk ? 'rgba(200,168,130,0.1)' : 'rgba(139,115,85,0.08)'}` }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4" style={{ color: dk ? '#C8A882' : '#8B7355' }} />
                    <span className="text-xs font-mono tracking-wider uppercase" style={{ color: dk ? '#C8A882' : '#8B7355' }}>HUNT {huntLabel}</span>
                    {building && (
                      <span className="ml-auto text-[10px] font-mono flex items-center gap-1" style={{ color: dk ? '#C8A882' : '#8B7355' }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: dk ? '#C8A882' : '#8B7355' }} />
                        PATCHING
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-bold mb-1">{currentHunt.title}</h3>
                  <p className="text-xs mb-3 leading-relaxed" style={{ color: 'var(--muted)' }}>{currentHunt.objective}</p>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="px-2 py-0.5 rounded-full" style={{ background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>{currentHunt.difficulty}</span>
                  </div>
                  {currentHunt.oracle && (
                    <div className="mt-3 p-2 rounded-lg" style={{ background: dk ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.03)', border: '1px solid var(--border)' }}>
                      <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Oracle</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{currentHunt.oracle.description}</div>
                    </div>
                  )}
                </motion.div>
              )}

              <div className="rounded-xl p-4" style={{ background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] font-mono uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--muted)' }}>How it works</div>
                <ol className="text-xs space-y-1.5 list-decimal list-inside" style={{ color: 'var(--muted)' }}>
                  <li>Play v{session.currentVersion} while AI builds v{nextVersion}.</li>
                  <li>Trigger the failure &mdash; your input becomes the trace.</li>
                  <li>Replay the <span style={{ color: 'var(--fg)' }}>same attack</span> on both builds.</li>
                  <li>Oracle proves old fails + fix is present.</li>
                  <li>The AI&apos;s next build has to survive you.</li>
                </ol>
              </div>

              <button onClick={handleReset} className="w-full py-2 text-xs flex items-center justify-center gap-2 rounded-lg transition-colors" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
                <RotateCcw className="w-3 h-3" /> New Session
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
