'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { signOut } from 'next-auth/react';
import { useCartStore } from '@/stores/pos-store';
import { useSettingsStore } from '@/stores/settings-store';
import { NetworkStatusMonitor, type NetworkStatus } from './network-listener';
import { getSyncWorker } from './sync-worker';
import { SyncQueueDB } from './indexeddb';

interface OfflineContextType {
  isOnline: boolean;
  networkStatus: NetworkStatus;
  isSyncing: boolean;
  syncStats: { synced: number; failed: number; total: number } | null;
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined);

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>('online');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStats, setSyncStats] = useState<{ synced: number; failed: number; total: number } | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const [failedSyncPreview, setFailedSyncPreview] = useState<string | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  useEffect(() => {
    let monitor: NetworkStatusMonitor | null = null;
    let cleanup = () => {};

    async function initialize() {
      try {
        monitor = new NetworkStatusMonitor();

        try {
          await getSyncWorker();
        } catch (syncError) {
          console.error('⚠️ Failed to initialize sync worker:', syncError);
        }

        const refreshCounts = async () => {
          try {
            const [unsynced, failed] = await Promise.all([
              SyncQueueDB.getUnsynced(),
              SyncQueueDB.getFailed(),
            ]);
            setPendingSyncCount(unsynced.length);
            setFailedSyncCount(failed.length);
            const firstFailed = failed[0];
            setFailedSyncPreview(
              firstFailed
                ? `${firstFailed.entityType}.${firstFailed.action}: ${firstFailed.error || 'Unknown sync error'}`
                : null
            );
          } catch (readError) {
            console.warn('Unable to read sync counts', readError);
          }
        };

        const handleNetworkStatus = (status: NetworkStatus) => {
          setNetworkStatus(status);
          refreshCounts().catch(console.error);
          if (status === 'online') setLastSyncTime(new Date());
        };

        const handleSyncComplete = async (event: Event) => {
          const stats = (event as CustomEvent).detail;
          setSyncStats(stats);
          setIsSyncing(false);
          setLastSyncTime(new Date());
          refreshCounts().catch(console.error);
        };

        const handleSyncStart = () => setIsSyncing(true);

        const handleSessionExpired = () => {
          setIsSyncing(false);
          signOut({ callbackUrl: '/login' });
        };

        monitor.subscribe(handleNetworkStatus);

        refreshCounts().catch(console.error);

        window.addEventListener('offlineSyncComplete', handleSyncComplete);
        window.addEventListener('offlineSyncStart', handleSyncStart);
        window.addEventListener('syncSessionExpired', handleSessionExpired);

        cleanup = () => {
          window.removeEventListener('offlineSyncComplete', handleSyncComplete);
          window.removeEventListener('offlineSyncStart', handleSyncStart);
          window.removeEventListener('syncSessionExpired', handleSessionExpired);
        };

        setNetworkStatus(monitor.getStatus());
      } catch (error) {
        console.error('❌ Failed to initialize offline provider:', error);
        setNetworkStatus('offline');
      }
    }

    initialize();

    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    const callback = () => {
      useCartStore.persist.rehydrate();
      useSettingsStore.persist.rehydrate();
    };

    let handle: number;

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      handle = (window as any).requestIdleCallback(callback, { timeout: 2000 });
    } else {
      handle = (globalThis as any).setTimeout(callback, 200);
    }

    return () => {
      if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(handle);
      } else {
        clearTimeout(handle);
      }
    };
  }, []);

  return (
    <OfflineContext.Provider value={{ isOnline: networkStatus === 'online', networkStatus, isSyncing, syncStats }}>
      {children}
      {(networkStatus === 'offline' || isSyncing) && (
        <div className="fixed top-0 left-1/2 -translate-x-1/2 bg-amber-500 text-white px-2 py-1 text-xs z-50">
          offline, sync pending: {pendingSyncCount}
        </div>
      )}
      {failedSyncCount > 0 && !isSyncing && networkStatus === 'online' && (
        <div className="fixed top-4 right-4 bg-orange-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          ⚠️ {failedSyncCount} item{failedSyncCount > 1 ? 's' : ''} failed to sync
          {failedSyncPreview && (
            <div className="text-xs mt-1 text-white/90 max-w-xs truncate" title={failedSyncPreview}>
              {failedSyncPreview}
            </div>
          )}
          <div className="text-xs mt-1 text-white/90">Retry after fixing the conflict, stock, or login issue.</div>
        </div>
      )}
    </OfflineContext.Provider>
  );
}

export function useOfflineContext() {
  const context = useContext(OfflineContext);
  if (context === undefined) {
    throw new Error('useOfflineContext must be used within OfflineProvider');
  }
  return context;
}
