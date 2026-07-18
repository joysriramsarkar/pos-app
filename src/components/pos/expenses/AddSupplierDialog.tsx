'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { UserPlus, Loader2 } from 'lucide-react';

interface AddSupplierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newSupplierName: string;
  setNewSupplierName: (v: string) => void;
  addingSupplier: boolean;
  onAdd: () => void;
  labels: {
    addSupplier: string;
    supplierName: string;
    enterName: string;
    cancel: string;
    add: string;
  };
}

export function AddSupplierDialog({
  open,
  onOpenChange,
  newSupplierName,
  setNewSupplierName,
  addingSupplier,
  onAdd,
  labels,
}: AddSupplierDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm w-[95vw]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> {labels.addSupplier}
          </DialogTitle>
        </DialogHeader>
        <div className="py-3 space-y-2">
          <Label htmlFor="new-supplier-name">{labels.supplierName}</Label>
          <Input
            id="new-supplier-name"
            value={newSupplierName}
            onChange={e => setNewSupplierName(e.target.value)}
            placeholder={labels.enterName}
            onKeyDown={e => e.key === 'Enter' && onAdd()}
            autoFocus
            className="h-9"
          />
        </div>
        <DialogFooter className="gap-2 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{labels.cancel}</Button>
          <Button onClick={onAdd} disabled={addingSupplier || !newSupplierName.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600">
            {addingSupplier && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            {labels.add}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
