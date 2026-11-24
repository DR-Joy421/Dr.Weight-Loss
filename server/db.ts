import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AssistantMessage,
  DailyAggregate,
  MealEntry,
  MealItemBreakdown,
  MealType,
  UserSettings,
  WaterLog,
  WeightLog,
} from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'drweightloss.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    daily_calorie_target INTEGER NOT NULL DEFAULT 1800,
    protein_target_g INTEGER NOT NULL DEFAULT 120,
    carbs_target_g INTEGER NOT NULL DEFAULT 180,
    fat_target_g INTEGER NOT NULL DEFAULT 60,
    water_goal_ml INTEGER NOT NULL DEFAULT 2500,
    height_cm REAL,
    starting_weight_kg REAL,
    target_weight_kg REAL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS meals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    meal_type TEXT NOT NULL CHECK (meal_type IN ('Breakfast', 'Lunch', 'Evening Snacks', 'Dinner')),
    food_name TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    items_json TEXT NOT NULL DEFAULT '[]',
    serving_size TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    oil_tsp REAL NOT NULL DEFAULT 0,
    calories REAL NOT NULL,
    protein REAL NOT NULL,
    carbs REAL NOT NULL,
    fat REAL NOT NULL,
    image_data TEXT,
    notes TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(date);

  CREATE TABLE IF NOT EXISTS water_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    amount_ml INTEGER NOT NULL,
    logged_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_water_date ON water_logs(date);

  CREATE TABLE IF NOT EXISTS weight_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    weight_kg REAL NOT NULL,
    note TEXT,
    logged_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_weight_date ON weight_logs(date);

  CREATE TABLE IF NOT EXISTS assistant_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

function ensureSettingsRow(): void {
  const existing = db.prepare('SELECT id FROM settings WHERE id = 1').get();
  if (!existing) {
    db.prepare(
      `INSERT INTO settings (
        id, daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g,
        water_goal_ml, height_cm, starting_weight_kg, target_weight_kg, updated_at
      ) VALUES (1, 1800, 120, 180, 60, 2500, NULL, NULL, NULL, ?)`
    ).run(new Date().toISOString());
  }
}

ensureSettingsRow();

export function getSettings(): UserSettings {
  ensureSettingsRow();
  return db.prepare('SELECT * FROM settings WHERE id = 1').get() as UserSettings;
}

