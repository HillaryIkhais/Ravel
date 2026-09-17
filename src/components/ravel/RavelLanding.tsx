'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ArrowRight, Sun, Moon, Info, X } from 'lucide-react';

export function RavelLanding() {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showHow, setShowHow] = useState(false);
  const dk = theme === 'dark';

  return (
    <div className="min-h-screen relative flex flex-col items-center justify-center overflow-hidden" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: dk
          ? 'radial-gradient(ellipse at 50% 50%, rgba(200,168,130,0.06) 0%, transparent 60%)'
          : 'radial-gradient(ellipse at 50% 50%, rgba(139,115,85,0.04) 0%, transparent 60%)',
      }} />

      {/* Nav corner controls */}
      <div className="absolute top-6 right-6 flex items-center gap-4 z-50">
        <button onClick={() => setShowHow(true)} className="flex items-center gap-1.5 text-xs font-mono px-3 py-1.5 rounded-lg transition-all hover:opacity-80" style={{ border: '1px solid var(--border)', color: 'var(--muted)' }}>
          <Info className="w-3 h-3" /> How it works
        </button>
        <button onClick={() => setTheme(d => d === 'dark' ? 'light' : 'dark')} className="w-8 h-8 rounded-full flex items-center justify-center transition-colors" style={{ background: dk ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }}>
          {dk ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
      </div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }} className="relative z-10 w-full max-w-4xl px-6 flex flex-col items-center text-center">
        
        <h1 className="font-editorial text-7xl sm:text-8xl md:text-9xl leading-[0.9] tracking-tight mb-4">
          RAVEL
        </h1>
        <h2 className="font-editorial text-3xl sm:text-4xl md:text-5xl leading-tight mb-12" style={{ color: dk ? '#C8A882' : '#8B7355' }}>
          BREAK WHAT AI BUILT.
        </h2>
        
        <div className="text-base sm:text-lg max-w-md mx-auto mb-16 space-y-2 font-mono" style={{ color: 'var(--muted)' }}>
          <p>AI is building the next version.</p>
          <p>Break this one before it ships.</p>
        </div>

        <button
          onClick={() => router.push('/play')}
          className="group px-12 py-5 text-lg font-medium rounded-xl transition-all duration-300 hover:scale-[1.02]"
          style={{
            background: dk ? '#F5F5F5' : '#111',
            color: dk ? '#0A0A0A' : '#F8F6F3',
            boxShadow: dk ? '0 8px 32px rgba(200,168,130,0.2)' : '0 8px 32px rgba(139,115,85,0.15)',
          }}
        >
          <span className="flex items-center gap-3">
            <Zap className="w-5 h-5" />
            ENTER THE ARENA
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </span>
        </button>
      </motion.div>

      {/* How it works modal */}
      <AnimatePresence>
        {showHow && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ background: dk ? 'rgba(10,10,10,0.8)' : 'rgba(248,246,243,0.8)', backdropFilter: 'blur(8px)' }}>
            <motion.div initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }} className="w-full max-w-xl rounded-2xl p-8 relative" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <button onClick={() => setShowHow(false)} className="absolute top-6 right-6" style={{ color: 'var(--muted)' }}>
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-editorial text-3xl mb-6">How it works</h3>
              <div className="space-y-4 text-sm font-mono leading-relaxed" style={{ color: 'var(--muted)' }}>
                <p><strong style={{ color: 'var(--fg)' }}>1.</strong> AI builds a game in real-time.</p>
                <p><strong style={{ color: 'var(--fg)' }}>2.</strong> You play it and find a weakness.</p>
                <p><strong style={{ color: 'var(--fg)' }}>3.</strong> The AI receives your exact attack trace and adapts.</p>
                <p><strong style={{ color: 'var(--fg)' }}>4.</strong> Your attack is replayed against both builds to prove the AI survived.</p>
                <p className="pt-4" style={{ color: dk ? '#C8A882' : '#8B7355' }}>The waiting isn&apos;t filler. It&apos;s the interval between two AI builds.</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
