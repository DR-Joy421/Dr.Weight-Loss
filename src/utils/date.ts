export function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCurrentTimeHHMM(): string {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${min}`;
}

export function shiftIsoDate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

export function formatReadableDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function formatMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const dt = new Date(y, m - 1, 1);
  return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const dt = new Date(y, m - 1 + deltaMonths, 1);
  const ny = dt.getFullYear();
  const nm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

export function getMonthCalendarDays(yearMonth: string): Array<{
  iso: string;
  day: number;
  inCurrentMonth: boolean;
}> {
  const [y, m] = yearMonth.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1);
  const startWeekday = firstDay.getDay(); // 0=Sun..6=Sat
  const daysInMonth = new Date(y, m, 0).getDate();

  const cells: Array<{ iso: string; day: number; inCurrentMonth: boolean }> = [];

  // Leading days from prev month
  const prevMonthDays = new Date(y, m - 1, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) {
    const dayNum = prevMonthDays - i;
    const prevDate = new Date(y, m - 2, dayNum);
    const iso = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    cells.push({ iso, day: dayNum, inCurrentMonth: false });
  }

  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${yearMonth}-${String(day).padStart(2, '0')}`;
    cells.push({ iso, day, inCurrentMonth: true });
  }

  // Trailing days to complete 6 rows (42) or 5 rows (35)
  const totalNeeded = cells.length <= 35 ? 35 : 42;
  let nextDay = 1;
  while (cells.length < totalNeeded) {
    const nextDate = new Date(y, m, nextDay);
    const iso = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;
    cells.push({ iso, day: nextDay, inCurrentMonth: false });
    nextDay++;
  }

  return cells;
}

export function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}
