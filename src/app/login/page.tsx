"use client";

import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Clear any cached session and IndexedDB when on the login page
    localStorage.removeItem("pos-app-session-user");
    import("@/lib/offline/indexeddb")
      .then((m) => m.clearAllOfflineData())
      .catch(() => {});
    if (searchParams.get("passwordChanged") === "1") {
      toast({ title: "✅ পাসওয়ার্ড পরিবর্তন সফল হয়েছে!", description: "নতুন পাসওয়ার্ড দিয়ে লগইন করুন।" });
    }
    if (searchParams.get("registered") === "1") {
      toast({ title: "✅ দোকান নিবন্ধন সফল হয়েছে!", description: "এখন ইউজারনেম ও পাসওয়ার্ড দিয়ে লগইন করুন।" });
    }
  }, [searchParams, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        username: username.trim(),
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("ভুল ইউজারনেম/মোবাইল বা পাসওয়ার্ড (Invalid username/phone or password)");
      } else {
        window.location.href = "/";
      }
    } catch {
      setError("লগইন করার সময় ত্রুটি হয়েছে (An error occurred during login)");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-muted/40 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">
            লগইন (Login)
          </CardTitle>
          <CardDescription>
            দোকানে প্রবেশ করতে ইউজারনেম/ফোন ও পাসওয়ার্ড দিন
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">ইউজারনেম বা মোবাইল নম্বর</Label>
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
                placeholder="Username or Phone number"
                required
                disabled={isLoading}
                className="h-11 text-base"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">পাসওয়ার্ড (Password)</Label>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={isLoading}
                className="h-11 text-base"
              />
            </div>

            {error && (
              <div className="text-sm font-medium text-destructive bg-destructive/10 p-2 rounded-md">
                {error}
              </div>
            )}

            <Button 
              type="submit" 
              className="w-full h-11 text-base bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600 touch-manipulation" 
              disabled={isLoading}
            >
              {isLoading ? "লগইন হচ্ছে..." : "লগইন (Login)"}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground border-t pt-4">
            নতুন দোকান শুরু করতে চান?{" "}
            <a
              href="/register"
              className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 underline underline-offset-4"
            >
              নতুন একাউন্ট খুলুন (Register Store)
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
