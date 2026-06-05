import { useTranslations } from "next-intl";
import { AppSettings } from "@/stores/settings-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Save } from "lucide-react";

interface PrinterTabProps {
  localSettings: AppSettings;
  handleChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  handleSave: (sectionKeys: (keyof AppSettings)[]) => void;
  isSaving: boolean;
  hasChanges: () => boolean;
}

export default function PrinterTab({ localSettings, handleChange, handleSave, isSaving, hasChanges }: PrinterTabProps) {
  const t = useTranslations("Settings");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("printer_title")}</CardTitle>
        <CardDescription>{t("printer_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3">
          <Label className="text-sm font-medium">{t("paper_size")}</Label>
          <RadioGroup
            value={localSettings.print_paper_size}
            onValueChange={(val) => handleChange("print_paper_size", val as "58mm" | "80mm" | "A4" | "A5")}
            className="flex flex-wrap gap-4"
          >
            {(["58mm", "80mm", "A4", "A5"] as const).map((size) => (
              <div key={size} className="flex items-center space-x-2">
                <RadioGroupItem value={size} id={size} />
                <Label htmlFor={size}>{size}{size.includes("mm") ? " (Thermal)" : ""}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-2">
          <Label>{t("font_size")}</Label>
          <Select value={localSettings.print_font_size} onValueChange={(val) => handleChange("print_font_size", val as "small" | "medium" | "large")}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="small">{t("font_small")}</SelectItem>
              <SelectItem value="medium">{t("font_medium")}</SelectItem>
              <SelectItem value="large">{t("font_large")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>{t("receipt_header")} <span className="text-muted-foreground font-normal">({t("max_chars")})</span></Label>
          <Textarea
            maxLength={100}
            placeholder="Custom header text for receipts"
            value={localSettings.print_header}
            onChange={(e) => handleChange("print_header", e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>{t("receipt_footer")} <span className="text-muted-foreground font-normal">({t("max_chars")})</span></Label>
          <Textarea
            maxLength={100}
            placeholder="Thank you message, terms, etc."
            value={localSettings.print_footer}
            onChange={(e) => handleChange("print_footer", e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">{t("auto_print")}</Label>
            <p className="text-xs text-muted-foreground">{t("auto_print_desc")}</p>
          </div>
          <Switch
            checked={localSettings.auto_print}
            onCheckedChange={(val) => handleChange("auto_print", val)}
          />
        </div>

        <div className="pt-2 flex justify-end">
          <Button onClick={() => handleSave(["print_paper_size", "print_font_size", "print_header", "print_footer", "auto_print"])} disabled={isSaving || !hasChanges()} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {t("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
