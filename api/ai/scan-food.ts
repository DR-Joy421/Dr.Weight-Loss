import { GoogleGenAI, Type } from '@google/genai';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FoodAnalysisResult, MealType } from '../../src/types';

type VercelRequest = IncomingMessage & {
  method?: string;
  body?: unknown;
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

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

function normalizeMealType(raw: string | undefined): MealType {
  const value = (raw || '').toLowerCase();
  if (value.includes('breakfast')) return 'Breakfast';
  if (value.includes('snack')) return 'Evening Snacks';
  if (value.includes('dinner')) return 'Dinner';
  return 'Lunch';
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
    const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
    if (!imageBase64.trim()) {
      return sendJson(res, 400, { error: 'Food photograph is required.' });
    }

    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg';
    const extraContext = typeof body.extraContext === 'string' ? body.extraContext : undefined;
    const isHomemade = Boolean(body.isHomemade);

    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const contextLines: string[] = [];
    if (isHomemade) {
      contextLines.push(
        'The user indicated this is a HOMEMADE meal. Pay extra attention to realistic home cooking portions and estimate added cooking oil or ghee in teaspoons separately in estimatedOilTsp (note: keep item fat macros consistent with ingredients + cooking oil, and explain clearly in confidenceNotes how much oil/ghee was assumed).'
      );
    }
    if (extraContext?.trim()) {
      contextLines.push(`User context / description: "${extraContext.trim()}"`);
    }

    const prompt = `Analyze this food photograph carefully as an expert clinical nutritionist specializing in Indian home cooking as well as global cuisines.

Identify every visible food item on the plate/bowl/thali (including Indian staples like roti, phulka, chapati, paratha, dal, sambar, rasam, sabzi, paneer dishes, rice, biryani, pulao, puri, dosa, idli, poha, upma, khichdi, curd/raita, chutney, salad, chai, snacks, as well as international meals).

For each individual food item, estimate:
- name (clear, specific dish name)
- quantity (numeric count or portions, e.g., 2 for 2 rotis, 1 for 1 katori)
- unit (e.g., "piece", "katori (150g)", "cup", "tbsp", "plate")
- calories (kcal for that total item quantity)
- protein (grams)
- carbs (grams)
- fat (grams)
- ingredients (array of key ingredients)

Also provide:
- foodName: concise overall meal title
- suggestedMealType: one of "Breakfast", "Lunch", "Evening Snacks", "Dinner"
- servingSize: concise total meal serving description
- estimatedOilTsp: estimated cooking oil or ghee used across the dish in teaspoons (e.g. 1.5). If negligible or raw/steamed, 0 or 0.5.
- confidenceNotes: brief practical note explaining portion assumptions and oil/ghee estimate so the user can review and adjust before saving.

${contextLines.join('\n')}`;

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
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: cleanBase64,
              },
            },
            { text: prompt },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              foodName: { type: Type.STRING },
              suggestedMealType: { type: Type.STRING },
              servingSize: { type: Type.STRING },
              estimatedOilTsp: { type: Type.NUMBER },
              confidenceNotes: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    calories: { type: Type.NUMBER },
                    protein: { type: Type.NUMBER },
                    carbs: { type: Type.NUMBER },
                    fat: { type: Type.NUMBER },
                    ingredients: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    'name',
                    'quantity',
                    'unit',
                    'calories',
                    'protein',
                    'carbs',
                    'fat',
                    'ingredients',
                  ],
                },
              },
            },
            required: [
              'foodName',
              'suggestedMealType',
              'servingSize',
              'estimatedOilTsp',
              'confidenceNotes',
              'items',
            ],
          },
        },
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

    const text = (response.text ?? '{}').trim();
    const rawParsed = JSON.parse(text || '{}') as unknown;
    const parsed = (
      rawParsed && typeof rawParsed === 'object' ? rawParsed : {}
    ) as Partial<FoodAnalysisResult>;

    const items = Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
          name: String(item.name || 'Food item'),
          quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
          unit: String(item.unit || 'serving'),
          calories: Math.max(0, Math.round(Number(item.calories) || 0)),
          protein: Math.max(0, Number((Number(item.protein) || 0).toFixed(1))),
          carbs: Math.max(0, Number((Number(item.carbs) || 0).toFixed(1))),
          fat: Math.max(0, Number((Number(item.fat) || 0).toFixed(1))),
          ingredients: Array.isArray(item.ingredients)
            ? item.ingredients.map((ing) => String(ing))
            : [],
        }))
      : [];

    const result: FoodAnalysisResult = {
      foodName: String(parsed.foodName || 'Scanned Meal'),
      suggestedMealType: normalizeMealType(parsed.suggestedMealType),
      servingSize: String(parsed.servingSize || '1 meal'),
      estimatedOilTsp: Math.max(0, Number((Number(parsed.estimatedOilTsp) || 0).toFixed(1))),
      confidenceNotes: String(
        parsed.confidenceNotes ||
          'Please review the detected items, portion sizes, and cooking oil before saving.'
      ),
      items,
    };

    return sendJson(res, 200, result);
  } catch (err) {
    if (err instanceof GeminiServiceError) {
      return sendJson(res, err.statusCode, { error: err.message });
    }
    const friendly = formatFriendlyAiError(err);
    return sendJson(res, friendly.statusCode, { error: friendly.message });
  }
}
