'use client';

import React from 'react';
import { Shield, FileText, Trash2, ExternalLink, HelpCircle, Smartphone, CheckCircle2, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AboutTab() {
  const openUrl = (path: string) => {
    window.open(path, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      {/* App & Developer Identity Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-sm overflow-hidden">
              <img
                src="/app-icon.svg"
                alt="Onuron POS"
                className="w-9 h-9 object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div>
              <CardTitle className="text-lg font-bold flex items-center gap-2">
                <span>Onuron POS</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
                  v1.0.2
                </span>
              </CardTitle>
              <CardDescription className="text-xs">
                Package: <code className="font-mono">com.onuron.pos</code> • Multi-Tenant Architecture
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm pt-0">
          <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Developer / Operating Entity:</span>
              <strong className="text-foreground">MorphWorks</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Official Web Domain:</span>
              <span className="font-mono text-indigo-600 dark:text-indigo-400">pos.onuron.org</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Privacy Officer:</span>
              <span className="text-foreground">privacy@onuron.org</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legal & Policy Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Privacy Policy */}
        <Card className="hover:border-indigo-500/50 transition cursor-pointer" onClick={() => openUrl('/privacy-policy')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                  <Shield className="w-4 h-4" />
                </div>
                <CardTitle className="text-sm font-semibold">Privacy Policy</CardTitle>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Read our complete 18-section privacy disclosure covering Camera ML Kit, offline IndexedDB sync, Firebase, and AI advisor.
          </CardContent>
        </Card>

        {/* Account Deletion */}
        <Card className="hover:border-rose-500/50 transition cursor-pointer" onClick={() => openUrl('/account-deletion')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400">
                  <Trash2 className="w-4 h-4" />
                </div>
                <CardTitle className="text-sm font-semibold text-rose-700 dark:text-rose-400">Account Deletion</CardTitle>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Google Play mandatory deletion portal: request deletion of your employee account or entire store business data.
          </CardContent>
        </Card>

        {/* Terms of Service */}
        <Card className="hover:border-indigo-500/50 transition cursor-pointer" onClick={() => openUrl('/terms')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                  <FileText className="w-4 h-4" />
                </div>
                <CardTitle className="text-sm font-semibold">Terms of Service</CardTitle>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Review merchant licensing, business data ownership rights, acceptable use policy, and warranties.
          </CardContent>
        </Card>

        {/* Contact & Support */}
        <Card className="hover:border-indigo-500/50 transition cursor-pointer" onClick={() => openUrl('/contact')}>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <CardTitle className="text-sm font-semibold">Contact & Support</CardTitle>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Reach MorphWorks technical assistance at support@onuron.org or submit inquiries online.
          </CardContent>
        </Card>
      </div>

      {/* Safety & Compliance Notice */}
      <Card className="border-border bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            Security & Privacy Architecture
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-2">
          <p>
            • <strong>Tenant Data Isolation:</strong> Enforced at PostgreSQL database level via Row-Level Security (RLS) policies.
          </p>
          <p>
            • <strong>Local ML Barcode Scanning:</strong> Camera video frames are processed on-device and never stored or transmitted to remote servers.
          </p>
          <p>
            • <strong>No Advertising Profiling:</strong> We do not sell personal or merchant financial transaction data to advertisers.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
