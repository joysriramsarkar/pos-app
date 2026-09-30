'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Store,
  Sun,
  Moon,
  Languages,
  Clock,
  Lock,
  FileSpreadsheet,
} from 'lucide-react';
import NotificationBell from '@/components/pos/NotificationBell';
import { BusinessSwitcher } from '@/components/pos/BusinessSwitcher';
import { type PageType } from '@/app/pos/nav-config';
import { cn } from '@/lib/utils';

export interface POSTopBarProps {
  storeName: string;
  currentPage: PageType;
  pageTitle?: string;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  activeShift?: { id: string; openedAt: string; openingCash: number } | null;
  onOpenShiftModal?: () => void;
  onOpenImportModal?: () => void;
  onFastLock?: () => void;
  resolvedTheme: string;
  toggleTheme: () => void;
  toggleLanguage: () => void;
}

export function POSTopBar({
  storeName,
  currentPage,
  pageTitle,
  isOnline,
  isSyncing,
  pendingCount,
  activeShift,
  onOpenShiftModal,
  onOpenImportModal,
  onFastLock,
  resolvedTheme,
  toggleTheme,
  toggleLanguage,
}: POSTopBarProps) {
  return (
    <header className="shrink-0 border-b border-border/50 bg-card/85 backdrop-blur-md px-3 py-1.5 pt-[calc(env(safe-area-inset-top)+0.25rem)] no-print sticky top-0 z-20 transition-colors">
      <div className="flex items-center justify-between gap-2 min-h-10">
        {/* Left: Store identity & page title */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shadow-xs shrink-0 border border-primary/20">
            <Store className="w-4 h-4 text-primary" />
          </div>
          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5">
              <h1 className="font-bold text-xs sm:text-sm bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent truncate leading-tight">
                {storeName}
              </h1>
              <BusinessSwitcher storeName={storeName} />
            </div>
            {pageTitle && currentPage !== 'billing' && (
              <span className="text-[10px] text-muted-foreground truncate leading-none mt-0.5">
                {pageTitle}
              </span>
            )}
          </div>
        </div>

        {/* Center: Shift status chip & Import quick button */}
        <div className="hidden md:flex items-center gap-2">
          {onOpenShiftModal && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenShiftModal}
              className={cn(
                'h-7 px-2.5 text-xs font-medium rounded-full border transition-all gap-1.5',
                activeShift
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
              )}
            >
              <Clock className="w-3 h-3" />
              <span>{activeShift ? 'শিফট চালু' : 'শিফট শুরু করুন'}</span>
            </Button>
          )}

          {onOpenImportModal && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenImportModal}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
              title="ইম্পোর্ট / এক্সপোর্ট"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">CSV ইম্পোর্ট</span>
            </Button>
          )}
        </div>

        {/* Right: Connectivity & Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Connectivity Badges */}
          <div className="flex items-center gap-1 mr-1">
            {!isOnline ? (
              <Badge
                variant="secondary"
                className="text-[10px] h-6 px-1.5 bg-amber-500/15 text-amber-700 dark:text-amber-400 border-0 font-medium"
              >
                <WifiOff className="w-3 h-3 mr-1" />
                অফলাইন
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className="hidden sm:inline-flex text-[10px] h-6 px-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0 font-medium"
              >
                <Wifi className="w-3 h-3 mr-1" />
                অনলাইন
              </Badge>
            )}

            {isSyncing && (
              <Badge variant="outline" className="text-[10px] h-6 px-1.5 gap-1 border-primary/30">
                <RefreshCw className="w-2.5 h-2.5 animate-spin text-primary" />
                সিঙ্ক হচ্ছে
              </Badge>
            )}

            {pendingCount > 0 && (
              <Badge variant="outline" className="text-[10px] h-6 px-1.5 text-amber-600 border-amber-300">
                {pendingCount} পেন্ডিং
              </Badge>
            )}
          </div>

          {/* Quick Lock / Fast Switch Cashier PIN */}
          {onFastLock && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onFastLock}
              className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/10 touch-manipulation"
              title="ক্যাশিয়ার লক"
            >
              <Lock className="h-3.5 w-3.5" />
            </Button>
          )}

          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/10 touch-manipulation"
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
          </Button>

          {/* Language Switch */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleLanguage}
            className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-primary/10 touch-manipulation"
            aria-label="Toggle language"
          >
            <Languages className="h-3.5 w-3.5" />
          </Button>

          {/* Notification Bell */}
          <NotificationBell variant="mobile" />
        </div>
      </div>
    </header>
  );
}
