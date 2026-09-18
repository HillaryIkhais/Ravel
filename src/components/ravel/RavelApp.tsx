'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bug, CheckCircle, XCircle, ArrowRight, Zap, RefreshCw } from 'lucide-react';
import { verifyReplayHtml } from '@/lib/ravel/verifier';
import { type OracleVerdict, type OracleCondition, type InputEvent } from '@/types/ravel';
import { Scene3D } from './Scene3D';

type Phase = 'idle' | 'hunting' | 'capturing' | 'patching' | 'verifying' | 'result' | 'refused';

interface Session {
  id: string;
  gameTitle: string;
  currentVersion: number;
  totalBuilds: number;
}

interface Hunt {
  id: string;
  title: string;
  objective: string;
  oracle?: OracleCondition;
}

interface PatchRound {
  oldVersion: number;
  newVersion: number;
  explanation: string;
  oldReplayHtml: string;
  newReplayHtml: string;
}

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, '0');
}

function extractTraceLabels(events: InputEvent[]): string[] {
  const labels: string[] = [];
  for (const e of events) {
    if (labels.length >= 7) break;
    if (e.type === 'keydown') {
      const k = e.key ?? '';
      if (k === ' ') { if (labels[labels.length - 1] !== 'DECOY') labels.push('DECOY'); }
      else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'].includes(k)) {
        if (labels[labels.length - 1] !== 'MOVE') labels.push('MOVE');
      }
    }
  }
  return labels;
}

