"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Store,
  User,
  Phone,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Building2,
  MapPin,
  Sparkles,
  Loader2,
} from "lucide-react";

const STORE_TYPES = [
  { id: "grocery", label: "মুদি ও খাদ্যদ্রব্য", icon: "🛒", desc: "চাল, ডাল, তেল, স্ন্যাক্স, পানীয়" },
  { id: "pharmacy", label: "ফার্মেসি / ওষুধ", icon: "💊", desc: "ঔষধ, ফার্স্ট এইড, স্বাস্থ্যপণ্য" },
  { id: "clothing", label: "পোশাক ও ফ্যাশন", icon: "👕", desc: "শার্ট, প্যান্ট, শাড়ি, বস্ত্রালয়" },
  { id: "electronics", label: "ইলেকট্রনিক্স ও গ্যাজেট", icon: "📱", desc: "মোবাইল, চার্জার, এক্সেসরিজ" },
  { id: "restaurant", label: "রেস্তোরাঁ ও মিষ্টির দোকান", icon: "🍽️", desc: "ফাস্টফুড, মিষ্টি, ক্যাফে, বেকারি" },
  { id: "general", label: "জেনারেল স্টোর / অন্যান্য", icon: "🏪", desc: "স্টেশনারি, প্রসাধন, দৈনন্দিন পণ্য" },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: User Account
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Step 2: Business Info
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("grocery");
  const [businessPhone, setBusinessPhone] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [currency, setCurrency] = useState("INR");

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) {
      setError("নাম অন্তত ২ অক্ষরের হতে হবে (Name must be at least 2 characters)");
      return;
    }
    if (username.trim().length < 3) {
      setError("ইউজারনেম অন্তত ৩ অক্ষরের হতে হবে (Username must be at least 3 characters)");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
      setError("ইউজারনেমে শুধু অক্ষর, সংখ্যা এবং আন্ডারস্কোর থাকতে পারে");
      return;
    }
    if (password.length < 6) {
      setError("পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে (Password must be at least 6 characters)");
      return;
    }
    if (password !== confirmPassword) {
      setError("পাসওয়ার্ড দুটি মেলেনি (Passwords do not match)");
      return;
    }

    setStep(2);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (businessName.trim().length < 2) {
      setError("দোকানের নাম অন্তত ২ অক্ষরের হতে হবে (Store name must be at least 2 characters)");
      return;
    }

    setIsLoading(true);

    try {
      // 1. Call Register API
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim().toLowerCase(),
          phone: phone.trim() || null,
          password,
          businessName: businessName.trim(),
          businessType,
          businessPhone: businessPhone.trim() || phone.trim() || null,
          businessAddress: businessAddress.trim() || null,
          currency,
          timezone: "Asia/Kolkata",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "নিবন্ধন ব্যর্থ হয়েছে (Registration failed)");
      }

      // Clear any prior store settings cache
      try {
        localStorage.removeItem("onuron-pos-settings");
        localStorage.removeItem("lakhan-bhandar-settings");
        localStorage.removeItem("pos-app-session-user");
      } catch {}

      // 2. Automatic login with newly created credentials
      const loginResult = await signIn("credentials", {
        username: username.trim().toLowerCase(),
        password,
        redirect: false,
      });

      if (loginResult?.error) {
        // Fallback to login page if auto-login fails
        router.push("/login?registered=1");
      } else {
        // Success: Navigate to onboarding wizard for new users
        window.location.href = "/onboarding";
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "নিবন্ধন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Card className="w-full max-w-lg border-slate-700 bg-slate-900/90 shadow-2xl backdrop-blur-md text-slate-100">
        <CardHeader className="space-y-2 text-center pb-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 shadow-inner">
            <Store className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            <span>নতুন দোকান নিবন্ধন</span>
            <span className="text-sm font-normal text-slate-400">/ Create Store</span>
          </CardTitle>
          <CardDescription className="text-slate-400 text-sm">
            {step === 1
              ? "ধাপ ১: আপনার অ্যাডমিন একাউন্ট তৈরি করুন"
              : "ধাপ ২: আপনার দোকানের বিবরণ দিন"}
          </CardDescription>

          {/* Stepper Progress Bar */}
          <div className="flex items-center justify-center gap-2 pt-2">
            <div
              className={`h-2 w-24 rounded-full transition-colors ${
                step >= 1 ? "bg-indigo-500" : "bg-slate-700"
              }`}
            />
            <div
              className={`h-2 w-24 rounded-full transition-colors ${
                step >= 2 ? "bg-indigo-500" : "bg-slate-700"
              }`}
            />
          </div>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg bg-red-500/15 border border-red-500/30 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-200 flex items-center gap-2">
                  <User className="h-4 w-4 text-indigo-400" /> আপনার নাম (Your Name) *
                </Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="যেমন: জয় সরকার"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="text-slate-200 flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-indigo-400">@</span> ইউজারনেম (Username) *
                </Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="যেমন: joysr"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  disabled={isLoading}
                  className="bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                />
                <p className="text-xs text-slate-400">লগইন করতে ব্যবহৃত হবে (ছোট হাতের অক্ষর ও সংখ্যা)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-slate-200 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-indigo-400" /> মোবাইল নাম্বার (Phone Number - Optional)
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="যেমন: 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isLoading}
                  className="bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-200 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-indigo-400" /> পাসওয়ার্ড *
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="কমপক্ষে ৬ অক্ষর"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-slate-200 flex items-center gap-2">
                    <Lock className="h-4 w-4 text-indigo-400" /> নিশ্চিত করুন *
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="পাসওয়ার্ড পুনরায় লিখুন"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    className="bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 mt-2 transition-all flex items-center justify-center gap-2"
              >
                <span>পরের ধাপ (Next Step)</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          ) : (
            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessName" className="text-slate-200 flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-indigo-400" /> আপনার দোকানের নাম (Store Name) *
                </Label>
                <Input
                  id="businessName"
                  type="text"
                  autoComplete="off"
                  placeholder="যেমন: মা তারা ভাণ্ডার / জয় জেনারেল স্টোর"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  disabled={isLoading}
                  autoFocus
                  className="bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500 text-base"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-200 flex items-center gap-2">
                  <Store className="h-4 w-4 text-indigo-400" /> কেমন দোকান? (দোকানের ধরণ / Store Type) *
                </Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {STORE_TYPES.map((type) => {
                    const isSelected = businessType === type.id;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setBusinessType(type.id)}
                        className={`p-2.5 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                          isSelected
                            ? "bg-indigo-600/30 border-indigo-500 text-white ring-2 ring-indigo-500 shadow-md"
                            : "bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:border-slate-600"
                        }`}
                      >
                        <span className="text-xl">{type.icon}</span>
                        <span className="text-xs font-semibold">{type.label}</span>
                        <span className="text-[10px] text-slate-400 line-clamp-1">{type.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessPhone" className="text-slate-200 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-indigo-400" /> দোকানের ফোন (Store Contact - Optional)
                </Label>
                <Input
                  id="businessPhone"
                  type="tel"
                  placeholder="ইনভয়েসে প্রিন্ট করার জন্য"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  disabled={isLoading}
                  className="bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="businessAddress" className="text-slate-200 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-indigo-400" /> ঠিকানা (Address - Optional)
                </Label>
                <Input
                  id="businessAddress"
                  type="text"
                  placeholder="যেমন: স্টেশন রোড, কলকাতা"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  disabled={isLoading}
                  className="bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-indigo-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency" className="text-slate-200 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-indigo-400" /> মুদ্রা (Currency)
                </Label>
                <div className="flex gap-3">
                  {["INR", "BDT"].map((curr) => (
                    <button
                      key={curr}
                      type="button"
                      onClick={() => setCurrency(curr)}
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                        currency === curr
                          ? "bg-indigo-600 border-indigo-500 text-white shadow-sm"
                          : "bg-slate-800/60 border-slate-700 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {curr === "INR" ? "₹ INR (রুপি)" : "৳ BDT (টাকা)"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(1)}
                  disabled={isLoading}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4 mr-1" />
                  আগে (Back)
                </Button>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-medium py-2.5 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      দোকান তৈরি হচ্ছে...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      দোকান শুরু করুন (Start POS)
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex flex-col items-center justify-center border-t border-slate-800 pt-4 text-sm text-slate-400">
          <div>
            ইতিমধ্যে একাউন্ট আছে?{" "}
            <Link
              href="/login"
              className="font-medium text-indigo-400 hover:text-indigo-300 underline underline-offset-4 transition-colors"
            >
              লগইন করুন (Login)
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
