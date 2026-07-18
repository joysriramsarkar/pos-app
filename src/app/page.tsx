'use client';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { POSDashboard } from '@/app/pos/POSDashboard';

export default function Home() {
  return (
    <ErrorBoundary>
      <POSDashboard />
    </ErrorBoundary>
  );
}