export function RavelApp() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<Session | null>(null);
  const [gameHtml, setGameHtml] = useState('');
  const [currentHunt, setCurrentHunt] = useState<Hunt | null>(null);
  const [huntNumber, setHuntNumber] = useState(1);
  const [eventCount, setEventCount] = useState(0);
  const [captureMessage, setCaptureMessage] = useState('');
  const [patchRound, setPatchRound] = useState<PatchRound | null>(null);
  const [oldVerdict, setOldVerdict] = useState<OracleVerdict | null>(null);
  const [newVerdict, setNewVerdict] = useState<OracleVerdict | null>(null);
  const [refusal, setRefusal] = useState('');
  const [shaking, setShaking] = useState(false);
  const [trace, setTrace] = useState<string[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(true);
  const [needsFocus, setNeedsFocus] = useState(false);
  
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const recordedEvents = useRef<InputEvent[]>([]);
  const recordingHandlerRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  
  const triggerShake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 400);
  }, []);

  const stopRecording = useCallback(() => {
    if (recordingHandlerRef.current) {
      recordingHandlerRef.current();
      recordingHandlerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    recordedEvents.current = [];
    setEventCount(0);
    const handler = (e: MessageEvent) => {
      const data = e.data || {};
      if (data.type === 'pl-event') {
        recordedEvents.current.push(data.event);
        setEventCount(recordedEvents.current.length);
      }
    };
    window.addEventListener('message', handler);
    recordingHandlerRef.current = () => window.removeEventListener('message', handler);
  }, []);

  const launchDemo = useCallback(async () => {
    setPhase('patching'); 
    setCaptureMessage('AI IS BUILDING INITIAL ARENA...');
    try {
      const res = await fetch('/api/ravel/demo', { method: 'POST' });
      const data = await res.json();
      sessionIdRef.current = data.sessionId;
      setHuntNumber(1);
      setSession({
        id: data.sessionId, gameTitle: data.title, currentVersion: data.version,
        totalBuilds: 1
      });
      setGameHtml(data.html);
      setCurrentHunt(data.hunt);
      setPhase('hunting');
      startRecording();
    } catch { 
      setPhase('idle'); 
    }
  }, [startRecording]);

  const handleCapture = useCallback(async () => {
    if (!session || !currentHunt) return;
    stopRecording(); 
    setPhase('capturing'); 
    setCaptureMessage('YOU BROKE IT.');
    triggerShake();
    
    setTrace(extractTraceLabels(recordedEvents.current));

    try {
      const res = await fetch('/api/ravel/attack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: session.id, huntId: currentHunt.id, 
          inputEvents: recordedEvents.current, 
          expectedBehavior: currentHunt.objective, 
          observedBehavior: 'Player attacked and observed unexpected behavior' 
        }),
      });
      const data = await res.json();
      if (data.refused) { setRefusal(data.reason); setPhase('refused'); return; }
      
      const traceId = data.traceId;
      
      setPhase('patching');
      setCaptureMessage('AI IS ADAPTING TO YOUR ATTACK...');
      
      const pres = await fetch('/api/ravel/patch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, traceId, attempt: 1 }),
      });
      if (!pres.ok) { 
        const err = await pres.json().catch(() => ({ detail: 'AI patch failed' }));
        setRefusal(err.detail || err.reason || 'AI patch failed.'); 
        setPhase('refused'); return; 
      }
      
      const pdata = await pres.json();
      setPatchRound(pdata);
      
      setPhase('verifying');
      setCaptureMessage('REPLAY READY');
      
      const [oldV, newV] = await Promise.all([
        verifyReplayHtml(pdata.oldReplayHtml, pdata.oldVersion), 
        verifyReplayHtml(pdata.newReplayHtml, pdata.newVersion)
      ]);
      setOldVerdict(oldV); setNewVerdict(newV);
      
      const vres = await fetch('/api/ravel/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, traceId, attempt: 1, oldVerdict: oldV, newVerdict: newV }),
      });
      const vdata = await vres.json();
      
      if (vdata.status === 'verified') {
        setGameHtml(vdata.html);
        setSession(prev => prev ? { ...prev, currentVersion: vdata.newVersion, totalBuilds: prev.totalBuilds + 1 } : null);
        setPhase('result');
      } else if (vdata.status === 'retry' && vdata.reason) {
        setRefusal(`The AI tried to adapt but ${vdata.reason.toLowerCase()} Retrying will keep your attack alive.`);
        setPhase('refused');
      } else {
        const reason = vdata.reason || '';
        const notReproduced = oldV.bugMet === false || /did not reproduce|expected bug side/i.test(reason);
        setRefusal(notReproduced ? 'The attack did not reproduce a failure. Try breaking it differently.' : 'AI FAILED TO ADAPT. YOUR ATTACK SURVIVED.');
        setPhase('refused');
      }
    } catch { 
      setRefusal('Failed to submit your attack.'); setPhase('refused'); 
    }
  }, [session, currentHunt, stopRecording, triggerShake]);

  const handleNextHunt = useCallback(async () => {
    setPhase('hunting'); 
    setCaptureMessage(''); setPatchRound(null); setOldVerdict(null); setNewVerdict(null);
    setRefusal('');
    setHuntNumber(n => n + 1);
    startRecording();
    // Round 2+ MUST get a fresh oracle against the CURRENT (adapted) build,
    // otherwise we keep testing the square-1 oracle forever. Fetch a new hunt.
    try {
      const res = await fetch('/api/ravel/hunt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      });
      const data = await res.json();
      if (data.hunt && data.hunt.oracle) setCurrentHunt(data.hunt);
    } catch { /* keep current hunt as fallback so it never hard-fails */ }
    startRecording();
  }, [startRecording, sessionIdRef]);

  const handleReset = useCallback(() => {
    stopRecording(); setSession(null); setGameHtml(''); setCurrentHunt(null);
    setPhase('idle');
  }, [stopRecording]);

  const focusIframe = useCallback(() => {
    iframeRef.current?.contentWindow?.focus();
    setNeedsFocus(false);
  }, []);

  // Detect when game loses focus
  useEffect(() => {
    if (phase === 'hunting') {
      const handleBlur = () => setNeedsFocus(true);
      const handleKeyDown = (e: KeyboardEvent) => {
        if (phase === 'hunting' && needsFocus) {
          focusIframe();
        }
      };
      window.addEventListener('blur', handleBlur);
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('blur', handleBlur);
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [phase, needsFocus, focusIframe]);

  // Idle screen animation state
  const [idleTime, setIdleTime] = useState(0);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [logoTransform, setLogoTransform] = useState('translate(0, 0)');
  const [idleParticles, setIdleParticles] = useState(() => 
    Array.from({ length: 30 }, () => ({
      x: 0,
      y: 0,
      vx: (Math.random() - 0.5) * 30,
      vy: (Math.random() - 0.5) * 30,
      size: 2 + Math.random() * 4,
      color: ['#22d3ee', '#ef4444', '#f97316', '#fbbf24', '#fff'][Math.floor(Math.random() * 5)],
      life: 1,
      type: Math.random() > 0.7 ? 'enemy' : Math.random() > 0.4 ? 'player' : 'particle'
    }))
  );

  // Initialize particle positions on client
  useEffect(() => {
    setIdleParticles(prev => prev.map(p => ({
      ...p,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
    })));
  }, []);

  // Update logo transform on mouse move
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePos({ x: e.clientX, y: e.clientY });
      setLogoTransform(`translate(${(e.clientX - window.innerWidth/2) * 0.02}px, ${(e.clientY - window.innerHeight/2) * 0.02}px)`);
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  useEffect(() => {
    let raf: number;
    const animate = (now: number) => {
      setIdleTime(now);
      setIdleParticles(prev => prev.map(p => {
        const next = { ...p };
        next.x += next.vx * 0.016;
        next.y += next.vy * 0.016;
        next.vx *= 0.995;
        next.vy *= 0.995;
        
        // Wrap around screen
        if (next.x < -50) next.x = window.innerWidth + 50;
        if (next.x > window.innerWidth + 50) next.x = -50;
        if (next.y < -50) next.y = window.innerHeight + 50;
        if (next.y > window.innerHeight + 50) next.y = -50;
        
        // Gentle attraction to mouse
        const dx = mousePos.x - next.x;
        const dy = mousePos.y - next.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 200 && dist > 0) {
          next.vx -= (dx / dist) * 50;
          next.vy -= (dy / dist) * 50;
        }
        return next;
      }));
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [mousePos]);

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  if (phase === 'idle') {
    return (
      <div 
        className="min-h-screen bg-[#0A0A0A] text-[#F8F6F3] flex flex-col items-center justify-center p-6 relative overflow-hidden"
        onMouseMove={handleMouseMove}
      >
        {/* Scene3D background */}
        <Scene3D dark={true} phase="idle" className="opacity-30" />
        
        {/* Floating particles canvas */}
        <canvas
          className="fixed inset-0 pointer-events-none z-10 w-full h-full"
          ref={((canvas) => {
            if (canvas) {
              canvas.width = window.innerWidth;
              canvas.height = window.innerHeight;
              const ctx = canvas.getContext('2d');
              const draw = () => {
                if (!ctx) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                idleParticles.forEach(p => {
                  ctx.save();
                  ctx.globalAlpha = 0.6;
                  ctx.translate(p.x, p.y);
                  
                  if (p.type === 'player') {
                    // Cyan triangle player
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.moveTo(0, -p.size * 2);
                    ctx.lineTo(p.size, p.size);
                    ctx.lineTo(-p.size, p.size);
                    ctx.closePath();
                    ctx.fill();
                    // Engine glow
                    ctx.fillStyle = '#22d3ee';
                    ctx.globalAlpha = 0.3;
                    ctx.beginPath();
                    ctx.ellipse(0, p.size * 1.5, p.size * 1.5, p.size * 0.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                  } else if (p.type === 'enemy') {
                    // Red diamond enemy
                    ctx.fillStyle = p.color;
                    ctx.rotate(idleTime / 1000);
                    ctx.beginPath();
                    for (let s = 0; s < 8; s++) {
                      const a = (s / 8) * Math.PI * 2;
                      const r = p.size * (s % 2 === 0 ? 1 : 0.6);
                      ctx.lineTo(Math.cos(a) * p.size, Math.sin(a) * p.size);
                    }
                    ctx.closePath();
                    ctx.fill();
                  } else {
                    // Glowing particle
                    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
                    grad.addColorStop(0, p.color);
                    grad.addColorStop(1, 'transparent');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(0, 0, p.size * 2, 0, Math.PI * 2);
                    ctx.fill();
                  }
                  ctx.restore();
                });
                requestAnimationFrame(() => {});
              };
              const loop = () => {
                draw();
                requestAnimationFrame(loop);
              };
              canvas.width = window.innerWidth;
              canvas.height = window.innerHeight;
              loop();
            }
          })}
        />

        <div className="relative z-20 flex flex-col items-center justify-center min-h-screen w-full px-6">
          {/* RAVEL Logo with hover reaction */}
          <div className="mb-8">
            <motion.h1 
              className="font-editorial text-8xl md:text-9xl tracking-tight select-none"
              style={{ 
                transform: logoTransform
              }}
              animate={{ 
                scale: [1, 1.02, 1],
                textShadow: [
                  '0 0 20px #C8A882',
                  '0 0 40px #C8A882, 0 0 60px #22d3ee',
                  '0 0 20px #C8A882'
                ]
              }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              RAVEL
            </motion.h1>
            
            {/* Subtitle with animated text */}
            <motion.h2 
              className="text-2xl md:text-3xl text-[#C8A882] font-editorial mb-4 tracking-widest"
              animate={{ 
                opacity: [0.7, 1, 0.7],
                letterSpacing: ['0.1em', '0.2em', '0.1em']
              }}
              transition={{ duration: 4, repeat: Infinity }}
            >
              AI BUILDS. YOU BREAK. AI ADAPTS.
            </motion.h2>

            {/* Concept explanation with animated icons */}
            <div className="mt-8 mb-12 w-full max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {[
                  { 
                    id: 'builds', 
                    label: 'AI BUILDS', 
                    desc: 'AI writes the enemy brain', 
                    color: '#C8A882',
                    bg: 'rgba(200,168,130,0.1)',
                    border: 'rgba(200,168,130,0.3)',
                    glow: 'rgba(200,168,130,0.4)'
                  },
                  { 
                    id: 'attacks', 
                    label: 'YOU ATTACK', 
                    desc: 'You find the bugs by playing', 
                    color: '#22d3ee',
                    bg: 'rgba(34,211,238,0.1)',
                    border: 'rgba(34,211,238,0.3)',
                    glow: 'rgba(34,211,238,0.4)'
                  },
                  { 
                    id: 'adapts', 
                    label: 'AI ADAPTS', 
                    desc: 'AI rewrites code from your moves', 
                    color: '#ef4444',
                    bg: 'rgba(239,68,68,0.1)',
                    border: 'rgba(239,68,68,0.3)',
                    glow: 'rgba(239,68,68,0.4)'
                  }
                ].map((step, i) => (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + i * 0.15, duration: 0.6 }}
                    className="group relative p-6 rounded-2xl bg-[{step.bg}] border border-[{step.border}] backdrop-blur-sm hover:border-white/30 hover:bg-white/10 transition-all duration-300 overflow-hidden"
                    whileHover={{ scale: 1.05, y: -4 }}
                    style={{ boxShadow: `0 0 30px ${step.glow}` }}
                  >
                    {/* Animated icon background */}
                    <div className="absolute inset-0 opacity-10 pointer-events-none">
                      <motion.div
                        className="absolute inset-0"
                        animate={{
                          background: [
                            `radial-gradient(circle at 20% 20%, ${step.glow} 0%, transparent 50%)`,
                            `radial-gradient(circle at 80% 80%, ${step.glow} 0%, transparent 50%)`,
                            `radial-gradient(circle at 20% 20%, ${step.glow} 0%, transparent 50%)`
                          ]
                        }}
                        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    </div>
                    
                    <div className="relative z-10 text-center">
                      {/* Animated icon */}
                      <motion.div
                        className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                        style={{ background: step.bg, border: `1px solid ${step.border}` }}
                        animate={{
                          scale: [1, 1.05, 1],
                          rotate: [0, 2, -2, 0],
                          boxShadow: [
                            `0 0 20px ${step.glow}`,
                            `0 0 40px ${step.glow}`,
                            `0 0 20px ${step.glow}`
                          ]
                        }}
                        transition={{ duration: 3, repeat: Infinity }}
                      >
                        {step.id === 'builds' && (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={step.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <path d="M8 21h8M12 17v4" />
                          </svg>
                        )}
                        {step.id === 'attacks' && (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={step.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        )}
                        {step.id === 'adapts' && (
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={step.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M23 4v6h-6" />
                            <path d="M1 20v-6h6" />
                            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                          </svg>
                        )}
                        <motion.div
                          className="absolute inset-0 rounded-2xl"
                          animate={{ 
                            borderColor: [
                              step.color,
                              `rgba(255,255,255,0.3)`,
                              step.color
                            ],
                            borderWidth: ['1px', '2px', '1px']
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        />
                      </motion.div>
                      
                      <div className="font-bold text-lg text-white mb-2">{step.label}</div>
                      <div className="text-sm text-white/60">{step.desc}</div>
                      
                      {/* Animated progress bar */}
                      <div className="mt-4 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full rounded-full"
                          style={{ background: step.color, transformOrigin: 'left' }}
                          animate={{ 
                            scaleX: [0, 1, 0],
                            opacity: [0.6, 1, 0.6]
                          }}
                          transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Live demo of the concept */}
              <motion.div 
                className="bg-black/30 border border-white/10 rounded-2xl p-6 max-w-4xl mx-auto"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, duration: 0.5 }}
              >
                <div className="text-xs font-mono text-[#C8A882] tracking-widest mb-4 text-center">THE LOOP IN 15 SECONDS</div>
                <div className="space-y-3 text-sm text-white/70">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#C8A882]/20 flex items-center justify-center text-xs font-bold shrink-0">1</div>
                    <span>AI builds enemy AI that chases <strong>nearest target</strong> (bug: chases decoys)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#22d3ee]/20 flex items-center justify-center text-xs font-bold shrink-0">2</div>
                    <span>You drop <span className="text-[#22d3ee]">decoys</span> — enemies fall for it</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#ef4444]/20 flex items-center justify-center text-xs font-bold shrink-0">3</div>
                    <span>Click <strong>"I BROKE IT"</strong> — your exact moves sent to AI</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#f97316]/20 flex items-center justify-center text-xs font-bold shrink-0">4</div>
                    <span>AI rewrites enemy brain. RAVEL replays your moves: <strong>old fails, new survives</strong></span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#22d3ee]/20 flex items-center justify-center text-xs font-bold shrink-0">5</div>
                    <span>Fixed build goes live. AI starts next build. You attack again.</span>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Launch button */}
            <motion.button
              onClick={launchDemo}
              className="bg-gradient-to-r from-[#F5F5F5] to-[#E0E0E0] text-[#0A0A0A] px-12 py-5 rounded-2xl font-bold text-lg tracking-widest flex items-center gap-3 hover:scale-105 transition-all duration-200 shadow-[0_0_30px_rgba(245,245,245,0.3)]"
              whileHover={{ scale: 1.08, boxShadow: '0 0 50px rgba(245,245,245,0.5)' }}
              whileTap={{ scale: 0.95 }}
              style={{ willChange: 'transform' }}
            >
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Zap className="w-7 h-7" />
              </motion.div>
              <span className="font-bold tracking-widest">ENTER THE ARENA</span>
              <motion.div
                animate={{ x: [0, 8, 0] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </motion.div>
            </motion.button>

            {/* Easter egg hint */}
            <motion.p 
              className="mt-10 text-xs text-white/30 font-mono tracking-widest"
              animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              Move your mouse — the particles follow. Press SPACE in-game for decoys. SHIFT to dash.
            </motion.p>

            {/* Stats ticker */}
            <motion.div 
              className="mt-16 flex flex-wrap justify-center gap-8 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2, duration: 0.8 }}
            >
              <div>
                <div className="text-3xl font-bold text-[#22d3ee] font-mono">19</div>
                <div className="text-xs text-white/40">PRIZES</div>
              </div>
              <div className="relative">
                <div className="text-3xl font-bold text-[#ef4444] font-mono">1000+</div>
                <div className="text-xs text-white/40">BUILDS</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-[#f97316] font-mono">∞</div>
                <div className="text-xs text-white/40">REPLAYS</div>
              </div>
            </motion.div>
          </div>
        </div>

        <style jsx>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-10px) rotate(2deg); }
          }
          @keyframes pulse-glow {
            0%, 100% { opacity: 0.3; }
            50% { opacity: 0.8; }
          }
        `}</style>
      </div>
    );
  }

  const building = phase === 'patching' || phase === 'verifying';

  return (
    <div className={`min-h-screen bg-[#0A0A0A] text-[#F8F6F3] overflow-hidden relative ${shaking ? 'screen-shake' : ''}`}>
      {/* Decorative background - dimmed so game is dominant */}
      <Scene3D dark={true} phase={phase} className="opacity-20" />

      {/* Full screen game frame - the actual 2D canvas game */}
      <div 
        className="absolute inset-0 z-0 pointer-events-auto cursor-crosshair"
        onClick={focusIframe}
        onMouseEnter={() => focusIframe()}
      >
        <iframe 
          ref={iframeRef} 
          srcDoc={gameHtml} 
          className="w-full h-full border-0 crt-flicker" 
          sandbox="allow-scripts allow-same-origin" 
          title="Game" 
          onLoad={() => iframeRef.current?.contentWindow?.focus()}
        />
        
        {/* Focus helper overlay */}
        {needsFocus && phase === 'hunting' && (
          <motion.div 
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="bg-black/80 backdrop-blur-sm border border-white/20 px-6 py-3 rounded-xl text-center">
              <div className="font-mono text-xs text-white/50 tracking-widest mb-1">CLICK TO FOCUS</div>
              <div className="text-sm text-white/80 font-medium">Click anywhere or press any key to focus game</div>
            </div>
          </motion.div>
        )}
      </div>

      {/* FIRST-TIME ONBOARDING OVERLAY */}
      {showOnboarding && phase === 'hunting' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-auto bg-black/95">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="bg-black/95 backdrop-blur-xl border border-white/10 p-8 rounded-2xl max-w-2xl w-full mx-4 shadow-2xl text-center">
            <div className="text-[#C8A882] font-editorial text-4xl mb-2">RAVEL</div>
            <div className="text-white/60 text-sm mb-6 font-mono tracking-widest">AI BUILDS. YOU BREAK. AI ADAPTS.</div>
            
            <div className="bg-white/5 border border-white/10 p-6 rounded-xl mb-6 text-left">
              <div className="text-[#C8A882] font-bold text-lg mb-3">THE GAME</div>
              <div className="text-white/80 text-sm leading-relaxed mb-4">
                You're the cyan triangle. <span className="font-mono text-[#22d3ee]">ARROWS / WASD</span> to move. 
                <span className="font-mono text-[#ef4444]">RED CIRCLES</span> are enemies — they chase the <b>nearest target</b>.
              </div>
              <div className="text-white/80 text-sm leading-relaxed mb-4">
                Press <span className="font-mono text-[#22d3ee]">SPACE</span> to drop a <span className="font-mono text-[#22d3ee]">DECOY</span> (cyan circle). 
                Enemies target the <b>nearest entity</b> — decoy OR you. <span className="text-[#C06060]">THAT'S THE BUG.</span> They should ignore decoys.
              </div>
              <div className="text-white/80 text-sm leading-relaxed">
                <b>YOUR JOB:</b> Bait an enemy into attacking your decoy. When it falls for the bait, click <span className="font-mono text-[#C06060]">"I BROKE IT"</span>.
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 p-6 rounded-xl mb-6 text-left">
              <div className="text-[#C8A882] font-bold text-lg mb-3">THE LOOP</div>
              <div className="text-white/70 text-sm leading-relaxed space-y-2">
                <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#C8A882]/20 flex items-center justify-center text-xs font-bold">1</span> AI builds the arena. You wait.</div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#C8A882]/20 flex items-center justify-center text-xs font-bold">2</span> While AI works on the NEXT build, you attack THIS one.</div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#C8A882]/20 flex items-center justify-center text-xs font-bold">3</span> Your attack becomes evidence. AI patches the bug.</div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#C8A882]/20 flex items-center justify-center text-xs font-bold">4</span> RAVEL replays your EXACT attack on old + new build. Proof: old fails, new survives.</div>
                <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-[#C8A882]/20 flex items-center justify-center text-xs font-bold">5</span> New build becomes live. AI starts next build. You attack again.</div>
              </div>
            </div>

            <button onClick={() => { setShowOnboarding(false); setTimeout(() => iframeRef.current?.contentWindow?.focus(), 100); }} className="w-full mt-6 bg-[#F5F5F5] text-[#0A0A0A] py-4 rounded-xl font-bold text-sm tracking-widest hover:scale-[1.02] transition-transform">
              GOT IT — ENTER THE ARENA
            </button>
          </motion.div>
        </div>
      )}

      {/* HUD OVERLAY - Pointer events none so you can click through to game */}
      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-8">
        
        {/* TOP ROW */}
        <div className="flex justify-between items-start w-full">
          <div className="pointer-events-auto">
            <button onClick={handleReset} className="font-editorial text-4xl hover:text-white/70 transition-colors drop-shadow-md">
              RAVEL
            </button>
          </div>
          
          <div className="font-mono text-2xl font-bold tracking-widest drop-shadow-md">
            BUILD {pad(session?.currentVersion || 1)}
          </div>
          
          <div className="font-mono text-sm tracking-widest text-[#C8A882] drop-shadow-md">
            AI SURVIVAL {pad((session?.totalBuilds || 1) - 1)}
          </div>
        </div>

        {/* MIDDLE - LEFT: CHALLENGE */}
        {phase === 'hunting' && currentHunt && (
          <div className="absolute left-8 top-1/2 -translate-y-1/2 w-72 bg-black/50 backdrop-blur-md border border-white/10 p-5 rounded-xl pointer-events-auto">
            <div className="text-[#C8A882] font-mono text-[10px] tracking-widest mb-1">HUNT {pad(huntNumber)}</div>
            <div className="font-bold text-lg mb-2 leading-tight">{currentHunt.title}</div>
            
            <div className="bg-[#C06060]/10 border border-[#C06060]/30 p-3 rounded-lg mb-3 text-xs text-white/80 leading-relaxed">
              <span className="font-bold text-[#C06060]">THE BUG:</span> Enemies target the nearest thing — decoy OR you. They should ignore decoys.
            </div>
            
            <div className="text-xs text-white/60 leading-relaxed mb-3">{currentHunt.objective}</div>
            <div className="text-[10px] text-[#22d3ee] font-mono mb-3 tracking-widest">ARROWS/WASD = MOVE  |  SPACE = DECOY</div>
            
            <button onClick={handleCapture} className="w-full py-3 bg-[#C06060]/20 border border-[#C06060]/40 text-[#C06060] rounded-lg text-sm font-medium hover:bg-[#C06060]/30 transition-colors flex items-center justify-center gap-2">
              <Bug className="w-4 h-4" /> I BROKE IT — SUBMIT ATTACK
            </button>
          </div>
        )}

        {/* CENTER OVERLAYS FOR CAPTURE/PATCH/RESULT */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <AnimatePresence>
            {phase === 'capturing' && (
              <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
                className="text-center bg-black/80 backdrop-blur-xl p-12 rounded-3xl border border-white/10 pointer-events-auto">
                <div className="text-[#C06060] font-editorial text-7xl mb-2">{captureMessage}</div>
                <div className="text-[#C06060]/70 font-mono text-sm tracking-widest uppercase">CAPTURED {eventCount} EVENTS</div>
              </motion.div>
            )}

            {phase === 'patching' && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="text-center bg-black/80 backdrop-blur-xl p-10 rounded-2xl border border-white/10 pointer-events-auto min-w-[400px]">
                <div className="text-[#C8A882] font-editorial text-4xl mb-2">AI IS ADAPTING</div>
                <div className="text-white/50 text-sm mb-6">Your attack is being replayed against the next build. The game stays live below — you can keep playing.</div>
                
                <div className="flex items-center justify-center gap-4 text-xs font-mono text-white/50 mb-6">
                  <div className="px-3 py-1 bg-white/5 rounded">BUILD {pad(session?.currentVersion || 1)}</div>
                  <ArrowRight className="w-4 h-4"/>
                  <div className="px-3 py-1 bg-[#C8A882]/10 text-[#C8A882] border border-[#C8A882]/20 rounded flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" /> BUILD {pad((session?.currentVersion || 1) + 1)}
                  </div>
                </div>
                
                <div className="text-[10px] uppercase tracking-widest text-white/40">The game stays playable while AI works</div>
              </motion.div>
            )}

{phase === 'result' && patchRound && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-black/90 backdrop-blur-2xl border border-white/10 p-8 rounded-2xl max-w-2xl w-full pointer-events-auto shadow-2xl">
                <div className="text-center mb-6">
                  <div className="text-[#C8A882] font-mono text-xs tracking-[0.2em] mb-2">NEW BUILD PROMOTED</div>
                  <div className="font-editorial text-5xl text-white mb-1">THE AI ADAPTED.</div>
                  <div className="text-white/50 text-sm">Your attack forced the change. The new build survived your exact attack.</div>
                </div>

                <div className="mb-6 bg-white/5 p-4 rounded-xl border border-white/5 text-center overflow-x-auto">
                  <div className="text-[10px] text-white/40 font-mono uppercase mb-3">YOUR ATTACK SEQUENCE</div>
                  <div className="flex items-center justify-center gap-2 text-xs font-mono text-[#C8A882] flex-wrap">
                    {trace.map((t, i) => (
                      <span key={i} className="flex items-center gap-2">
                        {t} {i < trace.length - 1 && <ArrowRight className="w-3 h-3 opacity-50"/>}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-[#C06060]/10 border border-[#C06060]/20 p-5 rounded-xl text-center">
                    <div className="text-[#C06060] font-mono text-sm tracking-widest mb-2">OLD BUILD {pad(patchRound.oldVersion)}</div>
                    <div className="text-[#C06060] font-mono text-xs mb-2">Your attack: DECOY ATTACKED</div>
                    <div className="flex items-center justify-center gap-2 text-[#C06060] font-bold text-lg">
                      <XCircle className="w-6 h-6" /> BUG REPRODUCED
                    </div>
                  </div>
                  
                  <div className="bg-[#C8A882]/10 border border-[#C8A882]/20 p-5 rounded-xl text-center">
                    <div className="text-[#C8A882] font-mono text-sm tracking-widest mb-2">NEW BUILD {pad(patchRound.newVersion)}</div>
                    <div className="text-[#C8A882] font-mono text-xs mb-2">Same attack: PLAYER ATTACKED</div>
                    <div className="flex items-center justify-center gap-2 text-[#C8A882] font-bold text-lg">
                      <CheckCircle className="w-6 h-6" /> BUG FIXED
                    </div>
                  </div>
                </div>
                
                <div className="mb-6 p-4 bg-white/5 border border-white/5 rounded-xl text-sm text-white/70">
                  <div className="text-[10px] font-mono uppercase text-white/40 mb-1">AI EXPLANATION</div>
                  {patchRound.explanation}
                </div>

                <button onClick={handleNextHunt} className="w-full bg-[#F5F5F5] text-[#0A0A0A] py-4 rounded-xl font-bold text-sm tracking-widest hover:scale-[1.02] transition-transform">
                  HUNT {pad(huntNumber + 1)} — THE ADAPTED AI IS WAITING
                </button>
              </motion.div>
            )}
            
            {phase === 'refused' && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-black/90 backdrop-blur-2xl border border-[#C06060]/30 p-8 rounded-2xl max-w-xl w-full pointer-events-auto text-center">
                <div className="text-[#C06060] font-editorial text-5xl mb-4">NOT A REAL BREAK</div>
                <p className="text-white/60 text-sm mb-8">{refusal}</p>
                <button onClick={handleNextHunt} className="bg-white/10 text-white px-8 py-3 rounded-xl text-sm font-medium hover:bg-white/20 transition-colors">
                  TRY AGAIN
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* BOTTOM ROW */}
        <div className="flex justify-between items-end w-full">
          <div className="font-mono text-xs tracking-widest text-[#C06060] flex items-center gap-2">
            {phase === 'hunting' && (
              <><span className="w-2 h-2 rounded-full bg-[#C06060] animate-pulse" /> REC {eventCount} EVENTS</>
            )}
          </div>
          
          <div className="font-mono text-xs tracking-widest text-white/40">
            {building ? (
              <span className="text-[#C8A882] flex items-center gap-2">
                <RefreshCw className="w-3 h-3 animate-spin" /> AI BUILDING NEXT
              </span>
            ) : (
              phase === 'hunting' && 'AI WAITING FOR ATTACK'
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
