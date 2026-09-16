'use client';

import { motion } from 'framer-motion';
import type { Branch } from '@/types';
import { cn } from '@/lib/utils';

interface BranchGraphProps {
  branches: Branch[];
}

export function BranchGraph({ branches }: BranchGraphProps) {
  if (branches.length === 0) return null;

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4">
      <p className="text-xs text-white/40 mb-3 font-mono uppercase tracking-wider">Evolution</p>

      <div className="relative">
        {/* Main trunk line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-white/10" />

        {/* Branch nodes */}
        <div className="space-y-3">
          {branches.map((branch, i) => (
            <motion.div
              key={branch.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-3 relative"
            >
              {/* Node */}
              <div className={cn(
                'w-6 h-6 rounded-full border-2 flex items-center justify-center z-10 bg-[#0a0a0f]',
                branch.status === 'active' && 'border-violet-500',
                branch.status === 'killed' && 'border-red-500',
                branch.status === 'selected' && 'border-emerald-500',
                branch.status === 'merged' && 'border-amber-500',
              )}>
                <div className={cn(
                  'w-2 h-2 rounded-full',
                  branch.status === 'active' && 'bg-violet-500',
                  branch.status === 'killed' && 'bg-red-500',
                  branch.status === 'selected' && 'bg-emerald-500',
                  branch.status === 'merged' && 'bg-amber-500',
                )} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'text-xs font-medium truncate',
                    branch.status === 'killed' && 'text-red-400 line-through',
                    branch.status === 'selected' && 'text-emerald-400',
                    branch.status === 'active' && 'text-white/80',
                  )}>
                    {branch.label}
                  </span>
                  <span className="text-[10px] text-white/20 font-mono">{branch.type}</span>
                </div>
              </div>

              {/* Status */}
              <div className="text-[10px] text-white/30 font-mono uppercase">
                {branch.status}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
