"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Store,
  Package,
  CreditCard,
  Users,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Sparkles,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

const STEPS = [
  {
    id: "store-info",
    icon: Store,
    title: "দোকানের তথ্য",
    subtitle: "Store Information",
    description: "আপনার দোকানের নাম ও যোগাযোগের তথ্য ঠিক করুন",
  },
  {
    id: "first-product",
    icon: Package,
    title: "প্রথম পণ্য",
    subtitle: "Add First Product",
    description: "আপনার প্রথম পণ্যটি যোগ করুন (পরে করলেও চলবে)",
  },
  {
    id: "payment-methods",
    icon: CreditCard,
    title: "পেমেন্ট পদ্ধতি",
    subtitle: "Payment Setup",
    description: "কোন কোন পেমেন্ট পদ্ধতি গ্রহণ করবেন?",
  },
  {
    id: "ready",
    icon: Sparkles,
    title: "শুরু করুন!",
    subtitle: "You're Ready!",
    description: "সব কিছু সেট হয়েছে। বিক্রি শুরু করুন!",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Store info state
  const [storeName, setStoreName] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [storeAddress, setStoreAddress] = useState("");

  // Product state
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productStock, setProductStock] = useState("");
  const [skipProduct, setSkipProduct] = useState(false);

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState({
    cash: true,
    upi: false,
    card: false,
    due: true,
  });

  // Pre-fill from session/business
  useEffect(() => {
    if (session?.user?.businessName) {
      setStoreName(session.user.businessName);
    }
  }, [session]);

  // Redirect if not logged in
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  const progress = ((currentStep + 1) / STEPS.length) * 100;
  const step = STEPS[currentStep];
  const StepIcon = step.icon;

  const handleStoreInfoSave = async () => {
    if (!storeName.trim()) {
      setError("দোকানের নাম দিন");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          store_name: storeName.trim(),
          store_phone: storePhone.trim(),
          store_address: storeAddress.trim(),
        }),
      });
      if (!res.ok) throw new Error("Settings save failed");
      setCurrentStep(1);
    } catch {
      setError("সেটিং সেভ করতে ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setIsLoading(false);
    }
  };

  const handleProductSave = async () => {
    if (skipProduct) {
      setCurrentStep(2);
      return;
    }

    if (!productName.trim()) {
      setSkipProduct(false);
      setCurrentStep(2);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: productName.trim(),
          sellingPrice: parseFloat(productPrice) || 0,
          buyingPrice: 0,
          currentStock: parseFloat(productStock) || 0,
          category: "General",
          unit: "piece",
          isActive: true,
        }),
      });
      if (!res.ok) throw new Error("Product save failed");
      setCurrentStep(2);
    } catch {
      setError("পণ্য সেভ করতে ব্যর্থ হয়েছে।");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSave = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const methods = Object.entries(paymentMethods)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(",");
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payment_methods: methods }),
      });
      setCurrentStep(3);
    } catch {
      setCurrentStep(3);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinish = () => {
    window.location.href = "/";
  };

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex flex-col items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Header */}
      <div className="w-full max-w-lg mb-6 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-4 py-1.5 mb-4">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-sm text-indigo-300 font-medium">Setup Wizard</span>
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">
          আপনার POS সেট আপ করুন
        </h1>
        <p className="text-slate-400 text-sm">
          মাত্র কয়েকটি ধাপে দোকান প্রস্তুত করুন
        </p>
      </div>

      {/* Step indicators */}
      <div className="w-full max-w-lg mb-6">
        <div className="flex items-center justify-between mb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.id} className="flex items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                    i < currentStep
                      ? "bg-green-500 text-white"
                      : i === currentStep
                      ? "bg-indigo-500 text-white ring-2 ring-indigo-300 ring-offset-2 ring-offset-slate-900"
                      : "bg-slate-700 text-slate-400"
                  }`}
                >
                  {i < currentStep ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 transition-all ${
                      i < currentStep ? "bg-green-500" : "bg-slate-700"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <Progress value={progress} className="h-1.5 bg-slate-700" />
      </div>

      {/* Step Card */}
      <Card className="w-full max-w-lg border-slate-700 bg-slate-900/80 backdrop-blur-md text-slate-100 shadow-2xl">
        <CardContent className="p-6">
          {/* Step header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
              <StepIcon className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{step.title}</h2>
              <p className="text-xs text-slate-400">{step.description}</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-red-500/15 border border-red-500/30 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Step 0: Store Info */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-200 text-sm">দোকানের নাম *</Label>
                <Input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="যেমন: জয় জেনারেল স্টোর"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200 text-sm">দোকানের ফোন (Optional)</Label>
                <Input
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  placeholder="ইনভয়েসে দেখাবে"
                  type="tel"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-200 text-sm">ঠিকানা (Optional)</Label>
                <Input
                  value={storeAddress}
                  onChange={(e) => setStoreAddress(e.target.value)}
                  placeholder="যেমন: স্টেশন রোড, মালদা"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                />
              </div>
              <Button
                onClick={handleStoreInfoSave}
                disabled={isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white mt-2"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                পরের ধাপ
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Step 1: First Product */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-200 text-sm">পণ্যের নাম</Label>
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="যেমন: বাসমতি চাল ৫ কেজি"
                  className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-slate-200 text-sm">বিক্রয় মূল্য (₹)</Label>
                  <Input
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                    placeholder="0.00"
                    type="number"
                    min="0"
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-200 text-sm">বর্তমান স্টক</Label>
                  <Input
                    value={productStock}
                    onChange={(e) => setProductStock(e.target.value)}
                    placeholder="0"
                    type="number"
                    min="0"
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => { setSkipProduct(true); setCurrentStep(2); }}
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  পরে যোগ করব (Skip)
                </Button>
                <Button
                  onClick={handleProductSave}
                  disabled={isLoading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  পণ্য যোগ করুন
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Payment Methods */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-400">আপনি কোন পেমেন্ট পদ্ধতি গ্রহণ করবেন?</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: "cash", label: "নগদ (Cash)", icon: "💵" },
                  { key: "upi", label: "UPI / QR", icon: "📱" },
                  { key: "card", label: "কার্ড (Card)", icon: "💳" },
                  { key: "due", label: "বাকি / Due", icon: "📋" },
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      setPaymentMethods((prev) => ({
                        ...prev,
                        [key]: !prev[key as keyof typeof prev],
                      }))
                    }
                    className={`p-3 rounded-xl border text-left transition-all ${
                      paymentMethods[key as keyof typeof paymentMethods]
                        ? "bg-indigo-600/30 border-indigo-500 text-white ring-1 ring-indigo-500"
                        : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <span className="text-xl block mb-1">{icon}</span>
                    <span className="text-xs font-semibold">{label}</span>
                    {paymentMethods[key as keyof typeof paymentMethods] && (
                      <CheckCircle2 className="w-4 h-4 text-green-400 float-right" />
                    )}
                  </button>
                ))}
              </div>
              <Button
                onClick={handlePaymentSave}
                disabled={isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                পরের ধাপ
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Step 3: Ready! */}
          {currentStep === 3 && (
            <div className="text-center space-y-5">
              <div className="w-16 h-16 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <div>
                <p className="text-white font-bold text-lg">সব কিছু প্রস্তুত! 🎉</p>
                <p className="text-slate-400 text-sm mt-1">
                  আপনার POS দোকান চালু হয়ে গেছে। এখন বিক্রি শুরু করুন।
                </p>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                {[
                  { icon: BarChart3, label: "Dashboard", desc: "সার্বিক পরিসংখ্যান" },
                  { icon: Package, label: "Billing", desc: "বিক্রয় শুরু করুন" },
                  { icon: Users, label: "Parties", desc: "কাস্টমার/সরবরাহকারী" },
                ].map(({ icon: Icon, label, desc }) => (
                  <div
                    key={label}
                    className="bg-slate-800/60 border border-slate-700 rounded-xl p-3"
                  >
                    <Icon className="w-5 h-5 text-indigo-400 mb-1" />
                    <p className="font-semibold text-xs text-white">{label}</p>
                    <p className="text-[10px] text-slate-400">{desc}</p>
                  </div>
                ))}
              </div>

              <Button
                onClick={handleFinish}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold shadow-lg shadow-indigo-600/30"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                POS শুরু করুন (Start Selling)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Skip all */}
      {currentStep < 3 && (
        <button
          onClick={handleFinish}
          className="mt-4 text-sm text-slate-500 hover:text-slate-400 underline underline-offset-4 transition-colors"
        >
          এখনই setup এড়িয়ে যান (Skip all)
        </button>
      )}
    </div>
  );
}
