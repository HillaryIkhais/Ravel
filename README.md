# RAVEL

AI can build software faster than humans can verify it.

RAVEL turns the time between AI builds into a playable adversarial testing loop.

**While AI builds, you try to break it.**

---

## How it works

```
BUILD → HUNT → BREAK → PROVE → PATCH → REPLAY
```

1. **AI builds a game.** A new version is being generated right now.
2. **You play the current version.** Your job: find something broken.
3. **You capture the attack.** Your inputs become an executable trace.
4. **RAVEL proves it.** The same trace replays against both builds. Oracle confirms the bug.
5. **AI patches.** The next build arrives with your fix.
6. **You attack again.** The AI gets better. You get harder.

Every successful hunt becomes an executable regression test.

The player never sees the verification machinery. They see: **YOU BROKE IT → AI IS REBUILDING → BREAK IT AGAIN.**

---

## The game

- **AI is your opponent.** It is building something. You have a limited window before the next version arrives.
- **Your job is to mess it up before it gets better.** Find weaknesses. Exploit them. Capture the moment.
- **The AI rebuilds.** Now you get to attack the new version.
- **The waiting isn't something we made fun. We made the waiting necessary.** The player literally needs the AI to finish building before they can attack the new version.

---

## What happens underneath

Event capture → deterministic replay → semantic oracle → failure proof → AI patch → regression verification

The second layer makes the first layer real. But the second layer is not the pitch.

---

## Architecture

- **Deterministic demo** — No API key needed. The showcase game (Enemy Targeting) boots instantly.
- **Oracle system** — Dual-sided verification: bug must be confirmed on old build, fix must be positively present on new build.
- **Bounded retry** — Max 3 attempts per hunt. No proof, no reward.
- **Replay proof** — Every verdict is backed by an immutable same-attack trace.
- **Theme** — Dark/light mode with particle field.

---

## Tech stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS
- Framer Motion
- OpenAI API (for game generation and patching)

---

## Running locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The deterministic demo works without an API key. To enable AI game generation and patching, add an `OPENAI_API_KEY` to `.env.local`.

---

## Deployment

```bash
npx vercel --prod
```

---

## The thesis

RAVEL is not QA gamified.

It is not developer infrastructure.

It is a game about trying to break AI before it gets better.

**AI is working. You aren't waiting. You're hunting. The AI's next build has to survive you.**
