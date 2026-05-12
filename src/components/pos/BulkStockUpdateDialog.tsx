'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ProductsDB, SyncQueueDB } from '@/lib/offline/indexeddb';
import { v4 as uuidv4 } from 'uuid';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useProductsStore, useSyncStore } from '@/stores/pos-store';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileDown, Table as TableIcon, AlertCircle, CheckCircle } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BulkStockUpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface StockUpdateData {
  barcode: string;
  name: string;
  quantity: number;
}

export function BulkStockUpdateDialog({ open, onOpenChange }: BulkStockUpdateDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<StockUpdateData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { products, updateProductStock, setProducts } = useProductsStore();

  // Pre-compute a map for O(1) barcode lookups
  const barcodeMap = useMemo(() => {
    const map = new Map<string, (typeof products)[0]>();
    products.forEach((product) => {
      if (product.barcode) {
        const normalized = convertBengaliToEnglishNumerals(product.barcode);
        if (!map.has(normalized)) {
          map.set(normalized, product);
        }
      }
    });
    return map;
  }, [products]);

  const isOnline = useSyncStore((state) => state.isOnline);
  const pendingCount = useSyncStore((state) => state.pendingCount);
  const setPendingCount = useSyncStore((state) => state.setPendingCount);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setParsedData([]);
      parseFile(selectedFile);
    }
  };

  const parseFile = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`Error parsing file: ${results.errors[0].message}`);
          return;
        }

        const requiredHeaders = ['barcode', 'quantity_to_add'];
        const headers = results.meta.fields;
        if (!headers || !requiredHeaders.every(h => headers.includes(h))) {
            setError(`Invalid CSV format. Required headers are: ${requiredHeaders.join(', ')}`);
            return;
        }

        const data = results.data as any[];
        const stockUpdateData: StockUpdateData[] = data
          .filter(row => {
            if (!row.quantity_to_add) return false;
            const parsedQty = parseInt(convertBengaliToEnglishNumerals(row.quantity_to_add), 10);
            return !isNaN(parsedQty) && parsedQty !== 0;
          })
          .map(row => {
            const normalizedRowBarcode = convertBengaliToEnglishNumerals(row.barcode);
            const product = barcodeMap.get(normalizedRowBarcode);
            return {
                barcode: row.barcode,
                name: product?.name || 'Unknown Product',
                quantity: parseInt(convertBengaliToEnglishNumerals(row.quantity_to_add), 10)
            }
        });

        if (stockUpdateData.length === 0) {
            setError("No valid stock updates found in the file. Please fill the 'quantity_to_add' column.");
            return;
        }

        setParsedData(stockUpdateData);
      },
      error: (err) => {
        setError(`Error parsing file: ${err.message}`);
      }
    });
  };

  const handleDownloadTemplate = async () => {
    const templateData = products.length > 0
      ? products.map(p => ({ barcode: p.barcode, name: p.name, current_stock: p.currentStock, quantity_to_add: 0 }))
      : [{ barcode: '1234567890', name: 'Sample Product Name', current_stock: 15, quantity_to_add: 10 }];

    const csv = Papa.unparse(templateData);
    const fileName = 'stock_update_template.csv';

    if (Capacitor.isNativePlatform()) {
      try {
        // ফাইল Cache ডিরেক্টরিতে সেভ করে Share sheet দিয়ে ডাউনলোড করানো হচ্ছে
        const { uri } = await Filesystem.writeFile({
          path: fileName,
          data: csv,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        await Share.share({
          title: fileName,
          url: uri,
          dialogTitle: 'CSV টেমপ্লেট সেভ করুন',
        });
      } catch (e) {
        toast({ title: 'ডাউনলোড ব্যর্থ', description: String(e), variant: 'destructive' });
      }
      return;
    }

    // Desktop: Blob URL
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (parsedData.length === 0) {
      setError("No data to save.");
      return;
    }

    // iterate and send each update to backend or handle offline
    for (const item of parsedData) {
      const normalizedItemBarcode = convertBengaliToEnglishNumerals(item.barcode);
      const product = barcodeMap.get(normalizedItemBarcode);
      if (!product) continue;

      if (isOnline) {
        try {
          const res = await fetch('/api/stock-entry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: product.id,
              quantity: item.quantity,
              purchasePrice: product.buyingPrice || 0,
              date: new Date().toISOString(),
              notes: 'Bulk update from CSV',
            }),
          });

          if (!res.ok) {
            const err = await res.json();
            console.warn('Bulk stock update failed for', item.barcode, err.error);
            toast({ title: 'Bulk update failed', description: err.error, variant: 'destructive' });
          } else {
            updateProductStock(product.id, item.quantity);
          }
        } catch (e) {
          console.error('Error during bulk stock update', e);
          toast({ title: 'Bulk update error', description: String(e), variant: 'destructive' });
        }
      } else {
        // offline behavior: update local state and queue
        updateProductStock(product.id, item.quantity);
        ProductsDB.updateStock(product.id, item.quantity).catch(console.error);
        await SyncQueueDB.add({
          id: uuidv4(),
          entityType: 'Product',
          entityId: product.id,
          action: 'update',
          payload: JSON.stringify({ productId: product.id, quantityChange: item.quantity }),
          synced: false,
          retryCount: 0,
          createdAt: new Date(),
        });
        setPendingCount(pendingCount + 1);
      }
    }

    if (isOnline) {
      // refresh products list after all updates
      const productsRes = await fetch('/api/products');
      if (productsRes.ok) {
        const { data: refreshed } = await productsRes.json();
        setProducts(refreshed);
      }
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Stock Update</DialogTitle>
          <DialogDescription>
            Update stock quantities in bulk using a CSV file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload CSV
                </Button>
                <Input
                    ref={fileInputRef}
                    id="csv-upload"
                    name="csv-upload"
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileChange}
                />

                <Button variant="secondary" onClick={handleDownloadTemplate}>
                    <FileDown className="w-4 h-4 mr-2" />
                    Download Template
                </Button>
            </div>

            {file && (
                <div className="text-sm text-muted-foreground">
                    Selected file: {file.name}
                </div>
            )}

            {error && (
                <div className="text-sm text-red-500 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}

            {parsedData.length > 0 && (
                <div>
                    <h3 className="text-lg font-medium mb-2 flex items-center gap-2">
                        <TableIcon className="w-5 h-5" />
                        Preview Data
                    </h3>
                    <ScrollArea className="h-64 border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Barcode</TableHead>
                                    <TableHead>Product Name</TableHead>
                                    <TableHead className="text-right">Quantity to Add</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {parsedData.map((row, index) => (
                                    <TableRow key={index}>
                                        <TableCell>{row.barcode}</TableCell>
                                        <TableCell>{row.name}</TableCell>
                                        <TableCell className="text-right">{row.quantity}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                </div>
            )}
        </div>


        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={parsedData.length === 0} className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
            <CheckCircle className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
