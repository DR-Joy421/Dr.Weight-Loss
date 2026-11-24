import React, { useState } from 'react';

interface CalorieRingProps {
  consumed: number;
  target: number;
}

export const CalorieRing: React.FC<CalorieRingProps> = ({ consumed, target }) => {
  const safeTarget = Math.max(target, 1);
  const ratio = Math.min(consumed / safeTarget, 1);
  const isOver = consumed > safeTarget;
  const remaining = Math.round(safeTarget - consumed);

  const size = 196;
  const strokeWidth = 14;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ratio);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E6EDE8"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={isOver ? '#C2593F' : '#2D6A4F'}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          className="transition-all duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
        <span className="text-xs font-medium text-[#526056]">
          {isOver ? 'Over target' : 'Remaining'}
        </span>
        <span
          className={`text-3xl font-bold tracking-tight tabular-nums font-display mt-0.5 ${
            isOver ? 'text-[#B5472D]' : 'text-[#142018]'
          }`}
        >
          {Math.abs(remaining).toLocaleString()}
        </span>
        <span className="text-xs text-[#526056] tabular-nums mt-0.5">
          kcal {isOver ? 'excess' : 'left'}
        </span>
      </div>
    </div>
  );
};

interface BarDatum {
  label: string;
  subLabel?: string;
  value: number;
  unit: string;
}

interface SimpleBarChartProps {
  data: BarDatum[];
  targetLine?: number;
  targetLabel?: string;
  barColor?: string;
  overColor?: string;
  height?: number;
  emptyText?: string;
}

