'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useSettingsStore } from '@/stores/settings-store';
import { useEffect, useState } from 'react';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettingsStore();
  const [messages, setMessages] = useState<any>(null);

  useEffect(() => {
    // Keep <html lang> in sync so formatPriceGlobal / isBengali() work outside hooks
    if (typeof document !== 'undefined') {
      document.documentElement.lang = settings.app_language === 'bn' ? 'bn' : 'en';
    }

    const loaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
      bn: () => import('../../../messages/bn.json'),
      en: () => import('../../../messages/en.json'),
    };

    const loader = loaders[settings.app_language] ?? loaders.en;
    loader()
      .then((mod) => setMessages(mod.default))
      .catch((err) => {
        console.error('Failed to load translations', err);
        loaders.en().then((mod) => setMessages(mod.default));
      });
  }, [settings.app_language]);

  // Optionally show a loading state while translations are loading
  if (!messages) {
    return null;
  }

  return (
    <NextIntlClientProvider
      locale={settings.app_language}
      messages={messages}
      onError={(error) => {
        if (error.code === 'MISSING_MESSAGE') return;
        console.error(error);
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
