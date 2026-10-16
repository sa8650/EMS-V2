import type { AppEnv } from '@/server/env';
import { AppError } from '@/server/errors';

/**
 * AI providers used by Zudo AI and AI Business Health (catalogue and
 * behaviour unchanged from EMS 4.x). The owner picks a model in the Owner
 * Console; keys live in server-side secrets only.
 */

export type AiProvider = 'cf' | 'gemini' | 'groq' | 'cerebras' | 'deepseek' | 'openrouter' | 'github' | 'anthropic';
export interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string }

export const DEFAULT_MODEL = '@cf/meta/llama-3.2-3b-instruct';

export const AI_PROVIDERS: Record<string, { name: string; provider: AiProvider }> = {
  '@cf/meta/llama-3.2-3b-instruct': { name: 'Llama 3.2 3B Instruct (Cloudflare · free)', provider: 'cf' },
  'gemini:gemini-3.6-flash': { name: 'Gemini 3.6 Flash (Google)', provider: 'gemini' },
  'gemini:gemini-3.5-flash-lite': { name: 'Gemini 3.5 Flash-Lite (Google)', provider: 'gemini' },
  'groq:openai/gpt-oss-120b': { name: 'GPT-OSS 120B (Groq · free tier)', provider: 'groq' },
  'groq:openai/gpt-oss-20b': { name: 'GPT-OSS 20B (Groq · free tier)', provider: 'groq' },
  'groq:qwen/qwen3.6-27b': { name: 'Qwen3.6 27B vision (Groq · preview)', provider: 'groq' },
  'cerebras:llama-3.3-70b': { name: 'Llama 3.3 70B (Cerebras · free)', provider: 'cerebras' },
  'cerebras:gpt-oss-120b': { name: 'GPT-OSS 120B (Cerebras · free)', provider: 'cerebras' },
  'cerebras:qwen-3-32b': { name: 'Qwen3 32B (Cerebras · free)', provider: 'cerebras' },
  'cerebras:llama-4-scout-17b-16e-instruct': { name: 'Llama 4 Scout 17B (Cerebras · free)', provider: 'cerebras' },
  'deepseek:deepseek-chat': { name: 'DeepSeek Chat V3 (DeepSeek direct)', provider: 'deepseek' },
  'deepseek:deepseek-reasoner': { name: 'DeepSeek Reasoner R1 (DeepSeek direct)', provider: 'deepseek' },
  'openrouter:openai/gpt-oss-120b:free': { name: 'GPT-OSS 120B (OpenRouter · free)', provider: 'openrouter' },
  'openrouter:openai/gpt-oss-20b:free': { name: 'GPT-OSS 20B (OpenRouter · free)', provider: 'openrouter' },
  'openrouter:google/gemma-4-31b-it:free': { name: 'Gemma 4 31B (OpenRouter · free)', provider: 'openrouter' },
  'openrouter:nvidia/nemotron-3-super-120b-a12b:free': { name: 'Nemotron 3 Super 120B (OpenRouter · free)', provider: 'openrouter' },
  'github:gpt-4o-mini': { name: 'GPT-4o mini (GitHub Models · Copilot, free)', provider: 'github' },
  'github:DeepSeek-V3': { name: 'DeepSeek V3 (GitHub Models · Copilot, free)', provider: 'github' },
  'github:Meta-Llama-3.3-70B-Instruct': { name: 'Llama 3.3 70B (GitHub Models · Copilot, free)', provider: 'github' },
  'anthropic:claude-haiku-4-5': { name: 'Claude Haiku 4.5 (Anthropic)', provider: 'anthropic' },
  'anthropic:claude-sonnet-5': { name: 'Claude Sonnet 5 (Anthropic)', provider: 'anthropic' },
};

