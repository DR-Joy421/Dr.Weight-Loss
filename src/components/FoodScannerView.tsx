import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  UtensilsCrossed,
} from 'lucide-react';
import { api } from '../api/client';
import {
  MEAL_TYPES,
  type MealEntry,
  type MealItemBreakdown,
  type MealType,
} from '../types';
import { captureVideoFrame, compressImageFile } from '../utils/image';
import { getCurrentTimeHHMM, getTodayIso } from '../utils/date';

interface FoodScannerViewProps {
  onMealSaved: (meal: MealEntry) => void;
  onOpenManualMeal: () => void;
}

export const FoodScannerView: React.FC<FoodScannerViewProps> = ({
  onMealSaved,
  onOpenManualMeal,
}) => {
  const [imageData, setImageData] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('image/jpeg');
  const [isHomemade, setIsHomemade] = useState<boolean>(true);
  const [extraContext, setExtraContext] = useState<string>('');
  const [analyzing, setAnalyzing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Camera state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Review & confirmation state (never auto-saved!)
  const [reviewReady, setReviewReady] = useState<boolean>(false);
  const [confidenceNotes, setConfidenceNotes] = useState<string>('');
  const [foodName, setFoodName] = useState<string>('');
  const [mealType, setMealType] = useState<MealType>('Lunch');
  const [date, setDate] = useState<string>(getTodayIso());
  const [time, setTime] = useState<string>(getCurrentTimeHHMM());
  const [servingSize, setServingSize] = useState<string>('1 serving');
  const [quantity, setQuantity] = useState<number>(1);
  const [baseOilTsp, setBaseOilTsp] = useState<number>(0);
  const [oilTsp, setOilTsp] = useState<number>(0);
  const [items, setItems] = useState<MealItemBreakdown[]>([]);
  const [ingredientsText, setIngredientsText] = useState<string>('');
  const [totalCalories, setTotalCalories] = useState<number>(0);
  const [totalProtein, setTotalProtein] = useState<number>(0);
  const [totalCarbs, setTotalCarbs] = useState<number>(0);
  const [totalFat, setTotalFat] = useState<number>(0);
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setError(null);
    setSavedBanner(null);
    stopCamera();
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Live camera preview is unavailable in this browser. Use "Take Photo / Upload" instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: mode } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch {
      setError(
        'Camera access was denied or unavailable. You can still capture or upload a photo using the upload button below.'
      );
    }
  };

  const handleCaptureFrame = () => {
    if (!videoRef.current) return;
    try {
      const { dataUrl, mimeType: mt } = captureVideoFrame(videoRef.current);
      setImageData(dataUrl);
      setMimeType(mt);
      setReviewReady(false);
      stopCamera();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setSavedBanner(null);
    stopCamera();
    try {
      const { dataUrl, mimeType: mt } = await compressImageFile(file);
      setImageData(dataUrl);
      setMimeType(mt);
      setReviewReady(false);
    } catch (err) {
      setError((err as Error).message);
    }
    e.target.value = '';
  };

  const recalculateFromItemsAndOil = (
    nextItems: MealItemBreakdown[],
    nextOil: number,
    refBaseOil: number
  ) => {
    const itemCal = nextItems.reduce((s, it) => s + (Number(it.calories) || 0), 0);
    const itemP = nextItems.reduce((s, it) => s + (Number(it.protein) || 0), 0);
    const itemC = nextItems.reduce((s, it) => s + (Number(it.carbs) || 0), 0);
    const itemF = nextItems.reduce((s, it) => s + (Number(it.fat) || 0), 0);
    const oilDiff = nextOil - refBaseOil;

    setTotalCalories(Math.max(0, Math.round(itemCal + oilDiff * 45)));
    setTotalProtein(Math.max(0, Number(itemP.toFixed(1))));
    setTotalCarbs(Math.max(0, Number(itemC.toFixed(1))));
    setTotalFat(Math.max(0, Number((itemF + oilDiff * 5).toFixed(1))));

    const ingSummary = nextItems
      .map((it) => {
        const ings = it.ingredients?.length ? ` (${it.ingredients.join(', ')})` : '';
        return `${it.quantity} ${it.unit} ${it.name}${ings}`;
      })
      .join('; ');
    setIngredientsText(ingSummary);
  };

  const handleAnalyze = async () => {
    if (!imageData) {
      setError('Please capture or upload a food photograph first.');
      return;
    }
    setAnalyzing(true);
    setError(null);
    setSavedBanner(null);
    try {
      const result = await api.scanFood({
        imageBase64: imageData,
        mimeType,
        extraContext: extraContext.trim() || undefined,
        isHomemade,
      });

      if (!result || typeof result !== 'object' || !Array.isArray(result.items)) {
        throw new Error('Received an unexpected response while analyzing the meal. Please try again.');
      }

      setFoodName(result.foodName || 'Scanned Meal');
      setMealType(result.suggestedMealType || 'Lunch');
      setServingSize(result.servingSize || '1 serving');
      setQuantity(1);
      setBaseOilTsp(Number(result.estimatedOilTsp) || 0);
      setOilTsp(Number(result.estimatedOilTsp) || 0);
      setItems(result.items);
      setConfidenceNotes(
        result.confidenceNotes || 'Please review the detected items and quantities before saving.'
      );
      setDate(getTodayIso());
      setTime(getCurrentTimeHHMM());
      recalculateFromItemsAndOil(
        result.items,
        Number(result.estimatedOilTsp) || 0,
        Number(result.estimatedOilTsp) || 0
      );
      setReviewReady(true);
    } catch (err) {
      setError((err as Error).message || 'AI food analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleItemQuantityChange = (idx: number, nextQty: number) => {
    const safeQty = Math.max(0.25, nextQty);
    const current = items[idx];
    const ratio = safeQty / Math.max(current.quantity, 0.25);
    const updated = items.map((it, i) =>
      i === idx
        ? {
            ...it,
            quantity: Number(safeQty.toFixed(2)),
            calories: Math.round(it.calories * ratio),
            protein: Number((it.protein * ratio).toFixed(1)),
            carbs: Number((it.carbs * ratio).toFixed(1)),
            fat: Number((it.fat * ratio).toFixed(1)),
          }
        : it
    );
    setItems(updated);
    recalculateFromItemsAndOil(updated, oilTsp, baseOilTsp);
  };

  const handleItemFieldChange = (idx: number, patch: Partial<MealItemBreakdown>) => {
    const updated = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    setItems(updated);
    recalculateFromItemsAndOil(updated, oilTsp, baseOilTsp);
  };

  const handleAddCustomItem = () => {
    const updated: MealItemBreakdown[] = [
      ...items,
      {
        name: 'Extra item (e.g., Roti / Curd)',
        quantity: 1,
        unit: 'serving',
        calories: 100,
        protein: 3,
        carbs: 15,
        fat: 2,
        ingredients: ['whole wheat'],
      },
    ];
    setItems(updated);
    recalculateFromItemsAndOil(updated, oilTsp, baseOilTsp);
  };

  const handleRemoveItem = (idx: number) => {
    const updated = items.filter((_, i) => i !== idx);
    setItems(updated);
    recalculateFromItemsAndOil(updated, oilTsp, baseOilTsp);
  };

  const handleOilAdjust = (nextOil: number) => {
    const clamped = Math.max(0, Math.min(12, Number(nextOil.toFixed(1))));
    setOilTsp(clamped);
    recalculateFromItemsAndOil(items, clamped, baseOilTsp);
  };

  const handleSaveMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foodName.trim()) {
      setError('Please enter a meal name before saving.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await api.createMeal({
        date,
        time,
        meal_type: mealType,
        food_name: foodName.trim(),
        ingredients: ingredientsText.trim() || foodName.trim(),
        items,
        serving_size: servingSize.trim() || '1 serving',
        quantity: Number(quantity) || 1,
        oil_tsp: oilTsp,
        calories: Math.max(0, Math.round(totalCalories)),
        protein: Math.max(0, Number(totalProtein.toFixed(1))),
        carbs: Math.max(0, Number(totalCarbs.toFixed(1))),
        fat: Math.max(0, Number(totalFat.toFixed(1))),
        image_data: imageData,
        notes: notes.trim() || (isHomemade ? 'Homemade meal' : null),
      });
      onMealSaved(created);
      setSavedBanner(`Saved "${created.food_name}" (${created.calories} kcal) to ${created.meal_type}.`);
      // Reset scanner state for next meal
      setReviewReady(false);
      setImageData(null);
      setExtraContext('');
      setItems([]);
      setNotes('');
    } catch (err) {
      setError((err as Error).message || 'Could not save meal.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetScanner = () => {
    stopCamera();
    setImageData(null);
    setReviewReady(false);
    setItems([]);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-[#526056]">
            AI Vision Meal Recognition · Indian &amp; Global Cuisines
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#142018] font-display mt-0.5">
            AI Food Scanner
          </h1>
        </div>
        <button
          type="button"
          onClick={onOpenManualMeal}
          className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#DCE5DE] bg-white px-4 py-2 text-sm font-medium text-[#142018] hover:bg-[#F1F5F2] whitespace-nowrap shrink-0"
        >
          <UtensilsCrossed className="h-4 w-4 text-[#2D6A4F]" />
          Log Without Photo
        </button>
      </div>

      {savedBanner && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[#B7D7C2] bg-[#EDF6F0] px-4 py-3 text-sm text-[#1B4332]">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            <span>{savedBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSavedBanner(null)}
            className="text-xs font-medium underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 rounded-xl border border-[#E5B8AD] bg-[#FDF4F2] px-4 py-3 text-sm text-[#9C3A22]">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          {imageData && !reviewReady && !analyzing && (
            <button
              type="button"
              onClick={handleAnalyze}
              className="self-start sm:self-auto rounded-lg border border-[#D49A8E] bg-white px-3 py-1.5 text-xs font-semibold text-[#9C3A22] hover:bg-[#FDF0EC] whitespace-nowrap shrink-0"
            >
              Try Again
            </button>
          )}
        </div>
      )}

      {!reviewReady ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Capture / Upload Zone */}
          <div className="lg:col-span-7 rounded-2xl border border-[#E2E8E2] bg-white p-5 sm:p-6 shadow-xs space-y-4">
            <h2 className="text-base font-semibold text-[#142018] font-display">
              1. Capture or Upload Food Photograph
            </h2>

            {cameraActive ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl bg-black aspect-4/3">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = facingMode === 'environment' ? 'user' : 'environment';
                      setFacingMode(next);
                      startCamera(next);
                    }}
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[#DCE5DE] px-3.5 py-2 text-sm font-medium text-[#142018] hover:bg-[#F7F9F7]"
                  >
                    <RefreshCw className="h-4 w-4" />
                    Flip Camera
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={stopCamera}
                      className="min-h-[44px] rounded-xl border border-[#DCE5DE] px-4 py-2 text-sm font-medium text-[#526056]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleCaptureFrame}
                      className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#1B4332] px-5 py-2 text-sm font-medium text-white hover:bg-[#2D6A4F]"
                    >
                      <Camera className="h-4 w-4" />
                      Capture Photo
                    </button>
                  </div>
                </div>
              </div>
            ) : imageData ? (
              <div className="space-y-3">
                <div className="relative overflow-hidden rounded-xl border border-[#DCE5DE] bg-[#F7F9F7] aspect-4/3">
                  <img
                    src={imageData}
                    alt="Selected meal preview"
                    className="h-full w-full object-contain"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleResetScanner}
                    className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[#DCE5DE] px-3.5 py-2 text-xs font-medium text-[#526056] hover:bg-[#F7F9F7]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Choose Another Photo
                  </button>
                  <span className="text-xs text-[#526056]">Ready for AI vision analysis</span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[#C5D3C9] bg-[#FAFBF9] p-6 sm:p-10 text-center space-y-5">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E8F0EB] text-[#1B4332]">
                  <ImagePlus className="h-7 w-7" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <p className="text-sm font-semibold text-[#142018]">
                    Snap your plate, thali, bowl, or snack
                  </p>
                  <p className="text-xs text-[#526056]">
                    Supports Indian homemade meals (roti, dal, sabzi, rice, dosa, idli, poha, paneer, paratha) and international cuisines.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => startCamera('environment')}
                    className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[#1B4332] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#2D6A4F] transition-colors whitespace-nowrap shrink-0"
                  >
                    <Camera className="h-4 w-4" />
                    Live Camera
                  </button>
                  <label className="min-h-[44px] cursor-pointer inline-flex items-center gap-2 rounded-xl border border-[#DCE5DE] bg-white px-4 py-2.5 text-sm font-medium text-[#142018] hover:bg-[#F1F5F2] transition-colors whitespace-nowrap shrink-0">
                    <Upload className="h-4 w-4 text-[#2D6A4F]" />
                    Upload / Gallery
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                  <label className="min-h-[44px] sm:hidden cursor-pointer inline-flex items-center gap-2 rounded-xl border border-[#DCE5DE] bg-white px-4 py-2.5 text-sm font-medium text-[#142018] hover:bg-[#F1F5F2] transition-colors whitespace-nowrap shrink-0">
                    <Camera className="h-4 w-4 text-[#2D6A4F]" />
                    Device Camera
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Context & Scan Action */}
          <div className="lg:col-span-5 rounded-2xl border border-[#E2E8E2] bg-white p-5 sm:p-6 shadow-xs flex flex-col justify-between gap-5">
            <div className="space-y-4">
              <h2 className="text-base font-semibold text-[#142018] font-display">
                2. Meal Details &amp; Homemade Precision
              </h2>

              <div className="flex items-center justify-between rounded-xl border border-[#E2E8E2] bg-[#F8FAF8] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#142018]">Homemade Meal</p>
                  <p className="text-xs text-[#526056]">
                    Enables cooking oil &amp; ghee quantity adjustment
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isHomemade}
                  onClick={() => setIsHomemade((v) => !v)}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    isHomemade ? 'bg-[#1B4332]' : 'bg-[#CBD6CE]'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-sm transition-transform ${
                      isHomemade ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#526056] mb-1.5">
                  Optional Dish Hint (Improves Portion Accuracy)
                </label>
                <textarea
                  rows={3}
                  value={extraContext}
                  onChange={(e) => setExtraContext(e.target.value)}
                  placeholder="e.g., 2 whole wheat phulkas with light ghee, 1 katori moong dal, aloo gobi sabzi"
                  className="w-full rounded-xl border border-[#DCE5DE] bg-white px-3.5 py-2.5 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                />
              </div>

              <div className="rounded-xl bg-[#F7F9F7] border border-[#E8EEE9] p-3.5 text-xs text-[#526056] space-y-1">
                <p className="font-semibold text-[#142018]">Review Before Saving</p>
                <p>
                  AI estimates are never saved automatically. You can review every item, adjust serving counts, and tweak cooking oil before logging.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={!imageData || analyzing}
              onClick={handleAnalyze}
              className="min-h-[48px] w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4332] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2D6A4F] disabled:opacity-50 transition-colors"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing Food &amp; Nutrition...
                </>
              ) : (
                'Analyze Meal with AI'
              )}
            </button>
          </div>
        </div>
      ) : (
        /* Mandatory Review & Confirmation Editor */
        <form onSubmit={handleSaveMeal} className="space-y-6">
          <div className="rounded-2xl border border-[#B7D7C2] bg-[#F2F7F3] px-4 py-3 text-xs sm:text-sm text-[#1B4332] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <span className="font-semibold">Review AI Estimates:</span> {confidenceNotes}
            </div>
            <button
              type="button"
              onClick={handleResetScanner}
              className="text-xs font-semibold underline self-start sm:self-auto shrink-0"
            >
              Discard &amp; Scan New
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Photo + Core Meal Metadata + Homemade Oil */}
            <div className="lg:col-span-5 space-y-5">
              <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-4">
                {imageData && (
                  <img
                    src={imageData}
                    alt={foodName}
                    className="w-full max-h-60 object-cover rounded-xl border border-[#E2E8E2]"
                    referrerPolicy="no-referrer"
                  />
                )}

                <div>
                  <label className="block text-xs font-medium text-[#526056] mb-1">
                    Meal Title
                  </label>
                  <input
                    type="text"
                    value={foodName}
                    onChange={(e) => setFoodName(e.target.value)}
                    className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2.5 text-sm font-medium text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#526056] mb-1">
                      Meal Slot
                    </label>
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
                      Overall Serving
                    </label>
                    <input
                      type="text"
                      value={servingSize}
                      onChange={(e) => setServingSize(e.target.value)}
                      className="w-full rounded-xl border border-[#DCE5DE] px-3 py-2.5 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#526056] mb-1">Date</label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-full rounded-xl border border-[#DCE5DE] px-3 py-2.5 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#526056] mb-1">Time</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full rounded-xl border border-[#DCE5DE] px-3 py-2.5 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                    />
                  </div>
                </div>

                {/* Homemade Oil/Ghee Adjuster */}
                <div className="rounded-xl border border-[#DCE5DE] bg-[#F8FAF8] p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#142018]">
                      Homemade Cooking Oil / Ghee
                    </span>
                    <span className="text-xs font-mono text-[#2D6A4F] tabular-nums">
                      AI est: {baseOilTsp} tsp
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleOilAdjust(oilTsp - 0.5)}
                      className="min-h-[38px] px-3 rounded-lg border border-[#DCE5DE] bg-white text-sm font-medium hover:bg-[#F1F5F2]"
                    >
                      −0.5
                    </button>
                    <div className="flex-1 text-center font-mono text-sm font-semibold text-[#142018] tabular-nums">
                      {oilTsp} tsp
                    </div>
                    <button
                      type="button"
                      onClick={() => handleOilAdjust(oilTsp + 0.5)}
                      className="min-h-[38px] px-3 rounded-lg border border-[#DCE5DE] bg-white text-sm font-medium hover:bg-[#F1F5F2]"
                    >
                      +0.5
                    </button>
                  </div>
                  <p className="text-[11px] text-[#526056]">
                    Adjusting oil updates calories (+45 kcal/tsp) and fat (+5g/tsp) automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column: Detected Items & Totals */}
            <div className="lg:col-span-7 space-y-5">
              <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-[#142018] font-display">
                    Detected Food Items &amp; Portions
                  </h2>
                  <button
                    type="button"
                    onClick={handleAddCustomItem}
                    className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[#DCE5DE] px-3 py-1.5 text-xs font-medium text-[#1B4332] hover:bg-[#F1F5F2]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Item
                  </button>
                </div>

                <div className="space-y-3">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-[#E8EEE9] bg-[#FAFBF9] p-3.5 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => handleItemFieldChange(idx, { name: e.target.value })}
                          className="flex-1 rounded-lg border border-[#DCE5DE] bg-white px-3 py-1.5 text-sm font-semibold text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#647368] hover:text-[#B5472D]"
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                        <div className="sm:col-span-1">
                          <label className="block text-[11px] text-[#526056] mb-0.5">Qty</label>
                          <input
                            type="number"
                            min={0.25}
                            step={0.25}
                            value={item.quantity}
                            onChange={(e) =>
                              handleItemQuantityChange(idx, Number(e.target.value))
                            }
                            className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2 py-1.5 text-xs font-mono tabular-nums"
                          />
                        </div>
                        <div className="sm:col-span-1">
                          <label className="block text-[11px] text-[#526056] mb-0.5">Unit</label>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleItemFieldChange(idx, { unit: e.target.value })}
                            className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#526056] mb-0.5">kcal</label>
                          <input
                            type="number"
                            min={0}
                            value={item.calories}
                            onChange={(e) =>
                              handleItemFieldChange(idx, { calories: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2 py-1.5 text-xs font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#526056] mb-0.5">Protein (g)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={item.protein}
                            onChange={(e) =>
                              handleItemFieldChange(idx, { protein: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2 py-1.5 text-xs font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#526056] mb-0.5">Carbs (g)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={item.carbs}
                            onChange={(e) =>
                              handleItemFieldChange(idx, { carbs: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2 py-1.5 text-xs font-mono tabular-nums"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#526056] mb-0.5">Fat (g)</label>
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={item.fat}
                            onChange={(e) =>
                              handleItemFieldChange(idx, { fat: Number(e.target.value) })
                            }
                            className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2 py-1.5 text-xs font-mono tabular-nums"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] text-[#526056] mb-0.5">
                          Ingredients (comma separated)
                        </label>
                        <input
                          type="text"
                          value={item.ingredients.join(', ')}
                          onChange={(e) =>
                            handleItemFieldChange(idx, {
                              ingredients: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2.5 py-1.5 text-xs text-[#526056]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#526056] mb-1">
                    Full Ingredients Summary
                  </label>
                  <textarea
                    rows={2}
                    value={ingredientsText}
                    onChange={(e) => setIngredientsText(e.target.value)}
                    className="w-full rounded-xl border border-[#DCE5DE] px-3 py-2 text-xs text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                  />
                </div>

                {/* Final Editable Totals */}
                <div className="rounded-xl border border-[#DCE5DE] bg-[#F7F9F7] p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#142018]">
                      Confirmed Meal Totals (Editable)
                    </span>
                    <span className="text-xs text-[#526056]">Saved only when you confirm</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#526056] mb-1">Calories (kcal)</label>
                      <input
                        type="number"
                        min={0}
                        value={totalCalories}
                        onChange={(e) => setTotalCalories(Number(e.target.value))}
                        className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2.5 py-2 text-sm font-bold text-[#1B4332] font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#526056] mb-1">Protein (g)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={totalProtein}
                        onChange={(e) => setTotalProtein(Number(e.target.value))}
                        className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2.5 py-2 text-sm font-semibold font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#526056] mb-1">Carbs (g)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={totalCarbs}
                        onChange={(e) => setTotalCarbs(Number(e.target.value))}
                        className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2.5 py-2 text-sm font-semibold font-mono tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#526056] mb-1">Fat (g)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={totalFat}
                        onChange={(e) => setTotalFat(Number(e.target.value))}
                        className="w-full rounded-lg border border-[#DCE5DE] bg-white px-2.5 py-2 text-sm font-semibold font-mono tabular-nums"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#526056] mb-1">
                    Notes (optional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g., Light dinner, low oil homemade"
                    className="w-full rounded-xl border border-[#DCE5DE] px-3.5 py-2 text-sm text-[#142018] focus:border-[#2D6A4F] focus:outline-none"
                  />
                </div>

                <div className="flex flex-col sm:flex-row sm:justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleResetScanner}
                    className="min-h-[44px] rounded-xl border border-[#DCE5DE] px-4 py-2 text-sm font-medium text-[#526056] hover:bg-[#F7F9F7]"
                  >
                    Discard
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[44px] inline-flex items-center justify-center gap-2 rounded-xl bg-[#1B4332] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#2D6A4F] disabled:opacity-60 transition-colors"
                  >
                    <Check className="h-4 w-4" />
                    {saving ? 'Saving Meal...' : 'Confirm & Save Meal'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
