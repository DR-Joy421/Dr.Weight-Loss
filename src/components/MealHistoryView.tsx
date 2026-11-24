import React, { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Droplets,
  Pencil,
  Plus,
  Scale,
  Trash2,
  Utensils,
} from 'lucide-react';
import { api } from '../api/client';
import {
  MEAL_TYPES,
  type MealEntry,
  type MealType,
  type UserSettings,
  type WaterLog,
  type WeightLog,
} from '../types';
import {
  formatMonthLabel,
  formatReadableDate,
  formatTime12h,
  getMonthCalendarDays,
  getTodayIso,
  shiftYearMonth,
} from '../utils/date';

interface MealHistoryViewProps {
  settings: UserSettings;
  weights: WeightLog[];
  refreshSignal: number;
  onOpenManualMeal: (mealType: MealType, date: string) => void;
  onEditMeal: (meal: MealEntry) => void;
  onDeleteMeal: (id: number) => Promise<void>;
  onWaterChanged: () => void;
}

export const MealHistoryView: React.FC<MealHistoryViewProps> = ({
  settings,
  weights,
  refreshSignal,
  onOpenManualMeal,
  onEditMeal,
  onDeleteMeal,
  onWaterChanged,
}) => {
  const todayIso = getTodayIso();
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);
  const [currentMonth, setCurrentMonth] = useState<string>(todayIso.slice(0, 7));
  const [activityMap, setActivityMap] = useState<
    Map<string, { calories: number; mealCount: number; water_ml: number; weight_kg: number | null }>
  >(new Map());
  const [dayMeals, setDayMeals] = useState<MealEntry[]>([]);
  const [dayWaterLogs, setDayWaterLogs] = useState<WaterLog[]>([]);
  const [loadingDay, setLoadingDay] = useState<boolean>(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    api.getCalendarActivity(currentMonth).then((rows) => {
      if (!active) return;
      const map = new Map<
        string,
        { calories: number; mealCount: number; water_ml: number; weight_kg: number | null }
      >();
      rows.forEach((r) => map.set(r.date, r));
      setActivityMap(map);
    });
    return () => {
      active = false;
    };
  }, [currentMonth, refreshSignal]);

  useEffect(() => {
    let active = true;
    setLoadingDay(true);
    Promise.all([api.getMeals({ date: selectedDate }), api.getWater({ date: selectedDate })])
      .then(([meals, water]) => {
        if (!active) return;
        setDayMeals(meals);
        setDayWaterLogs(water.logs);
      })
      .finally(() => {
        if (active) setLoadingDay(false);
      });
    return () => {
      active = false;
    };
  }, [selectedDate, refreshSignal]);

  const calendarDays = getMonthCalendarDays(currentMonth);
  const dayTotals = dayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + m.calories,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const dayWaterMl = dayWaterLogs.reduce((s, w) => s + w.amount_ml, 0);
  const dayWeight = weights.filter((w) => w.date === selectedDate).slice(-1)[0] ?? null;

  const handleAddWaterForDay = async (ml: number) => {
    await api.addWater(selectedDate, ml);
    onWaterChanged();
  };

  const handleDeleteWaterForDay = async (id: number) => {
    await api.deleteWater(id);
    onWaterChanged();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#526056]">Calendar &amp; Daily Meal Log</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#142018] font-display mt-0.5">
            Meal History
          </h1>
        </div>
        <button
          type="button"
          onClick={() => onOpenManualMeal('Lunch', selectedDate)}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#1B4332] px-4 py-2 text-sm font-medium text-white hover:bg-[#2D6A4F] whitespace-nowrap shrink-0"
        >
          <Plus className="h-4 w-4" />
          Log Meal for {selectedDate === todayIso ? 'Today' : selectedDate}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Calendar Card */}
        <div className="lg:col-span-5 rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#142018] font-display">
              {formatMonthLabel(currentMonth)}
            </h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCurrentMonth((m) => shiftYearMonth(m, -1))}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[#DCE5DE] text-[#142018] hover:bg-[#F7F9F7]"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCurrentMonth(todayIso.slice(0, 7));
                  setSelectedDate(todayIso);
                }}
                className="min-h-[38px] px-2.5 rounded-lg border border-[#DCE5DE] text-xs font-medium text-[#1B4332] hover:bg-[#F7F9F7]"
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setCurrentMonth((m) => shiftYearMonth(m, 1))}
                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg border border-[#DCE5DE] text-[#142018] hover:bg-[#F7F9F7]"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[#647368]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((cell) => {
              const info = activityMap.get(cell.iso);
              const isSelected = cell.iso === selectedDate;
              const isToday = cell.iso === todayIso;
              const hasMeals = (info?.mealCount ?? 0) > 0;
              const hasWaterOrWeight = (info?.water_ml ?? 0) > 0 || info?.weight_kg !== null;

              return (
                <button
                  key={cell.iso}
                  type="button"
                  onClick={() => {
                    setSelectedDate(cell.iso);
                    if (cell.iso.slice(0, 7) !== currentMonth) {
                      setCurrentMonth(cell.iso.slice(0, 7));
                    }
                  }}
                  className={`relative min-h-[44px] flex flex-col items-center justify-center rounded-xl text-xs transition-colors ${
                    isSelected
                      ? 'bg-[#1B4332] text-white font-semibold'
                      : cell.inCurrentMonth
                        ? isToday
                          ? 'bg-[#E8F0EB] text-[#1B4332] font-semibold hover:bg-[#DCE9E0]'
                          : 'text-[#142018] hover:bg-[#F4F7F4]'
                        : 'text-[#A3B0A7] hover:bg-[#F7F9F7]'
                  }`}
                >
                  <span className="tabular-nums">{cell.day}</span>
                  {(hasMeals || hasWaterOrWeight) && (
                    <span className="mt-0.5 flex items-center gap-0.5">
                      {hasMeals && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSelected ? 'bg-[#B7E4C7]' : 'bg-[#2D6A4F]'
                          }`}
                        />
                      )}
                      {info?.weight_kg !== null && info?.weight_kg !== undefined && (
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            isSelected ? 'bg-white' : 'bg-[#C58B37]'
                          }`}
                        />
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-[#EDF2EE] pt-3 text-[11px] text-[#526056]">
            <span>Green mark: Meals logged</span>
            <span>Amber mark: Weight recorded</span>
          </div>
        </div>

        {/* Selected Day Summary + Meals */}
        <div className="lg:col-span-7 space-y-5">
          {/* Day Totals Strip */}
          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EDF2EE] pb-3">
              <div>
                <h2 className="text-lg font-semibold text-[#142018] font-display">
                  {formatReadableDate(selectedDate)}
                </h2>
                <p className="text-xs text-[#526056]">
                  Target: {settings.daily_calorie_target.toLocaleString()} kcal
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-[#1B4332] font-mono tabular-nums">
                  {Math.round(dayTotals.calories).toLocaleString()} kcal
                </p>
                <p className="text-xs text-[#526056] font-mono tabular-nums">
                  P {dayTotals.protein.toFixed(1)}g · C {dayTotals.carbs.toFixed(1)}g · F{' '}
                  {dayTotals.fat.toFixed(1)}g
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-[#E8EEE9] bg-[#FAFBF9] p-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-[#526056]">
                    <Droplets className="h-3.5 w-3.5 text-[#2A7B88]" />
                    <span>Water Consumed</span>
                  </div>
                  <p className="text-base font-bold text-[#142018] font-mono tabular-nums mt-0.5">
                    {dayWaterMl.toLocaleString()} / {settings.water_goal_ml.toLocaleString()} ml
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAddWaterForDay(250)}
                    className="min-h-[36px] rounded-lg border border-[#DCE5DE] bg-white px-2.5 py-1 text-xs font-medium text-[#142018] hover:bg-[#F0F7F8]"
                  >
                    +250 ml
                  </button>
                  {dayWaterLogs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleDeleteWaterForDay(dayWaterLogs[0].id)}
                      className="min-h-[36px] rounded-lg border border-[#DCE5DE] bg-white px-2 py-1 text-xs text-[#647368] hover:text-[#B5472D]"
                      title="Remove latest water entry for this day"
                    >
                      Undo
                    </button>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-[#E8EEE9] bg-[#FAFBF9] p-3.5 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-1.5 text-xs text-[#526056]">
                    <Scale className="h-3.5 w-3.5 text-[#2D6A4F]" />
                    <span>Recorded Weight</span>
                  </div>
                  <p className="text-base font-bold text-[#142018] font-mono tabular-nums mt-0.5">
                    {dayWeight ? `${dayWeight.weight_kg.toFixed(1)} kg` : 'No weight logged'}
                  </p>
                </div>
                {dayWeight?.note && (
                  <span className="text-xs text-[#526056] truncate max-w-[120px]">
                    {dayWeight.note}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Meals by Slot */}
          {loadingDay ? (
            <div className="h-48 rounded-2xl bg-[#E8EEE9] animate-pulse" />
          ) : (
            <div className="space-y-4">
              {MEAL_TYPES.map((slot) => {
                const slotMeals = dayMeals.filter((m) => m.meal_type === slot);
                return (
                  <div
                    key={slot}
                    className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5 shadow-xs"
                  >
                    <div className="flex items-center justify-between border-b border-[#EDF2EE] pb-3 mb-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-semibold text-[#142018] font-display">{slot}</h3>
                        <span className="text-xs font-mono text-[#526056] tabular-nums">
                          {Math.round(slotMeals.reduce((s, m) => s + m.calories, 0))} kcal
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onOpenManualMeal(slot, selectedDate)}
                        className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[#DCE5DE] px-2.5 py-1 text-xs font-medium text-[#1B4332] hover:bg-[#F1F5F2]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add
                      </button>
                    </div>

                    {slotMeals.length === 0 ? (
                      <p className="text-sm text-[#647368] py-2">No entries in {slot.toLowerCase()}.</p>
                    ) : (
                      <div className="divide-y divide-[#EDF2EE]">
                        {slotMeals.map((meal) => (
                          <div key={meal.id} className="py-3 first:pt-0 last:pb-0 flex gap-3.5 items-start">
                            {meal.image_data ? (
                              <img
                                src={meal.image_data}
                                alt={meal.food_name}
                                className="h-16 w-16 rounded-xl object-cover border border-[#E2E8E2] shrink-0"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <div className="h-16 w-16 rounded-xl bg-[#EEF3EF] flex items-center justify-center shrink-0">
                                <Utensils className="h-5 w-5 text-[#526056]" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-[#142018]">
                                  {meal.food_name}
                                </p>
                                <span className="text-sm font-bold text-[#1B4332] font-mono tabular-nums shrink-0">
                                  {Math.round(meal.calories)} kcal
                                </span>
                              </div>
                              <p className="text-xs text-[#526056] mt-0.5">
                                {meal.serving_size} · {formatTime12h(meal.time)}
                              </p>
                              <p className="text-xs text-[#647368] mt-1 line-clamp-2">
                                Ingredients: {meal.ingredients}
                              </p>
                              <p className="text-xs font-mono text-[#526056] mt-1 tabular-nums">
                                Protein {meal.protein}g · Carbs {meal.carbs}g · Fat {meal.fat}g
                                {meal.oil_tsp > 0 ? ` · Oil ${meal.oil_tsp} tsp` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => onEditMeal(meal)}
                                className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#526056] hover:bg-[#F1F5F2] hover:text-[#142018]"
                                aria-label="Edit meal"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {confirmDeleteId === meal.id ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onDeleteMeal(meal.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="min-h-[38px] px-2.5 rounded-lg bg-[#B5472D] text-xs font-medium text-white"
                                >
                                  Confirm
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(meal.id)}
                                  className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg text-[#647368] hover:bg-[#FDF4F2] hover:text-[#B5472D]"
                                  aria-label="Delete meal"
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
          )}
        </div>
      </div>
    </div>
  );
};
