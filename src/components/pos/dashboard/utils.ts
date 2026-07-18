import type { ComparisonResult } from './types';

export function getComparison(todayVal: number, yesterdayVal: number): ComparisonResult {
  if (yesterdayVal <= 0) return null;
  const diff = todayVal - yesterdayVal;
  const pct = Math.round((diff / yesterdayVal) * 100);
  if (pct > 0) return { pct, direction: 'up' };
  if (pct < 0) return { pct: Math.abs(pct), direction: 'down' };
  return { pct: 0, direction: 'same' };
}

export function getGreetingKey(hour: number): 'good_morning' | 'good_afternoon' | 'good_evening' | 'good_night' {
  if (hour >= 5 && hour < 12) return 'good_morning';
  if (hour >= 12 && hour < 17) return 'good_afternoon';
  if (hour >= 17 && hour < 21) return 'good_evening';
  return 'good_night';
}

export function getGreetingPeriod(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}
