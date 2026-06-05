import { useTranslations } from "next-intl";
import { AppSettings } from "@/stores/settings-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";

interface LanguageTabProps {
  localSettings: AppSettings;
  handleChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  handleSave: (sectionKeys: (keyof AppSettings)[]) => void;
  isSaving: boolean;
  hasChanges: () => boolean;
}

export default function LanguageTab({ localSettings, handleChange, handleSave, isSaving, hasChanges }: LanguageTabProps) {
  const t = useTranslations("Settings");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("language_title")}</CardTitle>
        <CardDescription>{t("language_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>{t("app_language")}</Label>
          <Select value={localSettings.app_language} onValueChange={(val) => handleChange("app_language", val as "en" | "bn")}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bn">বাংলা (Bengali)</SelectItem>
              <SelectItem value="en">English (ইংরেজি)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("receipt_language")}</Label>
          <Select value={localSettings.receipt_language} onValueChange={(val) => handleChange("receipt_language", val as "en" | "bn")}>
            <SelectTrigger className="w-full md:w-[300px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bn">বাংলা (Bengali)</SelectItem>
              <SelectItem value="en">English (ইংরেজি)</SelectItem>
              <SelectItem value="both">দুটোই (Both)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="pt-2 flex justify-end">
          <Button onClick={() => handleSave(["app_language", "receipt_language"])} disabled={isSaving || !hasChanges()} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
