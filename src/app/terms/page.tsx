import React from 'react';
import type { Metadata } from 'next';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
import { FileText, Shield, CheckCircle2 } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service | Onuron POS',
  description:
    'Terms of Service for Onuron POS Android application and web platform operated by MorphWorks. Learn about data ownership, licensing, acceptable use, and service commitments.',
  keywords: ['Onuron POS terms', 'POS terms of service', 'MorphWorks terms', 'pos.onuron.org terms'],
};

export default function TermsPage() {
  const lastUpdated = 'September 13, 2026';

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-indigo-500/20">
      <PublicHeader activePage="terms" />

      {/* Hero Header */}
      <section className="border-b border-border bg-gradient-to-b from-indigo-50/40 via-background to-background dark:from-indigo-950/20 dark:via-background dark:to-background py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 mb-4">
            <FileText className="w-3.5 h-3.5" />
            Legal Agreement
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Terms of Service
          </h1>
          <p className="mt-3 text-base text-muted-foreground">
            Onuron POS • Developed and Operated by <strong>MorphWorks</strong> • Last Updated: {lastUpdated}
          </p>
        </div>
      </section>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 flex-1">
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10 text-sm sm:text-base leading-relaxed text-muted-foreground">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">1. Acceptance of Terms</h2>
            <p>
              These Terms of Service (&quot;Terms&quot;) govern your access to and use of the <strong>Onuron POS</strong> mobile application (Android App ID: <code>com.onuron.pos</code>), web portal (<code>https://pos.onuron.org</code>), and associated cloud services operated by <strong>MorphWorks</strong> (&quot;MorphWorks&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
            </p>
            <p>
              By installing, creating an account, or using Onuron POS, you agree to be bound by these Terms and our{' '}
              <a href="/privacy-policy" className="text-indigo-600 dark:text-indigo-400 underline font-medium">
                Privacy Policy
              </a>
              . If you do not agree to these Terms, do not use the application.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">2. Service Description</h2>
            <p>
              Onuron POS is a commercial point-of-sale software designed for retail merchants, grocers, and commercial enterprises. The service includes billing, inventory tracking, customer credit ledger management, thermal and PDF invoice printing, barcode scanning, offline caching, and reporting analytics.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">3. Business Accounts & Security</h2>
            <p>
              To access Onuron POS, you must register a user account and either create or join a business entity. You agree to:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide accurate and complete account registration information.</li>
              <li>Maintain the confidentiality of your authentication credentials and passwords.</li>
              <li>Promptly notify us of any suspected unauthorized access to your account or store data.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">4. Business Data Ownership</h2>
            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20 text-foreground">
              <strong>Your Data Belongs to You:</strong> You retain full, exclusive ownership of all business catalogs, product inventories, prices, customer lists, and financial records uploaded or generated through Onuron POS. MorphWorks claims no intellectual property rights or ownership over your business data.
            </div>
            <p className="mt-2">
              You grant MorphWorks a limited license solely to host, backup, and process your data to provide the POS service to you and your authorized staff.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">5. Acceptable Use Policy</h2>
            <p>You agree not to use Onuron POS to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Violate any local, national, or international commercial laws or regulations.</li>
              <li>Conduct fraudulent billing or unauthorized financial transactions.</li>
              <li>Attempt to reverse-engineer, decompile, or breach multi-tenant row-level security isolation.</li>
              <li>Interfere with or disrupt the normal operation of our servers or networks.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">6. Offline Functionality & Data Synchronization</h2>
            <p>
              Onuron POS supports offline transaction caching via device local storage. You acknowledge that pending offline records reside on the physical device until synchronized. Merchants are solely responsible for ensuring device security (passcodes/screen locks) and syncing data before resetting or uninstalling the app.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">7. Disclaimer of Warranties & Limitation of Liability</h2>
            <p>
              Onuron POS is provided on an &quot;AS IS&quot; and &quot;AS AVAILABLE&quot; basis. To the maximum extent permitted by applicable law, MorphWorks disclaims all warranties of any kind, whether express or implied.
            </p>
            <p>
              In no event shall MorphWorks be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, revenue, or business data, arising out of or related to your use of the application.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">8. Termination & Account Deletion</h2>
            <p>
              You may terminate your account at any time by following the account deletion process outlined on our{' '}
              <a href="/account-deletion" className="text-indigo-600 dark:text-indigo-400 underline font-medium">
                Account Deletion Page
              </a>
              . We reserve the right to suspend or terminate accounts that violate these Terms.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">9. Contact Us</h2>
            <p>
              If you have any questions or legal inquiries regarding these Terms of Service, please contact:
            </p>
            <div className="p-4 rounded-xl border border-border bg-card text-foreground space-y-1">
              <p><strong>Entity:</strong> MorphWorks</p>
              <p><strong>App:</strong> Onuron POS (<code>com.onuron.pos</code>)</p>
              <p>
                <strong>Legal & Support Email:</strong>{' '}
                <a href="mailto:support@onuron.org" className="text-indigo-600 dark:text-indigo-400 underline">
                  support@onuron.org
                </a>
              </p>
              <p>
                <strong>Website:</strong>{' '}
                <a href="https://pos.onuron.org" className="text-indigo-600 dark:text-indigo-400 underline">
                  https://pos.onuron.org
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
