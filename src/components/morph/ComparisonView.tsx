'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, Skull, Sparkles, Merge, RotateCcw } from 'lucide-react';
import type { ComparisonResult } from '@/types';

interface ComparisonViewProps {
  sessionId: string;
  onReset: () => void;
}

export function ComparisonView({ sessionId, onReset }: ComparisonViewProps) {
  const [data, setData] = useState<ComparisonResult | null>(null);
  const [session, setSession] = useState<{ prompt?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/morph/session?sessionId=${sessionId}`)
      .then(r => r.json())
      .then(d => {
        setData(d.comparison);
        setSession(d.session);
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || !session) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
    >
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Morph Complete</h2>
        <p className="text-white/50 text-sm">{session.prompt}</p>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          icon={<GitBranch className="w-4 h-4" />}
          label="Branches Detected"
          value={data.branchesDetected}
        />
        <MetricCard
          icon={<Sparkles className="w-4 h-4" />}
          label="Interventions"
          value={data.interventionsCount}
        />
        <MetricCard
          icon={<Skull className="w-4 h-4" />}
          label="Directions Killed"
          value={data.branchesKilled}
        />
        <MetricCard
          icon={<Merge className="w-4 h-4" />}
          label="Directions Merged"
          value={data.branchesMerged}
        />
      </div>

      {/* Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Original */}
        <div className="bg-white/[0.02] border border-white/10 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-white/20" />
            <span className="text-sm font-medium text-white/60">Without You</span>
          </div>
          <div className="text-sm text-white/50 leading-relaxed max-h-[300px] overflow-y-auto">
            {data.originalOutput || 'No original output captured'}
          </div>
        </div>

        {/* Morphed */}
        <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-violet-500" />
            <span className="text-sm font-medium text-violet-400">With You</span>
          </div>
          <div className="text-sm text-white/70 leading-relaxed max-h-[300px] overflow-y-auto">
            {data.morphedOutput}
          </div>
        </div>
      </div>

      {/* Impact Statement */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-8 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 rounded-xl p-6 text-center"
      >
        <p className="text-lg text-white/90">
          <span className="text-violet-400 font-bold">{data.interventionsCount} interventions</span>
          {' '}changed{' '}
          <span className="text-fuchsia-400 font-bold">{data.downstreamChanges} downstream decisions</span>
        </p>
        <p className="text-sm text-white/40 mt-2">
          Your choices didn&apos;t edit the result. They shaped what the AI became.
        </p>
      </motion.div>

      {/* Actions */}
      <div className="flex justify-center gap-4 mt-8">
        <button
          onClick={onReset}
          className="px-6 py-2.5 text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          Start New Morph
        </button>
      </div>
    </motion.div>
  );
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-white/40 mb-2">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white/90">{value}</div>
    </div>
  );
}
