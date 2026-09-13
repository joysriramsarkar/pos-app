"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { useToast } from "@/hooks/use-toast";
import { auth } from "@/lib/firebase";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from "firebase/auth";
import { Lock, Phone, RefreshCw, KeyRound, ArrowLeft, ShieldCheck } from "lucide-react";
import { signInWithPopup, GoogleAuthProvider, auth as firebaseAuth } from "@/lib/firebase";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Active Login Tab
  const [activeTab, setActiveTab] = useState<"password" | "otp">("password");

  // Password Login State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // OTP Login State
  const [countryCode, setCountryCode] = useState("+880");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState<"phone" | "verify">("phone");
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [countdown, setCountdown] = useState(0);

  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  const recaptchaVerifierRef = useRef<RecaptchaVerifier | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Google Sign-in State
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState("");

  useEffect(() => {
    // Clear any cached session and IndexedDB when on the login page
    localStorage.removeItem("pos-app-session-user");
    import("@/lib/offline/indexeddb")
      .then((m) => m.clearAllOfflineData())
      .catch(() => {});

    if (searchParams.get("passwordChanged") === "1") {
      toast({
        title: "✅ পাসওয়ার্ড পরিবর্তন সফল হয়েছে!",
        description: "নতুন পাসওয়ার্ড দিয়ে লগইন করুন।",
      });
    }
    if (searchParams.get("registered") === "1") {
      toast({
        title: "✅ দোকান নিবন্ধন সফল হয়েছে!",
        description: "এখন ইউজারনেম ও পাসওয়ার্ড দিয়ে লগইন করুন।",
      });
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {}
      }
    };
  }, [searchParams, toast]);

  // Countdown timer for resend OTP
  const startCountdown = () => {
    setCountdown(60);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // 1. Password Login Submit
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordLoading(true);
    setPasswordError("");

    try {
      const result = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setPasswordError("ভুল ইউজারনেম/মোবাইল বা পাসওয়ার্ড (Invalid username/phone or password)");
      } else {
        window.location.href = "/";
      }
    } catch {
      setPasswordError("লগইন করার সময় ত্রুটি হয়েছে (An error occurred during login)");
    } finally {
      setPasswordLoading(false);
    }
  };

  // 4. Google Sign-in
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setGoogleError("");

    if (!firebaseAuth) {
      setGoogleError("Firebase লোড হয়নি। ইন্টারনেট সংযোগ চেক করুন।");
      setGoogleLoading(false);
      return;
    }

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(firebaseAuth, provider);
      const email = result.user.email;

      if (!email) {
        setGoogleError("Google অ্যাকাউন্ট থেকে ইমেইল পাওয়া যায়নি।");
        setGoogleLoading(false);
        return;
      }

      const signInResult = await signIn("credentials", {
        isGoogleVerified: "true",
        googleEmail: email,
        redirect: false,
      });

      if (signInResult?.error) {
        setGoogleError(signInResult.error);
      } else {
        toast({
          title: "✅ Google লগইন সফল!",
          description: "ড্যাশবোর্ডে প্রবেশ করা হচ্ছে...",
        });
        window.location.href = "/";
      }
    } catch (err: unknown) {
      console.error("Google sign-in error:", err);
      const errorObj = err as { code?: string; message?: string };
      if (errorObj.code === "auth/popup-closed-by-user" || errorObj.code === "auth/cancelled-popup-request") {
        // User closed popup — silent
      } else if (errorObj.code === "auth/unauthorized-domain") {
        setGoogleError("⚠️ এই ডোমেইন Firebase-এ অনুমোদিত নয়। Firebase Console > Authentication > Settings > Authorized domains-এ যোগ করুন।");
      } else {
        setGoogleError(errorObj.message || "Google লগইনে সমস্যা হয়েছে। আবার চেষ্টা করুন।");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  // Helper to get formatted international phone number
  const getFormattedPhone = () => {
    let cleanPhone = phoneNumber.trim().replace(/\D/g, "");
    // If phone number starts with 0 and country code is already selected, strip leading zero
    if (cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.substring(1);
    }
    return `${countryCode}${cleanPhone}`;
  };

  // 2. Setup Recaptcha and Send OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setOtpError("");

    const formattedPhone = getFormattedPhone();
    if (phoneNumber.trim().length < 8) {
      setOtpError("একটি সঠিক মোবাইল নম্বর দিন (Please enter a valid phone number)");
      return;
    }

    if (!auth) {
      setOtpError("Firebase Authentication লোড করা যায়নি। ইন্টারনেট কানেকশন চেক করুন।");
      return;
    }

    setOtpLoading(true);

    try {
      // Fully destroy previous recaptcha instance
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {}
        recaptchaVerifierRef.current = null;
      }

      // Recreate the container div entirely (clears all reCAPTCHA state)
      const oldContainer = document.getElementById("recaptcha-container");
      if (oldContainer && oldContainer.parentNode) {
        const newContainer = document.createElement("div");
        newContainer.id = "recaptcha-container";
        oldContainer.parentNode.replaceChild(newContainer, oldContainer);
      }

      const appVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
        callback: () => {
          // reCAPTCHA solved
        },
        "expired-callback": () => {
          setOtpError("reCAPTCHA এর মেয়াদ শেষ হয়েছে, আবার চেষ্টা করুন।");
        },
      });

      recaptchaVerifierRef.current = appVerifier;

      const confirmation = await signInWithPhoneNumber(
        auth,
        formattedPhone,
        appVerifier
      );

      confirmationResultRef.current = confirmation;
      setOtpStep("verify");
      setOtpCode("");
      startCountdown();
      toast({
        title: "📲 ওটিপি পাঠানো হয়েছে!",
        description: `${formattedPhone} নম্বরে ৬ ডিজিটের ভেরিফিকেশন কোড পাঠানো হয়েছে।`,
      });
    } catch (err: unknown) {
      console.error("Firebase send OTP error:", err);
      if (recaptchaVerifierRef.current) {
        try {
          recaptchaVerifierRef.current.clear();
        } catch {}
        recaptchaVerifierRef.current = null;
      }

      const errorObj = err as { code?: string; message?: string };
      const errCode = errorObj.code || "";
      const errMessage = errorObj.message || String(err);

      if (errCode === "auth/operation-not-allowed") {
        setOtpError("⚠️ Firebase Console-এ Phone Sign-in চালু (Enable) করা নেই। অনুগ্রহ করে Firebase Console > Authentication > Sign-in method-এ গিয়ে Phone Enable করুন।");
      } else if (errCode === "auth/unauthorized-domain") {
        setOtpError("⚠️ Firebase Console-এ localhost ডোমেইন অনুমোদিত নয়। Firebase Console > Authentication > Settings > Authorized domains-এ localhost যোগ করুন।");
      } else if (errCode === "auth/invalid-phone-number" || errMessage.includes("invalid-phone-number")) {
        setOtpError("মোবাইল নম্বরটি সঠিক নয়। অনুগ্রহ করে সঠিক মোবাইল নম্বর দিন।");
      } else if (errCode === "auth/too-many-requests" || errMessage.includes("too-many-requests")) {
        setOtpError("অনেক বেশি ওটিপি পাঠানোর চেষ্টা করা হয়েছে। কিছুক্ষণ পরে চেষ্টা করুন।");
      } else if (errCode === "auth/quota-exceeded" || errMessage.includes("quota-exceeded")) {
        setOtpError("⚠️ Firebase-এর ফ্রি SMS কোটা শেষ হয়েছে। টেস্টিংয়ের জন্য Firebase Console-এ 'Phone numbers for testing'-এ আপনার নম্বর ও ফিক্সড ওটিপি যুক্ত করুন।");
      } else if (errCode === "auth/captcha-check-failed" || errCode === "auth/invalid-app-credential") {
        setOtpError(`reCAPTCHA ভেরিফিকেশন সমস্যা হয়েছে (${errCode || "captcha-failed"})। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।`);
      } else {
        setOtpError(`ওটিপি পাঠাতে সমস্যা হয়েছে (${errCode || errMessage})। Firebase সেটিংস বা ইন্টারনেট চেক করুন।`);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  // 3. Verify OTP & Complete Login
  const handleVerifyOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setOtpError("");

    if (otpCode.length !== 6) {
      setOtpError("৬ ডিজিটের সম্পূর্ণ ওটিপি দিন (Please enter the 6-digit OTP)");
      return;
    }

    if (!confirmationResultRef.current) {
      setOtpError("ওটিপি সেশন পাওয়া যায়নি। অনুগ্রহ করে পুনরায় ওটিপি পাঠান।");
      setOtpStep("phone");
      return;
    }

    setOtpLoading(true);

    try {
      // Confirm with Firebase
      await confirmationResultRef.current.confirm(otpCode);

      const formattedPhone = getFormattedPhone();

      // Sign in to application session with OTP flag
      const result = await signIn("credentials", {
        username: formattedPhone,
        isOtpVerified: "true",
        redirect: false,
      });

      if (result?.error) {
        setOtpError(result.error);
      } else {
        toast({
          title: "✅ লগইন সফল হয়েছে!",
          description: "দোকানের ড্যাশবোর্ডে প্রবেশ করা হচ্ছে...",
        });
        window.location.href = "/";
      }
    } catch (err: unknown) {
      console.error("Firebase verify OTP error:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      if (errorMsg.includes("invalid-verification-code")) {
        setOtpError("ভুল ওটিপি কোড (Invalid OTP). পুনরায় সঠিক কোড দিন।");
      } else if (errorMsg.includes("code-expired")) {
        setOtpError("ওটিপির মেয়াদ শেষ হয়ে গেছে (OTP Expired). পুনরায় ওটিপি পাঠান।");
      } else {
        setOtpError("ওটিপি যাচাই করা সম্ভব হয়নি। আবার চেষ্টা করুন।");
      }
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-muted/40 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      {/* Invisible reCAPTCHA container */}
      <div id="recaptcha-container"></div>

      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="space-y-1 text-center pb-4">
          <CardTitle className="text-2xl font-bold tracking-tight">
            লগইন (Login)
          </CardTitle>
          <CardDescription>
            Onuron POS-এ প্রবেশ করতে লগইন করুন
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              setActiveTab(val as "password" | "otp");
              setPasswordError("");
              setOtpError("");
            }}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="password" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <KeyRound className="w-3.5 h-3.5" />
                পাসওয়ার্ড (Password)
              </TabsTrigger>
              <TabsTrigger value="otp" className="flex items-center gap-1.5 text-xs sm:text-sm">
                <Phone className="w-3.5 h-3.5" />
                মোবাইল OTP
              </TabsTrigger>
            </TabsList>

            {/* --- 1. Password Login Tab --- */}
            <TabsContent value="password">
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username">ইমেইল, ইউজারনেম বা মোবাইল নম্বর</Label>
                  <Input
                    id="username"
                    type="text"
                    autoComplete="username"
                    inputMode="text"
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="email@example.com / username / phone"
                    required
                    disabled={passwordLoading}
                    className="h-11 text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">পাসওয়ার্ড (Password)</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    disabled={passwordLoading}
                    className="h-11 text-base"
                  />
                </div>

                {passwordError && (
                  <div className="text-sm font-medium text-destructive bg-destructive/10 p-2.5 rounded-md">
                    {passwordError}
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 text-base bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600 touch-manipulation"
                  disabled={passwordLoading}
                >
                  {passwordLoading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> লগইন হচ্ছে...
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Lock className="w-4 h-4" /> লগইন (Login)
                    </span>
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* --- 2. Mobile OTP Login Tab --- */}
            <TabsContent value="otp">
              {otpStep === "phone" ? (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">মোবাইল নম্বর (Phone Number)</Label>
                    <div className="flex gap-2">
                      <select
                        value={countryCode}
                        onChange={(e) => setCountryCode(e.target.value)}
                        className="h-11 rounded-md border border-input bg-background px-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
                        disabled={otpLoading}
                      >
                        <option value="+880">🇧🇩 +880 (BD)</option>
                        <option value="+91">🇮🇳 +91 (IN)</option>
                        <option value="+1">🇺🇸 +1 (US)</option>
                        <option value="+44">🇬🇧 +44 (UK)</option>
                        <option value="+971">🇦🇪 +971 (UAE)</option>
                        <option value="+966">🇸🇦 +966 (KSA)</option>
                      </select>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        autoFocus
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="17XXXXXXXX / 9876543210"
                        required
                        disabled={otpLoading}
                        className="h-11 text-base flex-1"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      এই নম্বরে একটি ৬ ডিজিটের এসএমএস কোড পাঠানো হবে।
                    </p>
                  </div>

                  {otpError && (
                    <div className="text-sm font-medium text-destructive bg-destructive/10 p-2.5 rounded-md">
                      {otpError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 text-base bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600 touch-manipulation"
                    disabled={otpLoading}
                  >
                    {otpLoading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" /> OTP পাঠানো হচ্ছে...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Phone className="w-4 h-4" /> OTP কোড পাঠান (Send OTP)
                      </span>
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-4">
                  <div className="space-y-3 text-center">
                    <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/60 p-2 rounded-md">
                      <span>নম্বর: <strong>{getFormattedPhone()}</strong></span>
                      <button
                        type="button"
                        onClick={() => {
                          setOtpStep("phone");
                          setOtpError("");
                        }}
                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
                      >
                        <ArrowLeft className="w-3 h-3" /> পরিবর্তন
                      </button>
                    </div>

                    <Label className="text-sm font-semibold block text-left">
                      ৬ ডিজিটের OTP কোড লিখুন
                    </Label>

                    <div className="flex justify-center py-2">
                      <InputOTP
                        maxLength={6}
                        value={otpCode}
                        onChange={(val) => setOtpCode(val)}
                        autoFocus
                        disabled={otpLoading}
                      >
                        <InputOTPGroup className="gap-1.5 sm:gap-2">
                          <InputOTPSlot index={0} className="w-10 h-12 text-lg font-bold" />
                          <InputOTPSlot index={1} className="w-10 h-12 text-lg font-bold" />
                          <InputOTPSlot index={2} className="w-10 h-12 text-lg font-bold" />
                          <InputOTPSlot index={3} className="w-10 h-12 text-lg font-bold" />
                          <InputOTPSlot index={4} className="w-10 h-12 text-lg font-bold" />
                          <InputOTPSlot index={5} className="w-10 h-12 text-lg font-bold" />
                        </InputOTPGroup>
                      </InputOTP>
                    </div>
                  </div>

                  {otpError && (
                    <div className="text-sm font-medium text-destructive bg-destructive/10 p-2.5 rounded-md">
                      {otpError}
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-11 text-base bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-500 dark:hover:bg-emerald-600 touch-manipulation"
                    disabled={otpLoading || otpCode.length !== 6}
                  >
                    {otpLoading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 animate-spin" /> যাচাই হচ্ছে...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4" /> ওটিপি যাচাই ও লগইন
                      </span>
                    )}
                  </Button>

                  <div className="text-center pt-1">
                    {countdown > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        পুনরায় কোড পাঠাতে অপেক্ষা করুন: <strong className="text-foreground">{countdown}s</strong>
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleSendOtp()}
                        disabled={otpLoading}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium inline-flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> পুনরায় ওটিপি পাঠান (Resend OTP)
                      </button>
                    )}
                  </div>
                </form>
              )}
            </TabsContent>
          </Tabs>

          {/* Google Sign-in */}
          <div className="mt-4 space-y-3">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">অথবা (or)</span>
              </div>
            </div>

            {googleError && (
              <div className="text-sm font-medium text-destructive bg-destructive/10 p-2.5 rounded-md">
                {googleError}
              </div>
            )}

            <Button
              type="button"
              id="google-signin-btn"
              variant="outline"
              className="w-full h-11 text-base flex items-center justify-center gap-3 border-2 hover:bg-muted/60 transition-all touch-manipulation"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
            >
              {googleLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              <span className="font-medium">Google দিয়ে লগইন</span>
            </Button>
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground border-t pt-4">
            নতুন দোকান শুরু করতে চান?{" "}
            <a
              href="/register"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 underline underline-offset-4"
            >
              নতুন একাউন্ট খুলুন (Register Store)
            </a>
          </div>

          <div className="mt-5 pt-3 border-t border-border/60 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <a href="/privacy-policy" className="hover:text-foreground hover:underline transition-colors">
              Privacy Policy
            </a>
            <span>•</span>
            <a href="/terms" className="hover:text-foreground hover:underline transition-colors">
              Terms
            </a>
            <span>•</span>
            <a href="/account-deletion" className="hover:text-foreground hover:underline transition-colors">
              Account Deletion
            </a>
            <span>•</span>
            <a href="/contact" className="hover:text-foreground hover:underline transition-colors">
              Contact
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
