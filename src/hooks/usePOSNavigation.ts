'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { type PageType } from '@/app/pos/nav-config';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { resolveBackNavigation } from '@/lib/back-navigation';

export interface UsePOSNavigationOptions {
  initialPage?: PageType;
  onExitApp?: () => void;
}

export function usePOSNavigation(options: UsePOSNavigationOptions = {}) {
  const { initialPage = 'billing', onExitApp } = options;
  const [currentPage, setCurrentPage] = useState<PageType>(initialPage);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Lazy-mounted pages state tracker
  const [mountedPages, setMountedPages] = useState<Record<string, boolean>>({
    billing: true,
  });

  // Navigation history stack for Android hardware and screen back button
  const navStackRef = useRef<PageType[]>([initialPage]);

  // Track page transitions in navigation stack
  useEffect(() => {
    const stack = navStackRef.current;
    if (stack[stack.length - 1] === currentPage) return;

    if (stack.length > 1 && stack[stack.length - 2] === currentPage) {
      stack.pop();
    } else {
      stack.push(currentPage);
    }

    // Mark current page as mounted
    setMountedPages((prev) => (prev[currentPage] ? prev : { ...prev, [currentPage]: true }));
  }, [currentPage]);

  // Navigate back one step in history
  const goBack = useCallback(() => {
    // If mobile cart or more menu is open, close them first
    if (mobileCartOpen) {
      setMobileCartOpen(false);
      return;
    }
    if (moreMenuOpen) {
      setMoreMenuOpen(false);
      return;
    }

    const stack = navStackRef.current;
    if (stack.length > 1) {
      stack.pop(); // remove current
      const previous = stack[stack.length - 1] || 'billing';
      setCurrentPage(previous);
    } else if (currentPage !== 'billing') {
      setCurrentPage('billing');
    }
  }, [mobileCartOpen, moreMenuOpen, currentPage]);

  // Setup hardware back button for Android Capacitor
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const backButtonHandler = CapacitorApp.addListener('backButton', () => {
      if (moreMenuOpen) {
        setMoreMenuOpen(false);
        return;
      }
      if (mobileCartOpen) {
        setMobileCartOpen(false);
        return;
      }

      const decision = resolveBackNavigation({
        currentPage,
        stack: navStackRef.current,
        hasOpenOverlay: false,
      });

      if (decision.kind === 'navigate' && decision.page) {
        const stack = navStackRef.current;
        if (stack.length > 1) {
          stack.pop();
        }
        setCurrentPage(decision.page);
      } else if (decision.kind === 'exit' && onExitApp) {
        onExitApp();
      }
    });

    return () => {
      backButtonHandler.then((handle) => handle.remove()).catch(() => {});
    };
  }, [currentPage, moreMenuOpen, mobileCartOpen, onExitApp]);

  return {
    currentPage,
    setCurrentPage,
    mobileCartOpen,
    setMobileCartOpen,
    moreMenuOpen,
    setMoreMenuOpen,
    mountedPages,
    goBack,
    isMounted: (page: string) => Boolean(mountedPages[page]),
  };
}
