import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface AppSettings {
  // Store Profile
  store_name: string;
  store_name_bn: string;
  store_address: string;
  store_phone: string;
  store_gst: string;
  store_logo: string;

  // Printer Settings
  print_paper_size: '58mm' | '80mm' | 'A4' | 'A5';
  print_font_size: 'small' | 'medium' | 'large';
  print_header: string;
  print_footer: string;
  auto_print: boolean;

  // Theme Settings
  theme_mode: 'light' | 'dark' | 'system';
  primary_color: string;

  // Language Settings
  app_language: 'bn' | 'en';
  receipt_language: 'bn' | 'en' | 'both';

  // Billing Settings
  default_discount: number;
  tax_rate: number;
  currency_symbol: string;
  round_off: boolean;
}

const defaultSettings: AppSettings = {
  store_name: 'Onuron POS',
  store_name_bn: 'অনুরণ পিওএস',
  store_address: '',
  store_phone: '',
  store_gst: '',
  store_logo: '',

  print_paper_size: '80mm',
  print_font_size: 'medium',
  print_header: '',
  print_footer: 'আপনার সাথে কেনাকাটা করার জন্য ধন্যবাদ!',
  auto_print: true,

  theme_mode: 'system',
  primary_color: '#16a34a', // green

  app_language: 'bn',
  receipt_language: 'bn',

  default_discount: 0,
  tax_rate: 0,
  currency_symbol: '₹',
  round_off: false,
};

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  setSettings: (settings: Partial<AppSettings>) => void;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  fetchSettings: () => Promise<void>;
  saveSettings: (settingsToSave: Partial<AppSettings>) => Promise<boolean>;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      settings: defaultSettings,
      isLoading: false,

      setSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      updateSetting: (key, value) => {
        set((state) => ({
          settings: { ...state.settings, [key]: value },
        }));
      },

      fetchSettings: async () => {
        set({ isLoading: true });
        try {
          const res = await fetch('/api/settings');
          if (!res.ok) {
            console.error('Failed to fetch settings:', res.statusText);
            return;
          }
          const data = await res.json();
          if (data.success && data.data) {
            // Merge defaults with fetched settings
            const fetched = data.data;
            const updated: any = {};
            for (const key of Object.keys(defaultSettings)) {
              if (fetched[key] !== undefined) {
                // Convert string values back to their proper types
                if (key === 'auto_print' || key === 'round_off') {
                  updated[key] = fetched[key] === 'true';
                } else if (key === 'default_discount' || key === 'tax_rate') {
                  updated[key] = Number(fetched[key]);
                } else {
                  updated[key] = fetched[key];
                }
              }
            }
            set((state) => ({
              settings: { ...state.settings, ...updated },
            }));
          }
        } catch (error) {
          console.error('Failed to fetch settings:', error);
        } finally {
          set({ isLoading: false });
        }
      },

      saveSettings: async (settingsToSave) => {
        set({ isLoading: true });
        try {
          // Convert to string for API payload
          const payload: Record<string, string> = {};
          for (const [key, value] of Object.entries(settingsToSave)) {
            payload[key] = String(value);
          }

          const res = await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const data = await res.json();
          if (data.success) {
            get().setSettings(settingsToSave);
            return true;
          }
          return false;
        } catch (error) {
          console.error('Failed to save settings:', error);
          return false;
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'onuron-pos-settings',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
);
