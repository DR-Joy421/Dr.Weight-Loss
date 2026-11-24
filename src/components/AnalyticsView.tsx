import React, { useEffect, useState } from 'react';
import { Calendar } from 'lucide-react';
import { api } from '../api/client';
import type { AnalyticsResponse, UserSettings } from '../types';
import { MacroStackedChart, SimpleBarChart, WeightLineChart } from './Charts';
import { formatShortDate, getTodayIso, shiftIsoDate } from '../utils/date';

interface AnalyticsViewProps {
  settings: UserSettings;
  refreshSignal: number;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ settings, refreshSignal }) => {
  const todayIso = getTodayIso();
  const [preset, setPreset] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
  const [startDate, setStartDate] = useState<string>(shiftIsoDate(todayIso, -29));
  const [endDate, setEndDate] = useState<string>(todayIso);
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedInspectDate, setSelectedInspectDate] = useState<string>(todayIso);

  const handlePreset = (next: '7d' | '30d' | '90d') => {
    setPreset(next);
    const days = next === '7d' ? 6 : next === '30d' ? 29 : 89;
    setEndDate(todayIso);
    setStartDate(shiftIsoDate(todayIso, -days));
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getAnalytics(startDate, endDate)
      .then((res) => {
        if (!active) return;
        setData(res);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [startDate, endDate, refreshSignal]);

  const inspectedDay =
    data?.daily.find((d) => d.date === selectedInspectDate) ??
    (data?.daily.length ? data.daily[data.daily.length - 1] : null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#526056]">Nutrition &amp; Weight Trends</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#142018] font-display mt-0.5">
            Analytics &amp; Progress Reports
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-xl bg-[#EEF2EE] p-1">
            {(
              [
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: '90d', label: '90 Days' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handlePreset(opt.id)}
                className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  preset === opt.id
                    ? 'bg-white text-[#142018] shadow-xs'
                    : 'text-[#526056] hover:text-[#142018]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPreset('custom');
                setStartDate(e.target.value);
              }}
              className="min-h-[38px] rounded-xl border border-[#DCE5DE] bg-white px-2.5 py-1 text-xs"
            />
            <span className="text-[#647368]">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPreset('custom');
                setEndDate(e.target.value);
              }}
              className="min-h-[38px] rounded-xl border border-[#DCE5DE] bg-white px-2.5 py-1 text-xs"
            />
          </div>
        </div>
      </div>

      {loading || !data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="h-24 rounded-2xl bg-[#E8EEE9] animate-pulse" />
            ))}
          </div>
          <div className="h-64 rounded-2xl bg-[#E8EEE9] animate-pulse" />
        </div>
      ) : (
        <>
          {/* Weekly & Macro Averages Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5 shadow-xs">
              <p className="text-xs text-[#526056]">Weekly Calorie Avg</p>
              <p className="text-2xl font-bold text-[#142018] font-mono tabular-nums mt-1">
                {data.weeklyAverage.calories.toLocaleString()} <span className="text-xs font-normal">kcal</span>
              </p>
              <p className="text-xs text-[#647368] mt-1 tabular-nums">
                Prev week: {data.previousWeekAverage.calories.toLocaleString()} kcal ({data.weeklyAverage.daysLogged}d logged)
              </p>
            </div>

            <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5 shadow-xs">
              <p className="text-xs text-[#526056]">Avg Daily Protein</p>
              <p className="text-2xl font-bold text-[#2D6A4F] font-mono tabular-nums mt-1">
                {data.weeklyAverage.protein}g
              </p>
              <p className="text-xs text-[#647368] mt-1 tabular-nums">
                Target: {settings.protein_target_g}g · Prev: {data.previousWeekAverage.protein}g
              </p>
            </div>

            <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5 shadow-xs">
              <p className="text-xs text-[#526056]">Avg Carbs / Fat</p>
              <p className="text-xl font-bold text-[#142018] font-mono tabular-nums mt-1">
                {data.weeklyAverage.carbs}g / {data.weeklyAverage.fat}g
              </p>
              <p className="text-xs text-[#647368] mt-1 tabular-nums">
                Targets: {settings.carbs_target_g}g / {settings.fat_target_g}g
              </p>
            </div>

            <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5 shadow-xs">
              <p className="text-xs text-[#526056]">Avg Daily Water</p>
              <p className="text-2xl font-bold text-[#2A7B88] font-mono tabular-nums mt-1">
                {data.weeklyAverage.water_ml.toLocaleString()} <span className="text-xs font-normal">ml</span>
              </p>
              <p className="text-xs text-[#647368] mt-1 tabular-nums">
                Goal: {settings.water_goal_ml.toLocaleString()} ml
              </p>
            </div>
          </div>

          {/* Chart 1 & 2: Daily Calories + Monthly Calorie Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[#142018] font-display">
                  Daily Calorie Consumption
                </h2>
                <p className="text-xs text-[#526056]">
                  Compared against your {settings.daily_calorie_target.toLocaleString()} kcal target
                </p>
              </div>
              <SimpleBarChart
                data={data.daily.map((d) => ({
                  label: formatShortDate(d.date),
                  subLabel: d.date,
                  value: d.calories,
                  unit: 'kcal',
                }))}
                targetLine={settings.daily_calorie_target}
                targetLabel={`Target ${settings.daily_calorie_target}`}
                barColor="#2D6A4F"
                overColor="#C2593F"
              />
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[#142018] font-display">
                  Monthly Calorie Trends
                </h2>
                <p className="text-xs text-[#526056]">Average daily kcal per logged month</p>
              </div>
              <SimpleBarChart
                data={data.monthlyTrend.map((m) => ({
                  label: m.month,
                  subLabel: `${m.month} (${m.daysLogged} days logged)`,
                  value: m.avgCalories,
                  unit: 'kcal/day',
                }))}
                targetLine={settings.daily_calorie_target}
                barColor="#74A88B"
                emptyText="Monthly averages will appear once meals are logged."
              />
            </div>
          </div>

          {/* Chart 3 & 4: Macro Consumption + Daily Water Consumption */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[#142018] font-display">
                  Protein, Carbs &amp; Fat Consumption
                </h2>
                <p className="text-xs text-[#526056]">Daily macronutrient breakdown in grams</p>
              </div>
              <MacroStackedChart
                data={data.daily.map((d) => ({
                  label: formatShortDate(d.date),
                  subLabel: d.date,
                  protein: d.protein,
                  carbs: d.carbs,
                  fat: d.fat,
                }))}
              />
            </div>

            <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[#142018] font-display">
                  Daily Water Consumption
                </h2>
                <p className="text-xs text-[#526056]">
                  Hydration vs {settings.water_goal_ml.toLocaleString()} ml goal
                </p>
              </div>
              <SimpleBarChart
                data={data.daily.map((d) => ({
                  label: formatShortDate(d.date),
                  subLabel: d.date,
                  value: d.water_ml,
                  unit: 'ml',
                }))}
                targetLine={settings.water_goal_ml}
                targetLabel={`Goal ${settings.water_goal_ml} ml`}
                barColor="#2A7B88"
                overColor="#2A7B88"
                emptyText="No water consumption logged in this date range."
              />
            </div>
          </div>

          {/* Chart 5: Weight-Loss Progress + Date Inspector */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-3">
              <div>
                <h2 className="text-base font-semibold text-[#142018] font-display">
                  Weight-Loss Progress
                </h2>
                <p className="text-xs text-[#526056]">Recorded weight trend over time</p>
              </div>
              <WeightLineChart
                points={data.weightLogs.map((w) => ({
                  date: w.date,
                  label: formatShortDate(w.date),
                  weight_kg: w.weight_kg,
                }))}
                targetWeightKg={settings.target_weight_kg}
              />
            </div>

            <div className="lg:col-span-5 rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-[#2D6A4F]" />
                  <h2 className="text-base font-semibold text-[#142018] font-display">
                    Date Record Inspector
                  </h2>
                </div>
                <input
                  type="date"
                  value={selectedInspectDate}
                  onChange={(e) => setSelectedInspectDate(e.target.value)}
                  className="rounded-xl border border-[#DCE5DE] px-2.5 py-1.5 text-xs"
                />
              </div>

              {inspectedDay ? (
                <div className="space-y-3">
                  <p className="text-xs text-[#526056]">
                    Summary for <span className="font-semibold text-[#142018]">{inspectedDay.date}</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-[#EDF2EE] bg-[#FAFBF9] p-3">
                      <p className="text-xs text-[#526056]">Calories</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-[#142018]">
                        {inspectedDay.calories.toLocaleString()} kcal
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#EDF2EE] bg-[#FAFBF9] p-3">
                      <p className="text-xs text-[#526056]">Meals Logged</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-[#142018]">
                        {inspectedDay.mealCount}
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#EDF2EE] bg-[#FAFBF9] p-3">
                      <p className="text-xs text-[#526056]">Macros (P / C / F)</p>
                      <p className="text-xs font-semibold font-mono tabular-nums text-[#142018] mt-1">
                        {inspectedDay.protein}g / {inspectedDay.carbs}g / {inspectedDay.fat}g
                      </p>
                    </div>
                    <div className="rounded-xl border border-[#EDF2EE] bg-[#FAFBF9] p-3">
                      <p className="text-xs text-[#526056]">Water &amp; Weight</p>
                      <p className="text-xs font-semibold font-mono tabular-nums text-[#142018] mt-1">
                        {inspectedDay.water_ml} ml
                        {inspectedDay.weight_kg !== null ? ` · ${inspectedDay.weight_kg} kg` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-[#647368]">Select a date within the range to inspect.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