/** Retired model ids → current replacement (applied transparently). */
export const AI_MODEL_FALLBACKS: Record<string, string> = {
  'gemini:gemini-2.0-flash': 'gemini:gemini-3.6-flash',
  'gemini:gemini-2.0-flash-lite': 'gemini:gemini-3.5-flash-lite',
  'groq:llama-3.3-70b-versatile': 'groq:openai/gpt-oss-120b',
  'groq:qwen-qwq-32b': 'groq:openai/gpt-oss-120b',
  'groq:llama-3.1-8b-instant': 'groq:openai/gpt-oss-20b',
  'cerebras:llama3.1-8b': 'cerebras:llama-3.3-70b',
  'cerebras:qwen-2.5-7b': 'cerebras:qwen-3-32b',
  'cerebras:gpt-oss-20b': 'cerebras:gpt-oss-120b',
};

export function aiProvider(model: unknown): AiProvider {
  const k = String(model ?? '');
  if (k.startsWith('@cf/')) return 'cf';
  const p = k.split(':')[0] as AiProvider;
  return (['gemini', 'groq', 'cerebras', 'deepseek', 'openrouter', 'github', 'anthropic'] as const).includes(p as never) ? p : 'cf';
}

export function modernModel(id: unknown): string {
  let m = String(id || DEFAULT_MODEL);
  if (AI_MODEL_FALLBACKS[m]) m = AI_MODEL_FALLBACKS[m]!;
  if (aiProvider(m) === 'cf' && (m.includes('llama-3.1') || m.includes('infire'))) m = DEFAULT_MODEL;
  return m;
}

export function aiConfigured(env: AppEnv, model: unknown): boolean {
  if (env.MOCK_AI === '1') return true;
  const p = aiProvider(model);
  return {
    cf: !!env.AI, gemini: !!env.GEMINI_API_KEY, groq: !!env.GROQ_API_KEY, cerebras: !!env.CEREBRAS_API_KEY,
    deepseek: !!env.DEEPSEEK_API_KEY, openrouter: !!env.OPENROUTER_API_KEY, github: !!env.GITHUB_TOKEN, anthropic: !!env.ANTHROPIC_API_KEY,
  }[p];
}

/** Provider/configuration failures are shown to the user (4.x behaviour) as 502. */
class AiError extends AppError {
  constructor(message: string) {
    super(message, 502);
  }
}

async function openaiCompat(url: string, key: string, model: string, messages: ChatMessage[], temperature: number, maxTokens: number, extraHeaders?: Record<string, string>): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...(extraHeaders ?? {}) },
    body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens || 1024 }),
  });
  const out = (await res.json().catch(() => ({}))) as { error?: { message?: string }; message?: string; choices?: { message?: { content?: string } }[] };
  if (!res.ok) throw new AiError(out?.error?.message || out?.message || 'AI request failed');
  return String(out?.choices?.[0]?.message?.content || '');
}

const MOCK_HEALTH_REPORT = '# Business health overview\nThe shop recorded solid performance with steady gross sales and manageable return volume.\n\n# What is working well\n- Sales performance and inventory restock movement\n- Due recoveries and cash receipts\n\n# What needs attention\n- Monitor customer returns and refunds\n- Manage low-stock items\n\n# Your 7-day action plan\n1. Review returned item conditions and reasons\n2. Reorder fast-selling stock\n3. Follow up on sales dues\n4. Inspect quarantined damaged merchandise\n5. Update customer contact information\n\n# Cash and due collection guidance\n- Promptly collect invoice balances\n\n# Growth ideas\n- Bundle accessories with core inventory';

