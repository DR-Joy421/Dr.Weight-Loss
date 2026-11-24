import type {
  AnalyticsResponse,
  AssistantMessage,
  FoodAnalysisResult,
  MealEntry,
  UserSettings,
  WaterLog,
  WeightLog,
} from '../types';
import { idbStore } from '../db/indexedDb';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const jsonErr =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null;
    if (jsonErr) {
      throw new Error(jsonErr);
    }
    if (res.status === 404) {
      throw new Error(
        'API route not found (404). Make sure /api functions or the Express server are deployed and running.'
      );
    }
    throw new Error(`Request failed (${res.status})`);
  }
  return data as T;
}

type BackendMode = 'express-sqlite' | 'vercel-serverless';
let modePromise: Promise<BackendMode> | null = null;

async function getBackendMode(): Promise<BackendMode> {
  if (!modePromise) {
    modePromise = fetch('/api/health')
      .then(async (r) => {
        if (!r.ok) return 'vercel-serverless' as BackendMode;
        const json = (await r.json()) as { mode?: string };
        return json?.mode === 'express-sqlite'
          ? ('express-sqlite' as BackendMode)
          : ('vercel-serverless' as BackendMode);
      })
      .catch(() => 'vercel-serverless' as BackendMode);
  }
  return modePromise;
}

export const api = {
  getSettings: async () => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.getSettings();
    return request<UserSettings>('/api/settings');
  },
  updateSettings: async (payload: Partial<UserSettings>) => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.updateSettings(payload);
    return request<UserSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  getMeals: async (params?: { date?: string; start?: string; end?: string }) => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.getMeals(params);
    const q = new URLSearchParams();
    if (params?.date) q.set('date', params.date);
    if (params?.start) q.set('start', params.start);
    if (params?.end) q.set('end', params.end);
    const qs = q.toString();
    return request<MealEntry[]>(`/api/meals${qs ? `?${qs}` : ''}`);
  },
  createMeal: async (payload: Omit<MealEntry, 'id' | 'created_at'>) => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.createMeal(payload);
    return request<MealEntry>('/api/meals', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateMeal: async (id: number, payload: Partial<Omit<MealEntry, 'id' | 'created_at'>>) => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.updateMeal(id, payload);
    return request<MealEntry>(`/api/meals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  deleteMeal: async (id: number) => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.deleteMeal(id);
    return request<{ deleted: boolean }>(`/api/meals/${id}`, { method: 'DELETE' });
  },

  getWater: async (params?: { date?: string; start?: string; end?: string }) => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.getWater(params);
    const q = new URLSearchParams();
    if (params?.date) q.set('date', params.date);
    if (params?.start) q.set('start', params.start);
    if (params?.end) q.set('end', params.end);
    const qs = q.toString();
    return request<{ logs: WaterLog[]; totalMl: number }>(`/api/water${qs ? `?${qs}` : ''}`);
  },
  addWater: async (date: string, amount_ml: number) => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.addWater(date, amount_ml);
    return request<WaterLog>('/api/water', {
      method: 'POST',
      body: JSON.stringify({ date, amount_ml }),
    });
  },
  deleteWater: async (id: number) => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.deleteWater(id);
    return request<{ deleted: boolean }>(`/api/water/${id}`, { method: 'DELETE' });
  },

  getWeights: async () => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.getWeights();
    return request<WeightLog[]>('/api/weight');
  },
  addWeight: async (date: string, weight_kg: number, note?: string) => {
    if ((await getBackendMode()) === 'vercel-serverless') {
      return idbStore.addWeight(date, weight_kg, note);
    }
    return request<WeightLog>('/api/weight', {
      method: 'POST',
      body: JSON.stringify({ date, weight_kg, note }),
    });
  },
  updateWeight: async (
    id: number,
    payload: { date?: string; weight_kg?: number; note?: string | null }
  ) => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.updateWeight(id, payload);
    return request<WeightLog>(`/api/weight/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  deleteWeight: async (id: number) => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.deleteWeight(id);
    return request<{ deleted: boolean }>(`/api/weight/${id}`, { method: 'DELETE' });
  },

  getCalendarActivity: async (month: string) => {
    if ((await getBackendMode()) === 'vercel-serverless') {
      return idbStore.getCalendarActivity(month);
    }
    return request<
      Array<{
        date: string;
        calories: number;
        mealCount: number;
        water_ml: number;
        weight_kg: number | null;
      }>
    >(`/api/calendar-activity?month=${encodeURIComponent(month)}`);
  },

  getAnalytics: async (start: string, end: string) => {
    if ((await getBackendMode()) === 'vercel-serverless') {
      return idbStore.getAnalytics(start, end);
    }
    return request<AnalyticsResponse>(
      `/api/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    );
  },

  scanFood: (payload: {
    imageBase64: string;
    mimeType: string;
    extraContext?: string;
    isHomemade?: boolean;
  }) =>
    request<FoodAnalysisResult>('/api/ai/scan-food', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getChatHistory: async () => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.getChatHistory();
    return request<AssistantMessage[]>('/api/ai/chat');
  },

  sendChatMessage: async (question: string, today: string) => {
    const mode = await getBackendMode();
    if (mode === 'express-sqlite') {
      return request<{ userMessage: AssistantMessage; assistantMessage: AssistantMessage }>(
        '/api/ai/chat',
        {
          method: 'POST',
          body: JSON.stringify({ question, today }),
        }
      );
    }

    const [history, nutritionContext] = await Promise.all([
      idbStore.getChatHistory(),
      idbStore.buildNutritionContext(today),
    ]);

    const { reply } = await request<{ reply: string }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        question,
        today,
        nutritionContext,
        history: history.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    const userMessage = await idbStore.addChatMessage('user', question);
    const assistantMessage = await idbStore.addChatMessage('assistant', reply);
    return { userMessage, assistantMessage };
  },

  clearChatHistory: async () => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.clearChatHistory();
    return request<{ cleared: boolean }>('/api/ai/chat', { method: 'DELETE' });
  },

  exportBackup: async () => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.exportAllData();
    return request<unknown>('/api/export');
  },

  restoreBackup: async (payload: unknown) => {
    if ((await getBackendMode()) === 'vercel-serverless') {
      return idbStore.restoreBackup(
        payload as Parameters<typeof idbStore.restoreBackup>[0]
      );
    }
    return request<{ restored: boolean }>('/api/restore', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  resetAllData: async () => {
    if ((await getBackendMode()) === 'vercel-serverless') return idbStore.resetAllData();
    return request<{ reset: boolean; settings: UserSettings }>('/api/reset', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  },
};
