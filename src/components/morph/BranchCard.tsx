'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Skull, Sparkles, ArrowRight, X } from 'lucide-react';
import type { Branch, InterventionType } from '@/types';
import { cn } from '@/lib/utils';

interface BranchCardProps {
  branch: Branch;
  onIntervene: (type: InterventionType, mutation?: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  direction: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
  style: 'from-purple-500/20 to-purple-600/10 border-purple-500/30',
  approach: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30',
  tone: 'from-amber-500/20 to-amber-600/10 border-amber-500/30',
  structure: 'from-rose-500/20 to-rose-600/10 border-rose-500/30',
  element: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/30',
};

const TYPE_ICONS: Record<string, string> = {
  direction: '→',
  style: '~',
  approach: '⊕',
  tone: '♪',
  structure: '⊞',
  element: '◆',
};

export function BranchCard({ branch, onIntervene }: BranchCardProps) {
  const [showMutate, setShowMutate] = useState(false);
  const [mutation, setMutation] = useState('');

  const colorClass = TYPE_COLORS[branch.type] || TYPE_COLORS.direction;
  const icon = TYPE_ICONS[branch.type] || '•';

  const handleMutate = () => {
    if (mutation.trim()) {
      onIntervene('mutate', mutation.trim());
      setMutation('');
      setShowMutate(false);
    }
  };

  return (
    <div className={cn(
      'relative bg-gradient-to-b border rounded-xl p-4 transition-all',
      colorClass
    )}>
      {/* Type badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-mono text-white/40 uppercase tracking-wider">
          {icon} {branch.type}
        </span>
        <div className="flex-1" />
        <div className="text-xs text-white/30 font-mono">
          {Math.round(branch.probability * 100)}%
        </div>
      </div>

      {/* Label */}
      <h3 className="text-sm font-semibold text-white/90 mb-1">{branch.label}</h3>
      <p className="text-xs text-white/50 leading-relaxed">{branch.description}</p>

      {/* Action buttons */}
      <div className="flex gap-2 mt-3">
        <button
          onClick={() => onIntervene('select')}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg transition-colors"
        >
          <ArrowRight className="w-3 h-3" />
          Select
        </button>
        <button
          onClick={() => onIntervene('kill')}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg transition-colors"
        >
          <Skull className="w-3 h-3" />
          Kill
        </button>
        <button
          onClick={() => setShowMutate(!showMutate)}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-lg transition-colors"
        >
          <Sparkles className="w-3 h-3" />
          Mutate
        </button>
      </div>

      {/* Mutate input */}
      {showMutate && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mt-3 flex gap-2"
        >
          <input
            type="text"
            value={mutation}
            onChange={(e) => setMutation(e.target.value)}
            placeholder="Describe the mutation..."
            className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-1.5 text-xs placeholder:text-white/30 focus:outline-none focus:border-violet-500/50"
            onKeyDown={(e) => e.key === 'Enter' && handleMutate()}
            autoFocus
          />
          <button
            onClick={handleMutate}
            disabled={!mutation.trim()}
            className="px-2 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:bg-white/10 rounded-lg transition-colors"
          >
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            onClick={() => { setShowMutate(false); setMutation(''); }}
            className="p-1.5 text-white/40 hover:text-white/70"
          >
            <X className="w-3 h-3" />
          </button>
        </motion.div>
      )}
    </div>
  );
}
