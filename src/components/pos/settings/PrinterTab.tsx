import { useState } from "react";
import { useTranslations } from "next-intl";
import { AppSettings } from "@/stores/settings-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Save, Bluetooth, Printer } from "lucide-react";
import { PrinterService } from "@/lib/printer-service";
import { useToast } from "@/hooks/use-toast";

interface PrinterTabProps {
  localSettings: AppSettings;
  handleChange: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  handleSave: (sectionKeys: (keyof AppSettings)[]) => void;
  isSaving: boolean;
  hasChanges: () => boolean;
}

export default function PrinterTab({ localSettings, handleChange, handleSave, isSaving, hasChanges }: PrinterTabProps) {
  const t = useTranslations("Settings");
  const { toast } = useToast();
  const [isConnectingBt, setIsConnectingBt] = useState(false);
  const [isTestPrinting, setIsTestPrinting] = useState(false);
  const [btDeviceName, setBtDeviceName] = useState<string | null>(null);

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

        {/* Hardware Bluetooth ESC/POS Printer Direct Connection */}
        <div className="rounded-xl border bg-gradient-to-br from-blue-50/60 to-indigo-50/40 dark:from-blue-950/20 dark:to-indigo-950/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <Bluetooth className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold">ব্লুটুথ থার্মাল প্রিন্টার (ESC/POS)</h4>
                <p className="text-xs text-muted-foreground">
                  {btDeviceName ? `সংযুক্ত: ${btDeviceName}` : 'কোনো প্রিন্টার সংযুক্ত নেই (Web Bluetooth)'}
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isConnectingBt}
              onClick={async () => {
                setIsConnectingBt(true);
                try {
                  const dev = await PrinterService.connectBluetooth();
                  if (dev) {
                    setBtDeviceName(dev.name || 'Bluetooth Printer');
                    toast({ title: 'প্রিন্টার সংযুক্ত', description: `${dev.name || 'Printer'} সফলভাবে যুক্ত হয়েছে।` });
                  }
                } catch (err: any) {
                  toast({
                    title: 'কানেকশন ব্যর্থ',
                    description: err.message || 'Bluetooth connection failed',
                    variant: 'destructive',
                  });
                } finally {
                  setIsConnectingBt(false);
                }
              }}
              className="gap-1.5 h-8 text-xs border-blue-200 dark:border-blue-800"
            >
              {isConnectingBt ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5" />}
              {btDeviceName ? 'পুনরায় যুক্ত করুন' : 'প্রিন্টার যুক্ত করুন'}
            </Button>
          </div>

          <div className="flex items-center justify-between pt-1 border-t border-blue-100 dark:border-blue-900/40">
            <span className="text-xs text-muted-foreground">কানেকশন যাচাই করতে টেস্ট স্লিপ প্রিন্ট করুন:</span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isTestPrinting}
              onClick={async () => {
                setIsTestPrinting(true);
                try {
                  const testSale: any = {
                    id: 'test-print',
                    invoiceNumber: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
                    createdAt: new Date(),
                    subtotal: 100,
                    discount: 0,
                    tax: 0,
                    totalAmount: 100,
                    amountPaid: 100,
                    paymentMethod: 'CASH',
                    items: [
                      {
                        id: 'item-1',
                        productId: 'prod-1',
                        productName: 'টেস্ট পণ্য (Test Item)',
                        quantity: 1,
                        unitPrice: 100,
                        totalPrice: 100,
                      },
                    ],
                  };
                  const testBusiness = {
                    name: localSettings.store_name || 'My Store',
                    address: localSettings.store_address,
                    phone: localSettings.store_phone,
                    currency: '₹',
                  };
                  await PrinterService.printReceipt(
                    testSale,
                    testBusiness,
                    (localSettings.print_paper_size === '80mm' ? '80mm' : '58mm')
                  );
                  toast({ title: 'টেস্ট প্রিন্ট সফল', description: 'প্রিন্টারে সিগন্যাল পাঠানো হয়েছে।' });
                } catch (err: any) {
                  toast({
                    title: 'প্রিন্ট ব্যর্থ',
                    description: err.message || 'Could not print test slip',
                    variant: 'destructive',
                  });
                } finally {
                  setIsTestPrinting(false);
                }
              }}
              className="h-7 text-xs gap-1"
            >
              <Printer className="w-3 h-3" />
              টেস্ট প্রিন্ট স্লিপ
            </Button>
          </div>
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
