import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { Download, Upload, Loader2 } from "lucide-react";

export default function BackupTab() {
  const t = useTranslations("Settings");
  const { toast } = useToast();
  const [isBackuping, setIsBackuping] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const handleBackup = async () => {
    setIsBackuping(true);
    try {
      const response = await fetch("/api/backup");
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lakhan-bhandar-backup-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: t("backup_success"), description: t("backup_success_desc") });
    } catch (error: unknown) {
      toast({ variant: "destructive", title: t("backup_failed"), description: (error instanceof Error ? error.message : "Unknown error") });
    } finally {
      setIsBackuping(false);
    }
  };

  const handleRestoreClick = async () => {
    if (isBackuping || isRestoring) return;
    setShowRestorePrompt(true);
  };

  useEffect(() => {
    if (showRestorePrompt) {
      window.setTimeout(() => restoreInputRef.current?.focus(), 0);
    }
  }, [showRestorePrompt]);

  const confirmRestore = () => {
    if (restoreConfirmText === "RESTORE") {
      setShowRestorePrompt(false);
      setRestoreConfirmText("");
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".json")) {
      toast({ variant: "destructive", title: t("invalid_file"), description: t("invalid_file_desc") });
      return;
    }
    setIsRestoring(true);
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-restore-confirmation": "CONFIRM_RESTORE_DELETE_ALL_DATA" },
        body: JSON.stringify(backupData),
      });
      const data = await response.json();
      if (data.success) {
        toast({ title: t("restore_success"), description: t("restore_success_desc") });
        window.setTimeout(() => window.location.reload(), 1500);
      } else {
        throw new Error(data.error || "Failed to restore");
      }
    } catch (error: unknown) {
      toast({ variant: "destructive", title: t("restore_failed"), description: (error instanceof Error ? error.message : "Unknown error") });
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("backup_title")}</CardTitle>
        <CardDescription>{t("backup_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg border p-4 space-y-4 bg-muted/20">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" /> {t("backup_section")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{t("backup_section_desc")}</p>
            </div>
            <Button className="w-full" onClick={handleBackup} disabled={isBackuping}>
              {isBackuping ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {t("download_backup")}
            </Button>
          </div>

          <div className="rounded-lg border p-4 space-y-4 bg-muted/20">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Upload className="w-5 h-5 text-destructive" /> {t("restore_section")}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">{t("restore_section_desc")}</p>
            </div>

            <Alert variant="destructive" className="py-2">
              <AlertDescription className="text-xs">{t("restore_warning")}</AlertDescription>
            </Alert>

            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
            {showRestorePrompt ? (
              <div className="space-y-2 mt-4 p-4 border border-destructive/50 rounded-md bg-destructive/10">
                <p className="text-sm font-bold text-destructive">{t("restore_confirm_prompt")}</p>
                <input
                  ref={restoreInputRef}
                  type="text"
                  className="w-full p-2 text-sm border rounded-md bg-background"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && restoreConfirmText === "RESTORE") {
                      e.preventDefault();
                      confirmRestore();
                    }
                  }}
                  placeholder="RESTORE"
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => { setShowRestorePrompt(false); setRestoreConfirmText(""); }}>
                    {t("restore_cancel")}
                  </Button>
                  <Button variant="destructive" className="flex-1" onClick={confirmRestore} disabled={restoreConfirmText !== "RESTORE"}>
                    {t("restore_confirm")}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="destructive" className="w-full" onClick={handleRestoreClick} disabled={isRestoring || isBackuping}>
                {isRestoring ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {t("restore_btn")}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