export function updateSettings(input: Partial<UserSettings>): UserSettings {
  const current = getSettings();
  const next = {
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

  db.prepare(
    `UPDATE settings SET
      daily_calorie_target = ?,
      protein_target_g = ?,
      carbs_target_g = ?,
      fat_target_g = ?,
      water_goal_ml = ?,
      height_cm = ?,
      starting_weight_kg = ?,
      target_weight_kg = ?,
      updated_at = ?
    WHERE id = 1`
  ).run(
    next.daily_calorie_target,
    next.protein_target_g,
    next.carbs_target_g,
    next.fat_target_g,
    next.water_goal_ml,
    next.height_cm,
    next.starting_weight_kg,
    next.target_weight_kg,
    next.updated_at
  );

  return getSettings();
}

interface RawMealRow {
  id: number;
  date: string;
  time: string;
  meal_type: MealType;
  food_name: string;
  ingredients: string;
  items_json: string;
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

function mapMealRow(row: RawMealRow): MealEntry {
  let items: MealItemBreakdown[] = [];
  try {
    const parsed = JSON.parse(row.items_json);
    if (Array.isArray(parsed)) {
      items = parsed;
    }
  } catch {
    items = [];
  }
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    meal_type: row.meal_type,
    food_name: row.food_name,
    ingredients: row.ingredients,
    items,
    serving_size: row.serving_size,
    quantity: row.quantity,
    oil_tsp: row.oil_tsp,
    calories: row.calories,
    protein: row.protein,
    carbs: row.carbs,
    fat: row.fat,
    image_data: row.image_data,
    notes: row.notes,
    created_at: row.created_at,
  };
}

export function getMeals(params?: { date?: string; start?: string; end?: string }): MealEntry[] {
  let rows: RawMealRow[];
  if (params?.date) {
    rows = db
      .prepare('SELECT * FROM meals WHERE date = ? ORDER BY time ASC, id ASC')
      .all(params.date) as RawMealRow[];
  } else if (params?.start && params?.end) {
    rows = db
      .prepare('SELECT * FROM meals WHERE date >= ? AND date <= ? ORDER BY date DESC, time ASC, id ASC')
      .all(params.start, params.end) as RawMealRow[];
  } else {
    rows = db
      .prepare('SELECT * FROM meals ORDER BY date DESC, time ASC, id ASC')
      .all() as RawMealRow[];
  }
  return rows.map(mapMealRow);
}

export function getMealById(id: number): MealEntry | null {
  const row = db.prepare('SELECT * FROM meals WHERE id = ?').get(id) as RawMealRow | undefined;
  return row ? mapMealRow(row) : null;
}

export function createMeal(input: {
  date: string;
  time: string;
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
  image_data?: string | null;
  notes?: string | null;
}): MealEntry {
  const result = db
    .prepare(
      `INSERT INTO meals (
        date, time, meal_type, food_name, ingredients, items_json, serving_size,
        quantity, oil_tsp, calories, protein, carbs, fat, image_data, notes, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.date,
      input.time,
      input.meal_type,
      input.food_name.trim(),
      input.ingredients.trim(),
      JSON.stringify(input.items ?? []),
      input.serving_size.trim(),
      Number(input.quantity) || 1,
      Number(input.oil_tsp) || 0,
      Math.max(0, Math.round(Number(input.calories) || 0)),
      Math.max(0, Number((Number(input.protein) || 0).toFixed(1))),
      Math.max(0, Number((Number(input.carbs) || 0).toFixed(1))),
      Math.max(0, Number((Number(input.fat) || 0).toFixed(1))),
      input.image_data ?? null,
      input.notes ?? null,
      new Date().toISOString()
    );

  return getMealById(Number(result.lastInsertRowid))!;
}

export function updateMeal(
  id: number,
  input: Partial<{
    date: string;
    time: string;
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
  }>
): MealEntry | null {
  const existing = getMealById(id);
  if (!existing) return null;

  db.prepare(
    `UPDATE meals SET
      date = ?,
      time = ?,
      meal_type = ?,
      food_name = ?,
      ingredients = ?,
      items_json = ?,
      serving_size = ?,
      quantity = ?,
      oil_tsp = ?,
      calories = ?,
      protein = ?,
      carbs = ?,
      fat = ?,
      image_data = ?,
      notes = ?
    WHERE id = ?`
  ).run(
    input.date ?? existing.date,
    input.time ?? existing.time,
    input.meal_type ?? existing.meal_type,
    (input.food_name ?? existing.food_name).trim(),
    (input.ingredients ?? existing.ingredients).trim(),
    JSON.stringify(input.items ?? existing.items),
    (input.serving_size ?? existing.serving_size).trim(),
    input.quantity !== undefined ? Number(input.quantity) || 1 : existing.quantity,
    input.oil_tsp !== undefined ? Number(input.oil_tsp) || 0 : existing.oil_tsp,
    input.calories !== undefined
      ? Math.max(0, Math.round(Number(input.calories) || 0))
      : existing.calories,
    input.protein !== undefined
      ? Math.max(0, Number((Number(input.protein) || 0).toFixed(1)))
      : existing.protein,
    input.carbs !== undefined
      ? Math.max(0, Number((Number(input.carbs) || 0).toFixed(1)))
      : existing.carbs,
    input.fat !== undefined
      ? Math.max(0, Number((Number(input.fat) || 0).toFixed(1)))
      : existing.fat,
    input.image_data !== undefined ? input.image_data : existing.image_data,
    input.notes !== undefined ? input.notes : existing.notes,
    id
  );

  return getMealById(id);
}

export function deleteMeal(id: number): boolean {
  const res = db.prepare('DELETE FROM meals WHERE id = ?').run(id);
  return res.changes > 0;
}

export function getWaterLogs(params?: { date?: string; start?: string; end?: string }): WaterLog[] {
  if (params?.date) {
    return db
      .prepare('SELECT * FROM water_logs WHERE date = ? ORDER BY logged_at DESC, id DESC')
      .all(params.date) as WaterLog[];
  }
  if (params?.start && params?.end) {
    return db
      .prepare('SELECT * FROM water_logs WHERE date >= ? AND date <= ? ORDER BY date DESC, logged_at DESC')
      .all(params.start, params.end) as WaterLog[];
  }
  return db
    .prepare('SELECT * FROM water_logs ORDER BY date DESC, logged_at DESC')
    .all() as WaterLog[];
}

export function addWaterLog(date: string, amount_ml: number): WaterLog {
  const cleanAmount = Math.max(10, Math.min(5000, Math.round(amount_ml)));
  const now = new Date().toISOString();
  const res = db
    .prepare('INSERT INTO water_logs (date, amount_ml, logged_at) VALUES (?, ?, ?)')
    .run(date, cleanAmount, now);
  return db.prepare('SELECT * FROM water_logs WHERE id = ?').get(Number(res.lastInsertRowid)) as WaterLog;
}

export function deleteWaterLog(id: number): boolean {
  const res = db.prepare('DELETE FROM water_logs WHERE id = ?').run(id);
  return res.changes > 0;
}

export function getWeightLogs(): WeightLog[] {
  return db
    .prepare('SELECT * FROM weight_logs ORDER BY date ASC, logged_at ASC, id ASC')
    .all() as WeightLog[];
}

export function addWeightLog(date: string, weight_kg: number, note?: string | null): WeightLog {
  const cleanWeight = Number(Number(weight_kg).toFixed(2));
  const now = new Date().toISOString();
  const res = db
    .prepare('INSERT INTO weight_logs (date, weight_kg, note, logged_at) VALUES (?, ?, ?, ?)')
    .run(date, cleanWeight, note?.trim() || null, now);

  // If user has no starting_weight_kg set yet, set it automatically from first weight entry
  const settings = getSettings();
  if (settings.starting_weight_kg === null) {
    updateSettings({ starting_weight_kg: cleanWeight });
  }

  return db.prepare('SELECT * FROM weight_logs WHERE id = ?').get(Number(res.lastInsertRowid)) as WeightLog;
}

export function updateWeightLog(
  id: number,
  input: { date?: string; weight_kg?: number; note?: string | null }
): WeightLog | null {
  const existing = db.prepare('SELECT * FROM weight_logs WHERE id = ?').get(id) as WeightLog | undefined;
  if (!existing) return null;

  db.prepare('UPDATE weight_logs SET date = ?, weight_kg = ?, note = ? WHERE id = ?').run(
    input.date ?? existing.date,
    input.weight_kg !== undefined ? Number(Number(input.weight_kg).toFixed(2)) : existing.weight_kg,
    input.note !== undefined ? input.note?.trim() || null : existing.note,
    id
  );

  return db.prepare('SELECT * FROM weight_logs WHERE id = ?').get(id) as WeightLog;
}

export function deleteWeightLog(id: number): boolean {
  const res = db.prepare('DELETE FROM weight_logs WHERE id = ?').run(id);
  return res.changes > 0;
}

export function getAssistantMessages(): AssistantMessage[] {
  return db
    .prepare('SELECT * FROM assistant_messages ORDER BY id ASC')
    .all() as AssistantMessage[];
}

export function addAssistantMessage(role: 'user' | 'assistant', content: string): AssistantMessage {
  const now = new Date().toISOString();
  const res = db
    .prepare('INSERT INTO assistant_messages (role, content, created_at) VALUES (?, ?, ?)')
    .run(role, content, now);
  return db
    .prepare('SELECT * FROM assistant_messages WHERE id = ?')
    .get(Number(res.lastInsertRowid)) as AssistantMessage;
}

export function clearAssistantMessages(): void {
  db.prepare('DELETE FROM assistant_messages').run();
}

export function getMonthActivityDates(yearMonth: string): {
  date: string;
  calories: number;
  mealCount: number;
  water_ml: number;
  weight_kg: number | null;
}[] {
  const likePattern = `${yearMonth}-%`;
  const mealRows = db
    .prepare(
      `SELECT date, SUM(calories) as calories, COUNT(*) as mealCount
       FROM meals WHERE date LIKE ? GROUP BY date`
    )
    .all(likePattern) as { date: string; calories: number; mealCount: number }[];

  const waterRows = db
    .prepare(
      `SELECT date, SUM(amount_ml) as water_ml
       FROM water_logs WHERE date LIKE ? GROUP BY date`
    )
    .all(likePattern) as { date: string; water_ml: number }[];

  const weightRows = db
    .prepare(
      `SELECT date, weight_kg FROM weight_logs WHERE date LIKE ? ORDER BY logged_at DESC`
    )
    .all(likePattern) as { date: string; weight_kg: number }[];

  const map = new Map<
    string,
    { date: string; calories: number; mealCount: number; water_ml: number; weight_kg: number | null }
  >();

  for (const m of mealRows) {
    map.set(m.date, {
      date: m.date,
      calories: Math.round(m.calories),
      mealCount: m.mealCount,
      water_ml: 0,
      weight_kg: null,
    });
  }
  for (const w of waterRows) {
    const existing = map.get(w.date) ?? {
      date: w.date,
      calories: 0,
      mealCount: 0,
      water_ml: 0,
      weight_kg: null,
    };
    existing.water_ml = w.water_ml;
    map.set(w.date, existing);
  }
  for (const wt of weightRows) {
    const existing = map.get(wt.date) ?? {
      date: wt.date,
      calories: 0,
      mealCount: 0,
      water_ml: 0,
      weight_kg: null,
    };
    if (existing.weight_kg === null) {
      existing.weight_kg = wt.weight_kg;
    }
    map.set(wt.date, existing);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

export function getAnalyticsData(startDate: string, endDate: string) {
  const mealAggs = db
    .prepare(
      `SELECT date,
              ROUND(SUM(calories), 0) as calories,
              ROUND(SUM(protein), 1) as protein,
              ROUND(SUM(carbs), 1) as carbs,
              ROUND(SUM(fat), 1) as fat,
              COUNT(*) as mealCount
       FROM meals
       WHERE date >= ? AND date <= ?
       GROUP BY date
       ORDER BY date ASC`
    )
    .all(startDate, endDate) as {
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    mealCount: number;
  }[];

  const waterAggs = db
    .prepare(
      `SELECT date, SUM(amount_ml) as water_ml
       FROM water_logs
       WHERE date >= ? AND date <= ?
       GROUP BY date
       ORDER BY date ASC`
    )
    .all(startDate, endDate) as { date: string; water_ml: number }[];

  const weightRows = db
    .prepare(
      `SELECT date, weight_kg FROM weight_logs WHERE date >= ? AND date <= ? ORDER BY logged_at DESC`
    )
    .all(startDate, endDate) as { date: string; weight_kg: number }[];

  const mealMap = new Map(mealAggs.map((m) => [m.date, m]));
  const waterMap = new Map(waterAggs.map((w) => [w.date, w.water_ml]));
  const weightMap = new Map<string, number>();
  for (const row of weightRows) {
    if (!weightMap.has(row.date)) {
      weightMap.set(row.date, row.weight_kg);
    }
  }

  // Generate continuous daily array from startDate to endDate
  const daily: DailyAggregate[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const m = mealMap.get(iso);
    daily.push({
      date: iso,
      calories: m?.calories ?? 0,
      protein: m?.protein ?? 0,
      carbs: m?.carbs ?? 0,
      fat: m?.fat ?? 0,
      mealCount: m?.mealCount ?? 0,
      water_ml: waterMap.get(iso) ?? 0,
      weight_kg: weightMap.get(iso) ?? null,
    });
  }

  // Compute current 7 days vs previous 7 days based on endDate
  const endObj = new Date(`${endDate}T00:00:00Z`);
  const curWeekStartObj = new Date(endObj);
  curWeekStartObj.setUTCDate(curWeekStartObj.getUTCDate() - 6);
  const prevWeekEndObj = new Date(curWeekStartObj);
  prevWeekEndObj.setUTCDate(prevWeekEndObj.getUTCDate() - 1);
  const prevWeekStartObj = new Date(prevWeekEndObj);
  prevWeekStartObj.setUTCDate(prevWeekStartObj.getUTCDate() - 6);

  const curStart = curWeekStartObj.toISOString().slice(0, 10);
  const prevStart = prevWeekStartObj.toISOString().slice(0, 10);
  const prevEnd = prevWeekEndObj.toISOString().slice(0, 10);

  const summarizeWindow = (s: string, e: string) => {
    const mRows = db
      .prepare(
        `SELECT date, SUM(calories) as calories, SUM(protein) as protein, SUM(carbs) as carbs, SUM(fat) as fat
         FROM meals WHERE date >= ? AND date <= ? GROUP BY date`
      )
      .all(s, e) as { date: string; calories: number; protein: number; carbs: number; fat: number }[];
    const wRows = db
      .prepare(
        `SELECT date, SUM(amount_ml) as water_ml FROM water_logs WHERE date >= ? AND date <= ? GROUP BY date`
      )
      .all(s, e) as { date: string; water_ml: number }[];

    const daysLogged = mRows.length;
    const tot = mRows.reduce(
      (acc, r) => ({
        calories: acc.calories + r.calories,
        protein: acc.protein + r.protein,
        carbs: acc.carbs + r.carbs,
        fat: acc.fat + r.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    const totalWater = wRows.reduce((sum, r) => sum + r.water_ml, 0);
    const waterDays = wRows.length || 1;
    const divisor = daysLogged || 1;
    return {
      calories: daysLogged ? Math.round(tot.calories / divisor) : 0,
      protein: daysLogged ? Number((tot.protein / divisor).toFixed(1)) : 0,
      carbs: daysLogged ? Number((tot.carbs / divisor).toFixed(1)) : 0,
      fat: daysLogged ? Number((tot.fat / divisor).toFixed(1)) : 0,
      water_ml: wRows.length ? Math.round(totalWater / waterDays) : 0,
      daysLogged,
    };
  };

  // Monthly trend across last 6 months with actual records
  const monthlyMealRows = db
    .prepare(
      `SELECT substr(date, 1, 7) as month,
              date,
              SUM(calories) as calories,
              SUM(protein) as protein,
              SUM(carbs) as carbs,
              SUM(fat) as fat
       FROM meals
       GROUP BY date
       ORDER BY month ASC`
    )
    .all() as {
    month: string;
    date: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[];

  const monthlyWaterRows = db
    .prepare(
      `SELECT substr(date, 1, 7) as month, date, SUM(amount_ml) as water_ml
       FROM water_logs
       GROUP BY date`
    )
    .all() as { month: string; date: string; water_ml: number }[];

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

  for (const r of monthlyMealRows) {
    const cur = monthMap.get(r.month) ?? {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      daysLogged: 0,
      waterTotal: 0,
      waterDays: 0,
    };
    cur.calories += r.calories;
    cur.protein += r.protein;
    cur.carbs += r.carbs;
    cur.fat += r.fat;
    cur.daysLogged += 1;
    monthMap.set(r.month, cur);
  }
  for (const w of monthlyWaterRows) {
    const cur = monthMap.get(w.month) ?? {
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      daysLogged: 0,
      waterTotal: 0,
      waterDays: 0,
    };
    cur.waterTotal += w.water_ml;
    cur.waterDays += 1;
    monthMap.set(w.month, cur);
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
    weeklyAverage: summarizeWindow(curStart, endDate),
    previousWeekAverage: summarizeWindow(prevStart, prevEnd),
    monthlyTrend,
    weightLogs: getWeightLogs(),
  };
}

export function exportAllData() {
  return {
    app: 'Dr.weight Loss',
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    meals: getMeals(),
    water_logs: getWaterLogs(),
    weight_logs: getWeightLogs(),
  };
}

export function restoreBackupData(payload: {
  settings?: Partial<UserSettings>;
  meals?: Array<Omit<MealEntry, 'id' | 'created_at'>>;
  water_logs?: Array<{ date: string; amount_ml: number; logged_at?: string }>;
  weight_logs?: Array<{ date: string; weight_kg: number; note?: string | null; logged_at?: string }>;
}): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM meals').run();
    db.prepare('DELETE FROM water_logs').run();
    db.prepare('DELETE FROM weight_logs').run();
    db.prepare('DELETE FROM assistant_messages').run();

    if (payload.settings) {
      updateSettings(payload.settings);
    }

    if (Array.isArray(payload.meals)) {
      const insertMeal = db.prepare(
        `INSERT INTO meals (
          date, time, meal_type, food_name, ingredients, items_json, serving_size,
          quantity, oil_tsp, calories, protein, carbs, fat, image_data, notes, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const m of payload.meals) {
        insertMeal.run(
          m.date,
          m.time || '12:00',
          m.meal_type || 'Lunch',
          m.food_name || 'Meal',
          m.ingredients || '',
          JSON.stringify(m.items ?? []),
          m.serving_size || '1 serving',
          Number(m.quantity) || 1,
          Number(m.oil_tsp) || 0,
          Number(m.calories) || 0,
          Number(m.protein) || 0,
          Number(m.carbs) || 0,
          Number(m.fat) || 0,
          m.image_data ?? null,
          m.notes ?? null,
          new Date().toISOString()
        );
      }
    }

    if (Array.isArray(payload.water_logs)) {
      const insertWater = db.prepare(
        'INSERT INTO water_logs (date, amount_ml, logged_at) VALUES (?, ?, ?)'
      );
      for (const w of payload.water_logs) {
        insertWater.run(w.date, Math.round(Number(w.amount_ml) || 250), w.logged_at || new Date().toISOString());
      }
    }

    if (Array.isArray(payload.weight_logs)) {
      const insertWeight = db.prepare(
        'INSERT INTO weight_logs (date, weight_kg, note, logged_at) VALUES (?, ?, ?, ?)'
      );
      for (const wt of payload.weight_logs) {
        insertWeight.run(
          wt.date,
          Number(wt.weight_kg),
          wt.note ?? null,
          wt.logged_at || new Date().toISOString()
        );
      }
    }
  });

  tx();
}

export function resetAllData(): UserSettings {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM meals').run();
    db.prepare('DELETE FROM water_logs').run();
    db.prepare('DELETE FROM weight_logs').run();
    db.prepare('DELETE FROM assistant_messages').run();
    db.prepare('DELETE FROM settings').run();
    ensureSettingsRow();
  });
  tx();
  return getSettings();
}
