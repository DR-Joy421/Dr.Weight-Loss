import type {
  AnalyticsResponse,
  AssistantMessage,
  FoodAnalysisResult,
  MealEntry,
  UserSettings,
  WaterLog,
  WeightLog,
} from '../types';

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
    const errMsg =
      (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : null) || `Request failed (${res.status})`;
    throw new Error(errMsg);
  }
  return data as T;
}

export const api = {
  getSettings: () => request<UserSettings>('/api/settings'),
  updateSettings: (payload: Partial<UserSettings>) =>
    request<UserSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getMeals: (params?: { date?: string; start?: string; end?: string }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set('date', params.date);
    if (params?.start) q.set('start', params.start);
    if (params?.end) q.set('end', params.end);
    const qs = q.toString();
    return request<MealEntry[]>(`/api/meals${qs ? `?${qs}` : ''}`);
  },
  createMeal: (payload: Omit<MealEntry, 'id' | 'created_at'>) =>
    request<MealEntry>('/api/meals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateMeal: (id: number, payload: Partial<Omit<MealEntry, 'id' | 'created_at'>>) =>
    request<MealEntry>(`/api/meals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteMeal: (id: number) =>
    request<{ deleted: boolean }>(`/api/meals/${id}`, { method: 'DELETE' }),

  getWater: (params?: { date?: string; start?: string; end?: string }) => {
    const q = new URLSearchParams();
    if (params?.date) q.set('date', params.date);
    if (params?.start) q.set('start', params.start);
    if (params?.end) q.set('end', params.end);
    const qs = q.toString();
    return request<{ logs: WaterLog[]; totalMl: number }>(`/api/water${qs ? `?${qs}` : ''}`);
  },
  addWater: (date: string, amount_ml: number) =>
    request<WaterLog>('/api/water', {
      method: 'POST',
      body: JSON.stringify({ date, amount_ml }),
    }),
  deleteWater: (id: number) =>
    request<{ deleted: boolean }>(`/api/water/${id}`, { method: 'DELETE' }),

  getWeights: () => request<WeightLog[]>('/api/weight'),
  addWeight: (date: string, weight_kg: number, note?: string) =>
    request<WeightLog>('/api/weight', {
      method: 'POST',
      body: JSON.stringify({ date, weight_kg, note }),
    }),
  updateWeight: (id: number, payload: { date?: string; weight_kg?: number; note?: string | null }) =>
    request<WeightLog>(`/api/weight/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  deleteWeight: (id: number) =>
    request<{ deleted: boolean }>(`/api/weight/${id}`, { method: 'DELETE' }),

  getCalendarActivity: (month: string) =>
    request<
      Array<{
        date: string;
        calories: number;
        mealCount: number;
        water_ml: number;
        weight_kg: number | null;
      }>
    >(`/api/calendar-activity?month=${encodeURIComponent(month)}`),

  getAnalytics: (start: string, end: string) =>
    request<AnalyticsResponse>(
      `/api/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    ),

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

  getChatHistory: () => request<AssistantMessage[]>('/api/ai/chat'),
  sendChatMessage: (question: string, today: string) =>
    request<{ userMessage: AssistantMessage; assistantMessage: AssistantMessage }>(
      '/api/ai/chat',
      {
        method: 'POST',
        body: JSON.stringify({ question, today }),
      }
    ),
  clearChatHistory: () =>
    request<{ cleared: boolean }>('/api/ai/chat', { method: 'DELETE' }),

  restoreBackup: (payload: unknown) =>
    request<{ restored: boolean }>('/api/restore', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  resetAllData: () =>
    request<{ reset: boolean; settings: UserSettings }>('/api/reset', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    }),
};
