import React, { useState } from 'react';
import { Check, Pencil, Plus, Scale, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import type { UserSettings, WeightLog } from '../types';
import { WeightLineChart } from './Charts';
import { formatShortDate, getTodayIso, shiftIsoDate } from '../utils/date';

interface WeightTrackerViewProps {
  settings: UserSettings;
  weights: WeightLog[];
  onSettingsUpdated: (s: UserSettings) => void;
  onWeightsChanged: () => void;
}

function getBmiCategory(bmi: number): { label: string; toneClass: string } {
  if (bmi < 18.5) return { label: 'Underweight', toneClass: 'text-[#9A671F]' };
  if (bmi < 25) return { label: 'Healthy range', toneClass: 'text-[#1B4332]' };
  if (bmi < 30) return { label: 'Overweight', toneClass: 'text-[#9A671F]' };
  return { label: 'Obese', toneClass: 'text-[#B5472D]' };
}

export const WeightTrackerView: React.FC<WeightTrackerViewProps> = ({
  settings,
  weights,
  onSettingsUpdated,
  onWeightsChanged,
}) => {
  const [heightCm, setHeightCm] = useState<string>(
    settings.height_cm !== null ? String(settings.height_cm) : ''
  );
  const [startingKg, setStartingKg] = useState<string>(
    settings.starting_weight_kg !== null ? String(settings.starting_weight_kg) : ''
  );
  const [targetKg, setTargetKg] = useState<string>(
    settings.target_weight_kg !== null ? String(settings.target_weight_kg) : ''
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSavedMsg, setProfileSavedMsg] = useState<string | null>(null);

  const [logDate, setLogDate] = useState<string>(getTodayIso());
  const [logWeight, setLogWeight] = useState<string>('');
  const [logNote, setLogNote] = useState<string>('');
  const [loggingWeight, setLoggingWeight] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [chartMode, setChartMode] = useState<'weekly' | 'monthly'>('weekly');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editWeight, setEditWeight] = useState<string>('');
  const [editNote, setEditNote] = useState<string>('');

  const latestWeight = weights.length > 0 ? weights[weights.length - 1].weight_kg : null;
  const effectiveStart =
    settings.starting_weight_kg ?? (weights.length > 0 ? weights[0].weight_kg : null);
  const effectiveTarget = settings.target_weight_kg;

  const bmi =
    latestWeight !== null && settings.height_cm
      ? Number((latestWeight / Math.pow(settings.height_cm / 100, 2)).toFixed(1))
      : null;

  const totalLost =
    effectiveStart !== null && latestWeight !== null
      ? Number((effectiveStart - latestWeight).toFixed(1))
      : null;

  let targetProgressPct: number | null = null;
  let remainingToTarget: number | null = null;
  if (effectiveStart !== null && effectiveTarget !== null && latestWeight !== null) {
    remainingToTarget = Number((latestWeight - effectiveTarget).toFixed(1));
    const totalNeeded = effectiveStart - effectiveTarget;
    if (Math.abs(totalNeeded) > 0.01) {
      targetProgressPct = Math.max(
        0,
        Math.min(100, Math.round(((effectiveStart - latestWeight) / totalNeeded) * 100))
      );
    } else if (Math.abs(latestWeight - effectiveTarget) <= 0.1) {
      targetProgressPct = 100;
    }
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setError(null);
    setProfileSavedMsg(null);
    try {
      const updated = await api.updateSettings({
        height_cm: heightCm.trim() ? Number(heightCm) : null,
        starting_weight_kg: startingKg.trim() ? Number(startingKg) : null,
        target_weight_kg: targetKg.trim() ? Number(targetKg) : null,
      });
      onSettingsUpdated(updated);
      setProfileSavedMsg('Body metrics updated.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAddWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(logWeight);
    if (!Number.isFinite(num) || num < 20 || num > 400) {
      setError('Please enter a valid weight between 20 and 400 kg.');
      return;
    }
    setLoggingWeight(true);
    setError(null);
    try {
      await api.addWeight(logDate, num, logNote);
      setLogWeight('');
      setLogNote('');
      onWeightsChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoggingWeight(false);
    }
  };

  const handleSaveEdit = async (id: number) => {
    const num = Number(editWeight);
    if (!Number.isFinite(num) || num < 20 || num > 400) {
      setError('Weight must be between 20 and 400 kg.');
      return;
    }
    await api.updateWeight(id, {
      date: editDate,
      weight_kg: num,
      note: editNote,
    });
    setEditingId(null);
    onWeightsChanged();
  };

  const handleDeleteWeight = async (id: number) => {
    await api.deleteWeight(id);
    onWeightsChanged();
  };

  // Build chart points for Weekly (last 28 days or weekly points) vs Monthly (last 180 days / monthly averages)
  const todayIso = getTodayIso();
  const chartPoints =
    chartMode === 'weekly'
      ? weights
          .filter((w) => w.date >= shiftIsoDate(todayIso, -28))
          .map((w) => ({
            date: w.date,
            label: formatShortDate(w.date),
            weight_kg: w.weight_kg,
          }))
      : (() => {
          // Group by month if > 30 entries, else show all entries over last 180 days
          const sixMonths = weights.filter((w) => w.date >= shiftIsoDate(todayIso, -180));
          if (sixMonths.length <= 24) {
            return sixMonths.map((w) => ({
              date: w.date,
              label: formatShortDate(w.date),
              weight_kg: w.weight_kg,
            }));
          }
          const byMonth = new Map<string, number[]>();
          sixMonths.forEach((w) => {
            const m = w.date.slice(0, 7);
            const arr = byMonth.get(m) ?? [];
            arr.push(w.weight_kg);
            byMonth.set(m, arr);
          });
          return Array.from(byMonth.entries()).map(([month, arr]) => ({
            date: month,
            label: month,
            weight_kg: Number((arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1)),
          }));
        })();

  const finalChartPoints =
    chartPoints.length > 0
      ? chartPoints
      : weights.slice(-12).map((w) => ({
          date: w.date,
          label: formatShortDate(w.date),
          weight_kg: w.weight_kg,
        }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-[#526056]">Body Metrics &amp; Progress</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#142018] font-display mt-0.5">
          Weight Tracker
        </h1>
      </div>

      {error && (
        <div className="rounded-xl border border-[#E5B8AD] bg-[#FDF4F2] px-4 py-3 text-sm text-[#9C3A22]">
          {error}
        </div>
      )}

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5 shadow-xs">
          <p className="text-xs text-[#526056]">Current Weight</p>
          <p className="text-2xl font-bold text-[#142018] font-mono tabular-nums mt-1">
            {latestWeight !== null ? `${latestWeight.toFixed(1)} kg` : '—'}
          </p>
          <p className="text-xs text-[#647368] mt-1 tabular-nums">
            {effectiveTarget !== null ? `Target: ${effectiveTarget.toFixed(1)} kg` : 'Set target below'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5 shadow-xs">
          <p className="text-xs text-[#526056]">Body Mass Index (BMI)</p>
          <p className="text-2xl font-bold text-[#142018] font-mono tabular-nums mt-1">
            {bmi !== null ? bmi.toFixed(1) : '—'}
          </p>
          <p className={`text-xs font-medium mt-1 ${bmi !== null ? getBmiCategory(bmi).toneClass : 'text-[#647368]'}`}>
            {bmi !== null ? getBmiCategory(bmi).label : 'Enter height & weight'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5 shadow-xs">
          <p className="text-xs text-[#526056]">Total Weight Lost</p>
          <p className="text-2xl font-bold text-[#1B4332] font-mono tabular-nums mt-1">
            {totalLost !== null
              ? totalLost > 0
                ? `${totalLost.toFixed(1)} kg`
                : totalLost < 0
                  ? `+${Math.abs(totalLost).toFixed(1)} kg`
                  : '0.0 kg'
              : '—'}
          </p>
          <p className="text-xs text-[#647368] mt-1 tabular-nums">
            {effectiveStart !== null ? `From ${effectiveStart.toFixed(1)} kg` : 'No baseline yet'}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5 shadow-xs">
          <p className="text-xs text-[#526056]">Target Progress</p>
          <p className="text-2xl font-bold text-[#142018] font-mono tabular-nums mt-1">
            {targetProgressPct !== null ? `${targetProgressPct}%` : '—'}
          </p>
          {targetProgressPct !== null ? (
            <div className="mt-2 space-y-1">
              <div className="h-2 w-full rounded-full bg-[#EDF2EE] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#2D6A4F]"
                  style={{ width: `${targetProgressPct}%` }}
                />
              </div>
              <p className="text-[11px] text-[#647368] tabular-nums">
                {remainingToTarget !== null && remainingToTarget > 0
                  ? `${remainingToTarget.toFixed(1)} kg to goal`
                  : 'Goal reached'}
              </p>
            </div>
          ) : (
            <p className="text-xs text-[#647368] mt-1">Set start &amp; target weight</p>
          )}
        </div>
      </div>

      {/* Forms Row: Log Weight + Baseline Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={handleAddWeight}
          className="lg:col-span-5 rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-4"
        >
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-[#2D6A4F]" />
            <h2 className="text-base font-semibold text-[#142018] font-display">Log Weight</h2>
          </div>
          <p className="text-xs text-[#526056]">
            Log your weight on any day you choose—daily entries are not required.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">Weight (kg)</label>
              <input
                type="number"
                step="0.1"
                min="20"
                max="400"
                value={logWeight}
                onChange={(e) => setLogWeight(e.target.value)}
                placeholder="e.g., 74.5"
                className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">Date</label>
              <input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                className="w-full rounded-xl border border-[#DCE5DE] px-3 py-2.5 text-sm focus:border-[#2D6A4F] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#526056] mb-1">Note (optional)</label>
            <input
              type="text"
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              placeholder="Morning fasted weigh-in"
              className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2 text-sm focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loggingWeight}
            className="min-h-[44px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4332] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2D6A4F] disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            {loggingWeight ? 'Saving...' : 'Save Weight Entry'}
          </button>
        </form>

        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-7 rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[#142018] font-display">
              Height &amp; Weight Goals
            </h2>
            {profileSavedMsg && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#1B4332]">
                <Check className="h-3.5 w-3.5" />
                {profileSavedMsg}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">Height (cm)</label>
              <input
                type="number"
                step="0.5"
                min="80"
                max="250"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                placeholder="e.g., 172"
                className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
              />
              {heightCm && Number(heightCm) > 0 && (
                <p className="text-[11px] text-[#647368] mt-1">
                  ≈ {Math.floor(Number(heightCm) / 30.48)}&apos;
                  {Math.round((Number(heightCm) % 30.48) / 2.54)}&quot;
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">
                Starting Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                min="20"
                max="400"
                value={startingKg}
                onChange={(e) => setStartingKg(e.target.value)}
                placeholder="e.g., 82.0"
                className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">
                Target Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                min="20"
                max="400"
                value={targetKg}
                onChange={(e) => setTargetKg(e.target.value)}
                placeholder="e.g., 70.0"
                className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-[#526056]">
              Used to compute your BMI and weight-loss progress automatically.
            </p>
            <button
              type="submit"
              disabled={savingProfile}
              className="min-h-[44px] rounded-xl border border-[#1B4332] px-4 py-2 text-sm font-medium text-[#1B4332] hover:bg-[#EDF6F0] whitespace-nowrap shrink-0"
            >
              {savingProfile ? 'Updating...' : 'Save Goals'}
            </button>
          </div>
        </form>
      </div>

      {/* Weight Chart */}
      <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#142018] font-display">
              Weight Trend Over Time
            </h2>
            <p className="text-xs text-[#526056]">
              {chartMode === 'weekly' ? 'Recent 4-week window' : 'Long-term monthly view'}
            </p>
          </div>
          <div className="inline-flex items-center gap-1 rounded-xl bg-[#F1F5F2] p-1 self-start">
            <button
              type="button"
              onClick={() => setChartMode('weekly')}
              className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                chartMode === 'weekly'
                  ? 'bg-white text-[#142018] shadow-xs'
                  : 'text-[#526056] hover:text-[#142018]'
              }`}
            >
              Weekly
            </button>
            <button
              type="button"
              onClick={() => setChartMode('monthly')}
              className={`min-h-[36px] rounded-lg px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                chartMode === 'monthly'
                  ? 'bg-white text-[#142018] shadow-xs'
                  : 'text-[#526056] hover:text-[#142018]'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        <WeightLineChart points={finalChartPoints} targetWeightKg={effectiveTarget} />
      </div>

      {/* Weight History Table */}
      <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-4">
        <h2 className="text-base font-semibold text-[#142018] font-display">
          Recorded Measurements ({weights.length})
        </h2>

        {weights.length === 0 ? (
          <p className="py-6 text-center text-sm text-[#647368]">
            No weight measurements logged yet. Add your first weight above to begin tracking.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E8EEE9] text-xs text-[#526056]">
                <tr>
                  <th className="py-2.5 pr-4 font-medium">Date</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Weight</th>
                  <th className="py-2.5 pr-4 font-medium text-right">BMI</th>
                  <th className="py-2.5 pr-4 font-medium">Note</th>
                  <th className="py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EDF2EE]">
                {[...weights].reverse().map((w) => {
                  const rowBmi = settings.height_cm
                    ? (w.weight_kg / Math.pow(settings.height_cm / 100, 2)).toFixed(1)
                    : '—';
                  const isEditing = editingId === w.id;

                  return (
                    <tr key={w.id} className="hover:bg-[#FAFBF9]">
                      <td className="py-3 pr-4 font-mono text-xs tabular-nums text-[#142018]">
                        {isEditing ? (
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="rounded-lg border border-[#DCE5DE] px-2 py-1 text-xs"
                          />
                        ) : (
                          w.date
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-[#142018]">
                        {isEditing ? (
                          <input
                            type="number"
                            step="0.1"
                            value={editWeight}
                            onChange={(e) => setEditWeight(e.target.value)}
                            className="w-20 rounded-lg border border-[#DCE5DE] px-2 py-1 text-right text-xs"
                          />
                        ) : (
                          `${w.weight_kg.toFixed(1)} kg`
                        )}
                      </td>
                      <td className="py-3 pr-4 text-right font-mono text-xs tabular-nums text-[#526056]">
                        {rowBmi}
                      </td>
                      <td className="py-3 pr-4 text-xs text-[#526056]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editNote}
                            onChange={(e) => setEditNote(e.target.value)}
                            className="w-full rounded-lg border border-[#DCE5DE] px-2 py-1 text-xs"
                          />
                        ) : (
                          w.note || '—'
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(w.id)}
                              className="rounded-lg bg-[#1B4332] px-2.5 py-1 text-xs font-medium text-white"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="rounded-lg border border-[#DCE5DE] px-2.5 py-1 text-xs text-[#526056]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(w.id);
                                setEditDate(w.date);
                                setEditWeight(String(w.weight_kg));
                                setEditNote(w.note || '');
                              }}
                              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg text-[#526056] hover:bg-[#F1F5F2]"
                              aria-label="Edit weight entry"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteWeight(w.id)}
                              className="min-h-[34px] min-w-[34px] inline-flex items-center justify-center rounded-lg text-[#647368] hover:bg-[#FDF4F2] hover:text-[#B5472D]"
                              aria-label="Delete weight entry"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
