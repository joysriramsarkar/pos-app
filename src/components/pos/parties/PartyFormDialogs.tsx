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
import { Edit, UserPlus, Phone, MapPin, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PartyFormState, PartyType } from './types';
import { EMPTY_PARTY_FORM } from './types';

interface AddPartyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: PartyType;
  form: PartyFormState;
  setForm: React.Dispatch<React.SetStateAction<PartyFormState>>;
  setIsNameEnTouched: (touched: boolean) => void;
  isSubmitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function AddPartyDialog({
  open,
  onOpenChange,
  activeTab,
  form,
  setForm,
  setIsNameEnTouched,
  isSubmitting,
  onSubmit,
  onCancel,
}: AddPartyDialogProps) {
  const t = useTranslations('Parties');

  return (
    <Dialog open={open} onOpenChange={(next) => {
      onOpenChange(next);
      if (!next) {
        setForm(EMPTY_PARTY_FORM);
        setIsNameEnTouched(false);
      }
    }}>
      <DialogContent className="sm:max-w-md w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Add New {activeTab === 'customer' ? 'Customer' : 'Supplier'}
          </DialogTitle>
          <DialogDescription>
            Enter {activeTab === 'customer' ? 'customer' : 'supplier'} details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="party-form-name">Name *</Label>
            <Input
              id="party-form-name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="party-form-nameEn">{t('name_en_label') || 'English Name'}</Label>
            <Input
              id="party-form-nameEn"
              value={form.nameEn}
              onChange={(e) => {
                setForm(prev => ({ ...prev, nameEn: e.target.value }));
                setIsNameEnTouched(true);
              }}
              placeholder="Auto-translated to English"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="party-form-phone">Phone</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="party-form-phone"
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="Enter phone number"
                className="pl-9"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="party-form-address">Address</Label>
            <Input
              id="party-form-address"
              value={form.address}
              onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
              placeholder="Enter address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="party-form-notes">Notes</Label>
            <Textarea
              id="party-form-notes"
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!form.name || isSubmitting} className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              `Add ${activeTab === 'customer' ? 'Customer' : 'Supplier'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface EditPartyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partyType: PartyType;
  form: PartyFormState;
  setForm: React.Dispatch<React.SetStateAction<PartyFormState>>;
  setIsNameEnTouched: (touched: boolean) => void;
  hasChanges: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function EditPartyDialog({
  open,
  onOpenChange,
  partyType,
  form,
  setForm,
  setIsNameEnTouched,
  hasChanges,
  isSubmitting,
  onSubmit,
  onCancel,
}: EditPartyDialogProps) {
  const t = useTranslations('Parties');

  return (
    <Dialog open={open} onOpenChange={(next) => {
      onOpenChange(next);
      if (!next) {
        onCancel();
      }
    }}>
      <DialogContent className="sm:max-w-md w-[95vw] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="w-5 h-5" />
            Edit {partyType === 'customer' ? 'Customer' : 'Supplier'}
          </DialogTitle>
          <DialogDescription>
            Update {partyType === 'customer' ? 'customer' : 'supplier'} details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-party-name">Name *</Label>
            <Input
              id="edit-party-name"
              value={form.name}
              onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-party-nameEn">{t('name_en_label') || 'English Name'}</Label>
            <Input
              id="edit-party-nameEn"
              value={form.nameEn}
              onChange={(e) => {
                setForm(prev => ({ ...prev, nameEn: e.target.value }));
                setIsNameEnTouched(true);
              }}
              placeholder="Auto-translated to English"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-party-phone">Phone</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="edit-party-phone"
                value={form.phone}
                onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="Enter phone number"
                className="pl-9"
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-party-address">Address</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                id="edit-party-address"
                value={form.address}
                onChange={(e) => setForm(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Enter address"
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-party-notes">Notes</Label>
            <Textarea
              id="edit-party-notes"
              value={form.notes}
              onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Enter notes"
              className="resize-none"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!form.name || !hasChanges || isSubmitting} className="bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              `Update ${partyType === 'customer' ? 'Customer' : 'Supplier'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
