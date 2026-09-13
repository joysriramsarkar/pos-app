"use client";

import { useState, useEffect, useTransition } from "react";
import { useSession } from "next-auth/react";
import { Store, ChevronDown, Check, Plus, Loader2, Building2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export function BusinessSwitcher({ storeName, storeNameBn, currentBusinessId }: BusinessSwitcherProps) {
  const { data: session, update: updateSession } = useSession();
  const { toast } = useToast();
  const [businesses, setBusinesses] = useState<BusinessInfo[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isSwitching, setIsSwitching] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Fetch all user's businesses (for dropdown)
  useEffect(() => {
    if (!session?.user?.id || hasFetched) return;

    fetch("/api/business/memberships")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.success) {
          setBusinesses(data.data);
        }
      })
      .catch(() => {})
      .finally(() => setHasFetched(true));
  }, [session?.user?.id, hasFetched]);

  const handleSwitch = async (targetBusinessId: string, targetBusinessName: string, role: string) => {
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
        title: "Business switch failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsSwitching(false);
    }
  };

  const handleCreateBusiness = () => {
    window.location.href = "/register?mode=add-business";
  };

  // Only show dropdown if user has multiple businesses (or loading)
  const hasMultiple = businesses.length > 1;

  if (!hasMultiple) {
    // Simple display (no dropdown needed)
    return (
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shadow-sm shrink-0">
          <Store className="w-6 h-6 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="font-bold text-sm bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent truncate">
            {storeName}
          </h1>
          {storeNameBn && (
            <p className="text-xs text-muted-foreground truncate">{storeNameBn}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 min-w-0 flex-1 group hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl px-2 py-1.5 transition-colors text-left"
          disabled={isSwitching}
          title="দোকান পরিবর্তন করুন (Switch Business)"
        >
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shadow-sm shrink-0">
            {isSwitching ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            ) : (
              <Store className="w-5 h-5 text-primary" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-sm bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent truncate">
              {storeName}
            </h1>
            {storeNameBn && (
              <p className="text-xs text-muted-foreground truncate">{storeNameBn}</p>
            )}
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          আপনার দোকান / Your Businesses
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
          onClick={handleCreateBusiness}
          className="flex items-center gap-3 cursor-pointer text-blue-600 dark:text-blue-400 py-2"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">নতুন দোকান যোগ করুন</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
