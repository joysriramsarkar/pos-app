'use client';

import React from 'react';
import { type PageType, type NavItem } from '@/app/pos/nav-config';
import { cn } from '@/lib/utils';
import { ShoppingCart } from 'lucide-react';
import { useTranslations } from 'next-intl';

export interface POSMobileBottomNavProps {
  currentPage: PageType;
  onNavigate: (page: PageType) => void;
  navItems: NavItem[];
  cartCount: number;
  onOpenCart: () => void;
  onOpenMore: () => void;
  isVisible?: boolean;
}

export function POSMobileBottomNav({
  currentPage,
  onNavigate,
  navItems,
  cartCount,
  onOpenCart,
  onOpenMore,
  isVisible = true,
}: POSMobileBottomNavProps) {
  const t = useTranslations('Navigation');

  if (!isVisible) return null;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-card/90 backdrop-blur-lg border-t border-border/60 pb-[env(safe-area-inset-bottom)] no-print shadow-lg transition-transform duration-200">
      <div className="flex items-center justify-around h-14 px-1 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isCart = (item.id as string) === 'cart_nav' || (item.id as string) === 'cart';
          const isMore = item.id === 'more';
          const isActive = currentPage === item.id;

          const handleClick = () => {
            if (isCart) {
              onOpenCart();
            } else if (isMore) {
              onOpenMore();
            } else {
              onNavigate(item.id as PageType);
            }
          };

          return (
            <button
              key={item.id}
              onClick={handleClick}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full py-1 px-0.5 transition-all select-none touch-manipulation',
                isActive
                  ? 'text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground active:scale-95'
              )}
            >
              <div className="relative flex items-center justify-center">
                <div
                  className={cn(
                    'p-1 rounded-xl transition-all',
                    isActive && 'bg-primary/15'
                  )}
                >
                  {item.icon}
                </div>

                {isCart && cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-2 bg-primary text-primary-foreground text-[10px] font-bold h-4 min-w-4 px-1 rounded-full flex items-center justify-center animate-scale-in shadow-xs">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 truncate max-w-[64px] text-center leading-tight">
                {t(item.id as any) || item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
