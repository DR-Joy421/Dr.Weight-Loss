import React, { useState } from 'react';
import { AlertTriangle, Check, Download, RotateCcw, Upload } from 'lucide-react';
import { api } from '../api/client';
import type { UserSettings } from '../types';
import { getTodayIso } from '../utils/date';

interface SettingsViewProps {
  settings: UserSettings;
  onSettingsUpdated: (s: UserSettings) => void;
  onDataResetOrRestored: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onSettingsUpdated,
  onDataResetOrRestored,
}) => {
  const [calorieTarget, setCalorieTarget] = useState(String(settings.daily_calorie_target));
  const [proteinTarget, setProteinTarget] = useState(String(settings.protein_target_g));
  const [carbsTarget, setCarbsTarget] = useState(String(settings.carbs_target_g));
  const [fatTarget, setFatTarget] = useState(String(settings.fat_target_g));
  const [waterGoal, setWaterGoal] = useState(String(settings.water_goal_ml));
  const [heightCm, setHeightCm] = useState(
    settings.height_cm !== null ? String(settings.height_cm) : ''
  );
  const [startingKg, setStartingKg] = useState(
    settings.starting_weight_kg !== null ? String(settings.starting_weight_kg) : ''
  );
  const [targetKg, setTargetKg] = useState(
    settings.target_weight_kg !== null ? String(settings.target_weight_kg) : ''
  );

  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const updated = await api.updateSettings({
        daily_calorie_target: Number(calorieTarget) || 1800,
        protein_target_g: Number(proteinTarget) || 120,
        carbs_target_g: Number(carbsTarget) || 180,
        fat_target_g: Number(fatTarget) || 60,
        water_goal_ml: Number(waterGoal) || 2500,
        height_cm: heightCm.trim() ? Number(heightCm) : null,
        starting_weight_kg: startingKg.trim() ? Number(startingKg) : null,
        target_weight_kg: targetKg.trim() ? Number(targetKg) : null,
      });
      onSettingsUpdated(updated);
      setStatusMsg('Settings saved.');
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSuggestTargets = () => {
    const wt = Number(startingKg) || 70;
    const ht = Number(heightCm) || 168;
    // Gentle sustainable estimate (approx 24-26 kcal/kg minus moderate deficit, minimum 1400 kcal)
    const maintenance = Math.round(10 * wt + 6.25 * ht - 150) * 1.35;
    const suggestedCal = Math.max(1400, Math.round((maintenance - 400) / 50) * 50);
    const p = Math.round(wt * 1.6);
    const f = Math.round((suggestedCal * 0.25) / 9);
    const c = Math.max(80, Math.round((suggestedCal - p * 4 - f * 9) / 4));
    const water = Math.round((wt * 35) / 100) * 100;

    setCalorieTarget(String(suggestedCal));
    setProteinTarget(String(p));
    setFatTarget(String(f));
    setCarbsTarget(String(c));
    setWaterGoal(String(Math.max(2000, water)));
    setStatusMsg('Suggested balanced targets filled in. Click "Save Settings" to apply.');
  };

  const handleExportCsv = async () => {
    try {
      const meals = await api.getMeals();
      const header = ['Date', 'Time', 'Meal Type', 'Food Name', 'Serving Size', 'Calories', 'Protein (g)', 'Carbs (g)', 'Fat (g)', 'Oil (tsp)', 'Ingredients'];
      const escape = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
      const rows = meals.map((m) =>
        [
          m.date,
          m.time,
          m.meal_type,
          m.food_name,
          m.serving_size,
          m.calories,
          m.protein,
          m.carbs,
          m.fat,
          m.oil_tsp,
          m.ingredients,
        ]
          .map(escape)
          .join(',')
      );
      const csv = [header.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dr-weight-loss-meals-${getTodayIso()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      await api.restoreBackup(parsed);
      onDataResetOrRestored();
      setStatusMsg('Backup restored successfully.');
    } catch (err) {
      setErrorMsg((err as Error).message || 'Invalid backup JSON file.');
    }
    e.target.value = '';
  };

  const handleConfirmReset = async () => {
    if (resetConfirmText.trim().toUpperCase() !== 'RESET') return;
    setResetting(true);
    try {
      const res = await api.resetAllData();
      onSettingsUpdated(res.settings);
      setCalorieTarget(String(res.settings.daily_calorie_target));
      setProteinTarget(String(res.settings.protein_target_g));
      setCarbsTarget(String(res.settings.carbs_target_g));
      setFatTarget(String(res.settings.fat_target_g));
      setWaterGoal(String(res.settings.water_goal_ml));
      setHeightCm('');
      setStartingKg('');
      setTargetKg('');
      onDataResetOrRestored();
      setShowResetModal(false);
      setResetConfirmText('');
      setStatusMsg('All application data has been reset.');
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <p className="text-xs font-medium text-[#526056]">Personal Targets &amp; Data Management</p>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#142018] font-display mt-0.5">
          Settings
        </h1>
      </div>

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-xl border border-[#B7D7C2] bg-[#EDF6F0] px-4 py-3 text-sm text-[#1B4332]">
          <Check className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl border border-[#E5B8AD] bg-[#FDF4F2] px-4 py-3 text-sm text-[#9C3A22]">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSave} className="rounded-2xl border border-[#E2E8E2] bg-white p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#EDF2EE] pb-3">
          <h2 className="text-base font-semibold text-[#142018] font-display">
            Daily Nutrition &amp; Hydration Targets
          </h2>
          <button
            type="button"
            onClick={handleSuggestTargets}
            className="text-xs font-medium text-[#2D6A4F] hover:underline self-start sm:self-auto"
          >
            Suggest Balanced Targets
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#526056] mb-1">
              Daily Calorie Target (kcal)
            </label>
            <input
              type="number"
              min={1000}
              max={6000}
              value={calorieTarget}
              onChange={(e) => setCalorieTarget(e.target.value)}
              className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#526056] mb-1">
              Protein Target (g)
            </label>
            <input
              type="number"
              min={20}
              max={400}
              value={proteinTarget}
              onChange={(e) => setProteinTarget(e.target.value)}
              className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#526056] mb-1">
              Carbohydrates Target (g)
            </label>
            <input
              type="number"
              min={20}
              max={600}
              value={carbsTarget}
              onChange={(e) => setCarbsTarget(e.target.value)}
              className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#526056] mb-1">Fat Target (g)</label>
            <input
              type="number"
              min={15}
              max={250}
              value={fatTarget}
              onChange={(e) => setFatTarget(e.target.value)}
              className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#526056] mb-1">
              Daily Water Goal (ml)
            </label>
            <input
              type="number"
              min={500}
              max={8000}
              step={100}
              value={waterGoal}
              onChange={(e) => setWaterGoal(e.target.value)}
              className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>
        </div>

        <div className="border-t border-[#EDF2EE] pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#526056] mb-1">Height (cm)</label>
            <input
              type="number"
              step="0.5"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#526056] mb-1">
              Starting Weight (kg)
            </label>
            <input
              type="number"
              step="0.1"
              value={startingKg}
              onChange={(e) => setStartingKg(e.target.value)}
              placeholder="Optional"
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
              value={targetKg}
              onChange={(e) => setTargetKg(e.target.value)}
              placeholder="Optional"
              className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={saving}
            className="min-h-[44px] rounded-xl bg-[#1B4332] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2D6A4F] disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* Export & Backup */}
      <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#142018] font-display">
            Data Export &amp; Backup
          </h2>
          <p className="text-xs text-[#526056] mt-0.5">
            Download your personal nutrition, hydration, and weight records anytime or restore from a JSON backup.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <a
            href="/api/export"
            download={`dr-weight-loss-backup-${getTodayIso()}.json`}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#DCE5DE] bg-[#F8FAF8] px-4 py-2 text-sm font-medium text-[#142018] hover:bg-[#EDF6F0] hover:border-[#2D6A4F]"
          >
            <Download className="h-4 w-4 text-[#2D6A4F]" />
            Download Full Backup (JSON)
          </a>

          <button
            type="button"
            onClick={handleExportCsv}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#DCE5DE] bg-[#F8FAF8] px-4 py-2 text-sm font-medium text-[#142018] hover:bg-[#EDF6F0] hover:border-[#2D6A4F]"
          >
            <Download className="h-4 w-4 text-[#2D6A4F]" />
            Export Meals (CSV)
          </button>

          <label className="min-h-[44px] cursor-pointer inline-flex items-center gap-2 rounded-xl border border-[#DCE5DE] bg-white px-4 py-2 text-sm font-medium text-[#142018] hover:bg-[#F7F9F7]">
            <Upload className="h-4 w-4 text-[#526056]" />
            Restore JSON Backup
            <input type="file" accept="application/json,.json" onChange={handleRestoreFile} className="hidden" />
          </label>
        </div>
      </div>

      {/* Reset All Data */}
      <div className="rounded-2xl border border-[#EBCAC3] bg-[#FDF8F6] p-5 sm:p-6 space-y-3">
        <div className="flex items-start justify-between gap-4 flex-col sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-[#8A2E1B] font-display">
              Reset Application Data
            </h2>
            <p className="text-xs text-[#6B4B44] mt-0.5">
              Permanently deletes all logged meals, food photos, water records, weight history, and assistant conversations.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowResetModal(true)}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#D49A8E] bg-white px-4 py-2 text-sm font-medium text-[#9C3A22] hover:bg-[#FDF0EC] whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-4 w-4" />
            Reset All Data
          </button>
        </div>
      </div>

      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-[#E2E8E2] bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-2.5 text-[#9C3A22]">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <h3 className="text-lg font-semibold font-display">Confirm Data Reset</h3>
            </div>
            <p className="text-sm text-[#526056]">
              This will erase all personal meals, hydration logs, weight measurements, and chat history. Consider downloading a JSON backup first.
            </p>
            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">
                Type <span className="font-mono font-bold text-[#142018]">RESET</span> to confirm
              </label>
              <input
                type="text"
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                placeholder="RESET"
                className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-mono focus:border-[#9C3A22] focus:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  setResetConfirmText('');
                }}
                className="min-h-[44px] rounded-xl border border-[#DCE5DE] px-4 py-2 text-sm font-medium text-[#526056]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetConfirmText.trim().toUpperCase() !== 'RESET' || resetting}
                onClick={handleConfirmReset}
                className="min-h-[44px] rounded-xl bg-[#B5472D] px-4 py-2 text-sm font-medium text-white hover:bg-[#9C3A22] disabled:opacity-40"
              >
                {resetting ? 'Resetting...' : 'Permanently Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
