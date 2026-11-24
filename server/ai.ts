import { GoogleGenAI, Type } from '@google/genai';
import type {
  AssistantMessage,
  FoodAnalysisResult,
  MealEntry,
  MealType,
} from '../src/types.ts';
import {
  getAnalyticsData,
  getMeals,
  getSettings,
  getWaterLogs,
  getWeightLogs,
} from './db.ts';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.'
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

function normalizeMealType(raw: string | undefined): MealType {
  const value = (raw || '').toLowerCase();
  if (value.includes('breakfast')) return 'Breakfast';
  if (value.includes('snack')) return 'Evening Snacks';
  if (value.includes('dinner')) return 'Dinner';
  return 'Lunch';
}

export async function analyzeFoodImage(params: {
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

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
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

  const text = (response.text ?? '{}').trim();
  const parsed = JSON.parse(text) as Partial<FoodAnalysisResult>;

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

function buildNutritionContext(todayIso: string): string {
  const settings = getSettings();
  const todayMeals: MealEntry[] = getMeals({ date: todayIso });
  const todayWaterLogs = getWaterLogs({ date: todayIso });
  const todayWaterMl = todayWaterLogs.reduce((sum, w) => sum + w.amount_ml, 0);
  const weightLogs = getWeightLogs();

  const todayTotals = todayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  // Build 14-day window ending todayIso
  const endObj = new Date(`${todayIso}T00:00:00Z`);
  const startObj = new Date(endObj);
  startObj.setUTCDate(startObj.getUTCDate() - 13);
  const startIso = startObj.toISOString().slice(0, 10);
  const analytics = getAnalyticsData(startIso, todayIso);

  const latestWeight =
    weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight_kg : null;
  const startingWeight =
    settings.starting_weight_kg ??
    (weightLogs.length > 0 ? weightLogs[0].weight_kg : null);
  const bmi =
    latestWeight && settings.height_cm
      ? Number((latestWeight / Math.pow(settings.height_cm / 100, 2)).toFixed(1))
      : null;

  const remainingCalories = settings.daily_calorie_target - Math.round(todayTotals.calories);

  const todayMealsText =
    todayMeals.length === 0
      ? 'No meals logged today yet.'
      : todayMeals
          .map(
            (m) =>
              `- [${m.meal_type} at ${m.time}] ${m.food_name} (${m.serving_size}): ${m.calories} kcal | Protein: ${m.protein}g, Carbs: ${m.carbs}g, Fat: ${m.fat}g | Ingredients: ${m.ingredients}`
          )
          .join('\n');

  const recentDaysText = analytics.daily
    .map(
      (d) =>
        `${d.date}: ${d.calories} kcal, P ${d.protein}g, C ${d.carbs}g, F ${d.fat}g, Meals: ${d.mealCount}, Water: ${d.water_ml} ml${d.weight_kg !== null ? `, Weight: ${d.weight_kg} kg` : ''}`
    )
    .join('\n');

  const recentWeightsText =
    weightLogs.length === 0
      ? 'No weight entries logged yet.'
      : weightLogs
          .slice(-10)
          .map((w) => `${w.date}: ${w.weight_kg} kg${w.note ? ` (${w.note})` : ''}`)
          .join(' | ');

  return `USER PROFILE & TARGETS (Today = ${todayIso}):
- Daily Calorie Target: ${settings.daily_calorie_target} kcal
- Macro Targets: Protein ${settings.protein_target_g}g, Carbs ${settings.carbs_target_g}g, Fat ${settings.fat_target_g}g
- Daily Water Goal: ${settings.water_goal_ml} ml
- Height: ${settings.height_cm ? `${settings.height_cm} cm` : 'Not set'}
- Starting Weight: ${startingWeight ? `${startingWeight} kg` : 'Not set'}
- Latest Current Weight: ${latestWeight ? `${latestWeight} kg` : 'Not set'}
- Target Weight: ${settings.target_weight_kg ? `${settings.target_weight_kg} kg` : 'Not set'}
- Current BMI: ${bmi ?? 'Unavailable'}

TODAY'S TOTALS (${todayIso}):
- Consumed: ${Math.round(todayTotals.calories)} kcal
- Remaining Calories: ${remainingCalories} kcal (${remainingCalories < 0 ? `over by ${Math.abs(remainingCalories)} kcal` : `${remainingCalories} kcal left`})
- Protein: ${todayTotals.protein.toFixed(1)}g / ${settings.protein_target_g}g
- Carbs: ${todayTotals.carbs.toFixed(1)}g / ${settings.carbs_target_g}g
- Fat: ${todayTotals.fat.toFixed(1)}g / ${settings.fat_target_g}g
- Water: ${todayWaterMl} ml / ${settings.water_goal_ml} ml

TODAY'S LOGGED MEALS:
${todayMealsText}

WEEK-OVER-WEEK AVERAGES (Logged Days Only):
- Current 7 days (${analytics.weeklyAverage.daysLogged} days logged): Avg ${analytics.weeklyAverage.calories} kcal/day, Protein ${analytics.weeklyAverage.protein}g, Carbs ${analytics.weeklyAverage.carbs}g, Fat ${analytics.weeklyAverage.fat}g, Water ${analytics.weeklyAverage.water_ml} ml/day
- Previous 7 days (${analytics.previousWeekAverage.daysLogged} days logged): Avg ${analytics.previousWeekAverage.calories} kcal/day, Protein ${analytics.previousWeekAverage.protein}g, Carbs ${analytics.previousWeekAverage.carbs}g, Fat ${analytics.previousWeekAverage.fat}g, Water ${analytics.previousWeekAverage.water_ml} ml/day

PAST 14 DAYS DAILY LOG:
${recentDaysText}

RECENT WEIGHT LOGS:
${recentWeightsText}`;
}

export async function askNutritionAssistant(params: {
  question: string;
  todayIso: string;
  history: AssistantMessage[];
}): Promise<string> {
  const ai = getGeminiClient();
  const context = buildNutritionContext(params.todayIso);

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

  const prompt = `${context}

${recentChat ? `RECENT CONVERSATION:\n${recentChat}\n\n` : ''}USER QUESTION:
${params.question}`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction,
    },
  });

  const reply = (response.text ?? '').trim();
  if (!reply) {
    throw new Error('The AI assistant returned an empty response. Please try again.');
  }
  return reply;
}
