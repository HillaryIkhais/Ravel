import fs from 'fs';

let content = fs.readFileSync('src/components/ravel/RavelApp.tsx', 'utf8');

// Replace the idle screen with just a "loading..." or simple ENTER THE ARENA if we want to drop the input
// Let's actually remove the task input entirely and make "ENTER THE ARENA" directly launch the demo game.
content = content.replace(
  /<div className="flex items-center gap-2 mb-4">[\s\S]*?<div className="flex items-center gap-3 text-\[10px\] font-mono"/,
  `<div className="flex items-center gap-3 text-[10px] font-mono"`
);

// Update HUD
content = content.replace(
  /<header className="relative"[^>]*>[\s\S]*?<\/header>/,
  `<header className="relative pointer-events-none" style={{ zIndex: 50, position: 'absolute', top: 0, left: 0, right: 0, padding: '24px 32px' }}>
    <div className="flex items-start justify-between">
      <div className="flex flex-col pointer-events-auto">
        <button onClick={handleReset} className="font-editorial text-3xl tracking-tight hover:opacity-80 transition-opacity">RAVEL</button>
      </div>
      <div className="text-center">
        <div className="font-mono text-xl font-bold tracking-widest" style={{ color: dk ? '#F8F6F3' : '#0A0A0A' }}>
          {session ? \`BUILD \${pad(session.currentVersion)}\` : ''}
        </div>
      </div>
      <div className="text-right pointer-events-auto">
        {session && (
          <div className="text-sm font-mono tracking-wider" style={{ color: 'var(--muted)' }}>
            AI SURVIVAL {pad(Math.max(0, session.totalBuilds - 1))}
          </div>
        )}
      </div>
    </div>
  </header>`
);

// We need to change the whole Game View layout. Instead of a grid with a sidebar, it should be full screen.
// I'll run a custom script to replace the game view in RavelApp.tsx.
fs.writeFileSync('src/components/ravel/RavelApp.tsx', content);
