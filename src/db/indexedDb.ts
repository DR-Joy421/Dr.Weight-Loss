import type {
  AnalyticsResponse,
  AssistantMessage,
  DailyAggregate,
  MealEntry,
  UserSettings,
  WaterLog,
  WeightLog,
} from '../types';

const DB_NAME = 'drweightloss_db';
const DB_VERSION = 1;

const DEFAULT_SETTINGS: UserSettings = {
  id: 1,
  daily_calorie_target: 1800,
  protein_target_g: 120,
  carbs_target_g: 180,
  fat_target_g: 60,
  water_goal_ml: 2500,
  height_cm: null,
  starting_weight_kg: null,
  target_weight_kg: null,
  updated_at: new Date().toISOString(),
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('meals')) {
        const meals = db.createObjectStore('meals', { keyPath: 'id', autoIncrement: true });
        meals.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('water_logs')) {
        const water = db.createObjectStore('water_logs', { keyPath: 'id', autoIncrement: true });
        water.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('weight_logs')) {
        const weight = db.createObjectStore('weight_logs', { keyPath: 'id', autoIncrement: true });
        weight.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('assistant_messages')) {
        db.createObjectStore('assistant_messages', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open local IndexedDB database.'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Database transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('Database transaction aborted.'));
  });
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Database request failed.'));
  });
}

