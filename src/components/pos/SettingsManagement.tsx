"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useSettingsStore, AppSettings } from "@/stores/settings-store";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Store, Printer, Database, Palette, Users, Globe, Receipt, Key } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTheme } from "@/components/providers/ThemeProvider";
import { UsersManagement } from "./UsersManagement";

import ProfileTab from "./settings/ProfileTab";
import PrinterTab from "./settings/PrinterTab";
import BackupTab from "./settings/BackupTab";
import ThemeTab from "./settings/ThemeTab";
import UsersTab from "./settings/UsersTab";
import LanguageTab from "./settings/LanguageTab";
import BillingTab from "./settings/BillingTab";

export default function SettingsManagement() {
  const t = useTranslations("Settings");
  const { settings, fetchSettings, saveSettings } = useSettingsStore();
  const { toast } = useToast();
  const { data: session } = useSession();
  const { setTheme } = useTheme();

  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocalSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async (sectionKeys: (keyof AppSettings)[]) => {
    setIsSaving(true);
    try {
      const payload: any = {};
      sectionKeys.forEach(key => {
        payload[key] = localSettings[key];
      });

      const success = await saveSettings(payload as Partial<AppSettings>);
      if (success) {
        toast({ title: t("success"), description: t("success") });

        // Special logic for theme saving
        if (sectionKeys.includes("theme_mode")) {
          setTheme(localSettings.theme_mode);
        }

        // Special logic for language saving
        if (sectionKeys.includes("app_language")) {
          setTimeout(() => window.location.reload(), 500);
        }
      } else {
        toast({ variant: "destructive", title: t("error"), description: t("error") });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Change detection helpers for each section
  const hasProfileChanges = (): boolean => {
    return localSettings.store_name !== settings.store_name ||
           localSettings.store_name_bn !== settings.store_name_bn ||
           localSettings.store_address !== settings.store_address ||
           localSettings.store_phone !== settings.store_phone ||
           localSettings.store_gst !== settings.store_gst ||
           localSettings.store_logo !== settings.store_logo;
  };

  const hasPrinterChanges = (): boolean => {
    return localSettings.print_paper_size !== settings.print_paper_size ||
           localSettings.print_font_size !== settings.print_font_size ||
           localSettings.print_header !== settings.print_header ||
           localSettings.print_footer !== settings.print_footer ||
           localSettings.auto_print !== settings.auto_print;
  };

  const hasThemeChanges = (): boolean => {
    return localSettings.theme_mode !== settings.theme_mode ||
           localSettings.primary_color !== settings.primary_color;
  };

  const hasLanguageChanges = (): boolean => {
    return localSettings.app_language !== settings.app_language ||
           localSettings.receipt_language !== settings.receipt_language;
  };

  const hasBillingChanges = (): boolean => {
    return localSettings.default_discount !== settings.default_discount ||
           localSettings.tax_rate !== settings.tax_rate ||
           localSettings.currency_symbol !== settings.currency_symbol ||
           localSettings.round_off !== settings.round_off;
  };

  const tabs = [
    { value: "profile", label: t("profile"), icon: Store, hasChanges: hasProfileChanges },
    { value: "printer", label: t("printer"), icon: Printer, hasChanges: hasPrinterChanges },
    { value: "billing", label: t("billing"), icon: Receipt, hasChanges: hasBillingChanges },
    { value: "theme", label: t("theme"), icon: Palette, hasChanges: hasThemeChanges },
    { value: "language", label: t("language"), icon: Globe, hasChanges: hasLanguageChanges },
    { value: "users", label: t("users"), icon: Users, hasChanges: () => false },
    { value: "password", label: t("change_password"), icon: Key, hasChanges: () => false },
    { value: "backup", label: t("backup"), icon: Database, hasChanges: () => false },
  ];

  return (
    <div className="flex flex-col h-full bg-muted/20">
      <div className="shrink-0 border-b bg-background px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Store className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold leading-tight">{t("title")}</h1>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-scroll p-3 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col md:flex-row gap-4 md:gap-6 items-stretch md:items-start w-full">
            {/* Mobile View: Select Dropdown to switch tabs */}
            <div className="w-full md:hidden mb-1">
              <Select value={activeTab} onValueChange={setActiveTab}>
                <SelectTrigger className="w-full h-11 bg-background border border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tabs.map(({ value, label, icon: Icon, hasChanges: tabHasChanges }) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <span>{label}</span>
                        {tabHasChanges() && (
                          <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />
                        )}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Desktop View: Normal vertical tabs sidebar */}
            <TabsList className="hidden md:flex flex-row md:flex-col h-auto w-full md:w-52 bg-transparent p-0 justify-start md:items-start overflow-x-auto no-scrollbar border-b md:border-b-0 md:border-r border-border pb-2 md:pb-0 md:pr-3 shrink-0 md:sticky md:top-0 md:h-fit">
              {tabs.map(({ value, label, icon: Icon, hasChanges: tabHasChanges }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="md:w-full h-auto justify-start text-left gap-2 px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground hover:bg-muted rounded-md whitespace-nowrap relative"
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="text-sm">{label}</span>
                  {tabHasChanges() && (
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 ml-auto shrink-0" />
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex-1 min-w-0 w-full">
              <TabsContent value="profile" className="m-0 focus-visible:outline-none focus-visible:ring-0">
                <ProfileTab localSettings={localSettings} handleChange={handleChange} handleSave={handleSave} isSaving={isSaving} hasChanges={hasProfileChanges} />
              </TabsContent>
              <TabsContent value="printer" className="m-0 focus-visible:outline-none focus-visible:ring-0">
                <PrinterTab localSettings={localSettings} handleChange={handleChange} handleSave={handleSave} isSaving={isSaving} hasChanges={hasPrinterChanges} />

              </TabsContent>
              <TabsContent value="billing" className="m-0 focus-visible:outline-none focus-visible:ring-0">
                <BillingTab localSettings={localSettings} handleChange={handleChange} handleSave={handleSave} isSaving={isSaving} hasChanges={hasBillingChanges} />
              </TabsContent>
              <TabsContent value="theme" className="m-0 focus-visible:outline-none focus-visible:ring-0">
                <ThemeTab localSettings={localSettings} handleChange={handleChange} handleSave={handleSave} isSaving={isSaving} hasChanges={hasThemeChanges} />
              </TabsContent>
              <TabsContent value="language" className="m-0 focus-visible:outline-none focus-visible:ring-0">
                <LanguageTab localSettings={localSettings} handleChange={handleChange} handleSave={handleSave} isSaving={isSaving} hasChanges={hasLanguageChanges} />
              </TabsContent>
              <TabsContent value="users" className="m-0 focus-visible:outline-none focus-visible:ring-0">
                <UsersManagement />
              </TabsContent>
              <TabsContent value="password" className="m-0 focus-visible:outline-none focus-visible:ring-0">
                <UsersTab session={session} />
              </TabsContent>
              <TabsContent value="backup" className="m-0 focus-visible:outline-none focus-visible:ring-0">
                <BackupTab />
              </TabsContent>
            </div>
          </Tabs>
      </div>
    </div>
  );
}
