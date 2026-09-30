'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Store, Save, Building, Phone, MapPin, Receipt, Loader2, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function BusinessProfileCard() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [business, setBusiness] = useState({
    name: '',
    phone: '',
    address: '',
    currency: '₹',
    timezone: 'Asia/Kolkata',
    gstNumber: '',
  });

  useEffect(() => {
    // Fetch business profile from settings
    const fetchBusiness = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.business) {
            setBusiness({
              name: data.business.name || '',
              phone: data.business.phone || '',
              address: data.business.address || '',
              currency: data.business.currency || '₹',
              timezone: data.business.timezone || 'Asia/Kolkata',
              gstNumber: data.business.gstNumber || '',
            });
          }
        }
      } catch (err) {
        console.error('Failed to load business profile:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchBusiness();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business }),
      });

      if (!res.ok) throw new Error('ব্যবসায়িক তথ্য সংরক্ষণ ব্যর্থ হয়েছে');

      toast({
        title: 'সংরক্ষিত হয়েছে!',
        description: 'দোকান ও ইনভয়েস প্রোফাইল আপডেট সম্পন্ন হয়েছে।',
      });
    } catch (err: any) {
      toast({
        title: 'ত্রুটি',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="rounded-3xl p-6 border-border/60">
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-xs">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span>প্রোফাইল লোড হচ্ছে...</span>
        </div>
      </Card>
    );
  }

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
                  onChange={(e) => setBusiness({ ...business, name: e.target.value })}
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
                  onChange={(e) => setBusiness({ ...business, phone: e.target.value })}
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
                onChange={(e) => setBusiness({ ...business, address: e.target.value })}
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
                onChange={(e) => setBusiness({ ...business, currency: e.target.value })}
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
                onChange={(e) => setBusiness({ ...business, gstNumber: e.target.value })}
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
                value={business.timezone}
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
