'use client';

import dynamic from 'next/dynamic';
import { ErrorBoundary } from '@/components/ErrorBoundary';

const POSDashboard = dynamic(
  () => import('@/app/pos/POSDashboard').then((mod) => mod.POSDashboard),
  { ssr: false }
);

export default function Home() {
  return (
    <ErrorBoundary>
      <POSDashboard />
    </ErrorBoundary>
  );
}
