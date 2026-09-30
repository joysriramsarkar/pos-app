'use client';

import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { type PageType, type NavItem } from '@/app/pos/nav-config';
import { cn } from '@/lib/utils';
import { LogOut, User } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface POSMoreMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPage: PageType;
  onSelectPage: (page: PageType) => void;
  menuItems: NavItem[];
  activeUser?: { name: string; username?: string } | null;
  userRole?: string | null;
  onLogout: () => void;
}

export function POSMoreMenu({
  open,
  onOpenChange,
  currentPage,
  onSelectPage,
  menuItems,
  activeUser,
  userRole,
  onLogout,
}: POSMoreMenuProps) {
  const t = useTranslations('Navigation');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl p-0 max-h-[85dvh] overflow-hidden pb-[calc(env(safe-area-inset-bottom)+0.5rem)] border-t border-border/60 bg-card/95 backdrop-blur-md shadow-2xl"
      >
        <SheetHeader className="px-4 pt-3.5 pb-2 border-b border-border/40">
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-muted-foreground/30" aria-hidden />
          <SheetTitle className="text-base font-semibold text-center">{t('more') || 'মেনু'}</SheetTitle>
        </SheetHeader>

        <div className="p-4 overflow-y-auto max-h-[calc(85dvh-5.5rem)] space-y-4 overscroll-contain">
          {/* Quick navigation items grid */}
          <div className="grid grid-cols-4 gap-2.5">
            {menuItems.map((item) => {
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-2.5 rounded-2xl transition-all duration-200 active:scale-95 touch-manipulation',
                    isActive
                      ? 'bg-primary/15 text-primary shadow-xs ring-1 ring-primary/30'
                      : 'hover:bg-muted/70 text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => {
                    onSelectPage(item.id as PageType);
                    onOpenChange(false);
                  }}
                >
                  <div
                    className={cn(
                      'h-11 w-11 rounded-2xl flex items-center justify-center transition-colors',
                      isActive ? 'bg-primary/20 text-primary' : 'bg-muted/80 text-foreground/80'
                    )}
                  >
                    {item.icon}
                  </div>
                  <span className="text-[11px] font-medium leading-tight text-center truncate w-full">
                    {t(item.id as any) || item.label}
                  </span>
                </button>
              );
            })}
          </div>

          <Separator className="bg-border/60" />

          {/* User profile & actions */}
          <div className="flex flex-col gap-3 pt-1 pb-2">
            {activeUser && (
              <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-muted/40 border border-border/40">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0 ring-2 ring-primary/20">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate leading-tight">{activeUser.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {userRole && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 h-4.5 uppercase font-bold tracking-wider text-muted-foreground border-border/60"
                      >
                        {userRole}
                      </Badge>
                    )}
                    {activeUser.username && (
                      <span className="text-xs text-muted-foreground truncate">@{activeUser.username}</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <Button
              variant="destructive"
              className="w-full gap-2 h-11 rounded-xl font-medium shadow-xs"
              onClick={() => {
                onOpenChange(false);
                onLogout();
              }}
            >
              <LogOut className="w-4 h-4" />
              <span>{t('logout') || 'লগআউট'}</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
