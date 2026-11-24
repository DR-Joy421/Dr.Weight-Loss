import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Camera,
  LayoutDashboard,
  MessageSquareHeart,
  MoreHorizontal,
  Scale,
  Settings,
  X,
} from 'lucide-react';
import { api } from './api/client';
import type {
  AppSection,
  MealEntry,
  MealType,
  UserSettings,
  WaterLog,
  WeightLog,
} from './types';
import { getTodayIso } from './utils/date';
import { DashboardView } from './components/DashboardView';
import { FoodScannerView } from './components/FoodScannerView';
import { MealHistoryView } from './components/MealHistoryView';
import { WeightTrackerView } from './components/WeightTrackerView';
import { AnalyticsView } from './components/AnalyticsView';
import { AssistantView } from './components/AssistantView';
import { SettingsView } from './components/SettingsView';
import { MealEditorModal } from './components/MealEditorModal';

interface NavItem {
  id: AppSection;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { id: 'scanner', label: 'Food Scanner', shortLabel: 'Scan', icon: Camera },
  { id: 'history', label: 'Meal History', shortLabel: 'History', icon: CalendarDays },
  { id: 'weight', label: 'Weight Tracker', shortLabel: 'Weight', icon: Scale },
  { id: 'analytics', label: 'Analytics', shortLabel: 'Analytics', icon: BarChart3 },
  { id: 'assistant', label: 'AI Nutrition Assistant', shortLabel: 'Coach', icon: MessageSquareHeart },
  { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
];

export default function App() {
  const [section, setSection] = useState<AppSection>('dashboard');
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const [settings, setSettings] = useState<UserSettings>({
    id: 1,
    daily_calorie_target: 1800,
    protein_target_g: 120,
    carbs_target_g: 180,
    fat_target_g: 60,
    water_goal_ml: 2500,
    height_cm: null,
    starting_weight_kg: null,
    target_weight_kg: null,
    updated_at: '',
  });
  const [todayMeals, setTodayMeals] = useState<MealEntry[]>([]);
  const [todayWaterLogs, setTodayWaterLogs] = useState<WaterLog[]>([]);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Modal state for creating/editing meals
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<MealEntry | null>(null);
  const [editorDefaultDate, setEditorDefaultDate] = useState<string>(getTodayIso());
  const [editorDefaultType, setEditorDefaultType] = useState<MealType>('Lunch');

  const fetchCoreData = useCallback(async () => {
    const today = getTodayIso();
    try {
      const [s, meals, water, w] = await Promise.all([
        api.getSettings(),
        api.getMeals({ date: today }),
        api.getWater({ date: today }),
        api.getWeights(),
      ]);
      setSettings(s);
      setTodayMeals(meals);
      setTodayWaterLogs(water.logs);
      setWeights(w);
      setLoadError(null);
    } catch (err) {
      setLoadError((err as Error).message || 'Failed to load nutrition data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoreData();
  }, [fetchCoreData, refreshSignal]);

  const triggerRefresh = () => {
    setRefreshSignal((n) => n + 1);
  };

  const handleNavigate = (next: AppSection) => {
    setSection(next);
    setMobileMoreOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddWaterToday = async (amountMl: number) => {
    await api.addWater(getTodayIso(), amountMl);
    triggerRefresh();
  };

  const handleDeleteWater = async (id: number) => {
    await api.deleteWater(id);
    triggerRefresh();
  };

  const handleOpenManualMeal = (mealType: MealType, date?: string) => {
    setEditingMeal(null);
    setEditorDefaultType(mealType);
    setEditorDefaultDate(date ?? getTodayIso());
    setEditorOpen(true);
  };

  const handleEditMeal = (meal: MealEntry) => {
    setEditingMeal(meal);
    setEditorDefaultDate(meal.date);
    setEditorDefaultType(meal.meal_type);
    setEditorOpen(true);
  };

  const handleSaveMealFromModal = async (
    payload: Omit<MealEntry, 'id' | 'created_at'>,
    existingId?: number
  ) => {
    if (existingId) {
      await api.updateMeal(existingId, payload);
    } else {
      await api.createMeal(payload);
    }
    triggerRefresh();
  };

  const handleDeleteMeal = async (id: number) => {
    await api.deleteMeal(id);
    triggerRefresh();
  };

  const todayCalories = Math.round(todayMeals.reduce((s, m) => s + m.calories, 0));

  return (
    <div className="min-h-screen bg-[#F7F9F7] text-[#142018] flex flex-col lg:flex-row">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 border-r border-[#E2E8E2] bg-white">
        <div className="px-6 py-5 border-b border-[#EDF2EE]">
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              handleNavigate('dashboard');
            }}
            className="text-xl font-bold tracking-tight text-[#1B4332] font-display whitespace-nowrap"
          >
            Dr.weight Loss
          </a>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Primary">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNavigate(item.id)}
                className={`w-full min-h-[44px] flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#E8F0EB] text-[#1B4332] font-semibold'
                    : 'text-[#526056] hover:bg-[#F4F7F4] hover:text-[#142018]'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-[#1B4332]' : 'text-[#647368]'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-[#EDF2EE]">
          <div className="rounded-xl bg-[#F7F9F7] border border-[#E8EEE9] p-3.5 space-y-1">
            <p className="text-[11px] font-medium text-[#526056]">Today&apos;s Intake</p>
            <p className="text-base font-bold text-[#142018] font-mono tabular-nums">
              {todayCalories.toLocaleString()} / {settings.daily_calorie_target.toLocaleString()} kcal
            </p>
          </div>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="lg:hidden sticky top-0 z-30 h-14 bg-white/95 backdrop-blur-md border-b border-[#E2E8E2] px-4 flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => handleNavigate('dashboard')}
          className="text-lg font-bold tracking-tight text-[#1B4332] font-display whitespace-nowrap shrink-0"
        >
          Dr.weight Loss
        </button>

        <button
          type="button"
          onClick={() => handleNavigate('scanner')}
          className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[#1B4332] px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap shrink-0"
        >
          <Camera className="h-3.5 w-3.5" />
          Scan Meal
        </button>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 lg:pl-64 pb-24 lg:pb-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-6">
          {loadError && (
            <div className="mb-5 rounded-xl border border-[#E5B8AD] bg-[#FDF4F2] px-4 py-3 text-sm text-[#9C3A22]">
              {loadError}
            </div>
          )}

          {section === 'dashboard' && (
            <DashboardView
              settings={settings}
              todayMeals={todayMeals}
              todayWaterLogs={todayWaterLogs}
              weights={weights}
              loading={loading}
              onNavigate={handleNavigate}
              onAddWater={handleAddWaterToday}
              onDeleteWater={handleDeleteWater}
              onOpenManualMeal={(slot) => handleOpenManualMeal(slot, getTodayIso())}
              onEditMeal={handleEditMeal}
              onDeleteMeal={handleDeleteMeal}
            />
          )}

          {section === 'scanner' && (
            <FoodScannerView
              onMealSaved={() => {
                triggerRefresh();
              }}
              onOpenManualMeal={() => handleOpenManualMeal('Lunch', getTodayIso())}
            />
          )}

          {section === 'history' && (
            <MealHistoryView
              settings={settings}
              weights={weights}
              refreshSignal={refreshSignal}
              onOpenManualMeal={handleOpenManualMeal}
              onEditMeal={handleEditMeal}
              onDeleteMeal={handleDeleteMeal}
              onWaterChanged={triggerRefresh}
            />
          )}

          {section === 'weight' && (
            <WeightTrackerView
              settings={settings}
              weights={weights}
              onSettingsUpdated={(s) => setSettings(s)}
              onWeightsChanged={triggerRefresh}
            />
          )}

          {section === 'analytics' && (
            <AnalyticsView settings={settings} refreshSignal={refreshSignal} />
          )}

          {section === 'assistant' && <AssistantView />}

          {section === 'settings' && (
            <SettingsView
              settings={settings}
              onSettingsUpdated={(s) => setSettings(s)}
              onDataResetOrRestored={triggerRefresh}
            />
          )}
        </div>
      </main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E2E8E2] pb-safe"
      >
        <div className="grid grid-cols-5 items-center h-16">
          {[
            { id: 'dashboard' as AppSection, label: 'Home', icon: LayoutDashboard },
            { id: 'history' as AppSection, label: 'History', icon: CalendarDays },
            { id: 'scanner' as AppSection, label: 'Scan', icon: Camera },
            { id: 'assistant' as AppSection, label: 'Coach', icon: MessageSquareHeart },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = section === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleNavigate(tab.id)}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active ? 'text-[#1B4332]' : 'text-[#647368]'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setMobileMoreOpen(true)}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors ${
              section === 'weight' || section === 'analytics' || section === 'settings'
                ? 'text-[#1B4332]'
                : 'text-[#647368]'
            }`}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-[10px] font-medium tracking-tight">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile More Bottom Sheet */}
      {mobileMoreOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex items-end bg-black/45 backdrop-blur-xs"
          onClick={() => setMobileMoreOpen(false)}
        >
          <div
            className="w-full rounded-t-3xl bg-white p-5 pb-8 space-y-3 border-t border-[#E2E8E2]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-[#D4DDD6] rounded-full mx-auto mb-2" />
            <div className="flex items-center justify-between pb-2 border-b border-[#EDF2EE]">
              <span className="text-sm font-semibold text-[#142018] font-display">More Sections</span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#526056]"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {[
              { id: 'weight' as AppSection, label: 'Weight Tracker', icon: Scale },
              { id: 'analytics' as AppSection, label: 'Analytics & Reports', icon: BarChart3 },
              { id: 'settings' as AppSection, label: 'Settings & Backup', icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full min-h-[48px] flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
                    active
                      ? 'bg-[#E8F0EB] text-[#1B4332] font-semibold'
                      : 'text-[#142018] hover:bg-[#F7F9F7]'
                  }`}
                >
                  <Icon className="h-5 w-5 text-[#2D6A4F]" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Meal Create / Edit Modal */}
      {editorOpen && (
        <MealEditorModal
          initialMeal={editingMeal}
          defaultDate={editorDefaultDate}
          defaultMealType={editorDefaultType}
          onClose={() => {
            setEditorOpen(false);
            setEditingMeal(null);
          }}
          onSave={handleSaveMealFromModal}
        />
      )}
    </div>
  );
}
