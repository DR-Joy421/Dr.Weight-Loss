import { GoogleGenAI } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AssistantMessage } from '../../src/types';

type VercelRequest = IncomingMessage & {
  method?: string;
  body?: unknown;
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

class GeminiServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function readJsonBody(req: VercelRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractUpstreamError(err: unknown): { code: number; status: string; message: string } {
  const rawMsg = err instanceof Error ? err.message : String(err ?? 'Unknown AI error');
  let code =
    (err as { status?: number; code?: number })?.status ||
    (err as { code?: number })?.code ||
    500;
  let status = '';
  let message = rawMsg;

  const jsonStart = rawMsg.indexOf('{');
  if (jsonStart !== -1) {
    try {
      const parsed = JSON.parse(rawMsg.slice(jsonStart)) as {
        error?: { code?: number; status?: string; message?: string };
      };
      if (parsed?.error) {
        if (typeof parsed.error.code === 'number') code = parsed.error.code;
        if (typeof parsed.error.status === 'string') status = parsed.error.status;
        if (typeof parsed.error.message === 'string') message = parsed.error.message;
      }
    } catch {
      // keep raw message
    }
  }

  return { code, status, message };
}

function isTransientHighDemandError(err: unknown): boolean {
  const { code, status, message } = extractUpstreamError(err);
  const lower = `${status} ${message}`.toLowerCase();
  return (
    code === 503 ||
    code === 500 ||
    code === 502 ||
    code === 504 ||
    lower.includes('unavailable') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('fetch failed') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout')
  );
}

function formatFriendlyAiError(err: unknown): GeminiServiceError {
  if (err instanceof GeminiServiceError) return err;
  const { code, status, message } = extractUpstreamError(err);
  const combined = `${status} ${message}`.toLowerCase();

  if (
    code === 403 ||
    (code === 400 && (combined.includes('api_key') || combined.includes('api key'))) ||
    combined.includes('permission_denied') ||
    combined.includes('api_key_invalid')
  ) {
    return new GeminiServiceError(
      'Your Gemini API key appears invalid or missing permissions. Please check GEMINI_API_KEY in Vercel Environment Variables / Secrets.',
      code === 400 ? 400 : 403
    );
  }

  if (code === 429 || combined.includes('resource_exhausted') || combined.includes('quota')) {
    return new GeminiServiceError(
      'AI rate limit reached right now. Please wait a moment and try again.',
      429
    );
  }

  if (code === 503 || combined.includes('unavailable') || combined.includes('high demand')) {
    return new GeminiServiceError(
      'The AI service is experiencing temporary high demand. Please try again in a few seconds.',
      503
    );
  }

  return new GeminiServiceError(
    message || 'AI request failed. Please try again.',
    code >= 400 ? code : 500
  );
}

export default async function handler(req: VercelRequest, res: ServerResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
      return sendJson(res, 503, {
        error:
          'GEMINI_API_KEY is not configured. Add it in Vercel Project Settings > Environment Variables and redeploy.',
      });
    }

    const body = await readJsonBody(req);
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) {
      return sendJson(res, 400, { error: 'Please enter a question.' });
    }

    const context =
      typeof body.nutritionContext === 'string' && body.nutritionContext.trim()
        ? body.nutritionContext
        : 'No nutrition records provided yet.';

    const history: Pick<AssistantMessage, 'role' | 'content'>[] = Array.isArray(body.history)
      ? body.history
          .filter(
            (m): m is { role: 'user' | 'assistant'; content: string } =>
              Boolean(m) &&
              typeof m === 'object' &&
              ((m as { role?: unknown }).role === 'user' ||
                (m as { role?: unknown }).role === 'assistant') &&
              typeof (m as { content?: unknown }).content === 'string'
          )
          .slice(-8)
      : [];

    const recentChat = history
      .map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
      .join('\n\n');

    const systemInstruction = `You are the personal nutrition coach inside "Dr.weight Loss", a private single-user nutrition and weight-loss companion.

Strict guidelines:
1. Always ground every number in the user's ACTUAL stored nutrition records provided below. Never invent logged meals, calories, weights, or water intake.
2. If the user has not logged meals or weight for a timeframe, state that honestly and clearly, and offer helpful next steps.
3. Provide practical, sustainable, evidence-based guidance (including Indian home-cooked options like dal, paneer, curd, sprouts, eggs, roti, sabzi, grilled meats/tofu when suggesting meals or protein boosts).
4. NEVER recommend extreme calorie restriction, starvation, or unsafe weight-loss practices. Emphasize balanced nutrition, adequate protein, hydration, and steady progress.
5. Keep responses concise, structured with clean bullet points or bold key numbers, and directly answer the user's question.`;

    const prompt = `${context}

${recentChat ? `RECENT CONVERSATION:\n${recentChat}\n\n` : ''}USER QUESTION:
${question}`;

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const callModel = (model: string) =>
      ai.models.generateContent({
        model,
        contents: prompt,
        config: { systemInstruction },
      });

    let response;
    try {
      response = await callModel('gemini-4-hydrogen');
    } catch (firstErr) {
      if (!isTransientHighDemandError(firstErr)) {
        throw formatFriendlyAiError(firstErr);
      }
      await new Promise((r) => setTimeout(r, 400));
      try {
        response = await callModel('gemini-4-hydrogen');
      } catch (secondErr) {
        if (!isTransientHighDemandError(secondErr)) {
          throw formatFriendlyAiError(secondErr);
        }
        try {
          response = await callModel('gemini-3.1-flash-lite');
        } catch {
          throw formatFriendlyAiError(secondErr);
        }
      }
    }

    const reply = (response.text ?? '').trim();
    if (!reply) {
      return sendJson(res, 502, {
        error: 'The AI assistant returned an empty response. Please try again.',
      });
    }

    return sendJson(res, 200, { reply });
  } catch (err) {
    if (err instanceof GeminiServiceError) {
      return sendJson(res, err.statusCode, { error: err.message });
    }
    const friendly = formatFriendlyAiError(err);
    return sendJson(res, friendly.statusCode, { error: friendly.message });
  }
}
