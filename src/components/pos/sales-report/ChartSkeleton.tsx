'use client';

export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div className="w-full animate-pulse" style={{ height }}>
      <div className="h-full rounded-lg bg-muted/50 relative overflow-hidden">
        <div className="absolute inset-0 flex items-end justify-around px-4 pb-4 gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-t-sm bg-muted"
              style={{ height: `${30 + Math.sin(i * 0.8) * 25 + Math.random() * 20}%`, opacity: 0.6 + i * 0.03 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
