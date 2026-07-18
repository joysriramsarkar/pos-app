const REPORTS_CACHE_TTL = 30 * 60 * 1000;

export function getReportCache(key: string) {
  if (typeof window === 'undefined') return null;
  const cached = localStorage.getItem(`reports-cache-${key}`);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached);
    if (!parsed?.timestamp || parsed?.data === undefined) return null;
    if (Date.now() - parsed.timestamp > REPORTS_CACHE_TTL) return null;
    return parsed.data;
  } catch (err) {
    console.error('Invalid report cache:', err);
    return null;
  }
}

export function setReportCache(key: string, data: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(
    `reports-cache-${key}`,
    JSON.stringify({ data, timestamp: Date.now() }),
  );
}

export function buildReportCacheKey(tab: string, params: string) {
  return `${tab}:${params}`;
}
