'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, RotateCcw, GitBranch, Zap, Clock, ArrowRight } from 'lucide-react';
import { BranchGraph } from './BranchGraph';
import { BranchCard } from './BranchCard';
import { StreamDisplay } from './StreamDisplay';
import { ComparisonView } from './ComparisonView';
import type { Branch, StreamChunk, InterventionType } from '@/types';

const DEMO_PROMPTS = [
  "Design a nightclub in Lagos that feels like it was built inside a crashed spaceship.",
  "Write the opening chapter of a noir novel set in a city where gravity sometimes reverses.",
  "Create a brand identity for an AI-powered cooking assistant that speaks like a grandmother.",
  "Design a mobile app interface for a service that lets you rent other people's dreams.",
];

export function MorphWindow() {
  const [prompt, setPrompt] = useState('');
  const [session, setSession] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [streamText, setStreamText] = useState('');
  const [showComparison, setShowComparison] = useState(false);
  const [streamStartTime, setStreamStartTime] = useState<number>(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const streamRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isStreaming || !streamStartTime) return;
    const interval = setInterval(() => {
      setElapsedTime(Date.now() - streamStartTime);
    }, 100);
    return () => clearInterval(interval);
  }, [isStreaming, streamStartTime]);

  const handleStart = useCallback(async () => {
    if (!prompt.trim()) return;

    const res = await fetch('/api/morph/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.trim() }),
    });

    const data = await res.json();
    setSession(data.sessionId);
    setBranches([]);
    setStreamText('');
    setShowComparison(false);
    setIsStreaming(true);
    setStreamStartTime(Date.now());

    const es = new EventSource(`/api/morph/stream?sessionId=${data.sessionId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      const chunk: StreamChunk = JSON.parse(event.data);

      switch (chunk.type) {
        case 'text':
          setStreamText(prev => prev + (chunk.content || ''));
          break;
        case 'branch_detected':
          if (chunk.branch) {
            setBranches(prev => [...prev, chunk.branch!]);
          }
          break;
        case 'done':
          setIsStreaming(false);
          es.close();
          break;
        case 'error':
          setIsStreaming(false);
          es.close();
          break;
      }
    };

    es.onerror = () => {
      setIsStreaming(false);
      es.close();
    };
  }, [prompt]);

  const handleIntervene = useCallback(async (branchId: string, type: InterventionType, mutation?: string) => {
    if (!session) return;

    await fetch('/api/morph/intervene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: session,
        branchId,
        type,
        mutation,
      }),
    });

    setBranches(prev =>
      prev.map(b => {
        if (b.id === branchId) {
          return { ...b, status: type === 'kill' ? 'killed' : type === 'select' ? 'selected' : b.status };
        }
        return b;
      })
    );
  }, [session]);

  const handleReset = useCallback(() => {
    eventSourceRef.current?.close();
    setSession(null);
    setBranches([]);
    setStreamText('');
    setShowComparison(false);
    setIsStreaming(false);
    setElapsedTime(0);
  }, []);

  const handleDemoPrompt = useCallback(() => {
    const randomPrompt = DEMO_PROMPTS[Math.floor(Math.random() * DEMO_PROMPTS.length)];
    setPrompt(randomPrompt);
  }, []);

  const activeBranches = branches.filter(b => b.status === 'active');
  const inactiveBranches = branches.filter(b => b.status !== 'active');

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Header */}
      <header className="border-b border-white/10 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">MORPH</h1>
            <span className="text-xs text-white/40 font-mono">shape AI before it finishes</span>
          </div>
          {isStreaming && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Clock className="w-4 h-4" />
              <span className="font-mono">{(elapsedTime / 1000).toFixed(1)}s</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {!session ? (
          /* Prompt Entry */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto"
          >
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
                Shape AI before it finishes
              </h2>
              <p className="text-white/50 text-lg">
                Enter a creative prompt. While AI generates, explore its possible futures.
                <br />
                Kill directions. Merge ideas. Mutate trajectories. Watch it evolve.
              </p>
            </div>

            <div className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe something you want AI to create..."
                className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-5 py-4 text-lg placeholder:text-white/30 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleStart();
                  }
                }}
              />
              <div className="absolute bottom-3 right-3 flex gap-2">
                <button
                  onClick={handleDemoPrompt}
                  className="px-3 py-1.5 text-xs text-white/40 hover:text-white/70 border border-white/10 rounded-lg hover:border-white/20 transition-colors"
                >
                  Try a demo
                </button>
                <button
                  onClick={handleStart}
                  disabled={!prompt.trim()}
                  className="px-4 py-1.5 text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:bg-white/10 disabled:text-white/30 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Play className="w-3 h-3" />
                  Start
                </button>
              </div>
            </div>
            <p className="text-center text-white/30 text-xs mt-3">
              Press ⌘+Enter to start
            </p>
          </motion.div>
        ) : showComparison ? (
          /* Comparison View */
          <ComparisonView sessionId={session} onReset={handleReset} />
        ) : (
          /* Morph Window */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Stream + Controls */}
            <div className="lg:col-span-2 space-y-4">
              {/* Prompt Bar */}
              <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex items-center justify-between">
                <div className="flex-1 truncate text-sm text-white/70">{prompt}</div>
                <div className="flex items-center gap-2 ml-4">
                  {isStreaming && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
                      <span className="text-xs text-violet-400">Generating</span>
                    </div>
                  )}
                  {!isStreaming && streamText && (
                    <button
                      onClick={() => setShowComparison(true)}
                      className="px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors flex items-center gap-2"
                    >
                      Compare
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={handleReset}
                    className="p-1.5 text-white/40 hover:text-white/70 border border-white/10 rounded-lg hover:border-white/20 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Stream Display */}
              <div className="bg-white/[0.02] border border-white/10 rounded-xl p-6 min-h-[400px] max-h-[600px] overflow-y-auto" ref={streamRef}>
                <StreamDisplay text={streamText} isStreaming={isStreaming} />
              </div>
            </div>

            {/* Right: Branches */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <GitBranch className="w-4 h-4" />
                <span>Possibility Space</span>
                <span className="ml-auto text-xs text-white/30">{activeBranches.length} active</span>
              </div>

              {activeBranches.length === 0 && !isStreaming && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                  <GitBranch className="w-8 h-8 mx-auto mb-3 text-white/20" />
                  <p className="text-sm text-white/40">
                    {isStreaming ? 'Detecting branches...' : 'No branches detected yet'}
                  </p>
                </div>
              )}

              {activeBranches.length === 0 && isStreaming && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center">
                  <div className="w-8 h-8 mx-auto mb-3 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                  <p className="text-sm text-white/40">AI is exploring possibilities...</p>
                </div>
              )}

              <AnimatePresence mode="popLayout">
                {activeBranches.map((branch, i) => (
                  <motion.div
                    key={branch.id}
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -20 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <BranchCard
                      branch={branch}
                      onIntervene={(type, mutation) => handleIntervene(branch.id, type, mutation)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>

              {inactiveBranches.length > 0 && (
                <div className="border-t border-white/10 pt-4">
                  <p className="text-xs text-white/30 mb-3">Resolved</p>
                  {inactiveBranches.map(branch => (
                    <div
                      key={branch.id}
                      className="text-xs text-white/20 py-1.5 flex items-center gap-2"
                    >
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        branch.status === 'killed' ? 'bg-red-500/50' :
                        branch.status === 'selected' ? 'bg-green-500/50' :
                        'bg-yellow-500/50'
                      }`} />
                      <span className="line-through">{branch.label}</span>
                      <span className="ml-auto text-white/10">{branch.status}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Evolution Graph */}
              {branches.length > 0 && (
                <div className="border-t border-white/10 pt-4">
                  <BranchGraph branches={branches} />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
