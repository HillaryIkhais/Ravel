import fs from 'fs';

const content = `'use client';

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
      if (!pres.ok) { setRefusal('AI patch failed.'); setPhase('refused'); return; }
      
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
      } else {
        setRefusal('AI FAILED TO ADAPT. YOUR ATTACK SURVIVED.');
        setPhase('refused');
      }
    } catch { 
      setRefusal('Failed to submit your attack.'); setPhase('refused'); 
    }
  }, [session, currentHunt, stopRecording, triggerShake]);

  const handleNextHunt = useCallback(() => {
    setPhase('hunting'); 
    setCaptureMessage(''); setPatchRound(null); setOldVerdict(null); setNewVerdict(null);
    setRefusal('');
    setHuntNumber(n => n + 1);
    startRecording();
  }, [startRecording]);

  const handleReset = useCallback(() => {
    stopRecording(); setSession(null); setGameHtml(''); setCurrentHunt(null);
    setPhase('idle');
  }, [stopRecording]);

  if (phase === 'idle') {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F8F6F3] flex flex-col items-center justify-center p-6 text-center">
        <h1 className="font-editorial text-7xl mb-4">RAVEL</h1>
        <h2 className="text-3xl text-[#C8A882] font-editorial mb-8">BREAK WHAT AI BUILT.</h2>
        <p className="text-lg text-white/50 mb-12 font-mono">
          AI is building the next version.<br/>Break this one before it ships.
        </p>
        <button onClick={launchDemo} className="bg-[#F5F5F5] text-[#0A0A0A] px-10 py-4 rounded-xl font-medium flex items-center gap-2 hover:scale-105 transition-transform">
          <Zap className="w-5 h-5"/> ENTER THE ARENA
        </button>
      </div>
    );
  }

  const building = phase === 'patching' || phase === 'verifying';

  return (
    <div className={\`min-h-screen bg-[#0A0A0A] text-[#F8F6F3] overflow-hidden relative \${shaking ? 'screen-shake' : ''}\`}>
      <Scene3D dark={true} phase={phase} />

      {/* Full screen game frame */}
      <div className="absolute inset-0 z-0 pointer-events-auto">
        <iframe ref={iframeRef} srcDoc={gameHtml} className="w-full h-full border-0 crt-flicker" sandbox="allow-scripts" title="Game" />
      </div>

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
          <div className="absolute left-8 top-1/2 -translate-y-1/2 w-64 bg-black/40 backdrop-blur-md border border-white/10 p-5 rounded-xl pointer-events-auto">
            <div className="text-[#C8A882] font-mono text-[10px] tracking-widest mb-1">HUNT {pad(huntNumber)}</div>
            <div className="font-bold text-lg mb-2 leading-tight">{currentHunt.title}</div>
            <div className="text-xs text-white/60 leading-relaxed mb-4">{currentHunt.objective}</div>
            
            <button onClick={handleCapture} className="w-full py-2.5 bg-[#C06060]/20 border border-[#C06060]/40 text-[#C06060] rounded-lg text-sm font-medium hover:bg-[#C06060]/30 transition-colors flex items-center justify-center gap-2">
              <Bug className="w-4 h-4" /> I BROKE IT
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
                <div className="text-[#C8A882] font-editorial text-4xl mb-6">AI IS ADAPTING</div>
                
                <div className="flex items-center justify-center gap-4 text-xs font-mono text-white/50 mb-6">
                  <div className="px-3 py-1 bg-white/5 rounded">BUILD {pad(session?.currentVersion || 1)}</div>
                  <ArrowRight className="w-4 h-4"/>
                  <div className="px-3 py-1 bg-[#C8A882]/10 text-[#C8A882] border border-[#C8A882]/20 rounded flex items-center gap-2">
                    <RefreshCw className="w-3 h-3 animate-spin" /> BUILD {pad((session?.currentVersion || 1) + 1)}
                  </div>
                </div>
                
                <div className="text-[10px] uppercase tracking-widest text-white/40">You can keep playing...</div>
              </motion.div>
            )}

            {phase === 'result' && patchRound && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                className="bg-black/90 backdrop-blur-2xl border border-white/10 p-8 rounded-2xl max-w-2xl w-full pointer-events-auto shadow-2xl">
                <div className="text-center mb-8">
                  <div className="text-[#C8A882] font-mono text-xs tracking-[0.2em] mb-2">NEW BUILD READY</div>
                  <div className="font-editorial text-6xl text-white">THE AI ADAPTED.</div>
                </div>

                <div className="mb-8 bg-white/5 p-4 rounded-xl border border-white/5 text-center overflow-x-auto">
                  <div className="text-[10px] text-white/40 font-mono uppercase mb-3">YOUR ATTACK</div>
                  <div className="flex items-center justify-center gap-2 text-xs font-mono text-[#C8A882]">
                    {trace.map((t, i) => (
                      <span key={i} className="flex items-center gap-2">
                        {t} {i < trace.length - 1 && <ArrowRight className="w-3 h-3 opacity-50"/>}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="bg-[#C06060]/10 border border-[#C06060]/20 p-5 rounded-xl text-center">
                    <div className="text-[#C06060] font-mono text-sm tracking-widest mb-3">BUILD {pad(patchRound.oldVersion)}</div>
                    <div className="flex items-center justify-center gap-2 text-[#C06060] font-bold text-lg">
                      <XCircle className="w-6 h-6" /> FAILED
                    </div>
                  </div>
                  
                  <div className="bg-[#C8A882]/10 border border-[#C8A882]/20 p-5 rounded-xl text-center">
                    <div className="text-[#C8A882] font-mono text-sm tracking-widest mb-3">BUILD {pad(patchRound.newVersion)}</div>
                    <div className="flex items-center justify-center gap-2 text-[#C8A882] font-bold text-lg">
                      <CheckCircle className="w-6 h-6" /> SURVIVED
                    </div>
                  </div>
                </div>
                
                <div className="mb-8 p-4 bg-white/5 border border-white/5 rounded-xl text-sm text-white/70">
                  <div className="text-[10px] font-mono uppercase text-white/40 mb-1">Proof of Break #{pad(session?.totalBuilds || 1)}</div>
                  {patchRound.explanation}
                </div>

                <button onClick={handleNextHunt} className="w-full bg-[#F5F5F5] text-[#0A0A0A] py-4 rounded-xl font-bold text-sm tracking-widest hover:scale-[1.02] transition-transform">
                  HUNT {pad(huntNumber + 1)} — BREAK IT AGAIN
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