export async function runAI(env: AppEnv, model: unknown, messages: ChatMessage[], temperature = 0.3, maxTokens = 1024): Promise<string> {
  if (env.MOCK_AI === '1') {
    if (messages.some((m) => m.content.includes('DATA SNAPSHOT') || m.content.includes('Business Health Advisor'))) return MOCK_HEALTH_REPORT;
    const userMsg = (messages.find((m) => m.role === 'user')?.content || '').toLowerCase();
    if (userMsg.includes('quarantine') || userMsg.includes('damaged') || userMsg.includes('defective')) {
      return 'Based on the store quarantine records, we currently track quarantined Damaged and Defective products isolated from active sellable inventory, including returned item codes, descriptions, quantities, and customer reasons.';
    }
    return 'Based on current shop data, customer returns, product exchanges, refunds, sellable inventory, and quarantined damaged/defective merchandise are fully tracked.';
  }
  const m = modernModel(model);
  const p = aiProvider(m);
  const system = messages.filter((x) => x.role === 'system').map((x) => x.content).join('\n\n');
  switch (p) {
    case 'gemini': {
      if (!env.GEMINI_API_KEY) throw new AiError('Gemini API key is not configured. Add GEMINI_API_KEY to the server secrets.');
      const contents = messages.filter((x) => x.role !== 'system').map((x) => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] }));
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m.slice(7))}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify({ contents, systemInstruction: system ? { parts: [{ text: system }] } : undefined, generationConfig: { temperature, maxOutputTokens: maxTokens } }),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: { message?: string }; candidates?: { content?: { parts?: { text?: string }[] } }[] };
      if (!res.ok) throw new AiError(out?.error?.message || 'Gemini request failed');
      return String(out?.candidates?.[0]?.content?.parts?.[0]?.text || '');
    }
    case 'groq':
      if (!env.GROQ_API_KEY) throw new AiError('Groq API key is not configured. Add GROQ_API_KEY to the server secrets.');
      return openaiCompat('https://api.groq.com/openai/v1/chat/completions', env.GROQ_API_KEY, m.slice(5), messages, temperature, maxTokens);
    case 'cerebras':
      if (!env.CEREBRAS_API_KEY) throw new AiError('Cerebras API key is not configured. Add CEREBRAS_API_KEY to the server secrets.');
      return openaiCompat('https://api.cerebras.ai/v1/chat/completions', env.CEREBRAS_API_KEY, m.slice(9), messages, temperature, maxTokens);
    case 'deepseek':
      if (!env.DEEPSEEK_API_KEY) throw new AiError('DeepSeek API key is not configured. Add DEEPSEEK_API_KEY to the server secrets.');
      return openaiCompat('https://api.deepseek.com/v1/chat/completions', env.DEEPSEEK_API_KEY, m.slice(9), messages, temperature, maxTokens);
    case 'openrouter':
      if (!env.OPENROUTER_API_KEY) throw new AiError('OpenRouter API key is not configured. Add OPENROUTER_API_KEY to the server secrets.');
      return openaiCompat('https://openrouter.ai/api/v1/chat/completions', env.OPENROUTER_API_KEY, m.slice(11), messages, temperature, maxTokens, { 'HTTP-Referer': 'https://ems-v1.app', 'X-Title': 'EMS V1 · Zudo AI' });
    case 'github':
      if (!env.GITHUB_TOKEN) throw new AiError('GitHub token is not configured. Add GITHUB_TOKEN to the server secrets (GitHub Models, free).');
      return openaiCompat('https://models.inference.ai.azure.com/chat/completions', env.GITHUB_TOKEN, m.slice(7), messages, temperature, maxTokens);
    case 'anthropic': {
      if (!env.ANTHROPIC_API_KEY) throw new AiError('Anthropic API key is not configured. Add ANTHROPIC_API_KEY to the server secrets.');
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: m.slice(10), max_tokens: maxTokens, temperature, system: system || undefined,
          messages: messages.filter((x) => x.role !== 'system').map((x) => ({ role: x.role === 'assistant' ? 'assistant' : 'user', content: x.content })),
        }),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: { message?: string }; content?: { type: string; text: string }[] };
      if (!res.ok) throw new AiError(out?.error?.message || 'Anthropic request failed');
      return String(out?.content?.filter((x) => x.type === 'text').map((x) => x.text).join('\n') || '');
    }
    default: {
      if (!env.AI) throw new AiError('Cloudflare AI binding is not configured.');
      const r = (await env.AI.run(m, { messages, temperature, max_tokens: maxTokens })) as { response?: string; result?: { response?: string } } | null;
      return String(r?.response || r?.result?.response || '');
    }
  }
}

export { AiError };