export const SimpleBarChart: React.FC<SimpleBarChartProps> = ({
  data,
  targetLine,
  targetLabel,
  barColor = '#2D6A4F',
  overColor = '#C2593F',
  height = 220,
  emptyText = 'No records in this range yet.',
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const hasAnyValue = data.some((d) => d.value > 0);
  if (!data.length || !hasAnyValue) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-[#DCE5DE] bg-[#FAFBF9] text-sm text-[#647368]"
        style={{ height }}
      >
        {emptyText}
      </div>
    );
  }

  const maxVal = Math.max(
    targetLine ? targetLine * 1.15 : 0,
    ...data.map((d) => d.value),
    10
  );

  const svgWidth = 640;
  const padLeft = 48;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 34;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const slotW = chartW / data.length;
  const barW = Math.max(6, Math.min(34, slotW * 0.62));
  const labelStep = data.length > 18 ? Math.ceil(data.length / 8) : data.length > 10 ? 2 : 1;

  const yTicks = [0, Math.round(maxVal / 2), Math.round(maxVal)];

  const targetY =
    targetLine !== undefined ? padTop + chartH - (targetLine / maxVal) * chartH : null;

  return (
    <div className="relative w-full">
      {hoverIdx !== null && data[hoverIdx] && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-[#DCE5DE] bg-[#F7F9F7] px-3 py-1.5 text-xs">
          <span className="font-medium text-[#142018]">
            {data[hoverIdx].subLabel || data[hoverIdx].label}
          </span>
          <span className="font-mono font-semibold text-[#1B4332] tabular-nums">
            {data[hoverIdx].value.toLocaleString()} {data[hoverIdx].unit}
          </span>
        </div>
      )}
      <svg
        viewBox={`0 0 ${svgWidth} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        role="img"
      >
        {yTicks.map((tick) => {
          const y = padTop + chartH - (tick / maxVal) * chartH;
          return (
            <g key={tick}>
              <line
                x1={padLeft}
                x2={svgWidth - padRight}
                y1={y}
                y2={y}
                stroke="#E8EEE9"
                strokeWidth={1}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-[#6B7A6F] text-[10px] font-mono"
              >
                {tick}
              </text>
            </g>
          );
        })}

        {targetY !== null && targetY >= padTop && targetY <= padTop + chartH && (
          <g>
            <line
              x1={padLeft}
              x2={svgWidth - padRight}
              y1={targetY}
              y2={targetY}
              stroke="#74A88B"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            {targetLabel && (
              <text
                x={svgWidth - padRight}
                y={targetY - 5}
                textAnchor="end"
                className="fill-[#2D6A4F] text-[10px] font-medium"
              >
                {targetLabel}
              </text>
            )}
          </g>
        )}

        {data.map((d, idx) => {
          const barH = Math.max(d.value > 0 ? 3 : 0, (d.value / maxVal) * chartH);
          const x = padLeft + idx * slotW + (slotW - barW) / 2;
          const y = padTop + chartH - barH;
          const isOverTarget = targetLine !== undefined && d.value > targetLine * 1.05;
          const isHovered = hoverIdx === idx;

          return (
            <g
              key={`${d.label}-${idx}`}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => setHoverIdx(idx === hoverIdx ? null : idx)}
              className="cursor-pointer"
            >
              <rect
                x={padLeft + idx * slotW}
                y={padTop}
                width={slotW}
                height={chartH}
                fill="transparent"
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={Math.min(4, barW / 2)}
                fill={isOverTarget ? overColor : barColor}
                opacity={hoverIdx === null || isHovered ? 1 : 0.45}
                className="transition-opacity duration-150"
              />
              {idx % labelStep === 0 && (
                <text
                  x={padLeft + idx * slotW + slotW / 2}
                  y={padTop + chartH + 18}
                  textAnchor="middle"
                  className="fill-[#647368] text-[10px]"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

interface MacroDatum {
  label: string;
  subLabel?: string;
  protein: number;
  carbs: number;
  fat: number;
}

export const MacroStackedChart: React.FC<{ data: MacroDatum[]; height?: number }> = ({
  data,
  height = 220,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hasAny = data.some((d) => d.protein + d.carbs + d.fat > 0);

  if (!data.length || !hasAny) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-[#DCE5DE] bg-[#FAFBF9] text-sm text-[#647368]"
        style={{ height }}
      >
        Log meals to view macronutrient trends.
      </div>
    );
  }

  const maxTotal = Math.max(...data.map((d) => d.protein + d.carbs + d.fat), 50);
  const svgWidth = 640;
  const padLeft = 42;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 34;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const slotW = chartW / data.length;
  const barW = Math.max(6, Math.min(32, slotW * 0.6));
  const labelStep = data.length > 18 ? Math.ceil(data.length / 8) : data.length > 10 ? 2 : 1;

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-4 text-[#526056]">
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#2D6A4F]" />
            Protein
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#C58B37]" />
            Carbs
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#A65E46]" />
            Fat
          </span>
        </div>
        {hoverIdx !== null && data[hoverIdx] && (
          <div className="font-mono text-[#142018] tabular-nums">
            {data[hoverIdx].subLabel || data[hoverIdx].label}: P {data[hoverIdx].protein}g · C{' '}
            {data[hoverIdx].carbs}g · F {data[hoverIdx].fat}g
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${svgWidth} ${height}`} className="w-full h-auto overflow-visible select-none">
        {[0, Math.round(maxTotal / 2), Math.round(maxTotal)].map((tick) => {
          const y = padTop + chartH - (tick / maxTotal) * chartH;
          return (
            <g key={tick}>
              <line x1={padLeft} x2={svgWidth - padRight} y1={y} y2={y} stroke="#E8EEE9" />
              <text x={padLeft - 6} y={y + 4} textAnchor="end" className="fill-[#6B7A6F] text-[10px] font-mono">
                {tick}g
              </text>
            </g>
          );
        })}

        {data.map((d, idx) => {
          const x = padLeft + idx * slotW + (slotW - barW) / 2;
          const pH = (d.protein / maxTotal) * chartH;
          const cH = (d.carbs / maxTotal) * chartH;
          const fH = (d.fat / maxTotal) * chartH;

          const pY = padTop + chartH - pH;
          const cY = pY - cH;
          const fY = cY - fH;
          const dimmed = hoverIdx !== null && hoverIdx !== idx;

          return (
            <g
              key={`${d.label}-${idx}`}
              onMouseEnter={() => setHoverIdx(idx)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => setHoverIdx(idx === hoverIdx ? null : idx)}
              className="cursor-pointer"
              opacity={dimmed ? 0.45 : 1}
            >
              <rect x={padLeft + idx * slotW} y={padTop} width={slotW} height={chartH} fill="transparent" />
              {d.protein > 0 && <rect x={x} y={pY} width={barW} height={pH} fill="#2D6A4F" />}
              {d.carbs > 0 && <rect x={x} y={cY} width={barW} height={cH} fill="#C58B37" />}
              {d.fat > 0 && <rect x={x} y={fY} width={barW} height={fH} rx={2} fill="#A65E46" />}
              {idx % labelStep === 0 && (
                <text
                  x={padLeft + idx * slotW + slotW / 2}
                  y={padTop + chartH + 18}
                  textAnchor="middle"
                  className="fill-[#647368] text-[10px]"
                >
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

interface WeightPoint {
  date: string;
  label: string;
  weight_kg: number;
}

export const WeightLineChart: React.FC<{
  points: WeightPoint[];
  targetWeightKg?: number | null;
  height?: number;
}> = ({ points, targetWeightKg, height = 240 }) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!points.length) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border border-dashed border-[#DCE5DE] bg-[#FAFBF9] text-sm text-[#647368]"
        style={{ height }}
      >
        Log at least one weight measurement to view your trend chart.
      </div>
    );
  }

  const values = points.map((p) => p.weight_kg);
  if (targetWeightKg) values.push(targetWeightKg);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const padding = Math.max(1.5, (rawMax - rawMin) * 0.2);
  const minVal = Math.floor((rawMin - padding) * 2) / 2;
  const maxVal = Math.ceil((rawMax + padding) * 2) / 2;
  const range = Math.max(1, maxVal - minVal);

  const svgWidth = 640;
  const padLeft = 48;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 34;
  const chartW = svgWidth - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const coords = points.map((p, i) => {
    const x =
      points.length === 1
        ? padLeft + chartW / 2
        : padLeft + (i / (points.length - 1)) * chartW;
    const y = padTop + chartH - ((p.weight_kg - minVal) / range) * chartH;
    return { ...p, x, y };
  });

  const linePath = coords.map((c, idx) => `${idx === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');
  const areaPath =
    coords.length > 1
      ? `${linePath} L ${coords[coords.length - 1].x} ${padTop + chartH} L ${coords[0].x} ${padTop + chartH} Z`
      : '';

  const targetY =
    targetWeightKg !== undefined && targetWeightKg !== null
      ? padTop + chartH - ((targetWeightKg - minVal) / range) * chartH
      : null;

  const yTicks = [minVal, Number(((minVal + maxVal) / 2).toFixed(1)), maxVal];
  const labelStep = coords.length > 10 ? Math.ceil(coords.length / 6) : 1;

  return (
    <div className="w-full">
      {hoverIdx !== null && coords[hoverIdx] && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-[#DCE5DE] bg-[#F7F9F7] px-3 py-1.5 text-xs">
          <span className="font-medium text-[#142018]">{coords[hoverIdx].date}</span>
          <span className="font-mono font-semibold text-[#1B4332] tabular-nums">
            {coords[hoverIdx].weight_kg.toFixed(1)} kg
          </span>
        </div>
      )}
      <svg viewBox={`0 0 ${svgWidth} ${height}`} className="w-full h-auto overflow-visible select-none">
        <defs>
          <linearGradient id="weightSageArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2D6A4F" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2D6A4F" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {yTicks.map((tick) => {
          const y = padTop + chartH - ((tick - minVal) / range) * chartH;
          return (
            <g key={tick}>
              <line x1={padLeft} x2={svgWidth - padRight} y1={y} y2={y} stroke="#E8EEE9" />
              <text x={padLeft - 8} y={y + 4} textAnchor="end" className="fill-[#6B7A6F] text-[10px] font-mono">
                {tick.toFixed(1)}
              </text>
            </g>
          );
        })}

        {targetY !== null && (
          <g>
            <line
              x1={padLeft}
              x2={svgWidth - padRight}
              y1={targetY}
              y2={targetY}
              stroke="#74A88B"
              strokeWidth={1.5}
              strokeDasharray="5 4"
            />
            <text
              x={svgWidth - padRight}
              y={targetY - 5}
              textAnchor="end"
              className="fill-[#2D6A4F] text-[10px] font-medium"
            >
              Target {targetWeightKg} kg
            </text>
          </g>
        )}

        {areaPath && <path d={areaPath} fill="url(#weightSageArea)" />}
        {coords.length > 1 && (
          <path d={linePath} fill="none" stroke="#1B4332" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        )}

        {coords.map((c, idx) => (
          <g
            key={`${c.date}-${idx}`}
            onMouseEnter={() => setHoverIdx(idx)}
            onMouseLeave={() => setHoverIdx(null)}
            onClick={() => setHoverIdx(idx === hoverIdx ? null : idx)}
            className="cursor-pointer"
          >
            <circle cx={c.x} cy={c.y} r={12} fill="transparent" />
            <circle
              cx={c.x}
              cy={c.y}
              r={hoverIdx === idx ? 6 : 4}
              fill={hoverIdx === idx ? '#1B4332' : '#FFFFFF'}
              stroke="#1B4332"
              strokeWidth={2}
            />
            {idx % labelStep === 0 && (
              <text
                x={c.x}
                y={padTop + chartH + 18}
                textAnchor="middle"
                className="fill-[#647368] text-[10px]"
              >
                {c.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
};
