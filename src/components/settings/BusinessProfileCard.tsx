'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Store, Save, Phone, MapPin, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useSettingsStore } from '@/stores/settings-store';

/**
 * Store profile card (name / phone / address / currency / GST).
 *
 * It saves through the settings store → PUT /api/settings with flat keys.
 * The previous version POSTed `{ business }`, an endpoint/method combination
 * the API never supported (405), so "save" always failed even though the
 * store name looked editable.
 */
export function BusinessProfileCard() {
  const { toast } = useToast();
  const { settings, saveSettings, lastError } = useSettingsStore();
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [business, setBusiness] = useState({
    name: settings.store_name || '',
    phone: settings.store_phone || '',
    address: settings.store_address || '',
    currency: settings.currency_symbol || '₹',
    gstNumber: settings.store_gst || '',
  });

  // Keep the form in sync with the store until the merchant edits a field.
  useEffect(() => {
    if (dirty) return;
    setBusiness({
      name: settings.store_name || '',
      phone: settings.store_phone || '',
      address: settings.store_address || '',
      currency: settings.currency_symbol || '₹',
      gstNumber: settings.store_gst || '',
    });
  }, [settings, dirty]);

  const update = (patch: Partial<typeof business>) => {
    setDirty(true);
    setBusiness((prev) => ({ ...prev, ...patch }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = business.name.trim();
    if (!name) {
      toast({
        title: 'দোকানের নাম প্রয়োজন',
        description: 'অনুগ্রহ করে দোকানের নাম লিখুন।',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);
      const ok = await saveSettings({
        store_name: name,
        store_phone: business.phone.trim(),
        store_address: business.address.trim(),
        currency_symbol: business.currency.trim() || '₹',
        store_gst: business.gstNumber.trim(),
      });

      if (!ok) {
        throw new Error(useSettingsStore.getState().lastError || lastError || 'ব্যবসায়িক তথ্য সংরক্ষণ ব্যর্থ হয়েছে');
      }

      setDirty(false);
      toast({
        title: 'সংরক্ষিত হয়েছে!',
        description: 'দোকান ও ইনভয়েস প্রোফাইল আপডেট সম্পন্ন হয়েছে।',
      });
    } catch (err: any) {
      toast({
        title: 'ত্রুটি',
        description: err?.message || 'ব্যবসায়িক তথ্য সংরক্ষণ ব্যর্থ হয়েছে',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="rounded-3xl border-border/60 shadow-xs overflow-hidden">
      <CardHeader className="bg-muted/20 border-b border-border/40 pb-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Store className="w-5 h-5 text-primary" />
              দোকান ও ব্যবসা প্রোফাইল
            </CardTitle>
            <CardDescription className="text-xs">
              এই তথ্যগুলো গ্রাহকের রসিদ, চালান ও Z-Report-এ মুদ্রিত হবে।
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
            সক্রিয় শাখা
          </Badge>
        </div>
      </CardHeader>

      <form onSubmit={handleSave}>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bizName" className="text-xs font-semibold">
                দোকানের নাম *
              </Label>
              <div className="relative">
                <Store className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="bizName"
                  value={business.name}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder="যেমন: লাখন ভাণ্ডার"
                  className="pl-10 h-11 rounded-xl text-sm"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bizPhone" className="text-xs font-semibold">
                যোগাযোগের ফোন নম্বর
              </Label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="bizPhone"
                  value={business.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  placeholder="যেমন: +91 98765 43210"
                  className="pl-10 h-11 rounded-xl text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="bizAddress" className="text-xs font-semibold">
              দোকানের ঠিকানা
            </Label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-3 w-4 h-4 text-muted-foreground" />
              <Input
                id="bizAddress"
                value={business.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="যেমন: মেইন রোড, বাজার চত্বর, দোকান নং ৪২"
                className="pl-10 h-11 rounded-xl text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="currency" className="text-xs font-semibold">
                কারেন্সি সিম্বল
              </Label>
              <Input
                id="currency"
                value={business.currency}
                onChange={(e) => update({ currency: e.target.value })}
                placeholder="₹ বা ৳"
                className="h-11 rounded-xl text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gstNumber" className="text-xs font-semibold">
                জিএসটি / ট্রেড লাইসেন্স নং
              </Label>
              <Input
                id="gstNumber"
                value={business.gstNumber}
                onChange={(e) => update({ gstNumber: e.target.value })}
                placeholder="GSTIN (ঐচ্ছিক)"
                className="h-11 rounded-xl text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="timezone" className="text-xs font-semibold">
                টাইমজোন
              </Label>
              <Input
                id="timezone"
                value="Asia/Kolkata"
                disabled
                className="h-11 rounded-xl text-sm bg-muted/40 cursor-not-allowed"
              />
            </div>
          </div>
        </CardContent>

        <CardFooter className="bg-muted/10 border-t border-border/40 p-4 flex justify-end">
          <Button
            type="submit"
            disabled={saving}
            className="rounded-xl gap-2 font-semibold shadow-xs"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>পরিবর্তন সংরক্ষণ করুন</span>
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
