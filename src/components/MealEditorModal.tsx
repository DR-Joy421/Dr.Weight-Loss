import React, { useState } from 'react';
import { Image as ImageIcon, Plus, Trash2, X } from 'lucide-react';
import { MEAL_TYPES, type MealEntry, type MealItemBreakdown, type MealType } from '../types';
import { compressImageFile } from '../utils/image';
import { getCurrentTimeHHMM, getTodayIso } from '../utils/date';

interface MealEditorModalProps {
  initialMeal?: MealEntry | null;
  defaultDate?: string;
  defaultMealType?: MealType;
  onClose: () => void;
  onSave: (payload: Omit<MealEntry, 'id' | 'created_at'>, existingId?: number) => Promise<void>;
}

export const MealEditorModal: React.FC<MealEditorModalProps> = ({
  initialMeal,
  defaultDate,
  defaultMealType,
  onClose,
  onSave,
}) => {
  const [foodName, setFoodName] = useState(initialMeal?.food_name ?? '');
  const [mealType, setMealType] = useState<MealType>(
    initialMeal?.meal_type ?? defaultMealType ?? 'Lunch'
  );
  const [date, setDate] = useState(initialMeal?.date ?? defaultDate ?? getTodayIso());
  const [time, setTime] = useState(initialMeal?.time ?? getCurrentTimeHHMM());
  const [servingSize, setServingSize] = useState(initialMeal?.serving_size ?? '1 serving');
  const [quantity, setQuantity] = useState(initialMeal?.quantity ?? 1);
  const [oilTsp, setOilTsp] = useState(initialMeal?.oil_tsp ?? 0);
  const [ingredients, setIngredients] = useState(initialMeal?.ingredients ?? '');
  const [calories, setCalories] = useState(initialMeal?.calories ?? 0);
  const [protein, setProtein] = useState(initialMeal?.protein ?? 0);
  const [carbs, setCarbs] = useState(initialMeal?.carbs ?? 0);
  const [fat, setFat] = useState(initialMeal?.fat ?? 0);
  const [items, setItems] = useState<MealItemBreakdown[]>(initialMeal?.items ?? []);
  const [imageData, setImageData] = useState<string | null>(initialMeal?.image_data ?? null);
  const [notes, setNotes] = useState(initialMeal?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { dataUrl } = await compressImageFile(file);
      setImageData(dataUrl);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const applyOilDelta = (nextOil: number) => {
    const clamped = Math.max(0, Math.min(10, Number(nextOil.toFixed(1))));
    const deltaTsp = clamped - oilTsp;
    setOilTsp(clamped);
    setCalories((c) => Math.max(0, Math.round(c + deltaTsp * 45)));
    setFat((f) => Math.max(0, Number((f + deltaTsp * 5).toFixed(1))));
  };

  const handleItemChange = (index: number, patch: Partial<MealItemBreakdown>) => {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    setItems(next);
    // Recompute totals from items + oil delta if user modifies breakdown
    const itemCal = next.reduce((s, it) => s + (Number(it.calories) || 0), 0);
    const itemP = next.reduce((s, it) => s + (Number(it.protein) || 0), 0);
    const itemC = next.reduce((s, it) => s + (Number(it.carbs) || 0), 0);
    const itemF = next.reduce((s, it) => s + (Number(it.fat) || 0), 0);
    setCalories(Math.round(itemCal));
    setProtein(Number(itemP.toFixed(1)));
    setCarbs(Number(itemC.toFixed(1)));
    setFat(Number(itemF.toFixed(1)));
    setIngredients(
      next
        .map((it) => `${it.quantity} ${it.unit} ${it.name}`)
        .filter(Boolean)
        .join(', ')
    );
  };

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        name: 'Homemade item',
        quantity: 1,
        unit: 'serving',
        calories: 100,
        protein: 3,
        carbs: 15,
        fat: 2,
        ingredients: [],
      },
    ]);
  };

  const handleRemoveItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    if (next.length > 0) {
      setCalories(Math.round(next.reduce((s, it) => s + it.calories, 0)));
      setProtein(Number(next.reduce((s, it) => s + it.protein, 0).toFixed(1)));
      setCarbs(Number(next.reduce((s, it) => s + it.carbs, 0).toFixed(1)));
      setFat(Number(next.reduce((s, it) => s + it.fat, 0).toFixed(1)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodName.trim()) {
      setError('Please enter a meal or food name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(
        {
          date,
          time,
          meal_type: mealType,
          food_name: foodName.trim(),
          ingredients: ingredients.trim() || foodName.trim(),
          items,
          serving_size: servingSize.trim() || '1 serving',
          quantity: Number(quantity) || 1,
          oil_tsp: Number(oilTsp) || 0,
          calories: Math.max(0, Math.round(Number(calories) || 0)),
          protein: Math.max(0, Number(Number(protein).toFixed(1)) || 0),
          carbs: Math.max(0, Number(Number(carbs).toFixed(1)) || 0),
          fat: Math.max(0, Number(Number(fat).toFixed(1)) || 0),
          image_data: imageData,
          notes: notes.trim() || null,
        },
        initialMeal?.id
      );
      onClose();
    } catch (err) {
      setError((err as Error).message || 'Unable to save meal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/45 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white border border-[#E2E8E2] shadow-xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E8EEE9] bg-white px-5 py-4">
          <h2 className="text-lg font-semibold text-[#142018] font-display">
            {initialMeal ? 'Edit Meal Entry' : 'Log Meal Manually'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#526056] hover:bg-[#F1F5F2] transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div className="rounded-xl border border-[#E5B8AD] bg-[#FDF4F2] px-4 py-3 text-sm text-[#9C3A22]">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-full sm:w-32 shrink-0">
              {imageData ? (
                <div className="relative aspect-square w-28 sm:w-32 rounded-xl overflow-hidden border border-[#DCE5DE]">
                  <img
                    src={imageData}
                    alt={foodName || 'Meal photo'}
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <button
                    type="button"
                    onClick={() => setImageData(null)}
                    className="absolute top-1.5 right-1.5 rounded-md bg-black/65 p-1 text-white hover:bg-black/80"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex aspect-square w-28 sm:w-32 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#C7D4CA] bg-[#F7F9F7] text-xs text-[#526056] hover:border-[#2D6A4F] transition-colors">
                  <ImageIcon className="h-5 w-5 text-[#2D6A4F]" />
                  <span>Add Photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
                </label>
              )}
            </div>

            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-[#526056] mb-1">
                  Meal / Food Name
                </label>
                <input
                  type="text"
                  value={foodName}
                  onChange={(e) => setFoodName(e.target.value)}
                  placeholder="e.g., 2 Rotis, Yellow Dal & Bhindi Sabzi"
                  className="w-full rounded-xl border border-[#DCE5DE] bg-white px-3.5 py-2.5 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#526056] mb-1">Meal Slot</label>
                <select
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value as MealType)}
                  className="w-full rounded-xl border border-[#DCE5DE] bg-white px-3 py-2.5 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                >
                  {MEAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#526056] mb-1">
                  Serving Size
                </label>
                <input
                  type="text"
                  value={servingSize}
                  onChange={(e) => setServingSize(e.target.value)}
                  placeholder="e.g., 1 bowl / 2 pieces"
                  className="w-full rounded-xl border border-[#DCE5DE] bg-white px-3.5 py-2.5 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#526056] mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-[#DCE5DE] bg-white px-3 py-2.5 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#526056] mb-1">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full rounded-xl border border-[#DCE5DE] bg-white px-3 py-2.5 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">Calories (kcal)</label>
              <input
                type="number"
                min={0}
                step={1}
                value={calories}
                onChange={(e) => setCalories(Number(e.target.value))}
                className="w-full rounded-xl border border-[#DCE5DE] px-3 py-2 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">Protein (g)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={protein}
                onChange={(e) => setProtein(Number(e.target.value))}
                className="w-full rounded-xl border border-[#DCE5DE] px-3 py-2 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">Carbs (g)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={carbs}
                onChange={(e) => setCarbs(Number(e.target.value))}
                className="w-full rounded-xl border border-[#DCE5DE] px-3 py-2 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">Fat (g)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={fat}
                onChange={(e) => setFat(Number(e.target.value))}
                className="w-full rounded-xl border border-[#DCE5DE] px-3 py-2 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">
                Quantity Multiplier
              </label>
              <input
                type="number"
                min={0.25}
                step={0.25}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="w-full rounded-xl border border-[#DCE5DE] px-3 py-2 text-sm font-mono tabular-nums focus:border-[#2D6A4F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#526056] mb-1">
                Homemade Cooking Oil / Ghee (tsp)
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => applyOilDelta(oilTsp - 0.5)}
                  className="min-h-[40px] px-3 rounded-xl border border-[#DCE5DE] text-sm font-medium hover:bg-[#F7F9F7]"
                >
                  −0.5
                </button>
                <span className="flex-1 text-center font-mono text-sm tabular-nums">
                  {oilTsp} tsp
                </span>
                <button
                  type="button"
                  onClick={() => applyOilDelta(oilTsp + 0.5)}
                  className="min-h-[40px] px-3 rounded-xl border border-[#DCE5DE] text-sm font-medium hover:bg-[#F7F9F7]"
                >
                  +0.5
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#526056] mb-1">Ingredients</label>
            <textarea
              rows={2}
              value={ingredients}
              onChange={(e) => setIngredients(e.target.value)}
              placeholder="List main ingredients (e.g., whole wheat flour, toor dal, cumin, okra, 1 tsp oil)"
              className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#526056]">Itemized Breakdown</span>
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2D6A4F] hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add item
                </button>
              </div>
              <div className="divide-y divide-[#EDF2EE] rounded-xl border border-[#E2E8E2]">
                {items.map((item, idx) => (
                  <div key={idx} className="p-3 grid grid-cols-12 gap-2 items-center text-xs">
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => handleItemChange(idx, { name: e.target.value })}
                      className="col-span-12 sm:col-span-5 rounded-lg border border-[#DCE5DE] px-2.5 py-1.5 text-sm"
                    />
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={item.calories}
                      onChange={(e) => handleItemChange(idx, { calories: Number(e.target.value) })}
                      aria-label="Item calories"
                      className="col-span-4 sm:col-span-2 rounded-lg border border-[#DCE5DE] px-2 py-1.5 font-mono tabular-nums"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={item.protein}
                      onChange={(e) => handleItemChange(idx, { protein: Number(e.target.value) })}
                      aria-label="Item protein"
                      className="col-span-3 sm:col-span-2 rounded-lg border border-[#DCE5DE] px-2 py-1.5 font-mono tabular-nums"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={item.carbs}
                      onChange={(e) => handleItemChange(idx, { carbs: Number(e.target.value) })}
                      aria-label="Item carbs"
                      className="col-span-3 sm:col-span-2 rounded-lg border border-[#DCE5DE] px-2 py-1.5 font-mono tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="col-span-2 sm:col-span-1 flex items-center justify-center text-[#8B988F] hover:text-[#B5472D]"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#526056] mb-1">Notes (optional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Homemade, restaurant, extra spices, etc."
              className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#E8EEE9]">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 rounded-xl border border-[#DCE5DE] text-sm font-medium text-[#526056] hover:bg-[#F7F9F7] whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-[#1B4332] text-sm font-medium text-white hover:bg-[#2D6A4F] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {saving ? 'Saving...' : initialMeal ? 'Save Changes' : 'Save Meal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
