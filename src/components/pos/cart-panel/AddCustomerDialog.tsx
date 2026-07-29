'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { UserPlus, Phone, MapPin, Languages, Loader2 } from 'lucide-react';
import { convertBengaliToEnglishNumerals } from '@/lib/utils';

export interface NewPartyForm {
  name: string;
  nameEn: string;
  phone: string;
  address: string;
  notes: string;
}

interface AddCustomerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  newParty: NewPartyForm;
  setNewParty: React.Dispatch<React.SetStateAction<NewPartyForm>>;
  setIsNameEnTouched: (v: boolean) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  labels: {
    addNewCustomer: string;
    enterCustomerDetails: string;
    customerName: string;
    enterName: string;
    customerNameEn: string;
    enterNameEn: string;
    customerPhone: string;
    enterPhone: string;
    customerAddress: string;
    enterAddress: string;
    customerNotes: string;
    cancel: string;
    createCustomer: string;
  };
}

export function AddCustomerDialog({
  open,
  onOpenChange,
  newParty,
  setNewParty,
  setIsNameEnTouched,
  onSubmit,
  onCancel,
  isSubmitting = false,
  labels,
}: AddCustomerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-emerald-600" />
            {labels.addNewCustomer}
          </DialogTitle>
          <DialogDescription>
            {labels.enterCustomerDetails}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="cart-party-name">{labels.customerName}</Label>
            <Input
              id="cart-party-name"
              value={newParty.name}
              onChange={(e) => setNewParty(prev => ({ ...prev, name: e.target.value }))}
              placeholder={labels.enterName}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cart-party-name-en" className="flex items-center gap-1.5">
              <Languages className="w-3.5 h-3.5 text-muted-foreground" />
              {labels.customerNameEn}
            </Label>
            <Input
              id="cart-party-name-en"
              value={newParty.nameEn}
              onChange={(e) => {
                setNewParty(prev => ({ ...prev, nameEn: e.target.value }));
                setIsNameEnTouched(true);
              }}
              placeholder={labels.enterNameEn}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cart-party-phone">{labels.customerPhone}</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cart-party-phone"
                value={newParty.phone}
                onChange={(e) => setNewParty(prev => ({ ...prev, phone: convertBengaliToEnglishNumerals(e.target.value) }))}
                placeholder={labels.enterPhone}
                className="pl-9"
                inputMode="numeric"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cart-party-address">{labels.customerAddress}</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="cart-party-address"
                value={newParty.address}
                onChange={(e) => setNewParty(prev => ({ ...prev, address: e.target.value }))}
                placeholder={labels.enterAddress}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cart-party-notes">{labels.customerNotes}</Label>
            <Textarea
              id="cart-party-notes"
              value={newParty.notes}
              onChange={(e) => setNewParty(prev => ({ ...prev, notes: e.target.value }))}
              placeholder={labels.customerNotes}
              className="resize-none h-20"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            {labels.cancel}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!newParty.name || isSubmitting}
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {labels.createCustomer}
              </>
            ) : (
              labels.createCustomer
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
