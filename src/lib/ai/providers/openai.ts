import OpenAI from 'openai';

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return _client;
}

export interface StreamCallbacks {
  onText: (text: string) => void;
  onDone: (fullText: string) => void;
  onError: (error: Error) => void;
}

export async function streamGenerate(
  prompt: string,
  systemPrompt: string,
  callbacks: StreamCallbacks,
  model: string = 'gpt-4o'
): Promise<string> {
  const stream = await getClient().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    stream: true,
    temperature: 0.8,
    max_tokens: 2000,
  });

  let fullText = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullText += delta;
      callbacks.onText(delta);
    }
  }

  callbacks.onDone(fullText);
  return fullText;
}

export async function generateBranches(
  prompt: string,
  currentContent: string
): Promise<Array<{ type: string; label: string; description: string; probability: number }>> {
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a creative branching engine. Given a creative prompt and current generation state, identify 2-4 possible creative directions the AI could take next.

Return a JSON array of branches. Each branch has:
- type: one of "direction", "style", "approach", "tone", "structure", "element"
- label: short creative name (2-4 words)
- description: what this direction means
- probability: 0.0-1.0 likelihood this is a natural direction

Return ONLY the JSON array, no other text. Make branches genuinely different from each other. Be creative and surprising.`
      },
      {
        role: 'user',
        content: `Creative prompt: ${prompt}\n\nCurrent generation:\n${currentContent.slice(-500)}\n\nWhat possible directions could this go?`
      }
    ],
    temperature: 0.9,
    max_tokens: 500,
  });

  const content = response.choices[0]?.message?.content || '[]';
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

export function buildMorphSystemPrompt(): string {
  return `You are a creative AI generating content for a user. You are part of the MORPH system where humans can intervene in your creative process.

RULES:
1. Generate rich, creative, detailed content
2. When you encounter a creative decision point, naturally present 2-3 possible directions
3. Use formatting like "**Option A — X**" or "**Direction: Y**" to make branches visually clear
4. When a human intervention is applied, seamlessly incorporate it and continue
5. Be bold and surprising in your creative choices
6. Never break character or mention being an AI
7. Generate at least 3-4 paragraphs of substantive content

FORMAT FOR BRANCHES (when you reach a decision point):
**[BRANCH: type="direction" label="Short Name" desc="What this direction means"]**
Then briefly describe the direction.
**[/BRANCH]**

Continue generating naturally after presenting options.`;
}

export function buildInterventionPrompt(interventionType: string, details: string): string {
  switch (interventionType) {
    case 'kill':
      return `\n\n[HUMAN INTERVENTION: The human has KILLED a creative direction. Do NOT pursue: "${details}". Continue with remaining directions.]\n\n`;
    case 'select':
      return `\n\n[HUMAN INTERVENTION: The human has SELECTED this direction. STRONGLY COMMIT to: "${details}". Make this the primary creative thread.]\n\n`;
    case 'merge':
      return `\n\n[HUMAN INTERVENTION: The human has MERGED multiple directions. COMBINE these elements into a unified creative vision: "${details}".]\n\n`;
    case 'mutate':
      return `\n\n[HUMAN INTERVENTION: The human has MUTATED the direction. Transform it to: "${details}". Adapt your generation accordingly.]\n\n`;
    case 'override':
      return `\n\n[HUMAN INTERVENTION: The human has OVERRIDDEN your direction with their own: "${details}". Follow this direction completely.]\n\n`;
    default:
      return '';
  }
}
