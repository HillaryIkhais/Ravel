import OpenAI from 'openai';
import { injectRecordingHarness } from './harness';
import { type OracleCondition } from '@/types/ravel';

let _client: OpenAI | null = null;

function getClient() {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
    const isGemini = !!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY;
    _client = new OpenAI({
      apiKey,
      baseURL: isGemini ? 'https://generativelanguage.googleapis.com/v1beta/openai/' : undefined,
    });
  }
  return _client;
}

export function defaultModel(): string {
  return process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY
    ? 'gemini-2.5-flash'
    : 'gpt-4o';
}

const PATCH_TIMEOUT_MS = 90_000;

export async function generateGame(title: string, model?: string): Promise<{ code: string; html: string }> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: model || defaultModel(),
    messages: [
      {
        role: 'system',
        content: `You are a game generator. Create a complete, playable HTML5 canvas game in a single JavaScript code block.

RULES:
1. Use a canvas element with id="gameCanvas" (already in the DOM, 800x600)
2. Get context with: const ctx = document.getElementById('gameCanvas').getContext('2d');
3. The game must be immediately playable
4. Include keyboard controls (arrow keys, space, etc.)
5. Make it fun and engaging
6. Use requestAnimationFrame for the game loop
7. Include clear win/lose conditions
8. Make the game buggy on purpose - include 1-2 subtle bugs that a player could discover:
   - An collision detection issue
   - An edge case that breaks something
   - A scoring bug
   - An entity that escapes the screen
9. Do NOT include HTML, only JavaScript code
10. The code should be self-contained
11. Use simple pixel art or geometric shapes (no external assets)

Generate a fun, small game like: space shooter, platformer, snake, breakout, or similar.
Make it visually appealing with colors and effects.`
      },
      {
        role: 'user',
        content: `Generate a game: "${title}"`
      }
    ],
    temperature: 0.8,
    max_tokens: 3000,
  }, { signal: AbortSignal.timeout(PATCH_TIMEOUT_MS) });

  const rawCode = response.choices[0]?.message?.content || '';

  const cleanedCode = rawCode
    .replace(/```javascript\n?/g, '')
    .replace(/```js\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const code = injectRecordingHarness(cleanedCode);

  return {
    code,
    html: `<!DOCTYPE html>
<html>
<head>
<style>
  body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
  canvas { border: 1px solid #333; }
</style>
</head>
<body>
<canvas id="gameCanvas" width="800" height="600"></canvas>
<script>
${code}
</script>
</body>
</html>`,
  };
}