export const idbStore = {
  async getSettings(): Promise<UserSettings> {
    const db = await openDb();
    const tx = db.transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    const existing = (await reqPromise(store.get(1))) as UserSettings | undefined;
    if (!existing) {
      const seeded = { ...DEFAULT_SETTINGS, updated_at: new Date().toISOString() };
      store.put(seeded);
      await txDone(tx);
      return seeded;
    }
    await txDone(tx);
    return existing;
  },

  async updateSettings(input: Partial<UserSettings>): Promise<UserSettings> {
    const current = await this.getSettings();
    const next: UserSettings = {
      id: 1,
      daily_calorie_target:
        typeof input.daily_calorie_target === 'number' && input.daily_calorie_target > 0
          ? Math.round(input.daily_calorie_target)
          : current.daily_calorie_target,
      protein_target_g:
        typeof input.protein_target_g === 'number' && input.protein_target_g >= 0
          ? Math.round(input.protein_target_g)
          : current.protein_target_g,
      carbs_target_g:
        typeof input.carbs_target_g === 'number' && input.carbs_target_g >= 0
          ? Math.round(input.carbs_target_g)
          : current.carbs_target_g,
      fat_target_g:
        typeof input.fat_target_g === 'number' && input.fat_target_g >= 0
          ? Math.round(input.fat_target_g)
          : current.fat_target_g,
      water_goal_ml:
        typeof input.water_goal_ml === 'number' && input.water_goal_ml > 0
          ? Math.round(input.water_goal_ml)
          : current.water_goal_ml,
      height_cm:
        input.height_cm === null
          ? null
          : typeof input.height_cm === 'number' && input.height_cm > 0
            ? Number(input.height_cm.toFixed(1))
            : current.height_cm,
      starting_weight_kg:
        input.starting_weight_kg === null
          ? null
          : typeof input.starting_weight_kg === 'number' && input.starting_weight_kg > 0
            ? Number(input.starting_weight_kg.toFixed(2))
            : current.starting_weight_kg,
      target_weight_kg:
        input.target_weight_kg === null
          ? null
          : typeof input.target_weight_kg === 'number' && input.target_weight_kg > 0
            ? Number(input.target_weight_kg.toFixed(2))
            : current.target_weight_kg,
      updated_at: new Date().toISOString(),
    };
    const db = await openDb();
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put(next);
    await txDone(tx);
    return next;
  },

  async getMeals(params?: { date?: string; start?: string; end?: string }): Promise<MealEntry[]> {
    const db = await openDb();
    const tx = db.transaction('meals', 'readonly');
    const all = (await reqPromise(tx.objectStore('meals').getAll())) as MealEntry[];
    await txDone(tx);

    let filtered = all;
    if (params?.date) {
      filtered = all.filter((m) => m.date === params.date);
    } else if (params?.start && params?.end) {
      filtered = all.filter((m) => m.date >= params.start! && m.date <= params.end!);
    }

    return filtered.sort((a, b) => {
      if (a.date !== b.date) return params?.date ? a.time.localeCompare(b.time) : b.date.localeCompare(a.date);
      if (a.time !== b.time) return a.time.localeCompare(b.time);
      return a.id - b.id;
    });
  },

  async createMeal(input: Omit<MealEntry, 'id' | 'created_at'>): Promise<MealEntry> {
    const db = await openDb();
    const tx = db.transaction('meals', 'readwrite');
    const store = tx.objectStore('meals');
    const record: Omit<MealEntry, 'id'> = {
      ...input,
      calories: Math.max(0, Math.round(Number(input.calories) || 0)),
      protein: Math.max(0, Number((Number(input.protein) || 0).toFixed(1))),
      carbs: Math.max(0, Number((Number(input.carbs) || 0).toFixed(1))),
      fat: Math.max(0, Number((Number(input.fat) || 0).toFixed(1))),
      created_at: new Date().toISOString(),
    };
    const id = (await reqPromise(store.add(record))) as number;
    await txDone(tx);
    return { ...record, id };
  },

  async updateMeal(
    id: number,
    patch: Partial<Omit<MealEntry, 'id' | 'created_at'>>
  ): Promise<MealEntry> {
    const db = await openDb();
    const tx = db.transaction('meals', 'readwrite');
    const store = tx.objectStore('meals');
    const existing = (await reqPromise(store.get(id))) as MealEntry | undefined;
    if (!existing) {
      throw new Error('Meal not found');
    }
    const updated: MealEntry = {
      ...existing,
      ...patch,
      id,
      calories:
        patch.calories !== undefined
          ? Math.max(0, Math.round(Number(patch.calories) || 0))
          : existing.calories,
      protein:
        patch.protein !== undefined
          ? Math.max(0, Number((Number(patch.protein) || 0).toFixed(1)))
          : existing.protein,
      carbs:
        patch.carbs !== undefined
          ? Math.max(0, Number((Number(patch.carbs) || 0).toFixed(1)))
          : existing.carbs,
      fat:
        patch.fat !== undefined
          ? Math.max(0, Number((Number(patch.fat) || 0).toFixed(1)))
          : existing.fat,
    };
    store.put(updated);
    await txDone(tx);
    return updated;
  },

  async deleteMeal(id: number): Promise<{ deleted: boolean }> {
    const db = await openDb();
    const tx = db.transaction('meals', 'readwrite');
    tx.objectStore('meals').delete(id);
    await txDone(tx);
    return { deleted: true };
  },

  async getWater(params?: {
    date?: string;
    start?: string;
    end?: string;
  }): Promise<{ logs: WaterLog[]; totalMl: number }> {
    const db = await openDb();
    const tx = db.transaction('water_logs', 'readonly');
    const all = (await reqPromise(tx.objectStore('water_logs').getAll())) as WaterLog[];
    await txDone(tx);

    let filtered = all;
    if (params?.date) {
      filtered = all.filter((w) => w.date === params.date);
    } else if (params?.start && params?.end) {
      filtered = all.filter((w) => w.date >= params.start! && w.date <= params.end!);
    }

    const sorted = filtered.sort((a, b) => b.logged_at.localeCompare(a.logged_at) || b.id - a.id);
    const totalMl = sorted.reduce((sum, w) => sum + w.amount_ml, 0);
    return { logs: sorted, totalMl };
  },

  async addWater(date: string, amount_ml: number): Promise<WaterLog> {
    const db = await openDb();
    const tx = db.transaction('water_logs', 'readwrite');
    const record: Omit<WaterLog, 'id'> = {
      date,
      amount_ml: Math.max(10, Math.min(5000, Math.round(amount_ml))),
      logged_at: new Date().toISOString(),
    };
    const id = (await reqPromise(tx.objectStore('water_logs').add(record))) as number;
    await txDone(tx);
    return { ...record, id };
  },

  async deleteWater(id: number): Promise<{ deleted: boolean }> {
    const db = await openDb();
    const tx = db.transaction('water_logs', 'readwrite');
    tx.objectStore('water_logs').delete(id);
    await txDone(tx);
    return { deleted: true };
  },

  async getWeights(): Promise<WeightLog[]> {
    const db = await openDb();
    const tx = db.transaction('weight_logs', 'readonly');
    const all = (await reqPromise(tx.objectStore('weight_logs').getAll())) as WeightLog[];
    await txDone(tx);
    return all.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.logged_at.localeCompare(b.logged_at) ||
        a.id - b.id
    );
  },

  async addWeight(date: string, weight_kg: number, note?: string): Promise<WeightLog> {
    const cleanWeight = Number(Number(weight_kg).toFixed(2));
    const db = await openDb();
    const tx = db.transaction('weight_logs', 'readwrite');
    const record: Omit<WeightLog, 'id'> = {
      date,
      weight_kg: cleanWeight,
      note: note?.trim() || null,
      logged_at: new Date().toISOString(),
    };
    const id = (await reqPromise(tx.objectStore('weight_logs').add(record))) as number;
    await txDone(tx);

    const settings = await this.getSettings();
    if (settings.starting_weight_kg === null) {
      await this.updateSettings({ starting_weight_kg: cleanWeight });
    }
    return { ...record, id };
  },

  async updateWeight(
    id: number,
    patch: { date?: string; weight_kg?: number; note?: string | null }
  ): Promise<WeightLog> {
    const db = await openDb();
    const tx = db.transaction('weight_logs', 'readwrite');
    const store = tx.objectStore('weight_logs');
    const existing = (await reqPromise(store.get(id))) as WeightLog | undefined;
    if (!existing) throw new Error('Weight log not found');
    const updated: WeightLog = {
      ...existing,
      date: patch.date ?? existing.date,
      weight_kg:
        patch.weight_kg !== undefined
          ? Number(Number(patch.weight_kg).toFixed(2))
          : existing.weight_kg,
      note: patch.note !== undefined ? patch.note?.trim() || null : existing.note,
    };
    store.put(updated);
    await txDone(tx);
    return updated;
  },

  async deleteWeight(id: number): Promise<{ deleted: boolean }> {
    const db = await openDb();
    const tx = db.transaction('weight_logs', 'readwrite');
    tx.objectStore('weight_logs').delete(id);
    await txDone(tx);
    return { deleted: true };
  },

  async getCalendarActivity(month: string) {
    const [meals, waterRes, weights] = await Promise.all([
      this.getMeals(),
      this.getWater(),
      this.getWeights(),
    ]);
    const prefix = `${month}-`;
    const map = new Map<
      string,
      { date: string; calories: number; mealCount: number; water_ml: number; weight_kg: number | null }
    >();

    for (const m of meals) {
      if (!m.date.startsWith(prefix)) continue;
      const cur = map.get(m.date) ?? {
        date: m.date,
        calories: 0,
        mealCount: 0,
        water_ml: 0,
        weight_kg: null,
      };
      cur.calories += Math.round(m.calories);
      cur.mealCount += 1;
      map.set(m.date, cur);
    }

    for (const w of waterRes.logs) {
      if (!w.date.startsWith(prefix)) continue;
      const cur = map.get(w.date) ?? {
        date: w.date,
        calories: 0,
        mealCount: 0,
        water_ml: 0,
        weight_kg: null,
      };
      cur.water_ml += w.amount_ml;
      map.set(w.date, cur);
    }

    for (const wt of weights) {
      if (!wt.date.startsWith(prefix)) continue;
      const cur = map.get(wt.date) ?? {
        date: wt.date,
        calories: 0,
        mealCount: 0,
        water_ml: 0,
        weight_kg: null,
      };
      cur.weight_kg = wt.weight_kg;
      map.set(wt.date, cur);
    }

    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  },

  async getAnalytics(startDate: string, endDate: string): Promise<AnalyticsResponse> {
    const [allMeals, allWaterRes, weightLogs] = await Promise.all([
      this.getMeals(),
      this.getWater(),
      this.getWeights(),
    ]);

    const mealMap = new Map<
      string,
      { calories: number; protein: number; carbs: number; fat: number; mealCount: number }
    >();
    for (const m of allMeals) {
      const cur = mealMap.get(m.date) ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        mealCount: 0,
      };
      cur.calories += m.calories;
      cur.protein += m.protein;
      cur.carbs += m.carbs;
      cur.fat += m.fat;
      cur.mealCount += 1;
      mealMap.set(m.date, cur);
    }

    const waterMap = new Map<string, number>();
    for (const w of allWaterRes.logs) {
      waterMap.set(w.date, (waterMap.get(w.date) ?? 0) + w.amount_ml);
    }

    const weightMap = new Map<string, number>();
    for (const wt of weightLogs) {
      weightMap.set(wt.date, wt.weight_kg);
    }

    const daily: DailyAggregate[] = [];
    const start = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
      const iso = d.toISOString().slice(0, 10);
      const m = mealMap.get(iso);
      daily.push({
        date: iso,
        calories: m ? Math.round(m.calories) : 0,
        protein: m ? Number(m.protein.toFixed(1)) : 0,
        carbs: m ? Number(m.carbs.toFixed(1)) : 0,
        fat: m ? Number(m.fat.toFixed(1)) : 0,
        mealCount: m ? m.mealCount : 0,
        water_ml: waterMap.get(iso) ?? 0,
        weight_kg: weightMap.get(iso) ?? null,
      });
    }

    const endObj = new Date(`${endDate}T00:00:00Z`);
    const curWeekStartObj = new Date(endObj);
    curWeekStartObj.setUTCDate(curWeekStartObj.getUTCDate() - 6);
    const prevWeekEndObj = new Date(curWeekStartObj);
    prevWeekEndObj.setUTCDate(prevWeekEndObj.getUTCDate() - 1);
    const prevWeekStartObj = new Date(prevWeekEndObj);
    prevWeekStartObj.setUTCDate(prevWeekStartObj.getUTCDate() - 6);

    const summarizeWindow = (s: string, e: string) => {
      let daysLogged = 0;
      let calories = 0;
      let protein = 0;
      let carbs = 0;
      let fat = 0;
      let waterTotal = 0;
      let waterDays = 0;

      for (const [dt, m] of mealMap.entries()) {
        if (dt >= s && dt <= e) {
          daysLogged += 1;
          calories += m.calories;
          protein += m.protein;
          carbs += m.carbs;
          fat += m.fat;
        }
      }
      for (const [dt, w] of waterMap.entries()) {
        if (dt >= s && dt <= e && w > 0) {
          waterDays += 1;
          waterTotal += w;
        }
      }
      const div = daysLogged || 1;
      return {
        calories: daysLogged ? Math.round(calories / div) : 0,
        protein: daysLogged ? Number((protein / div).toFixed(1)) : 0,
        carbs: daysLogged ? Number((carbs / div).toFixed(1)) : 0,
        fat: daysLogged ? Number((fat / div).toFixed(1)) : 0,
        water_ml: waterDays ? Math.round(waterTotal / waterDays) : 0,
        daysLogged,
      };
    };

    const monthMap = new Map<
      string,
      {
        calories: number;
        protein: number;
        carbs: number;
        fat: number;
        daysLogged: number;
        waterTotal: number;
        waterDays: number;
      }
    >();

    for (const [dt, m] of mealMap.entries()) {
      const month = dt.slice(0, 7);
      const cur = monthMap.get(month) ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        daysLogged: 0,
        waterTotal: 0,
        waterDays: 0,
      };
      cur.calories += m.calories;
      cur.protein += m.protein;
      cur.carbs += m.carbs;
      cur.fat += m.fat;
      cur.daysLogged += 1;
      monthMap.set(month, cur);
    }

    for (const [dt, w] of waterMap.entries()) {
      const month = dt.slice(0, 7);
      const cur = monthMap.get(month) ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        daysLogged: 0,
        waterTotal: 0,
        waterDays: 0,
      };
      cur.waterTotal += w;
      cur.waterDays += 1;
      monthMap.set(month, cur);
    }

    const monthlyTrend = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => ({
        month,
        avgCalories: v.daysLogged ? Math.round(v.calories / v.daysLogged) : 0,
        avgProtein: v.daysLogged ? Number((v.protein / v.daysLogged).toFixed(1)) : 0,
        avgCarbs: v.daysLogged ? Number((v.carbs / v.daysLogged).toFixed(1)) : 0,
        avgFat: v.daysLogged ? Number((v.fat / v.daysLogged).toFixed(1)) : 0,
        avgWaterMl: v.waterDays ? Math.round(v.waterTotal / v.waterDays) : 0,
        daysLogged: v.daysLogged,
      }));

    return {
      daily,
      weeklyAverage: summarizeWindow(curWeekStartObj.toISOString().slice(0, 10), endDate),
      previousWeekAverage: summarizeWindow(
        prevWeekStartObj.toISOString().slice(0, 10),
        prevWeekEndObj.toISOString().slice(0, 10)
      ),
      monthlyTrend,
      weightLogs,
    };
  },

  async getChatHistory(): Promise<AssistantMessage[]> {
    const db = await openDb();
    const tx = db.transaction('assistant_messages', 'readonly');
    const all = (await reqPromise(tx.objectStore('assistant_messages').getAll())) as AssistantMessage[];
    await txDone(tx);
    return all.sort((a, b) => a.id - b.id);
  },

  async addChatMessage(role: 'user' | 'assistant', content: string): Promise<AssistantMessage> {
    const db = await openDb();
    const tx = db.transaction('assistant_messages', 'readwrite');
    const record: Omit<AssistantMessage, 'id'> = {
      role,
      content,
      created_at: new Date().toISOString(),
    };
    const id = (await reqPromise(tx.objectStore('assistant_messages').add(record))) as number;
    await txDone(tx);
    return { ...record, id };
  },

  async clearChatHistory(): Promise<{ cleared: boolean }> {
    const db = await openDb();
    const tx = db.transaction('assistant_messages', 'readwrite');
    tx.objectStore('assistant_messages').clear();
    await txDone(tx);
    return { cleared: true };
  },

  async buildNutritionContext(todayIso: string): Promise<string> {
    const [settings, todayMeals, todayWater, weightLogs] = await Promise.all([
      this.getSettings(),
      this.getMeals({ date: todayIso }),
      this.getWater({ date: todayIso }),
      this.getWeights(),
    ]);

    const endObj = new Date(`${todayIso}T00:00:00Z`);
    const startObj = new Date(endObj);
    startObj.setUTCDate(startObj.getUTCDate() - 13);
    const analytics = await this.getAnalytics(startObj.toISOString().slice(0, 10), todayIso);

    const todayTotals = todayMeals.reduce(
      (acc, m) => ({
        calories: acc.calories + m.calories,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );

    const latestWeight = weightLogs.length > 0 ? weightLogs[weightLogs.length - 1].weight_kg : null;
    const startingWeight =
      settings.starting_weight_kg ?? (weightLogs.length > 0 ? weightLogs[0].weight_kg : null);
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
- Water: ${todayWater.totalMl} ml / ${settings.water_goal_ml} ml

TODAY'S LOGGED MEALS:
${todayMealsText}

WEEK-OVER-WEEK AVERAGES (Logged Days Only):
- Current 7 days (${analytics.weeklyAverage.daysLogged} days logged): Avg ${analytics.weeklyAverage.calories} kcal/day, Protein ${analytics.weeklyAverage.protein}g, Carbs ${analytics.weeklyAverage.carbs}g, Fat ${analytics.weeklyAverage.fat}g, Water ${analytics.weeklyAverage.water_ml} ml/day
- Previous 7 days (${analytics.previousWeekAverage.daysLogged} days logged): Avg ${analytics.previousWeekAverage.calories} kcal/day, Protein ${analytics.previousWeekAverage.protein}g, Carbs ${analytics.previousWeekAverage.carbs}g, Fat ${analytics.previousWeekAverage.fat}g, Water ${analytics.previousWeekAverage.water_ml} ml/day

PAST 14 DAYS DAILY LOG:
${recentDaysText}

RECENT WEIGHT LOGS:
${recentWeightsText}`;
  },

  async exportAllData() {
    const [settings, meals, waterRes, weightLogs] = await Promise.all([
      this.getSettings(),
      this.getMeals(),
      this.getWater(),
      this.getWeights(),
    ]);
    return {
      app: 'Dr.weight Loss',
      exportedAt: new Date().toISOString(),
      settings,
      meals,
      water_logs: waterRes.logs,
      weight_logs: weightLogs,
    };
  },

  async restoreBackup(payload: {
    settings?: Partial<UserSettings>;
    meals?: Array<Omit<MealEntry, 'id' | 'created_at'>>;
    water_logs?: Array<{ date: string; amount_ml: number; logged_at?: string }>;
    weight_logs?: Array<{ date: string; weight_kg: number; note?: string | null; logged_at?: string }>;
  }): Promise<{ restored: boolean }> {
    await this.resetAllData();
    if (payload.settings) {
      await this.updateSettings(payload.settings);
    }
    const db = await openDb();
    const tx = db.transaction(['meals', 'water_logs', 'weight_logs'], 'readwrite');
    if (Array.isArray(payload.meals)) {
      const mealStore = tx.objectStore('meals');
      for (const m of payload.meals) {
        mealStore.add({
          date: m.date,
          time: m.time || '12:00',
          meal_type: m.meal_type || 'Lunch',
          food_name: m.food_name || 'Meal',
          ingredients: m.ingredients || '',
          items: Array.isArray(m.items) ? m.items : [],
          serving_size: m.serving_size || '1 serving',
          quantity: Number(m.quantity) || 1,
          oil_tsp: Number(m.oil_tsp) || 0,
          calories: Number(m.calories) || 0,
          protein: Number(m.protein) || 0,
          carbs: Number(m.carbs) || 0,
          fat: Number(m.fat) || 0,
          image_data: m.image_data ?? null,
          notes: m.notes ?? null,
          created_at: new Date().toISOString(),
        });
      }
    }
    if (Array.isArray(payload.water_logs)) {
      const waterStore = tx.objectStore('water_logs');
      for (const w of payload.water_logs) {
        waterStore.add({
          date: w.date,
          amount_ml: Math.round(Number(w.amount_ml) || 250),
          logged_at: w.logged_at || new Date().toISOString(),
        });
      }
    }
    if (Array.isArray(payload.weight_logs)) {
      const weightStore = tx.objectStore('weight_logs');
      for (const wt of payload.weight_logs) {
        weightStore.add({
          date: wt.date,
          weight_kg: Number(wt.weight_kg),
          note: wt.note ?? null,
          logged_at: wt.logged_at || new Date().toISOString(),
        });
      }
    }
    await txDone(tx);
    return { restored: true };
  },

  async resetAllData(): Promise<{ reset: boolean; settings: UserSettings }> {
    const db = await openDb();
    const tx = db.transaction(
      ['settings', 'meals', 'water_logs', 'weight_logs', 'assistant_messages'],
      'readwrite'
    );
    tx.objectStore('meals').clear();
    tx.objectStore('water_logs').clear();
    tx.objectStore('weight_logs').clear();
    tx.objectStore('assistant_messages').clear();
    const fresh: UserSettings = { ...DEFAULT_SETTINGS, updated_at: new Date().toISOString() };
    tx.objectStore('settings').put(fresh);
    await txDone(tx);
    return { reset: true, settings: fresh };
  },
};
