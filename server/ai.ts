import type { AssistantMessage, FoodAnalysisResult, MealEntry } from '../src/types.ts';
import {
  analyzeFoodImageWithGemini,
  askNutritionAssistantWithContext,
  GeminiServiceError,
} from '../api/_lib/gemini.ts';
import {
  getAnalyticsData,
  getMeals,
  getSettings,
  getWaterLogs,
  getWeightLogs,
} from './db.ts';

export { GeminiServiceError };

export async function analyzeFoodImage(params: {
  imageBase64: string;
  mimeType: string;
  extraContext?: string;
  isHomemade?: boolean;
}): Promise<FoodAnalysisResult> {
  return analyzeFoodImageWithGemini(params);
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
  const context = buildNutritionContext(params.todayIso);
  return askNutritionAssistantWithContext({
    question: params.question,
    context,
    history: params.history,
  });
}
