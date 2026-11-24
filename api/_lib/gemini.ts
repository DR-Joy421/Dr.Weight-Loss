import { GoogleGenAI, Type } from '@google/genai';
import type {
  AssistantMessage,
  FoodAnalysisResult,
  MealType,
} from '../../src/types';

export class GeminiServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new GeminiServiceError(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Environment Variables / Secrets.',
      503
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
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
      'Your Gemini API key appears invalid or missing permissions. Please check GEMINI_API_KEY in Environment Variables / Secrets.',
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry<T>(runForModel: (model: string) => Promise<T>): Promise<T> {
  const primaryModel = 'gemini-4-hydrogen';
  const fallbackModel = 'gemini-3.1-flash-lite';
  const delays = [700, 1500];

  let lastError: unknown;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await runForModel(primaryModel);
    } catch (err) {
      lastError = err;
      if (!isTransientHighDemandError(err)) {
        throw formatFriendlyAiError(err);
      }
      if (attempt < delays.length) {
        await sleep(delays[attempt]);
      }
    }
  }

  try {
    return await runForModel(fallbackModel);
  } catch (fallbackErr) {
    throw formatFriendlyAiError(lastError ?? fallbackErr);
  }
}

function normalizeMealType(raw: string | undefined): MealType {
  const value = (raw || '').toLowerCase();
  if (value.includes('breakfast')) return 'Breakfast';
  if (value.includes('snack')) return 'Evening Snacks';
  if (value.includes('dinner')) return 'Dinner';
  return 'Lunch';
}

export async function analyzeFoodImageWithGemini(params: {
  imageBase64: string;
  mimeType: string;
  extraContext?: string;
  isHomemade?: boolean;
}): Promise<FoodAnalysisResult> {
  const ai = getGeminiClient();

  const cleanBase64 = params.imageBase64.replace(/^data:[^;]+;base64,/, '');
  const mimeType = params.mimeType || 'image/jpeg';

  const contextLines: string[] = [];
  if (params.isHomemade) {
    contextLines.push(
      'The user indicated this is a HOMEMADE meal. Pay extra attention to realistic home cooking portions and estimate added cooking oil or ghee in teaspoons separately in estimatedOilTsp (note: keep item fat macros consistent with ingredients + cooking oil, and explain clearly in confidenceNotes how much oil/ghee was assumed).'
    );
  }
  if (params.extraContext?.trim()) {
    contextLines.push(`User context / description: "${params.extraContext.trim()}"`);
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

  const response = await generateWithRetry((model) =>
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
    })
  );

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

  return {
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
}

export async function askNutritionAssistantWithContext(params: {
  question: string;
  context: string;
  history: Pick<AssistantMessage, 'role' | 'content'>[];
}): Promise<string> {
  const ai = getGeminiClient();

  const recentChat = params.history
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'User' : 'Coach'}: ${m.content}`)
    .join('\n\n');

  const systemInstruction = `You are the personal nutrition coach inside "Dr.weight Loss", a private single-user nutrition and weight-loss companion.

Strict guidelines:
1. Always ground every number in the user's ACTUAL stored nutrition records provided below. Never invent logged meals, calories, weights, or water intake.
2. If the user has not logged meals or weight for a timeframe, state that honestly and clearly, and offer helpful next steps.
3. Provide practical, sustainable, evidence-based guidance (including Indian home-cooked options like dal, paneer, curd, sprouts, eggs, roti, sabzi, grilled meats/tofu when suggesting meals or protein boosts).
4. NEVER recommend extreme calorie restriction, starvation, or unsafe weight-loss practices. Emphasize balanced nutrition, adequate protein, hydration, and steady progress.
5. Keep responses concise, structured with clean bullet points or bold key numbers, and directly answer the user's question.`;

  const prompt = `${params.context}

${recentChat ? `RECENT CONVERSATION:\n${recentChat}\n\n` : ''}USER QUESTION:
${params.question}`;

  const response = await generateWithRetry((model) =>
    ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction,
      },
    })
  );

  const reply = (response.text ?? '').trim();
  if (!reply) {
    throw new GeminiServiceError(
      'The AI assistant returned an empty response. Please try again.',
      502
    );
  }
  return reply;
}
