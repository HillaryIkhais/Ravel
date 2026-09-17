'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bug, CheckCircle, XCircle,
  ArrowRight, RotateCcw, ShieldX, Target, Sun, Moon, Zap, Terminal,
} from 'lucide-react';
import { verifyReplayHtml } from '@/lib/ravel/verifier';
import { type OracleVerdict, type OracleCondition, type InputEvent } from '@/types/ravel';
import { Scene3D } from './Scene3D';

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
  const [showInstructions, setShowInstructions] = useState(true);
  const [initialBuild, setInitialBuild] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const recordedEvents = useRef<InputEvent[]>([]);
  const recordingHandlerRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const traceIdRef = useRef<string | null>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const tiltRef = useRef({ x: 0, y: 0 });
  const isInitialBuild = useRef(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      setCursorPos({ x: e.clientX, y: e.clientY });
      const tx = (e.clientX / window.innerWidth - 0.5) * 12;
      const ty = (e.clientY / window.innerHeight - 0.5) * 12;
      const newTilt = { x: -ty, y: tx };
      setTilt(newTilt);
      tiltRef.current = newTilt;
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
    const lines = isInitialBuild.current
      ? [
          '> AI is thinking about your game...',
          '> Designing game mechanics...',
          '> Writing game logic...',
          '> Adding controls and physics...',
          '> Testing for bugs...',
          '> Build complete.',
        ]
      : [
          '> Studying your attack...',
          '> Understanding what you did...',
          '> Building a defense...',
          '> Rebuilding the game...',
          '> Checking if it holds...',
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

  const launchGenerated = useCallback(async (title: string) => {
    setPhase('patching'); setPatchProgress(6); setTerminalLines([]);
    isInitialBuild.current = true; setInitialBuild(true);
    try {
      const res = await fetch('/api/ravel/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
      });
      const data = await res.json();
      if (data.error) { setPhase('idle'); setRefusal(data.error); return; }
      sessionIdRef.current = data.sessionId; setHuntNumber(1);
      isInitialBuild.current = false; setInitialBuild(false);
      enterHunt(
        { id: data.sessionId, gameTitle: data.title, currentVersion: data.version,
          versionBase: data.versionBase ?? 0, huntBase: data.huntBase ?? 0, totalBuilds: 1, totalXp: 0, totalEarned: 0 },
        data.html,
        { id: '', title: 'Break the game', objective: 'Play the game and find a way to break it. When you have, click I BROKE IT.', difficulty: 'medium', reward: 2.4, status: 'active' },
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
      setPhase('patching'); setPatchProgress(8); setCaptureMessage('AI IS LEARNING FROM YOUR ATTACK...'); setAttemptNo(attempt);
      try {
        const pres = await fetch('/api/ravel/patch', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current, traceId, attempt, lastFailureReason: failureReason ?? null }),
        });
        if (!pres.ok) { const perr = await pres.json(); setRefusal(perr.reason || 'AI patch failed.'); setPhase('refused'); setCaptureMessage('NO PROOF, NO REWARD'); return; }
        const pdata = await pres.json(); setPatchRound(pdata); setPhase('verifying'); setCaptureMessage('TESTING YOUR ATTACK...');
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
        setRefusal(vdata.reason || 'Verification failed.'); setPhase('refused'); setCaptureMessage('NOT A REAL BREAK'); return;
      } catch { setRefusal('Patch/verify cycle failed.'); setPhase('refused'); setCaptureMessage('NOT A REAL BREAK'); return; }
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
      if (data.refused) { setRefusal(data.reason); setPhase('refused'); setCaptureMessage('NOT A REAL BREAK'); return; }
      traceIdRef.current = data.traceId; setAttemptNo(1); await runPatchCycle(1, data.traceId);
    } catch { setRefusal('Failed to submit your attack.'); setPhase('refused'); setCaptureMessage('ATTACK FAILED'); }
  }, [session, currentHunt, stopRecording, runPatchCycle, triggerShake, triggerGlitch]);

  const handleNextHunt = useCallback(async () => {
    if (!session) return;
    setPhase('hunting'); setCaptureMessage(''); setPatchRound(null); setOldVerdict(null); setNewVerdict(null);
    setReward(null); setRefusal('');
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
    sessionIdRef.current = null; traceIdRef.current = null; setAttemptNo(1);
  }, [stopRecording]);

  const nextVersion = (session?.currentVersion ?? 0) + 1;
  const huntLabel = pad(huntNumber);
  const building = phase === 'patching' || phase === 'verifying';
  const dk = theme === 'dark';

  return (
    <div className="min-h-screen relative" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <Scene3D dark={dk} phase={phase} />

      <header className="relative" style={{ zIndex: 10 }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-editorial text-lg tracking-tight">RAVEL</span>
            <span className="text-[11px] tracking-[0.15em] uppercase" style={{ color: 'var(--muted)' }}>outsmart what AI builds</span>
          </div>
          <div className="flex items-center gap-4">
            {session && (
              <>
                <button
                  onClick={() => { handleReset(); setShowInstructions(true); }}
                  onMouseEnter={() => setCursorHover(true)}
                  onMouseLeave={() => setCursorHover(false)}
                  className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-full transition-all"
                  style={{
                    background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    border: '1px solid var(--border)',
                    color: 'var(--muted)',
                  }}
                >
                  <RotateCcw className="w-3 h-3" />
                  New Game
                </button>
                <div className="flex items-center gap-3 text-xs font-mono">
                  <span style={{ color: dk ? '#C8A882' : '#8B7355' }}>BUILD {pad(session.currentVersion)}</span>
                  <div className="w-px h-3" style={{ background: 'var(--border)' }} />
                  <span style={{ color: 'var(--muted)' }}>{session.totalBuilds - 1} SURVIVED</span>
                </div>
              </>
            )}
            <button
              onClick={() => setTheme(d => d === 'dark' ? 'light' : 'dark')}
              onMouseEnter={() => setCursorHover(true)}
              onMouseLeave={() => setCursorHover(false)}
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
              <div className="relative mb-4">
                <h1 className="font-editorial text-5xl sm:text-6xl md:text-7xl lg:text-8xl leading-[1.05] tracking-tight max-w-4xl">
                  Break what AI built.
                </h1>
                <div className="absolute inset-0 pointer-events-none" style={{
                  background: 'radial-gradient(ellipse at center, var(--glow) 0%, transparent 70%)',
                  filter: 'blur(40px)', opacity: 0.4,
                }} />
              </div>
              <p className="text-base sm:text-lg max-w-lg mb-12" style={{ color: 'var(--muted)' }}>
                Give AI a task. While it builds, you try to break what it makes.
              </p>
              <div className="w-full max-w-lg mb-16">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={gameTitle}
                    onChange={e => setGameTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleStart()}
                    placeholder="Tell AI what to build..."
                    className="flex-1 px-6 py-4 text-base rounded-xl outline-none transition-all duration-300 focus:ring-2"
                    style={{
                      background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                      border: `1px solid ${dk ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                      color: 'var(--fg)',
                    }}
                  />
                  <button
                    onClick={handleStart}
                    disabled={!gameTitle.trim()}
                    className="px-8 py-4 text-base font-medium rounded-xl transition-all disabled:opacity-30 duration-300"
                    style={{
                      background: dk ? '#F5F5F5' : '#111',
                      color: dk ? '#0A0A0A' : '#F8F6F3',
                      boxShadow: dk ? '0 0 20px rgba(200,168,130,0.1)' : '0 0 20px rgba(139,115,85,0.08)',
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <Zap className="w-4 h-4" />
                      Build
                    </span>
                  </button>
                </div>
                <div className="mt-4 flex items-center justify-center gap-4 text-xs" style={{ color: 'var(--muted)', opacity: 0.6 }}>
                  <span>&ldquo;A space shooter with homing missiles&rdquo;</span>
                  <span>&middot;</span>
                  <span>&ldquo;A puzzle game with moving platforms&rdquo;</span>
                </div>
              </div>
              <div className="flex items-center gap-6 text-xs font-mono" style={{ color: 'var(--muted)', opacity: 0.5 }}>
                <div className="flex items-center gap-2">
                  <span>AI BUILDS</span>
                  <ArrowRight className="w-3 h-3" />
                  <span>YOU BREAK</span>
                  <ArrowRight className="w-3 h-3" />
                  <span>AI ADAPTS</span>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className={`grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 ${shaking ? 'screen-shake' : ''}`}>
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-mono" style={{ color: 'var(--muted)' }}>
                <span>
                  {phase === 'hunting' ? `BUILD ${pad(session.currentVersion)} \u2022 ROUND ${huntLabel}` :
                   building ? (initialBuild
                     ? `AI BUILDING \u2022 GPT-4o generating...`
                     : `AI ADAPTING \u2022 v${session.currentVersion} \u2192 v${nextVersion}`) :
                   phase === 'result' ? `BUILD ${pad(session.currentVersion)} UPDATED` :
                   phase === 'refused' ? `BUILD ${pad(session.currentVersion)} HOLDING` : 'READY'}
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
                    ROUND {huntLabel}
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
                  transform: `perspective(1200px) rotateX(${tilt.x * 0.5}deg) rotateY(${tilt.y * 0.5}deg)`,
                  transition: 'transform 0.15s ease-out, box-shadow 0.5s ease, border-color 0.5s ease',
                  transformStyle: 'preserve-3d',
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
                      {initialBuild
                        ? 'GPT-4o is generating your game...'
                        : phase === 'verifying'
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

              {/* Instructions overlay */}
              <AnimatePresence>
                {phase === 'hunting' && showInstructions && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    className="rounded-xl p-6 mb-2"
                    style={{
                      background: dk ? 'rgba(200,168,130,0.04)' : 'rgba(139,115,85,0.04)',
                      border: `1px solid ${dk ? 'rgba(200,168,130,0.12)' : 'rgba(139,115,85,0.1)'}`,
                    }}>
                    <h3 className="font-editorial text-lg mb-3" style={{ color: dk ? '#C8A882' : '#8B7355' }}>
                      How to play
                    </h3>
                    <div className="space-y-2 text-sm" style={{ color: 'var(--muted)' }}>
                      <p><strong style={{ color: 'var(--fg)' }}>1.</strong> Play the game above. Try to beat it.</p>
                      <p><strong style={{ color: 'var(--fg)' }}>2.</strong> When you find a way to break it &mdash; click <span style={{ color: '#C06060', fontWeight: 600 }}>I BROKE IT</span> below.</p>
                      <p><strong style={{ color: 'var(--fg)' }}>3.</strong> The AI learns from your attack and rebuilds the game.</p>
                      <p><strong style={{ color: 'var(--fg)' }}>4.</strong> Try the same attack again. If it no longer works &mdash; <strong style={{ color: dk ? '#C8A882' : '#8B7355' }}>you win XP</strong>. The AI adapted to survive you.</p>
                    </div>
                    <button
                      onClick={() => setShowInstructions(false)}
                      onMouseEnter={() => setCursorHover(true)}
                      onMouseLeave={() => setCursorHover(false)}
                      className="mt-4 px-5 py-2 rounded-full text-xs font-medium transition-all"
                      style={{ background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', color: 'var(--fg)' }}
                    >
                      Got it, let me play
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

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
                  onMouseEnter={() => setCursorHover(true)}
                  onMouseLeave={() => setCursorHover(false)}
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
                  I BROKE IT
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
                        <div className="font-editorial text-2xl" style={{ color: dk ? '#C8A882' : '#8B7355' }}>The AI learned from your attack.</div>
                        <div className="text-xs" style={{ color: 'var(--muted)' }}>It changed the game because of what you did.</div>
                      </div>
                    </div>

                    {/* What the AI changed */}
                    <div className="rounded-lg p-3 mb-4" style={{
                      background: dk ? 'rgba(200,168,130,0.06)' : 'rgba(139,115,85,0.04)',
                      border: `1px solid ${dk ? 'rgba(200,168,130,0.1)' : 'rgba(139,115,85,0.08)'}`,
                    }}>
                      <div className="text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: dk ? '#C8A882' : '#8B7355' }}>What it changed</div>
                      <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>{patchRound.explanation}</p>
                    </div>

                    {/* Before / After */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="rounded-lg p-3" style={{
                        background: dk ? 'rgba(192,96,96,0.06)' : 'rgba(192,96,96,0.04)',
                        border: `1px solid ${dk ? 'rgba(192,96,96,0.12)' : 'rgba(192,96,96,0.1)'}`,
                      }}>
                        <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: '#C06060' }}>BEFORE &mdash; v{patchRound.oldVersion}</div>
                        <div className="flex items-center gap-1.5">
                          {oldVerdict?.bugMet ? <CheckCircle className="w-3.5 h-3.5" style={{ color: '#C06060' }} /> : <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />}
                          <span className="text-xs font-medium" style={{ color: '#C06060' }}>YOUR ATTACK BROKE IT</span>
                        </div>
                      </div>
                      <div className="rounded-lg p-3" style={{
                        background: dk ? 'rgba(200,168,130,0.06)' : 'rgba(139,115,85,0.04)',
                        border: `1px solid ${dk ? 'rgba(200,168,130,0.12)' : 'rgba(139,115,85,0.1)'}`,
                      }}>
                        <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: dk ? '#C8A882' : '#8B7355' }}>AFTER &mdash; v{patchRound.newVersion}</div>
                        <div className="flex items-center gap-1.5">
                          {newVerdict?.fixedMet ? <CheckCircle className="w-3.5 h-3.5" style={{ color: dk ? '#C8A882' : '#8B7355' }} /> : <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--muted)' }} />}
                          <span className="text-xs font-medium" style={{ color: dk ? '#C8A882' : '#8B7355' }}>AI SURVIVED YOUR ATTACK</span>
                        </div>
                      </div>
                    </div>

                    {/* Proof card */}
                    <div className="rounded-lg p-3 mb-4" style={{ background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}>
                      <div className="text-[10px] font-mono uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Proof of Break</div>
                      <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                        <div><span style={{ color: 'var(--muted)' }}>Events:</span> <span style={{ color: 'var(--fg)' }}>{pendingEventCount}</span></div>
                        <div><span style={{ color: 'var(--muted)' }}>Old:</span> <span style={{ color: '#C06060' }}>BROKE</span></div>
                        <div><span style={{ color: 'var(--muted)' }}>New:</span> <span style={{ color: dk ? '#C8A882' : '#8B7355' }}>SURVIVED</span></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg px-4 py-3" style={{ background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}>
                      <span className="text-xs font-mono" style={{ color: 'var(--muted)' }}>v{patchRound.newVersion} is ready</span>
                      <button onClick={handleNextHunt}
                        onMouseEnter={() => setCursorHover(true)}
                        onMouseLeave={() => setCursorHover(false)}
                        className="px-5 py-2 rounded-full text-xs font-medium flex items-center gap-2 transition-all" style={{ background: dk ? '#F5F5F5' : '#111', color: dk ? '#0A0A0A' : '#F8F6F3' }}>
                        FIND ANOTHER WAY <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <details className="rounded-xl p-4 text-xs" style={{ background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}>
                    <summary className="cursor-pointer font-mono uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Replay proof</summary>
                    <div className="mt-3 space-y-2">
                      <a href={`data:text/html,${encodeURIComponent(patchRound.oldReplayHtml)}`} target="_blank" rel="noopener noreferrer" className="block p-2 rounded-lg text-xs font-mono transition-colors" style={{ background: dk ? 'rgba(192,96,96,0.06)' : 'rgba(192,96,96,0.04)', color: '#C06060' }}>
                        v{patchRound.oldVersion} &mdash; same attack, old build failed
                      </a>
                      <a href={`data:text/html,${encodeURIComponent(patchRound.newReplayHtml)}`} target="_blank" rel="noopener noreferrer" className="block p-2 rounded-lg text-xs font-mono transition-colors" style={{ background: dk ? 'rgba(200,168,130,0.06)' : 'rgba(139,115,85,0.04)', color: dk ? '#C8A882' : '#8B7355' }}>
                        v{patchRound.newVersion} &mdash; same attack, new build survived
                      </a>
                    </div>
                  </details>
                </motion.div>
              )}

              {phase === 'refused' && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl p-6" style={{ background: dk ? 'rgba(192,96,96,0.06)' : 'rgba(192,96,96,0.04)', border: `1px solid ${dk ? 'rgba(192,96,96,0.15)' : 'rgba(192,96,96,0.12)'}` }}>
                  <div className="flex items-center gap-3 mb-2">
                    <ShieldX className="w-6 h-6" style={{ color: '#C06060' }} />
                    <div className="font-editorial text-2xl" style={{ color: '#C06060' }}>Not a real break</div>
                  </div>
                  <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>{refusal || captureMessage}</p>
                  <div className="flex gap-3">
                    <button onClick={() => { setPhase('hunting'); setRefusal(''); setCaptureMessage(''); startRecording(); }} className="px-5 py-2 rounded-full text-xs font-medium" style={{ background: dk ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                      Try another attack
                    </button>
                    <button onClick={handleReset} className="px-5 py-2 rounded-full text-xs font-medium" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
                      New game
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="space-y-4">
              <div className="rounded-xl p-4" style={{ background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] font-mono uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--muted)' }}>Game</div>
                <div className="text-sm font-medium mb-3">{session.gameTitle}</div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg p-2" style={{ background: dk ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
                    <div style={{ color: 'var(--muted)' }}>Build</div>
                    <div className="text-lg font-bold font-mono">v{session.currentVersion}</div>
                  </div>
                  <div className="rounded-lg p-2" style={{ background: dk ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)' }}>
                    <div style={{ color: 'var(--muted)' }}>Next</div>
                    <div className="text-lg font-bold font-mono" style={{ color: dk ? '#C8A882' : '#8B7355' }}>v{nextVersion}</div>
                  </div>
                  <div className="rounded-lg p-2" style={{ background: dk ? 'rgba(192,96,96,0.06)' : 'rgba(192,96,96,0.04)' }}>
                    <div style={{ color: '#C06060' }}>Attacks</div>
                    <div className="text-lg font-bold font-mono" style={{ color: '#C06060' }}>{session.totalBuilds - 1}</div>
                  </div>
                </div>
              </div>

              {currentHunt && (phase === 'hunting' || phase === 'capturing' || building) && (
                <motion.div initial={{ opacity: 0, x: 12, rotateY: -10 }} animate={{ opacity: 1, x: 0, rotateY: 0 }}
                  transition={{ type: 'spring', stiffness: 120, damping: 15 }}
                  className="rounded-xl p-4"
                  style={{
                    background: dk ? 'rgba(200,168,130,0.04)' : 'rgba(139,115,85,0.04)',
                    border: `1px solid ${dk ? 'rgba(200,168,130,0.1)' : 'rgba(139,115,85,0.08)'}`,
                    transform: `perspective(800px) rotateX(${tilt.x * 0.3}deg) rotateY(${tilt.y * 0.3}deg)`,
                    transition: 'transform 0.2s ease-out',
                    transformStyle: 'preserve-3d',
                  }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4" style={{ color: dk ? '#C8A882' : '#8B7355' }} />
                    <span className="text-xs font-mono tracking-wider uppercase" style={{ color: dk ? '#C8A882' : '#8B7355' }}>ROUND {huntLabel}</span>
                    {building && (
                      <span className="ml-auto text-[10px] font-mono flex items-center gap-1" style={{ color: dk ? '#C8A882' : '#8B7355' }}>
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: dk ? '#C8A882' : '#8B7355' }} />
                        {initialBuild ? 'BUILDING' : 'ADAPTING'}
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
                      <div className="text-[10px] font-mono uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>How we know</div>
                      <div className="text-xs" style={{ color: 'var(--muted)' }}>{currentHunt.oracle.description}</div>
                    </div>
                  )}
                </motion.div>
              )}

              <div className="rounded-xl p-4" style={{ background: dk ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)', border: '1px solid var(--border)' }}>
                <div className="text-[10px] font-mono uppercase tracking-[0.15em] mb-2" style={{ color: 'var(--muted)' }}>How it works</div>
                <div className="text-xs space-y-2" style={{ color: 'var(--muted)' }}>
                  <p>GPT-4o builds a game in front of you.</p>
                  <p>You play it. Find a weakness. Click <span style={{ color: '#C06060', fontWeight: 600 }}>I BROKE IT</span>.</p>
                  <p>The AI sees your attack and rebuilds the game.</p>
                  <p>You try the <span style={{ color: 'var(--fg)' }}>same attack</span> on the new version.</p>
                  <p className="pt-1 font-medium" style={{ color: dk ? '#C8A882' : '#8B7355' }}>Every build has to survive you.</p>
                </div>
              </div>

              <button onClick={handleReset} className="w-full py-2 text-xs flex items-center justify-center gap-2 rounded-lg transition-colors" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
                <RotateCcw className="w-3 h-3" /> New Game
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Custom cursor */}
      <div
        className="pointer-events-none fixed z-[200]"
        style={{
          left: cursorPos.x,
          top: cursorPos.y,
          transform: 'translate(-50%, -50%)',
          transition: 'width 0.2s, height 0.2s, border-color 0.2s, background 0.2s',
          width: cursorHover ? 48 : 16,
          height: cursorHover ? 48 : 16,
          borderRadius: '50%',
          border: `1.5px solid ${dk ? 'rgba(200,168,130,0.5)' : 'rgba(139,115,85,0.4)'}`,
          background: cursorHover
            ? (dk ? 'rgba(200,168,130,0.08)' : 'rgba(139,115,85,0.06)')
            : 'transparent',
          mixBlendMode: dk ? 'difference' : 'normal',
        }}
      />
    </div>
  );
}
