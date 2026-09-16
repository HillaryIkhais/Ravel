'use client';

import { motion } from 'framer-motion';

interface StreamDisplayProps {
  text: string;
  isStreaming: boolean;
}

export function StreamDisplay({ text, isStreaming }: StreamDisplayProps) {
  if (!text && isStreaming) {
    return (
      <div className="flex items-center gap-3 text-white/40">
        <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
        <span className="text-sm">AI is generating...</span>
      </div>
    );
  }

  if (!text) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/30">
        <div className="text-4xl mb-4">◇</div>
        <p className="text-sm">Waiting for generation to begin...</p>
      </div>
    );
  }

  const paragraphs = text.split('\n').filter(p => p.trim());

  return (
    <div className="space-y-4">
      {paragraphs.map((paragraph, i) => {
        const isBranch = paragraph.includes('[BRANCH:') || paragraph.includes('**Option') || paragraph.includes('**Direction');
        const isBold = paragraph.startsWith('**') && paragraph.endsWith('**');

        if (isBranch) {
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-violet-500/10 border border-violet-500/20 rounded-lg px-4 py-3 text-sm text-violet-300"
            >
              {paragraph.replace(/\*\*/g, '').replace(/\[BRANCH:.*?\]/g, '').replace(/\[\/BRANCH\]/g, '')}
            </motion.div>
          );
        }

        return (
          <motion.p
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 }}
            className={`text-white/80 leading-relaxed ${isBold ? 'font-semibold text-white/90' : ''}`}
          >
            {paragraph.replace(/\*\*/g, '')}
          </motion.p>
        );
      })}

      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-violet-500 animate-pulse ml-0.5" />
      )}
    </div>
  );
}