export async function patchGame(opts: {
  originalCode: string;
  failureDescription: string;
  reproductionSteps: string[];
  expectedBehavior: string;
  observedBehavior: string;
  oracle?: OracleCondition;
  previousFailure?: string;
}): Promise<{ code: string; explanation: string }> {
  const {
    originalCode,
    failureDescription,
    reproductionSteps,
    expectedBehavior,
    observedBehavior,
    oracle,
    previousFailure,
  } = opts;
  const client = getClient();

  const oracleBlock = oracle
    ? `\nORACLE (THE PATCH IS MACHINE-VERIFIED AGAINST THIS):
- Description: ${oracle.description}
- Bug side (currently TRUE — the failure): ${oracle.evalExpression || `state "${oracle.statePath}" is ${oracle.bugValue}`}
- Fix side (your patch MUST make this TRUE): ${oracle.fixedExpression || `state "${oracle.statePath}" must equal ${oracle.fixedValue}`}

YOUR FIX MUST:
- Make the bug side evaluate to FALSE.
- Make the fix side evaluate to TRUE (the positive fix is required, not merely "error disappeared").
- Keep every game-state variable the oracle reads defined and updated every frame.
- Keep the game playable and visually identical.`
    : '';

  const feedbackBlock = previousFailure
    ? `\nPREVIOUS PATCH ATTEMPT FAILED MACHINE VERIFICATION:
${previousFailure}
Inspect your new fix against that failure specifically before answering.`
    : '';

  const response = await client.chat.completions.create({
    model: defaultModel(),
    messages: [
      {
        role: 'system',
        content: `You are an AI game logic patcher. You are ONLY allowed to rewrite one specific function:

window.enemyDecision = function(enemy, state, memory) { ... }

RULES:
1. Return ONLY the replacement JavaScript code for that function.
2. Your code must start with "window.enemyDecision = function(enemy, state, memory) {" and end with "};".
3. The function must return { targetX: number, targetY: number, isPlayer: boolean }.
4. state has { enemies, decoys, player }.
5. After the function code, add a comment exactly formatted like this: // PATCH_EXPLANATION: <your explanation>`
      },
      {
        role: 'user',
        content: `ORIGINAL CODE:
${originalCode}

BUG REPORT:
${failureDescription}

EXPECTED BEHAVIOR:
${expectedBehavior}

OBSERVED BEHAVIOR:
${observedBehavior}

REPRODUCTION STEPS:
${reproductionSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}
${oracleBlock}
${feedbackBlock}
Fix this bug by rewriting window.enemyDecision. Return ONLY the new function.`
      }
    ],
    temperature: 0.3,
    max_tokens: 1500,
  }, { signal: AbortSignal.timeout(PATCH_TIMEOUT_MS) });

  const rawResponse = response.choices[0]?.message?.content || '';

  if (!rawResponse.trim()) {
    throw new Error('AI returned no code');
  }

  const explanationMatch = rawResponse.match(/\/\/ PATCH_EXPLANATION:\s*(.+)/);
  const explanation = explanationMatch ? explanationMatch[1].trim() : 'Enemy targeting logic updated';

  const rawPatchedCode = rawResponse
    .replace(/```javascript\n?/g, '')
    .replace(/```js\n?/g, '')
    .replace(/```\n?/g, '')
    .replace(/\/\/ PATCH_EXPLANATION:.*/g, '')
    .trim();

  if (rawPatchedCode.length < 20) {
    throw new Error('AI returned invalid or empty code');
  }

  const replacedCode = originalCode.replace(
    /window\.enemyDecision\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?^\s*\};\n/m,
    rawPatchedCode + '\n'
  );

  const code = injectRecordingHarness(replacedCode);

  return {
    code,
    explanation,
  };
}

export async function generateHuntChallenge(gameCode: string, gameTitle: string): Promise<{
  title: string;
  objective: string;
  difficulty: 'easy' | 'medium' | 'hard';
  expectedBehavior: string;
  reward: number;
  oracle: {
    description: string;
    statePath: string;
    operator: string;
    bugValue: unknown;
    fixedValue: unknown;
    evalExpression?: string;
  };
}> {
  const client = getClient();

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a game challenge and oracle generator. Given game code, generate a specific hunt challenge AND a machine-checkable oracle condition.

The challenge should:
1. Target a potential bug or exploit in the game
2. Be specific enough to be reproducible
3. Have clear success criteria
4. Be fun to attempt

The oracle defines what "broken" means. It references a game state variable and checks its value.

IMPORTANT: The oracle must reference variables that EXIST in the game code. Look at the code to find actual variable names like: score, lives, health, enemy, player, targets, enemies, gameOver, etc.

Return JSON:
{
  "title": "short catchy title",
  "objective": "specific thing to try to break/do",
  "difficulty": "easy|medium|hard",
  "expectedBehavior": "what should happen according to game rules",
  "reward": number (10-500 based on difficulty),
  "oracle": {
    "description": "human-readable: 'Enemy should target the player but instead targets the decoy'",
    "statePath": "dot-separated path to the game state variable (e.g., 'enemy.target', 'player.health', 'score')",
    "operator": "equals|not_equals|less_than|greater_than|contains|exists|not_exists",
    "bugValue": "the value when the bug is PRESENT (what the human observed)",
    "fixedValue": "the value when the bug is FIXED (what should happen after patch)"
  }
}

If the bug is hard to express as a single variable, use evalExpression instead:
"evalExpression": "typeof enemy !== 'undefined' && enemy.target !== player"
This JS expression will be evaluated against the game's global scope.`
      },
      {
        role: 'user',
        content: `Game: "${gameTitle}"\n\nCode:\n${gameCode.slice(0, 3000)}\n\nGenerate a hunt challenge with an oracle.`
      }
    ],
    temperature: 0.9,
    max_tokens: 500,
  }, { signal: AbortSignal.timeout(PATCH_TIMEOUT_MS) });

  const content = response.choices[0]?.message?.content || '{}';
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    if (parsed && parsed.oracle) {
      return {
        title: parsed.title || 'Find a Bug',
        objective: parsed.objective || 'Try to break the game',
        difficulty: parsed.difficulty || 'easy',
        expectedBehavior: parsed.expectedBehavior || 'Game should work correctly',
        reward: parsed.reward || 50,
        oracle: {
          description: parsed.oracle.description || 'Game state check',
          statePath: parsed.oracle.statePath || '',
          operator: parsed.oracle.operator || 'equals',
          bugValue: parsed.oracle.bugValue ?? null,
          fixedValue: parsed.oracle.fixedValue ?? null,
          evalExpression: parsed.oracle.evalExpression,
        },
      };
    }
  } catch {}

  // Fallback: generic oracle that checks for errors
  return {
    title: 'Find a Bug',
    objective: 'Try to break the game in any way possible',
    difficulty: 'easy',
    expectedBehavior: 'Game should work correctly',
    reward: 50,
    oracle: {
      description: 'Game should not throw errors or crash',
      statePath: '',
      operator: 'not_exists',
      bugValue: 'error',
      fixedValue: null,
      evalExpression: 'typeof window.__plError === "undefined"',
    },
  };
}
