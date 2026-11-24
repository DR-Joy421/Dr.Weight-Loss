import type { IncomingMessage, ServerResponse } from 'node:http';
import { askNutritionAssistantWithContext, GeminiServiceError } from '../_lib/gemini';
import type { AssistantMessage } from '../../src/types';

type VercelRequest = IncomingMessage & {
  method?: string;
  body?: Record<string, unknown>;
};

type VercelResponse = ServerResponse & {
  status: (code: number) => VercelResponse;
  json: (body: unknown) => void;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) {
      return res.status(400).json({ error: 'Please enter a question.' });
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

    const reply = await askNutritionAssistantWithContext({
      question,
      context,
      history,
    });

    return res.status(200).json({ reply });
  } catch (err) {
    if (err instanceof GeminiServiceError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    const message = (err as Error).message || 'Failed to get response from Nutrition Assistant.';
    const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
    return res.status(status).json({ error: message });
  }
}
