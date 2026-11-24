export type MealType = 'Breakfast' | 'Lunch' | 'Evening Snacks' | 'Dinner';

export const MEAL_TYPES: MealType[] = [
  'Breakfast',
  'Lunch',
  'Evening Snacks',
  'Dinner',
];

export interface UserSettings {
  id: number;
  daily_calorie_target: number;
  protein_target_g: number;
  carbs_target_g: number;
  fat_target_g: number;
  water_goal_ml: number;
  height_cm: number | null;
  starting_weight_kg: number | null;
  target_weight_kg: number | null;
  updated_at: string;
}

export interface MealItemBreakdown {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: string[];
}

export interface MealEntry {
  id: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  meal_type: MealType;
  food_name: string;
  ingredients: string;
  items: MealItemBreakdown[];
  serving_size: string;
  quantity: number;
  oil_tsp: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  image_data: string | null;
  notes: string | null;
  created_at: string;
}

export interface WaterLog {
  id: number;
  date: string; // YYYY-MM-DD
  amount_ml: number;
  logged_at: string;
}

export interface WeightLog {
  id: number;
  date: string; // YYYY-MM-DD
  weight_kg: number;
  note: string | null;
  logged_at: string;
}

export interface AssistantMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface FoodAnalysisResult {
  foodName: string;
  suggestedMealType: MealType;
  servingSize: string;
  estimatedOilTsp: number;
  items: MealItemBreakdown[];
  confidenceNotes: string;
}

export interface DailyAggregate {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  mealCount: number;
  water_ml: number;
  weight_kg: number | null;
}

export interface AnalyticsResponse {
  daily: DailyAggregate[];
  weeklyAverage: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    water_ml: number;
    daysLogged: number;
  };
  previousWeekAverage: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    water_ml: number;
    daysLogged: number;
  };
  monthlyTrend: {
    month: string;
    avgCalories: number;
    avgProtein: number;
    avgCarbs: number;
    avgFat: number;
    avgWaterMl: number;
    daysLogged: number;
  }[];
  weightLogs: WeightLog[];
}

export type AppSection =
  | 'dashboard'
  | 'scanner'
  | 'history'
  | 'weight'
  | 'analytics'
  | 'assistant'
  | 'settings';
