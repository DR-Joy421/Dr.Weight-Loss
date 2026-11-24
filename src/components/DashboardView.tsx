import React, { useState } from 'react';
import {
  Camera,
  Droplets,
  Pencil,
  Plus,
  RotateCcw,
  Scale,
  Trash2,
  Utensils,
} from 'lucide-react';
import {
  MEAL_TYPES,
  type AppSection,
  type MealEntry,
  type MealType,
  type UserSettings,
  type WaterLog,
  type WeightLog,
} from '../types';
import { CalorieRing } from './Charts';
import { formatReadableDate, formatTime12h, getTodayIso } from '../utils/date';

interface DashboardViewProps {
  settings: UserSettings;
  todayMeals: MealEntry[];
  todayWaterLogs: WaterLog[];
  weights: WeightLog[];
  loading: boolean;
  onNavigate: (section: AppSection) => void;
  onAddWater: (amountMl: number) => Promise<void>;
  onDeleteWater: (id: number) => Promise<void>;
  onOpenManualMeal: (mealType: MealType) => void;
  onEditMeal: (meal: MealEntry) => void;
  onDeleteMeal: (id: number) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  settings,
  todayMeals,
  todayWaterLogs,
  weights,
  loading,
  onNavigate,
  onAddWater,
  onDeleteWater,
  onOpenManualMeal,
  onEditMeal,
  onDeleteMeal,
}) => {
  const [waterBusy, setWaterBusy] = useState(false);
  const [confirmDeleteMealId, setConfirmDeleteMealId] = useState<number | null>(null);

  const todayIso = getTodayIso();

  const totals = todayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const waterTotalMl = todayWaterLogs.reduce((sum, w) => sum + w.amount_ml, 0);
  const waterPct = Math.min(100, Math.round((waterTotalMl / Math.max(settings.water_goal_ml, 1)) * 100));

  const latestWeight = weights.length > 0 ? weights[weights.length - 1].weight_kg : null;
  const startingWeight =
    settings.starting_weight_kg ?? (weights.length > 0 ? weights[0].weight_kg : null);
  const weightLost =
    startingWeight !== null && latestWeight !== null
      ? Number((startingWeight - latestWeight).toFixed(1))
      : null;

  const bmi =
    latestWeight !== null && settings.height_cm
      ? Number((latestWeight / Math.pow(settings.height_cm / 100, 2)).toFixed(1))
      : null;

  const handleQuickWater = async (ml: number) => {
    setWaterBusy(true);
    try {
      await onAddWater(ml);
    } finally {
      setWaterBusy(false);
    }
  };

  const handleUndoWater = async () => {
    if (!todayWaterLogs.length) return;
    setWaterBusy(true);
    try {
      await onDeleteWater(todayWaterLogs[0].id);
    } finally {
      setWaterBusy(false);
    }
  };

  const macroRows = [
    {
      label: 'Protein',
      value: totals.protein,
      target: settings.protein_target_g,
      barClass: 'bg-[#2D6A4F]',
    },
    {
      label: 'Carbohydrates',
      value: totals.carbs,
      target: settings.carbs_target_g,
      barClass: 'bg-[#C58B37]',
    },
    {
      label: 'Fat',
      value: totals.fat,
      target: settings.fat_target_g,
      barClass: 'bg-[#A65E46]',
    },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-48 rounded-2xl bg-[#E8EEE9] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="h-44 rounded-2xl bg-[#E8EEE9] animate-pulse" />
          <div className="h-44 rounded-2xl bg-[#E8EEE9] animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#526056]">Daily Overview · {formatReadableDate(todayIso)}</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#142018] font-display mt-0.5">
            Today&apos;s Nutrition
          </h1>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onOpenManualMeal('Lunch')}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#DCE5DE] bg-white px-4 py-2 text-sm font-medium text-[#142018] hover:bg-[#F1F5F2] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4 text-[#2D6A4F]" />
            Quick Log
          </button>
          <button
            type="button"
            onClick={() => onNavigate('scanner')}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-medium text-white hover:bg-[#2D6A4F] transition-colors whitespace-nowrap shrink-0"
          >
            <Camera className="h-4 w-4" />
            Scan Food
          </button>
        </div>
      </div>

      {/* Primary Hero Card: Calorie Ring + Macros */}
      <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 sm:p-6 shadow-xs">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-5 flex flex-col sm:flex-row items-center gap-6">
            <CalorieRing consumed={Math.round(totals.calories)} target={settings.daily_calorie_target} />
            <div className="grid grid-cols-2 sm:grid-cols-1 gap-4 w-full sm:w-auto text-center sm:text-left">
              <div>
                <p className="text-xs text-[#526056]">Consumed Today</p>
                <p className="text-2xl font-bold text-[#142018] font-mono tabular-nums">
                  {Math.round(totals.calories).toLocaleString()} <span className="text-xs font-normal text-[#526056]">kcal</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-[#526056]">Daily Target</p>
                <p className="text-lg font-semibold text-[#2D6A4F] font-mono tabular-nums">
                  {settings.daily_calorie_target.toLocaleString()} <span className="text-xs font-normal text-[#526056]">kcal</span>
                </p>
              </div>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-4 border-t lg:border-t-0 lg:border-l border-[#EDF2EE] pt-5 lg:pt-0 lg:pl-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#142018] font-display">Macronutrients</h2>
              <span className="text-xs text-[#526056] tabular-nums">
                {todayMeals.length} {todayMeals.length === 1 ? 'meal' : 'meals'} logged
              </span>
            </div>
            <div className="space-y-3.5">
              {macroRows.map((macro) => {
                const pct = Math.min(100, Math.round((macro.value / Math.max(macro.target, 1)) * 100));
                return (
                  <div key={macro.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[#142018]">{macro.label}</span>
                      <span className="font-mono text-xs sm:text-sm tabular-nums text-[#142018]">
                        {macro.value.toFixed(1)}g{' '}
                        <span className="text-[#647368]">/ {macro.target}g ({pct}%)</span>
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EDF2EE]">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${macro.barClass}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Secondary Metrics Row: Hydration + Weight Progress */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Water Intake Card */}
        <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-[#526056]">
                <Droplets className="h-4 w-4 text-[#2A7B88]" />
                <span>Daily Hydration</span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-[#142018] font-mono tabular-nums">
                  {waterTotalMl.toLocaleString()} ml
                </span>
                <span className="text-sm text-[#526056] tabular-nums">
                  / {settings.water_goal_ml.toLocaleString()} ml ({waterPct}%)
                </span>
              </div>
            </div>
            {todayWaterLogs.length > 0 && (
              <button
                type="button"
                onClick={handleUndoWater}
                disabled={waterBusy}
                className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[#DCE5DE] px-2.5 py-1 text-xs font-medium text-[#526056] hover:bg-[#F7F9F7] whitespace-nowrap shrink-0"
                title="Undo last water log"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Undo
              </button>
            )}
          </div>

          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#E6F1F3]">
            <div
              className="h-full rounded-full bg-[#2A7B88] transition-all duration-300"
              style={{ width: `${waterPct}%` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: '+150 ml', sub: 'Cup', val: 150 },
              { label: '+250 ml', sub: 'Glass', val: 250 },
              { label: '+500 ml', sub: 'Bottle', val: 500 },
            ].map((btn) => (
              <button
                key={btn.val}
                type="button"
                disabled={waterBusy}
                onClick={() => handleQuickWater(btn.val)}
                className="min-h-[44px] flex flex-col items-center justify-center rounded-xl border border-[#DCE5DE] bg-[#F8FAF8] px-2 py-1.5 text-center hover:border-[#2A7B88] hover:bg-[#F0F7F8] active:scale-[0.98] transition-all disabled:opacity-50"
              >
                <span className="text-sm font-semibold text-[#142018] font-mono tabular-nums">
                  {btn.label}
                </span>
                <span className="text-[11px] text-[#526056]">{btn.sub}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Weight & Target Card */}
        <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium text-[#526056]">
                <Scale className="h-4 w-4 text-[#2D6A4F]" />
                <span>Weight Progress</span>
              </div>
              <div className="mt-1.5 flex items-baseline gap-3">
                <span className="text-2xl font-bold text-[#142018] font-mono tabular-nums">
                  {latestWeight !== null ? `${latestWeight.toFixed(1)} kg` : 'Not logged'}
                </span>
                {settings.target_weight_kg !== null && (
                  <span className="text-sm text-[#526056] tabular-nums">
                    Target {settings.target_weight_kg.toFixed(1)} kg
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('weight')}
              className="min-h-[36px] rounded-lg border border-[#DCE5DE] px-3 py-1.5 text-xs font-medium text-[#1B4332] hover:bg-[#F1F5F2] whitespace-nowrap shrink-0"
            >
              Manage Weight
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-[#EDF2EE] pt-3">
            <div>
              <p className="text-xs text-[#526056]">Starting</p>
              <p className="text-sm font-semibold text-[#142018] font-mono tabular-nums mt-0.5">
                {startingWeight !== null ? `${startingWeight.toFixed(1)} kg` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#526056]">Total Change</p>
              <p className="text-sm font-semibold text-[#1B4332] font-mono tabular-nums mt-0.5">
                {weightLost !== null
                  ? weightLost > 0
                    ? `−${weightLost.toFixed(1)} kg`
                    : weightLost < 0
                      ? `+${Math.abs(weightLost).toFixed(1)} kg`
                      : '0.0 kg'
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-[#526056]">BMI</p>
              <p className="text-sm font-semibold text-[#142018] font-mono tabular-nums mt-0.5">
                {bmi !== null ? bmi.toFixed(1) : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Today's Meals Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#142018] font-display">Today&apos;s Meals</h2>
          <button
            type="button"
            onClick={() => onNavigate('history')}
            className="text-sm font-medium text-[#2D6A4F] hover:underline whitespace-nowrap shrink-0"
          >
            View Calendar History
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {MEAL_TYPES.map((slot) => {
            const slotMeals = todayMeals.filter((m) => m.meal_type === slot);
            const slotCalories = slotMeals.reduce((s, m) => s + m.calories, 0);

            return (
              <div
                key={slot}
                className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5 shadow-xs flex flex-col gap-3"
              >
                <div className="flex items-center justify-between border-b border-[#EDF2EE] pb-3">
                  <div>
                    <h3 className="text-base font-semibold text-[#142018] font-display">{slot}</h3>
                    <p className="text-xs text-[#526056] font-mono tabular-nums">
                      {Math.round(slotCalories)} kcal · {slotMeals.length}{' '}
                      {slotMeals.length === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenManualMeal(slot)}
                    className="min-h-[38px] inline-flex items-center gap-1 rounded-lg border border-[#DCE5DE] px-3 py-1.5 text-xs font-medium text-[#1B4332] hover:bg-[#F1F5F2] whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>

                {slotMeals.length === 0 ? (
                  <div className="py-5 text-center text-sm text-[#647368]">
                    No {slot.toLowerCase()} logged yet.
                  </div>
                ) : (
                  <div className="divide-y divide-[#EDF2EE]">
                    {slotMeals.map((meal) => (
                      <div key={meal.id} className="py-3 first:pt-1 last:pb-1 flex gap-3 items-start">
                        {meal.image_data ? (
                          <img
                            src={meal.image_data}
                            alt={meal.food_name}
                            className="h-14 w-14 rounded-xl object-cover border border-[#E2E8E2] shrink-0"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="h-14 w-14 rounded-xl bg-[#EEF3EF] flex items-center justify-center shrink-0">
                            <Utensils className="h-5 w-5 text-[#526056]" />
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-[#142018] truncate">
                              {meal.food_name}
                            </p>
                            <span className="text-sm font-semibold text-[#1B4332] font-mono tabular-nums shrink-0">
                              {Math.round(meal.calories)} kcal
                            </span>
                          </div>
                          <p className="text-xs text-[#526056] mt-0.5 truncate">
                            {meal.serving_size} · {formatTime12h(meal.time)}
                          </p>
                          <p className="text-xs text-[#647368] mt-1 font-mono tabular-nums">
                            P {meal.protein}g · C {meal.carbs}g · F {meal.fat}g
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onEditMeal(meal)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#526056] hover:bg-[#F1F5F2] hover:text-[#142018]"
                            aria-label={`Edit ${meal.food_name}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {confirmDeleteMealId === meal.id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeleteMeal(meal.id);
                                setConfirmDeleteMealId(null);
                              }}
                              className="min-h-[36px] px-2 rounded-lg bg-[#B5472D] text-xs font-medium text-white whitespace-nowrap"
                            >
                              Delete?
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteMealId(meal.id)}
                              className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#647368] hover:bg-[#FDF4F2] hover:text-[#B5472D]"
                              aria-label={`Delete ${meal.food_name}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
