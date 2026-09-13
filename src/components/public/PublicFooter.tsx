import React from 'react';
import Link from 'next/link';

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-muted/30 text-muted-foreground text-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start text-center md:text-left gap-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">Onuron POS</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-medium">
                v1.0.2
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Smart Point of Sale & Retail Management System developed & operated by <strong>MorphWorks</strong>.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium">
            <Link href="/privacy-policy" className="hover:text-foreground transition-colors">
              Privacy Policy
            </Link>
            <Link href="/account-deletion" className="hover:text-foreground transition-colors">
              Account Deletion
            </Link>
            <Link href="/terms" className="hover:text-foreground transition-colors">
              Terms of Service
            </Link>
            <Link href="/contact" className="hover:text-foreground transition-colors">
              Contact & Support
            </Link>
            <a href="mailto:privacy@onuron.org" className="hover:text-foreground transition-colors">
              privacy@onuron.org
            </a>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between text-xs text-muted-foreground gap-3">
          <p>© {new Date().getFullYear()} MorphWorks. All rights reserved.</p>
          <p>
            Official Website: <a href="https://pos.onuron.org" className="text-foreground hover:underline font-medium">pos.onuron.org</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
