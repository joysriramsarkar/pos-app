'use client';

import React, { useState } from 'react';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Mail, MessageSquare, Shield, HelpCircle, CheckCircle2, ArrowRight } from 'lucide-react';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate sending or redirecting to mailto
    const mailtoUrl = `mailto:support@onuron.org?subject=${encodeURIComponent(
      subject || 'Inquiry regarding Onuron POS'
    )}&body=${encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`)}`;
    window.location.href = mailtoUrl;
    setSent(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-indigo-500/20">
      <PublicHeader activePage="contact" />

      {/* Hero Header */}
      <section className="border-b border-border bg-gradient-to-b from-indigo-50/40 via-background to-background dark:from-indigo-950/20 dark:via-background dark:to-background py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 mb-4">
            <Mail className="w-3.5 h-3.5" />
            Official Support & Developer Contact
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Contact Us
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Have questions about Onuron POS, need technical support, or have privacy inquiries? Our team at <strong>MorphWorks</strong> is here to assist you.
          </p>
        </div>
      </section>

      {/* Contact Cards & Form */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 flex-1 space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-6 rounded-xl border border-border bg-card space-y-3 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <HelpCircle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-foreground">Customer & Technical Support</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              For assistance with hardware setups (printers, barcode scanners), account setup, offline sync troubleshooting, or feature requests.
            </p>
            <a
              href="mailto:support@onuron.org"
              className="inline-block font-semibold text-sm text-indigo-600 dark:text-indigo-400 hover:underline pt-2"
            >
              support@onuron.org
            </a>
          </div>

          <div className="p-6 rounded-xl border border-border bg-card space-y-3 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
              <Shield className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-base text-foreground">Privacy & Compliance Inquiries</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              For queries related to our Privacy Policy, data protection practices, data export, or account deletion requests.
            </p>
            <a
              href="mailto:privacy@onuron.org"
              className="inline-block font-semibold text-sm text-indigo-600 dark:text-indigo-400 hover:underline pt-2"
            >
              privacy@onuron.org
            </a>
          </div>
        </div>

        {/* Quick Message Form */}
        <div className="p-6 rounded-xl border border-border bg-card space-y-5 shadow-sm">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-bold text-lg text-foreground">Send a Message</h2>
          </div>

          {sent ? (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 text-sm flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Thank you! Your default email client was opened. We look forward to hearing from you.</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Your Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Email Address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Subject</label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject of your message"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Message</label>
                <textarea
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="How can we help your business?"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition flex items-center justify-center gap-2 shadow-sm"
              >
                Send Message
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>

        {/* Developer Entity Box */}
        <div className="p-4 rounded-xl border border-border bg-muted/20 text-xs text-muted-foreground space-y-1">
          <p><strong>Developer & Entity:</strong> MorphWorks</p>
          <p><strong>Application:</strong> Onuron POS (Android App ID: <code>com.onuron.pos</code>)</p>
          <p><strong>Website:</strong> <a href="https://pos.onuron.org" className="underline text-foreground">https://pos.onuron.org</a></p>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
