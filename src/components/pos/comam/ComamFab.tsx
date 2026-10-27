'use client';

import React from 'react';
import { Mic, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ComamFabProps {
  onClick: () => void;
}

export function ComamFab({ onClick }: ComamFabProps) {
  return (
    <div className="fixed bottom-6 right-6 z-40 print:hidden flex items-center gap-2">
      <Button
        type="button"
        onClick={onClick}
        className="h-12 w-12 rounded-full p-0 shadow-xl bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white border-2 border-emerald-400/40 relative group transition-transform hover:scale-105 active:scale-95"
        title="comam AI — ভয়েস বিলিং অ্যাসিস্ট্যান্ট (Alt+V)"
      >
        <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500" />
        </span>
        <Mic className="w-5 h-5 group-hover:scale-110 transition-transform" />
      </Button>
    </div>
  );
}
