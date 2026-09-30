'use client';

import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Copy,
  Loader2,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { useNumberFormat } from '@/hooks/use-number-format';
import { cn } from '@/lib/utils';

export interface ProductImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportSuccess?: () => void;
}

export function ProductImportModal({
  open,
  onOpenChange,
  onImportSuccess,
}: ProductImportModalProps) {
  const { toast } = useToast();
  const { formatPrice } = useNumberFormat();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvContent, setCsvContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [committing, setCommitting] = useState<boolean>(false);
  const [previewData, setPreviewData] = useState<any | null>(null);

  // Handle CSV file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvContent(text);
      handlePreview(text);
    };
    reader.readAsText(file);
  };

  // Preview CSV parsing
  const handlePreview = async (text: string) => {
    if (!text.trim()) return;
    try {
      setLoading(true);
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', csv: text }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'CSV প্রিভিউ ব্যর্থ হয়েছে');
      }
      setPreviewData(data.data);
    } catch (err: any) {
      toast({
        title: 'প্রিভিউ ত্রুটি',
        description: err.message,
        variant: 'destructive',
      });
      setPreviewData(null);
    } finally {
      setLoading(false);
    }
  };

  // Commit Import
  const handleCommit = async () => {
    if (!csvContent) return;
    try {
      setCommitting(true);
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'commit', csv: csvContent }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'প্রোডাক্ট ইম্পোর্ট ব্যর্থ হয়েছে');
      }

      toast({
        title: 'সফলভাবে ইম্পোর্ট সম্পন্ন!',
        description: `${data.data.created}টি নতুন প্রোডাক্ট যোগ ও ${data.data.updated}টি আপডেট হয়েছে।`,
      });

      onImportSuccess?.();
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      toast({
        title: 'ইম্পোর্ট ত্রুটি',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setCommitting(false);
    }
  };

  const resetState = () => {
    setCsvContent('');
    setFileName('');
    setPreviewData(null);
  };

  // Download template
  const handleDownloadTemplate = () => {
    window.open('/api/products/import', '_blank');
  };

  // Export current catalog
  const handleExportCatalog = () => {
    window.open('/api/products/export', '_blank');
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetState();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto rounded-3xl p-6">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-primary" />
              প্রোডাক্ট ইম্পোর্ট ও এক্সপোর্ট
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground">
            এক ক্লিকে শত শত প্রোডাক্ট যোগ করুন অথবা ব্যাকআপ হিসেবে এক্সপোর্ট করুন।
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Action bar for template and export */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDownloadTemplate}
              className="rounded-2xl h-11 border-dashed border-border/80 gap-2 justify-start px-4 text-xs font-semibold hover:border-primary"
            >
              <Download className="w-4 h-4 text-primary" />
              <span>নমুনা CSV টেমপ্লেট ডাউনলোড</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCatalog}
              className="rounded-2xl h-11 border-dashed border-border/80 gap-2 justify-start px-4 text-xs font-semibold hover:border-primary"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>বর্তমান ক্যাটালগ এক্সপোর্ট (CSV)</span>
            </Button>
          </div>

          {/* Upload Area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed rounded-3xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all duration-200',
              fileName
                ? 'border-primary/50 bg-primary/5'
                : 'border-border/80 hover:border-primary/60 hover:bg-muted/30'
            )}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,text/csv"
              className="hidden"
            />
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-1">
              <Upload className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-foreground text-center">
              {fileName || 'আপনার CSV ফাইল নির্বাচন করুন'}
            </p>
            <p className="text-xs text-muted-foreground text-center">
              ফাইল টেনে আনুন অথবা ক্লিক করে ডিভাইস থেকে সিলেক্ট করুন (.csv)
            </p>
          </div>

          {/* Preview Results */}
          {loading && (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">CSV যাচাই করা হচ্ছে...</p>
            </div>
          )}

          {previewData && !loading && (
            <div className="space-y-3">
              {/* Summary Badges */}
              <div className="grid grid-cols-4 gap-2">
                <div className="p-3 rounded-2xl bg-muted/40 border border-border/60 text-center">
                  <span className="text-[10px] text-muted-foreground block font-medium">মোট সারি</span>
                  <span className="text-base font-bold text-foreground">{previewData.total}</span>
                </div>
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 block font-medium">সঠিক (Valid)</span>
                  <span className="text-base font-bold text-emerald-600">{previewData.valid}</span>
                </div>
                <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-center">
                  <span className="text-[10px] text-blue-700 dark:text-blue-400 block font-medium">বিদ্যমান (Update)</span>
                  <span className="text-base font-bold text-blue-600">{previewData.duplicates}</span>
                </div>
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-center">
                  <span className="text-[10px] text-rose-700 dark:text-rose-400 block font-medium">ত্রুটিপূর্ণ (Invalid)</span>
                  <span className="text-base font-bold text-rose-600">{previewData.invalid}</span>
                </div>
              </div>

              {/* Sample Rows Table Preview */}
              <div className="border border-border/60 rounded-2xl overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/70 text-muted-foreground font-semibold sticky top-0">
                    <tr>
                      <th className="p-2.5">স্ট্যাটাস</th>
                      <th className="p-2.5">নাম</th>
                      <th className="p-2.5">ক্যাটাগরি</th>
                      <th className="p-2.5 text-right">বিক্রয়মূল্য</th>
                      <th className="p-2.5 text-right">স্টক</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {previewData.rows.slice(0, 15).map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-muted/20">
                        <td className="p-2.5">
                          {row.status === 'valid' && (
                            <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                              নতুন
                            </Badge>
                          )}
                          {row.status === 'duplicate' && (
                            <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/30">
                              আপডেট
                            </Badge>
                          )}
                          {row.status === 'invalid' && (
                            <Badge variant="outline" className="text-[9px] bg-rose-500/10 text-rose-600 border-rose-500/30">
                              ত্রুটি
                            </Badge>
                          )}
                        </td>
                        <td className="p-2.5 font-medium truncate max-w-[120px]">
                          {row.name}
                          {row.errors?.length > 0 && (
                            <span className="text-[9px] text-rose-500 block truncate">
                              {row.errors[0]}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-muted-foreground truncate max-w-[100px]">{row.category}</td>
                        <td className="p-2.5 text-right font-medium">{formatPrice(row.sellingPrice || 0)}</td>
                        <td className="p-2.5 text-right text-muted-foreground">{row.currentStock || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {previewData.rows.length > 15 && (
                <p className="text-[10px] text-muted-foreground text-center">
                  আরও {previewData.rows.length - 15}টি রো রয়েছে...
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 sm:justify-end gap-2 border-t border-border/40 mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            বাতিল
          </Button>
          <Button
            type="button"
            disabled={!previewData || committing || previewData.valid + previewData.duplicates === 0}
            onClick={handleCommit}
            className="rounded-xl gap-2 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {committing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowRight className="w-4 h-4" />
            )}
            ইম্পোর্ট চূড়ান্ত করুন ({previewData ? previewData.valid + previewData.duplicates : 0}টি)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
