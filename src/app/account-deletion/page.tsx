'use client';

import React, { useState } from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Trash2, ShieldAlert, CheckCircle2, HelpCircle, ArrowRight, AlertTriangle, Smartphone, Mail } from 'lucide-react';

export default function AccountDeletionPage() {
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [role, setRole] = useState('cashier');
  const [deletionType, setDeletionType] = useState<'USER_ONLY' | 'FULL_BUSINESS'>('USER_ONLY');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; referenceId?: string; message?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !confirmed) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch('/api/account-deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          identifier,
          businessName,
          role,
          deletionType,
          reason,
          confirmed,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setResult({ success: true, referenceId: data.referenceId, message: data.message });
      } else {
        setResult({ success: false, message: data.error || 'Failed to submit request.' });
      }
    } catch {
      setResult({
        success: false,
        message: 'Network error. Please contact privacy@onuron.org directly to submit your request.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-rose-500/20">
      <PublicHeader activePage="account-deletion" />

      {/* Hero Header */}
      <section className="border-b border-border bg-gradient-to-b from-rose-50/40 via-background to-background dark:from-rose-950/20 dark:via-background dark:to-background py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 mb-4">
            <Trash2 className="w-3.5 h-3.5" />
            Google Play Account Deletion Portal
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Account & Data Deletion
          </h1>
          <p className="mt-3 text-base text-muted-foreground leading-relaxed">
            You have full control over your Onuron POS account and personal information. This page explains how your data is handled when you request deletion and provides both in-app and web-based deletion procedures.
          </p>
        </div>
      </section>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 flex-1 space-y-12">
        {/* Multi-Tenant Distinction Callout */}
        <section className="p-5 rounded-xl border border-border bg-card space-y-4">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Understanding Account Deletion in a Multi-Tenant POS System
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Because Onuron POS is designed for commercial business operations, we distinguish between <strong>Individual User Accounts</strong> and <strong>Entire Business Stores</strong>:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Option A: User / Staff Account Deletion
              </span>
              <h3 className="font-semibold text-sm text-foreground">Cashiers, Managers & Staff</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Deletes your personal profile, phone number, login credentials, and session access. Historical store invoices created during your shifts remain safely in the store ledger under the store owner to maintain accurate financial accounting.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-border bg-muted/30 space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Option B: Complete Business & Store Deletion
              </span>
              <h3 className="font-semibold text-sm text-foreground">Store Owners Only</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Permanently purges the entire business tenant, store catalog, product list, customer debt ledgers, sales history, employee memberships, and sync queues. This action is irreversible.
              </p>
            </div>
          </div>
        </section>

        {/* In-App Instructions */}
        <section className="space-y-4 border-b border-border pb-10">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            1. Delete Your Account Directly Inside the App
          </h2>
          <p className="text-sm text-muted-foreground">
            If you have the Onuron POS Android application installed on your device, you can initiate account deletion immediately from Settings:
          </p>
          <div className="p-4 rounded-xl bg-muted/30 border border-border">
            <ol className="list-decimal pl-5 space-y-2 text-sm text-foreground">
              <li>Open the <strong>Onuron POS</strong> app and sign in with your credentials.</li>
              <li>Navigate to <strong>Settings</strong> from the bottom or sidebar menu.</li>
              <li>Tap on <strong>About & Legal</strong> tab.</li>
              <li>Select <strong>Request Account Deletion</strong> and confirm your decision.</li>
            </ol>
          </div>
        </section>

        {/* Web-Based Deletion Request Form */}
        <section className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              2. Submit a Deletion Request Online
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              If you have uninstalled the app, lost access to your device, or prefer submitting via web, fill out the official deletion request form below:
            </p>
          </div>

          {result?.success ? (
            <div className="p-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200 space-y-3">
              <div className="flex items-center gap-2 font-bold text-base">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                Deletion Request Registered
              </div>
              <p className="text-sm leading-relaxed">{result.message}</p>
              <div className="p-3 bg-background/80 rounded-lg border border-emerald-500/20 text-xs font-mono">
                Tracking Reference ID: <strong className="text-foreground">{result.referenceId}</strong>
              </div>
              <p className="text-xs text-muted-foreground">
                Please keep this reference ID. For urgent inquiries, email{' '}
                <a href="mailto:privacy@onuron.org" className="underline font-medium text-foreground">
                  privacy@onuron.org
                </a>
                .
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="p-6 rounded-xl border border-border bg-card space-y-5 shadow-sm">
              {result && !result.success && (
                <div className="p-3.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200 text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{result.message}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Registered Phone Number or Email <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="+91... or email@example.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Store / Business Name</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="Store name (if applicable)"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Your Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="cashier">Staff / Cashier</option>
                    <option value="manager">Store Manager</option>
                    <option value="owner">Business Owner</option>
                  </select>
                </div>
              </div>

              {/* Deletion Type Radio */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-semibold text-foreground">Requested Scope of Deletion</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                      deletionType === 'USER_ONLY'
                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20'
                        : 'border-border bg-background'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deletionType"
                      checked={deletionType === 'USER_ONLY'}
                      onChange={() => setDeletionType('USER_ONLY')}
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-foreground">Delete My User Account</p>
                      <p className="text-muted-foreground mt-0.5">Removes my login credentials & personal details.</p>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition ${
                      deletionType === 'FULL_BUSINESS'
                        ? 'border-rose-600 bg-rose-50/40 dark:bg-rose-950/20'
                        : 'border-border bg-background'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deletionType"
                      checked={deletionType === 'FULL_BUSINESS'}
                      onChange={() => setDeletionType('FULL_BUSINESS')}
                      className="mt-0.5"
                    />
                    <div className="text-xs">
                      <p className="font-semibold text-foreground">Delete Complete Business Store</p>
                      <p className="text-muted-foreground mt-0.5">Purges all store inventory, sales, and accounts (Owner only).</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Reason for Deletion (Optional)</label>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tell us why you are deleting your account..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer pt-1">
                <input
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 rounded border-border"
                />
                <span>
                  I confirm that I want to delete my account/data. I understand that once processed, access to this account cannot be recovered.
                </span>
              </label>

              <button
                type="submit"
                disabled={loading || !confirmed || !identifier}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-2"
              >
                {loading ? 'Submitting...' : 'Submit Deletion Request'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </section>

        {/* Retention Disclosure */}
        <section className="p-4 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground space-y-2">
          <h3 className="font-semibold text-foreground">Statutory Data Retention Notice</h3>
          <p className="leading-relaxed">
            Upon receipt and identity verification of your request, active user credentials and memberships will be purged within 7 business days. As required by applicable commercial accounting and taxation regulations, past tax invoices and audit trails may be archived securely in cold storage until the statutory retention period expires, after which they are irreversibly destroyed.
          </p>
          <p>
            Operating Entity: <strong>MorphWorks</strong> • Privacy Contact:{' '}
            <a href="mailto:privacy@onuron.org" className="text-indigo-600 dark:text-indigo-400 underline">
              privacy@onuron.org
            </a>
          </p>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
