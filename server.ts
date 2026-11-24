import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  addAssistantMessage,
  addWaterLog,
  addWeightLog,
  clearAssistantMessages,
  createMeal,
  deleteMeal,
  deleteWaterLog,
  deleteWeightLog,
  exportAllData,
  getAnalyticsData,
  getAssistantMessages,
  getMeals,
  getMonthActivityDates,
  getSettings,
  getWaterLogs,
  getWeightLogs,
  resetAllData,
  restoreBackupData,
  updateMeal,
  updateSettings,
  updateWeightLog,
} from './server/db.ts';
import { analyzeFoodImage, askNutritionAssistant } from './server/ai.ts';
import { MEAL_TYPES, type MealType } from './src/types.ts';

function isValidIsoDate(val: unknown): val is string {
  return typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val);
}

function getLocalTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Settings
  app.get('/api/settings', (_req, res) => {
    res.json(getSettings());
  });

  app.put('/api/settings', (req, res) => {
    try {
      const updated = updateSettings(req.body || {});
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'Failed to update settings' });
    }
  });

  // Meals
  app.get('/api/meals', (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const start = typeof req.query.start === 'string' ? req.query.start : undefined;
    const end = typeof req.query.end === 'string' ? req.query.end : undefined;
    res.json(getMeals({ date, start, end }));
  });

  app.post('/api/meals', (req, res) => {
    try {
      const body = req.body || {};
      const date = isValidIsoDate(body.date) ? body.date : getLocalTodayIso();
      const time = typeof body.time === 'string' && /^\d{2}:\d{2}$/.test(body.time) ? body.time : '12:00';
      const meal_type: MealType = MEAL_TYPES.includes(body.meal_type) ? body.meal_type : 'Lunch';
      const food_name = typeof body.food_name === 'string' ? body.food_name.trim() : '';

      if (!food_name) {
        return res.status(400).json({ error: 'Food name is required.' });
      }

      const created = createMeal({
        date,
        time,
        meal_type,
        food_name,
        ingredients: typeof body.ingredients === 'string' ? body.ingredients : '',
        items: Array.isArray(body.items) ? body.items : [],
        serving_size: typeof body.serving_size === 'string' && body.serving_size.trim()
          ? body.serving_size.trim()
          : '1 serving',
        quantity: Number(body.quantity) || 1,
        oil_tsp: Number(body.oil_tsp) || 0,
        calories: Number(body.calories) || 0,
        protein: Number(body.protein) || 0,
        carbs: Number(body.carbs) || 0,
        fat: Number(body.fat) || 0,
        image_data: typeof body.image_data === 'string' ? body.image_data : null,
        notes: typeof body.notes === 'string' ? body.notes : null,
      });

      res.status(201).json(created);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'Failed to save meal' });
    }
  });

  app.put('/api/meals/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid meal id' });
    }
    const updated = updateMeal(id, req.body || {});
    if (!updated) {
      return res.status(404).json({ error: 'Meal not found' });
    }
    res.json(updated);
  });

  app.delete('/api/meals/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid meal id' });
    }
    const ok = deleteMeal(id);
    if (!ok) {
      return res.status(404).json({ error: 'Meal not found' });
    }
    res.json({ deleted: true });
  });

  // Water
  app.get('/api/water', (req, res) => {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined;
    const start = typeof req.query.start === 'string' ? req.query.start : undefined;
    const end = typeof req.query.end === 'string' ? req.query.end : undefined;
    const logs = getWaterLogs({ date, start, end });
    const totalMl = logs.reduce((sum, l) => sum + l.amount_ml, 0);
    res.json({ logs, totalMl });
  });

  app.post('/api/water', (req, res) => {
    const body = req.body || {};
    const date = isValidIsoDate(body.date) ? body.date : getLocalTodayIso();
    const amount_ml = Number(body.amount_ml);
    if (!Number.isFinite(amount_ml) || amount_ml <= 0) {
      return res.status(400).json({ error: 'Valid water amount in ml is required.' });
    }
    const entry = addWaterLog(date, amount_ml);
    res.status(201).json(entry);
  });

  app.delete('/api/water/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid water log id' });
    }
    const ok = deleteWaterLog(id);
    if (!ok) {
      return res.status(404).json({ error: 'Water log not found' });
    }
    res.json({ deleted: true });
  });

  // Weight
  app.get('/api/weight', (_req, res) => {
    res.json(getWeightLogs());
  });

  app.post('/api/weight', (req, res) => {
    const body = req.body || {};
    const date = isValidIsoDate(body.date) ? body.date : getLocalTodayIso();
    const weight_kg = Number(body.weight_kg);
    if (!Number.isFinite(weight_kg) || weight_kg < 20 || weight_kg > 400) {
      return res.status(400).json({ error: 'Weight must be between 20 and 400 kg.' });
    }
    const created = addWeightLog(date, weight_kg, typeof body.note === 'string' ? body.note : null);
    res.status(201).json(created);
  });

  app.put('/api/weight/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid weight log id' });
    }
    const updated = updateWeightLog(id, req.body || {});
    if (!updated) {
      return res.status(404).json({ error: 'Weight log not found' });
    }
    res.json(updated);
  });

  app.delete('/api/weight/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid weight log id' });
    }
    const ok = deleteWeightLog(id);
    if (!ok) {
      return res.status(404).json({ error: 'Weight log not found' });
    }
    res.json({ deleted: true });
  });

  // Calendar activity & Analytics
  app.get('/api/calendar-activity', (req, res) => {
    const month = typeof req.query.month === 'string' && /^\d{4}-\d{2}$/.test(req.query.month)
      ? req.query.month
      : getLocalTodayIso().slice(0, 7);
    res.json(getMonthActivityDates(month));
  });

  app.get('/api/analytics', (req, res) => {
    const end = isValidIsoDate(req.query.end) ? req.query.end : getLocalTodayIso();
    let start = isValidIsoDate(req.query.start) ? req.query.start : '';
    if (!start) {
      const d = new Date(`${end}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 29);
      start = d.toISOString().slice(0, 10);
    }
    res.json(getAnalyticsData(start, end));
  });

  // AI Food Scanner
  app.post('/api/ai/scan-food', async (req, res) => {
    try {
      const body = req.body || {};
      if (typeof body.imageBase64 !== 'string' || !body.imageBase64.trim()) {
        return res.status(400).json({ error: 'Food photograph is required.' });
      }
      const result = await analyzeFoodImage({
        imageBase64: body.imageBase64,
        mimeType: typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg',
        extraContext: typeof body.extraContext === 'string' ? body.extraContext : undefined,
        isHomemade: Boolean(body.isHomemade),
      });
      res.json(result);
    } catch (err) {
      const message = (err as Error).message || 'Failed to analyze food photograph.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  // AI Nutrition Assistant
  app.get('/api/ai/chat', (_req, res) => {
    res.json(getAssistantMessages());
  });

  app.post('/api/ai/chat', async (req, res) => {
    try {
      const body = req.body || {};
      const question = typeof body.question === 'string' ? body.question.trim() : '';
      const todayIso = isValidIsoDate(body.today) ? body.today : getLocalTodayIso();

      if (!question) {
        return res.status(400).json({ error: 'Please enter a question.' });
      }

      const history = getAssistantMessages();
      const replyText = await askNutritionAssistant({
        question,
        todayIso,
        history,
      });

      const userMsg = addAssistantMessage('user', question);
      const assistantMsg = addAssistantMessage('assistant', replyText);

      res.json({ userMessage: userMsg, assistantMessage: assistantMsg });
    } catch (err) {
      const message = (err as Error).message || 'Failed to get response from Nutrition Assistant.';
      const status = message.includes('GEMINI_API_KEY') ? 503 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.delete('/api/ai/chat', (_req, res) => {
    clearAssistantMessages();
    res.json({ cleared: true });
  });

  // Export, Restore, Reset
  app.get('/api/export', (_req, res) => {
    const data = exportAllData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="dr-weight-loss-backup-${getLocalTodayIso()}.json"`
    );
    res.send(JSON.stringify(data, null, 2));
  });

  app.post('/api/restore', (req, res) => {
    try {
      const payload = req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ error: 'Invalid backup JSON payload.' });
      }
      restoreBackupData(payload);
      res.json({ restored: true });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message || 'Failed to restore backup.' });
    }
  });

  app.post('/api/reset', (req, res) => {
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: 'Explicit confirmation is required to reset all data.' });
    }
    const settings = resetAllData();
    res.json({ reset: true, settings });
  });

  // Vite middleware (dev) or static dist serving (prod)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dr.weight Loss server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
