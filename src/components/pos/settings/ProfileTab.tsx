import { useRef } from "react";
import { useTranslations } from "next-intl";
import { AppSettings } from "@/stores/settings-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Upload, X } from "lucide-react";

interface ProfileTabProps {
  localSettings: AppSettings;
  handleChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  handleSave: (sectionKeys: (keyof AppSettings)[]) => void;
  isSaving: boolean;
  hasChanges: () => boolean;
}

export default function ProfileTab({ localSettings, handleChange, handleSave, isSaving, hasChanges }: ProfileTabProps) {
  const t = useTranslations("Settings");
  const logoInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      alert(t("logo_size_error"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => handleChange("store_logo", reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("profile_title")}</CardTitle>
        <CardDescription>{t("profile_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t("store_logo")}</Label>
          <div className="flex items-center gap-4">
            {localSettings.store_logo ? (
              <div className="relative w-20 h-20 rounded-lg border overflow-hidden bg-muted shrink-0">
                <img src={localSettings.store_logo} alt="Store logo" className="w-full h-full object-contain" />
                <button
                  onClick={() => handleChange("store_logo", "")}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/30 shrink-0">
                <Upload className="w-6 h-6 text-muted-foreground/50" />
              </div>
            )}
            <div className="space-y-1">
              <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                <Upload className="w-3.5 h-3.5 mr-1.5" />
                {t("upload_logo")}
              </Button>
              <p className="text-xs text-muted-foreground">{t("logo_hint")}</p>
            </div>
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("store_name_en")}</Label>
            <Input value={localSettings.store_name} onChange={(e) => handleChange("store_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("store_name_bn")}</Label>
            <Input value={localSettings.store_name_bn} onChange={(e) => handleChange("store_name_bn", e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("address")}</Label>
          <Textarea value={localSettings.store_address} onChange={(e) => handleChange("store_address", e.target.value)} rows={2} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("phone")}</Label>
            <Input value={localSettings.store_phone} onChange={(e) => handleChange("store_phone", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("gst")}</Label>
            <Input value={localSettings.store_gst} onChange={(e) => handleChange("store_gst", e.target.value)} placeholder="GSTIN number" />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button onClick={() => handleSave(["store_name", "store_name_bn", "store_address", "store_phone", "store_gst", "store_logo"])} disabled={isSaving || !hasChanges()} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
