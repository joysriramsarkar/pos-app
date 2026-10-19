'use client';

import { useState, useEffect, useTransition } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Store, ChevronDown, Check, Plus, Loader2, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface BusinessInfo {
  businessId: string;
  businessName: string;
  role: string;
  isCurrent: boolean;
  currency: string;
}

interface BusinessSwitcherProps {
  storeName: string;
  storeNameBn?: string;
  currentBusinessId?: string;
}

const STORE_TYPES = [
  { id: "grocery", label: "গুদাম ও খাদ্যদ্রব্য" },
  { id: "pharmacy", label: "ফার্মেসি / ওষুধ" },
  { id: "clothing", label: "পোশাক ও ফ্যাশন" },
  { id: "electronics", label: "ইলেকট্রনিক্স ও গ্যাজেট" },
  { id: "restaurant", label: "রেস্তোরাঁ ও মিষ্টি" },
  { id: "general", label: "জেনারেল স্টোর" },
];

export function BusinessSwitcher({
  storeName,
  storeNameBn,
  currentBusinessId,
}: BusinessSwitcherProps) {
  const { data: session, update: updateSession } = useSession();
  const { toast } = useToast();
  const t = useTranslations("Business");
  const [businesses, setBusinesses] = useState<BusinessInfo[]>([]);
  const [, startTransition] = useTransition();
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // "Add store" dialog state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("grocery");
  const [newPhone, setNewPhone] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Fetch all user's businesses (for dropdown)
  useEffect(() => {
    if (!session?.user?.id || hasFetched) return;

    fetch("/api/business/memberships")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.success) {
          setBusinesses(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setHasFetched(true));
  }, [session?.user?.id, hasFetched]);

  const handleSwitch = async (
    targetBusinessId: string,
    targetBusinessName: string,
    role: string
  ) => {
    if (targetBusinessId === currentBusinessId || isSwitching) return;

    setIsSwitching(true);
    try {
      const res = await fetch("/api/business/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessId: targetBusinessId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Switch failed");
      }

      const data = await res.json();

      // Update NextAuth session with new business context
      await updateSession({
        businessId: data.data.businessId,
        businessName: data.data.businessName,
        role: data.data.role,
      });

      // Update local businesses list to reflect current
      setBusinesses((prev) =>
        prev.map((b) => ({ ...b, isCurrent: b.businessId === targetBusinessId }))
      );

      // Reload page to reset all stores/caches for new business
      window.location.reload();
    } catch (err) {
      toast({
        title: t("switch_failed"),
        description: err instanceof Error ? err.message : t("unknown_error"),
        variant: "destructive",
      });
    } finally {
      setIsSwitching(false);
    }
  };

  /**
   * Creates an additional store for the CURRENT user.
   * Never navigates to /register — that page always minted a new user account
   * and therefore a second owner.
   */
  const handleCreateBusiness = async () => {
    if (newName.trim().length < 2) {
      toast({
        title: t("name_too_short"),
        description: t("name_too_short_desc"),
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          phone: newPhone.trim() || null,
          address: newAddress.trim() || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data?.error || t("create_failed"));
      }

      await updateSession({
        businessId: data.data.businessId,
        businessName: data.data.businessName,
        role: data.data.role,
      });

      toast({
        title: t("created"),
        description: t("created_desc", { name: data.data.businessName }),
      });

      setIsAddOpen(false);
      setNewName("");
      setNewPhone("");
      setNewAddress("");
      startTransition(() => {});
      window.location.reload();
    } catch (err) {
      toast({
        title: t("create_failed"),
        description: err instanceof Error ? err.message : t("unknown_error"),
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const storeTitle = (
    <>
      <h1 className="font-bold text-sm bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent truncate">
        {storeName}
      </h1>
      {storeNameBn && <p className="text-xs text-muted-foreground truncate">{storeNameBn}</p>}
    </>
  );

  // Only show dropdown if user has multiple businesses (or loading)
  const hasMultiple = businesses.length > 1;

  const addStoreDialog = (
    <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("add_store_title")}</DialogTitle>
          <DialogDescription>{t("add_store_desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-business-name">{t("store_name")} *</Label>
            <Input
              id="new-business-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("store_name_placeholder")}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-business-type">{t("store_type")}</Label>
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger id="new-business-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STORE_TYPES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="new-business-phone">{t("phone")}</Label>
              <Input
                id="new-business-phone"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                inputMode="tel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-business-address">{t("address")}</Label>
              <Input
                id="new-business-address"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsAddOpen(false)} disabled={isCreating}>
            {t("cancel")}
          </Button>
          <Button onClick={handleCreateBusiness} disabled={isCreating}>
            {isCreating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {t("create_store")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (!hasMultiple) {
    return (
      <>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-sm shrink-0">
            <Store className="w-6 h-6 text-primary" />
          </div>
          <div className="min-w-0">{storeTitle}</div>
        </div>
        {addStoreDialog}
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 min-w-0 flex-1 group hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl px-2 py-1.5 transition-colors text-left"
            disabled={isSwitching}
            title={t("switch_store")}
          >
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shadow-sm shrink-0">
              {isSwitching ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
              ) : (
                <Store className="w-5 h-5 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">{storeTitle}</div>
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
            {t("your_stores")}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {businesses.map((biz) => (
            <DropdownMenuItem
              key={biz.businessId}
              onClick={() => handleSwitch(biz.businessId, biz.businessName, biz.role)}
              className="flex items-center gap-3 cursor-pointer py-2.5"
              disabled={biz.businessId === currentBusinessId || isSwitching}
            >
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{biz.businessName}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{biz.role}</p>
              </div>
              {biz.businessId === currentBusinessId && (
                <Check className="w-4 h-4 text-green-500 shrink-0" />
              )}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsAddOpen(true)}
            className="flex items-center gap-3 cursor-pointer text-blue-600 dark:text-blue-400 py-2"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">{t("add_store")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {addStoreDialog}
    </>
  );
}