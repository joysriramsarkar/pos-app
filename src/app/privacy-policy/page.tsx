import React from 'react';
import type { Metadata } from 'next';
import { PublicHeader } from '@/components/public/PublicHeader';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Shield, Lock, Eye, Database, Server, Smartphone, Cpu, RefreshCw, Trash2, Mail, ExternalLink } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy | Onuron POS',
  description:
    'Comprehensive Privacy Policy for Onuron POS Android application and web services operated by MorphWorks. Learn how your business data, camera permissions, and customer records are protected.',
  keywords: [
    'Onuron POS Privacy Policy',
    'POS data privacy',
    'MorphWorks',
    'Android POS privacy',
    'pos.onuron.org privacy',
  ],
};

export default function PrivacyPolicyPage() {
  const lastUpdated = 'September 13, 2026';

  const sections = [
    { id: 'about', title: '1. About Onuron POS' },
    { id: 'data-collected', title: '2. Information We Collect' },
    { id: 'how-we-use', title: '3. How We Use Information' },
    { id: 'business-data', title: '4. Business & POS Financial Data' },
    { id: 'camera', title: '5. Camera & Barcode Scanning' },
    { id: 'offline-sync', title: '6. Offline Data & Synchronization' },
    { id: 'authentication', title: '7. Authentication & Credentials' },
    { id: 'third-party-services', title: '8. Analytics & Third-Party SDKs' },
    { id: 'ai-advisor', title: '9. AI Business Advisor' },
    { id: 'sharing', title: '10. How We Share Information' },
    { id: 'security', title: '11. Data Security & Multi-Tenancy' },
    { id: 'retention', title: '12. Data Retention' },
    { id: 'account-deletion', title: '13. Account & Business Data Deletion' },
    { id: 'your-rights', title: '14. Your Rights & Choices' },
    { id: 'children', title: '15. Children’s Privacy' },
    { id: 'international', title: '16. International Data Processing' },
    { id: 'changes', title: '17. Changes to This Policy' },
    { id: 'contact', title: '18. Contact Us' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-indigo-500/20">
      <PublicHeader activePage="privacy" />

      {/* Hero Header */}
      <section className="border-b border-border bg-gradient-to-b from-indigo-50/50 via-background to-background dark:from-indigo-950/20 dark:via-background dark:to-background py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 mb-4">
            <Shield className="w-3.5 h-3.5" />
            Official Privacy Documentation
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
            Privacy Policy
          </h1>
          <p className="mt-2 text-base text-muted-foreground">
            Onuron POS • Android App ID: <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">com.onuron.pos</code>
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-muted-foreground border-t border-border pt-4">
            <span><strong>Effective Date:</strong> {lastUpdated}</span>
            <span>•</span>
            <span><strong>Developer / Legal Entity:</strong> MorphWorks</span>
            <span>•</span>
            <span><strong>URL:</strong> https://pos.onuron.org/privacy-policy</span>
          </div>
          <div className="mt-6 p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/40 dark:bg-indigo-950/30 text-sm leading-relaxed text-foreground">
            <strong>Core Principle:</strong> Your business data belongs to your business. Onuron POS does not sell personal information or business data to advertisers, nor do we track user behavior for third-party ad targeting.
          </div>
        </div>
      </section>

      {/* Main Content Layout */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 flex-1">
        {/* Table of Contents Box */}
        <div className="p-5 rounded-xl border border-border bg-muted/20 mb-12">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
            Table of Contents
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {sections.map((sec) => (
              <a
                key={sec.id}
                href={`#${sec.id}`}
                className="text-indigo-600 dark:text-indigo-400 hover:underline hover:text-indigo-700 dark:hover:text-indigo-300 truncate"
              >
                {sec.title}
              </a>
            ))}
          </div>
        </div>

        {/* Policy Body */}
        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-12 leading-relaxed">
          {/* Section 1 */}
          <section id="about" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">1.</span> About Onuron POS
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              Onuron POS is a multi-tenant point-of-sale, billing, and retail inventory management application developed and operated by <strong>MorphWorks</strong> (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;).
            </p>
            <p className="text-sm sm:text-base text-muted-foreground mt-2">
              This Privacy Policy applies to the <strong>Onuron POS Android application</strong> (Application ID: <code>com.onuron.pos</code>), the official web application (<code>https://pos.onuron.org</code>), and associated backend APIs. It describes our policies and practices regarding the collection, storage, use, protection, and disclosure of information when you access or use Onuron POS.
            </p>
            <p className="text-sm sm:text-base text-muted-foreground mt-2">
              By installing, accessing, or using Onuron POS, you acknowledge that you have read and understood this Privacy Policy.
            </p>
          </section>

          {/* Section 2 */}
          <section id="data-collected" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">2.</span> Information We Collect
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              Depending on how you use Onuron POS and the permissions granted, we may process the following categories of information:
            </p>
            
            <h3 className="text-base font-semibold text-foreground mt-4">A. Account & User Credentials</h3>
            <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1 mt-2">
              <li>Full name</li>
              <li>Username and employee identifier</li>
              <li>Phone number (used for login and OTP verification)</li>
              <li>Email address (optional or used for Google sign-in)</li>
              <li>Account role (Owner, Admin, Manager, Cashier, Viewer)</li>
              <li>
                <strong>Password Credentials:</strong> Passwords are protected using salted cryptographic hashes (bcrypt) and are never stored, logged, or visible in plain text.
              </li>
            </ul>

            <h3 className="text-base font-semibold text-foreground mt-4">B. Technical & Diagnostic Information</h3>
            <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1 mt-2">
              <li>Device model, manufacturer, and Android operating system version</li>
              <li>Application version and build number</li>
              <li>Network status (online/offline state) for synchronization timing</li>
              <li>IP address (used strictly for rate limiting, DDoS defense, and security audit logs)</li>
              <li>Error logs, crash reports, and performance diagnostics via Firebase</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section id="how-we-use" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">3.</span> How We Use Information
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              We process information solely to provide, operate, and maintain the Onuron POS service:
            </p>
            <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1 mt-2">
              <li>Creating and managing business profiles and employee memberships</li>
              <li>Processing retail sales, calculating discounts, taxes, and customer change</li>
              <li>Generating and printing physical or PDF sales receipts and invoices</li>
              <li>Tracking product catalog inventory, stock adjustments, and low-stock alerts</li>
              <li>Managing customer credit accounts (ledger entries, dues, repayments)</li>
              <li>Syncing offline transactions with cloud servers when connectivity is available</li>
              <li>Enforcing security controls, role permissions, and brute-force prevention</li>
              <li>Providing optional AI-powered business advisory summaries upon merchant request</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section id="business-data" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">4.</span> Business & POS Financial Data
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              Onuron POS is an enterprise multi-tenant software system. Each business is logically and cryptographically partitioned from other businesses. Depending on the modules utilized by your enterprise, Onuron POS stores:
            </p>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3.5 rounded-lg border border-border bg-card">
                <h4 className="font-semibold text-foreground">Business Profile</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Store name, address, business phone, business email, currency (e.g., INR), timezone, and receipt customization headers/footers.
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-border bg-card">
                <h4 className="font-semibold text-foreground">Products & Inventory</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Product names, Bengali names, categories, barcodes, buying/cost prices, selling prices, unit measures, and real-time stock balances.
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-border bg-card">
                <h4 className="font-semibold text-foreground">Customer & Supplier Records</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Customer names, contact numbers, credit dues, advance payments, supplier details, and transaction histories.
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-border bg-card">
                <h4 className="font-semibold text-foreground">Transactions & Financials</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Invoices, payment breakdown (Cash, UPI, Card), daily store expenses, refunds/returns, and daily manual cash registers.
                </p>
              </div>
            </div>
            <div className="mt-4 p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-200">
              <strong>Financial Data Notice:</strong> Onuron POS does not store credit card numbers, CVVs, or bank account credentials. Payment methods are recorded solely as descriptive payment modes (e.g. &quot;Cash&quot; or &quot;UPI&quot;) for business accounting.
            </div>
          </section>

          {/* Section 5 */}
          <section id="camera" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">5.</span> Camera & Barcode Scanning
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              The Onuron POS Android application requests access to the device camera (<code>android.permission.CAMERA</code>).
            </p>
            <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1.5 mt-2">
              <li>
                <strong>Purpose:</strong> Camera access is used <em>strictly and solely</em> for scanning product barcodes and QR codes to look up products in the POS cart and inventory modules.
              </li>
              <li>
                <strong>Local Machine Learning Processing:</strong> Barcode scanning is performed locally on the device using Google ML Kit Barcode Scanning.
              </li>
              <li>
                <strong>No Image Storage or Uploads:</strong> Video preview frames and camera photos are processed in temporary device memory and are <strong>never stored on disk or transmitted to our servers or third parties</strong>.
              </li>
              <li>
                <strong>No Surveillance:</strong> The camera is only active while the barcode scanning screen is explicitly open and displayed to the user.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section id="offline-sync" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">6.</span> Offline Data & Synchronization
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              Onuron POS is engineered for uninterrupted offline operation. When network connectivity is intermittent or unavailable:
            </p>
            <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1 mt-2">
              <li>Business product catalogs, customer balances, and pending sales are cached locally on the device in an encrypted/tenant-isolated IndexedDB database.</li>
              <li>Offline sales are queued in a local sync queue with cryptographic idempotency keys to prevent duplicate transactions.</li>
              <li>When internet connectivity is restored, eligible queued transactions are automatically synchronized with the central cloud database.</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-3 p-3 rounded-lg bg-muted/40 border border-border">
              <strong>Device Security Advisory:</strong> Because local offline data resides on the physical device storage until synchronized or cleared, merchants are strongly advised to secure their Android devices with screen lock PINs, passwords, or biometrics.
            </p>
          </section>

          {/* Section 7 */}
          <section id="authentication" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">7.</span> Authentication & Credentials
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              User identity and session verification are handled through secure authentication mechanisms:
            </p>
            <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1 mt-2">
              <li><strong>Session Cookies / JWT:</strong> Authenticated sessions use HTTP-only, secure, encrypted session tokens.</li>
              <li><strong>Password Hashing:</strong> Passwords are hashed using the industry-standard bcrypt algorithm with dynamic salt rounds.</li>
              <li><strong>Brute-force Protection:</strong> Failed login attempts are rate-limited per IP and per username to prevent credential stuffing and brute-force attacks.</li>
            </ul>
          </section>

          {/* Section 8 */}
          <section id="third-party-services" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">8.</span> Analytics & Third-Party SDKs
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              We integrate select third-party SDKs from reputable providers to support authentication, security, and app reliability:
            </p>
            <div className="mt-4 space-y-3">
              <div className="p-3.5 rounded-lg border border-border bg-card text-sm">
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>Google Firebase (Google LLC)</span>
                  <a
                    href="https://policies.google.com/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1 hover:underline"
                  >
                    Privacy Policy <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  We use Firebase Authentication for optional phone OTP verification and Firebase Analytics for crash diagnostics and technical stability monitoring. Data collected may include pseudonymized app instance IDs, device hardware details, and crash stack traces.
                </p>
              </div>
              <div className="p-3.5 rounded-lg border border-border bg-card text-sm">
                <div className="font-semibold text-foreground">Google ML Kit Barcode Scanning</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Operates completely on-device for barcode extraction. No image frames or visual biometric data are sent to Google cloud servers.
                </p>
              </div>
            </div>
          </section>

          {/* Section 9 */}
          <section id="ai-advisor" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">9.</span> AI Business Advisor
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              Onuron POS provides an optional, merchant-initiated <strong>AI Business Advisor</strong> feature (accessible via the Reports / Advisor module).
            </p>
            <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1.5 mt-2">
              <li>
                <strong>What is Transmitted:</strong> When you actively submit a query to the AI Advisor, high-level aggregated business report metrics (such as total sales count, revenue figures, category breakdowns, and top-selling product names) along with your natural-language question are sent to our AI service processor using the <code>glm-4-flash</code> language model via secure API middleware.
              </li>
              <li>
                <strong>No Personal Customer Data:</strong> Customer phone numbers, passwords, and payment card information are excluded from the AI prompt context.
              </li>
              <li>
                <strong>User Responsibility:</strong> We recommend that merchants do not enter personal identifying information or confidential third-party credentials into the free-form question input.
              </li>
              <li>
                <strong>No Use for Advertising:</strong> Data transmitted to the AI Advisor is used exclusively to generate the immediate business answer and is not used for behavioral ad profiling.
              </li>
            </ul>
          </section>

          {/* Section 10 */}
          <section id="sharing" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">10.</span> How We Share Information
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              We do not sell, rent, or trade your personal information or business financial records to any third party. We share data only with service providers strictly necessary to operate the application:
            </p>

            {/* Structured Table */}
            <div className="mt-4 overflow-x-auto border border-border rounded-xl">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-muted/50 text-foreground font-semibold border-b border-border">
                  <tr>
                    <th className="p-3">Service Partner</th>
                    <th className="p-3">Purpose</th>
                    <th className="p-3">Data Processed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-muted-foreground">
                  <tr>
                    <td className="p-3 font-medium text-foreground">PostgreSQL / Supabase</td>
                    <td className="p-3">Cloud database infrastructure & storage</td>
                    <td className="p-3">Tenant business data, sales, products, users</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-foreground">Firebase (Google LLC)</td>
                    <td className="p-3">Phone authentication & crash analytics</td>
                    <td className="p-3">Device metadata, crash logs, auth identifiers</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-foreground">AI Service Provider</td>
                    <td className="p-3">AI Business Advisor request processing</td>
                    <td className="p-3">Aggregated sales reports & merchant questions</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-foreground">Vercel Inc.</td>
                    <td className="p-3">Web hosting, CDN, and backend API routing</td>
                    <td className="p-3">HTTP requests, server logs, IP addresses</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium text-foreground">Legal Authorities</td>
                    <td className="p-3">Compliance with legal obligations</td>
                    <td className="p-3">Disclosed only upon valid court order or law</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-1 text-sm text-muted-foreground">
              <p>✓ <strong>Zero Sale of Data:</strong> We never sell personal or business data to data brokers or advertising networks.</p>
              <p>✓ <strong>Zero Ad Retargeting:</strong> We do not use customer purchase data or store receipts for targeted advertising.</p>
            </div>
          </section>

          {/* Section 11 */}
          <section id="security" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">11.</span> Data Security & Multi-Tenancy
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              We implement comprehensive technical and organizational safeguards designed to protect your data against unauthorized access, loss, or alteration:
            </p>
            <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1.5 mt-2">
              <li>
                <strong>PostgreSQL Row-Level Security (RLS):</strong> Multi-tenant isolation is enforced directly at the database engine layer. Every query is bound to the active transaction business tenant context.
              </li>
              <li>
                <strong>Encrypted Communications:</strong> All network traffic between the Android app, web portal, and cloud servers is encrypted using Transport Layer Security (TLS 1.3 / HTTPS).
              </li>
              <li>
                <strong>Role-Based Access Control (RBAC):</strong> Strict permissions prevent unauthorized cashiers or viewers from viewing confidential profit margins or modifying store settings.
              </li>
              <li>
                <strong>Audit Logging:</strong> Critical operations (such as price edits, inventory adjustments, user creations, and refunds) are recorded with timestamps, user IDs, and client IP addresses.
              </li>
            </ul>
          </section>

          {/* Section 12 */}
          <section id="retention" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">12.</span> Data Retention
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              We retain account and business records for as long as your business maintains an active subscription or account with Onuron POS.
            </p>
            <p className="text-sm sm:text-base text-muted-foreground mt-2">
              When an account or business data deletion request is fulfilled, records are permanently deleted or irreversibly anonymized from active operational databases. Certain financial invoices, tax records, and audit logs may be retained in encrypted archives for statutory periods strictly required by applicable commercial accounting laws, tax regulations, and fraud-prevention obligations.
            </p>
          </section>

          {/* Section 13 */}
          <section id="account-deletion" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">13.</span> Account & Business Data Deletion
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              In accordance with Google Play Developer Policies and data protection standards, users have the right to request deletion of their account and associated data at any time.
            </p>

            <div className="mt-4 p-4 rounded-xl border border-border bg-card space-y-3">
              <h3 className="text-sm font-bold text-foreground">How to Request Deletion:</h3>
              <ul className="list-disc pl-5 text-xs sm:text-sm text-muted-foreground space-y-1">
                <li>
                  <strong>Inside the App:</strong> Go to <strong>Settings → About & Legal → Request Account Deletion</strong>.
                </li>
                <li>
                  <strong>Via Web Portal:</strong> Submit a request anytime at our dedicated public deletion page:{' '}
                  <a href="/account-deletion" className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">
                    https://pos.onuron.org/account-deletion
                  </a>
                </li>
                <li>
                  <strong>Via Email:</strong> Send a deletion request to <a href="mailto:privacy@onuron.org" className="text-indigo-600 dark:text-indigo-400 hover:underline">privacy@onuron.org</a> with your registered phone number or email address.
                </li>
              </ul>
              
              <div className="pt-2 text-xs text-muted-foreground border-t border-border">
                <strong>Multi-Tenant Distinction:</strong>
                <ul className="list-circle pl-5 mt-1 space-y-1">
                  <li><strong>Staff/Cashier Deletion:</strong> Removes the personal login, phone number, and access credentials of the individual employee. Store business sales records remain intact under the store owner.</li>
                  <li><strong>Business Owner Deletion:</strong> Permanently purges the entire business entity, all staff memberships, inventory, customer accounts, and expense records.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Section 14 */}
          <section id="your-rights" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">14.</span> Your Rights & Choices
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              Depending on your jurisdiction, you have the following rights regarding your personal information:
            </p>
            <ul className="list-disc pl-5 text-sm sm:text-base text-muted-foreground space-y-1 mt-2">
              <li><strong>Access:</strong> Request a copy of the personal and business data associated with your account.</li>
              <li><strong>Rectification:</strong> Correct or update inaccurate account information directly in store settings.</li>
              <li><strong>Erasure:</strong> Request the complete deletion of your account and records.</li>
              <li><strong>Data Portability:</strong> Export your product catalog, sales reports, and customer ledgers to Excel/CSV format directly from the application reports panel.</li>
            </ul>
          </section>

          {/* Section 15 */}
          <section id="children" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">15.</span> Children’s Privacy
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              Onuron POS is a commercial retail management tool designed exclusively for adult business owners, store operators, and employees aged 18 and older. It is not directed to or intended for use by children under the age of 18 (or 13/16 depending on local jurisdiction). We do not knowingly collect personal information from children.
            </p>
          </section>

          {/* Section 16 */}
          <section id="international" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">16.</span> International Data Processing
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              Our cloud infrastructure, database clusters, and hosting services are distributed across secure cloud data centers operated by leading infrastructure providers (including Supabase, Google Cloud, and Vercel). By using Onuron POS, you consent to the processing of your data within these managed cloud environments.
            </p>
          </section>

          {/* Section 17 */}
          <section id="changes" className="scroll-mt-24 border-b border-border/60 pb-8">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">17.</span> Changes to This Policy
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              We may update this Privacy Policy periodically to reflect new app features, regulatory requirements, or operational changes. The updated version will be indicated by the &quot;Last Updated&quot; date at the top of this document. Continued use of Onuron POS following posted updates constitutes your acceptance of the revised terms.
            </p>
          </section>

          {/* Section 18 */}
          <section id="contact" className="scroll-mt-24">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span className="text-indigo-600 dark:text-indigo-400">18.</span> Contact Us
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground mt-3">
              If you have any questions, feedback, or privacy concerns regarding this Privacy Policy or our data practices, please contact our Data Protection team:
            </p>
            <div className="mt-4 p-5 rounded-xl border border-border bg-card text-sm space-y-2">
              <p><strong>Operating Entity:</strong> MorphWorks</p>
              <p><strong>Application:</strong> Onuron POS (<code>com.onuron.pos</code>)</p>
              <p>
                <strong>Privacy Inquiries:</strong>{' '}
                <a href="mailto:privacy@onuron.org" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                  privacy@onuron.org
                </a>
              </p>
              <p>
                <strong>Technical Support:</strong>{' '}
                <a href="mailto:support@onuron.org" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                  support@onuron.org
                </a>
              </p>
              <p>
                <strong>Official Web Portal:</strong>{' '}
                <a href="https://pos.onuron.org" className="text-indigo-600 dark:text-indigo-400 hover:underline">
                  https://pos.onuron.org
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
