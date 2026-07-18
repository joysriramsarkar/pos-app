'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, BellRing, AlertTriangle, CircleAlert, Wallet, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  type: 'low_stock' | 'out_of_stock' | 'due_payment';
  title: string;
  message: string;
  icon: 'alert' | 'critical' | 'wallet';
  createdAt: string;
  read: boolean;
  referenceId?: string;
}

interface NotificationsResponse {
  success: boolean;
  data: NotificationItem[];
  unreadCount: number;
}

function getTimeAgo(dateStr: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return t('just_now');
  if (diffMinutes < 60) return t('minutes_ago', { count: diffMinutes });
  if (diffHours < 24) return t('hours_ago', { count: diffHours });
  return t('days_ago', { count: diffDays });
}

function getNotificationIcon(type: NotificationItem['type']) {
  switch (type) {
    case 'out_of_stock':
      return <CircleAlert className="h-4 w-4 text-red-500 shrink-0" />;
    case 'low_stock':
      return <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />;
    case 'due_payment':
      return <Wallet className="h-4 w-4 text-orange-500 shrink-0" />;
  }
}

function getNotificationBg(type: NotificationItem['type'], read: boolean) {
  if (read) return '';
  switch (type) {
    case 'out_of_stock':
      return 'bg-red-50 dark:bg-red-950/30';
    case 'low_stock':
      return 'bg-orange-50 dark:bg-orange-950/30';
    case 'due_payment':
      return 'bg-orange-50 dark:bg-orange-950/30';
  }
}

interface NotificationBellProps {
  variant?: 'desktop' | 'mobile';
}

export default function NotificationBell({ variant = 'desktop' }: NotificationBellProps) {
  const t = useTranslations('Notifications');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const raw = localStorage.getItem('pos-notif-read-ids');
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as string[]);
    } catch {
      return new Set();
    }
  });

  const persistReadIds = useCallback((ids: Set<string>) => {
    try {
      // Keep last 200 ids only
      const arr = Array.from(ids).slice(-200);
      localStorage.setItem('pos-notif-read-ids', JSON.stringify(arr));
    } catch {
      /* ignore quota */
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data: NotificationsResponse = await res.json();
        const list = data.data || [];
        setNotifications(list);
        const unread = list.filter((n) => !readIds.has(n.id)).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error('বিজ্ঞপ্তি আনতে ত্রুটি:', error);
    } finally {
      setLoading(false);
    }
  }, [readIds]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const newSet = new Set(prev);
      newSet.add(id);
      persistReadIds(newSet);
      return newSet;
    });
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, [persistReadIds]);

  const markAllAsRead = useCallback(() => {
    setReadIds((prev) => {
      const newSet = new Set(prev);
      notifications.forEach((n) => newSet.add(n.id));
      persistReadIds(newSet);
      return newSet;
    });
    setUnreadCount(0);
  }, [notifications, persistReadIds]);

  const isRead = useCallback(
    (id: string) => readIds.has(id),
    [readIds]
  );

  const effectiveUnreadCount = unreadCount;

  const isMobile = variant === 'mobile';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative text-muted-foreground hover:text-foreground hover:bg-accent",
            isMobile ? "h-8 w-8" : "h-9 w-9"
          )}
        >
          {effectiveUnreadCount > 0 ? (
            <BellRing className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'} animate-swing`} />
          ) : (
            <Bell className={isMobile ? 'h-4 w-4' : 'h-5 w-5'} />
          )}
          {effectiveUnreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center text-[10px] font-bold bg-red-500 text-white border-0 animate-pulse"
            >
              {effectiveUnreadCount > 9 ? '৯+' : effectiveUnreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[calc(100vw-2rem)] sm:w-96 p-0"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-emerald-600" />
            <h3 className="font-semibold text-sm">{t('title')}</h3>
            {effectiveUnreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] h-5 px-1.5 bg-emerald-100 text-emerald-700">
                {effectiveUnreadCount}
              </Badge>
            )}
          </div>
          {effectiveUnreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              onClick={markAllAsRead}
            >
              <Check className="h-3 w-3 mr-1" />
              {t('mark_all_read')}
            </Button>
          )}
        </div>

        {/* Notifications List */}
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4">
              <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <Bell className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">{t('no_notifications')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const read = isRead(notification.id);
                return (
                  <div
                    key={notification.id}
                    className={`p-3 transition-colors ${getNotificationBg(notification.type, read)} ${!read ? 'border-l-2' : ''} ${
                      notification.type === 'out_of_stock' && !read
                        ? 'border-l-red-500'
                        : notification.type === 'low_stock' && !read
                          ? 'border-l-orange-500'
                          : notification.type === 'due_payment' && !read
                            ? 'border-l-orange-500'
                            : 'border-l-transparent'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">{getNotificationIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-xs font-medium line-clamp-2 ${read ? 'text-muted-foreground' : 'text-foreground'}`}>
                            {notification.title}
                          </p>
                          {!read && (
                            <div className="h-2 w-2 rounded-full bg-emerald-500 shrink-0 mt-1" />
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 line-clamp-2 ${read ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-[10px] text-muted-foreground/60">
                            {getTimeAgo(notification.createdAt, t)}
                          </span>
                          {!read && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-[10px] px-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => markAsRead(notification.id)}
                            >
                              <Check className="h-2.5 w-2.5 mr-0.5" />
                              {t('mark_read')}
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>

      {/* Animation keyframes */}
      <style jsx global>{`
        @keyframes swing {
          0%, 100% { transform: rotate(0deg); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-12deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-6deg); }
          75% { transform: rotate(3deg); }
        }
        .animate-swing {
          animation: swing 1s ease-in-out;
        }
      `}</style>
    </Popover>
  );
}
