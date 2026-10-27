'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ShoppingCart,
  Send,
  Volume2,
  VolumeX,
  X,
  CreditCard,
  User,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCartStore, useProductsStore, useCustomersStore } from '@/stores/pos-store';
import { parseComamCommand, type ComamDraft, type DraftItem } from '@/lib/comam/comam-engine';
import { formatBnTaka, formatBnNumber } from '@/lib/comam/bn-parser';
import type { Product } from '@/types/pos';

interface ComamVoiceAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCheckout?: () => void;
}

export function ComamVoiceAssistant({
  isOpen,
  onClose,
  onOpenCheckout,
}: ComamVoiceAssistantProps) {
  const products = useProductsStore((state) => state.products);
  const customers = useCustomersStore((state) => state.customers);

  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [draft, setDraft] = useState<ComamDraft | null>(null);
  const [serverAnswer, setServerAnswer] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(true);

  // Web Speech API recognition reference
  const recognitionRef = useRef<any>(null);

  // Initialize SpeechRecognition on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setHasSpeechSupport(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'bn-BD';

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMsg(null);
      };

      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setInputText(transcript);
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setErrorMsg('মাইক্রোফোন ব্যবহারের অনুমতি দিন');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (e) {
      console.warn('Failed to initialize speech recognition:', e);
      setHasSpeechSupport(false);
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, []);

  // Text-To-Speech readback
  const speakText = useCallback(
    (text: string) => {
      if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
      try {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'bn-BD';
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('TTS error:', err);
      }
    },
    [ttsEnabled]
  );

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setErrorMsg('এই ব্রাউজারে ভয়েস রেকগনিশন নেই — টাইপ করে ব্যবহার করুন');
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current.stop();
      } catch {}
      setIsListening(false);
    } else {
      setErrorMsg(null);
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Start recognition failed:', e);
      }
    }
  };

  // Process command locally and through API
  const handleProcessCommand = async (commandToProcess?: string) => {
    const text = (commandToProcess || inputText).trim();
    if (!text) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setServerAnswer(null);

    // 1. Instant deterministic parse client-side
    const localDraft = parseComamCommand(text, products, customers);
    setDraft(localDraft);

    // 2. Call server API for reports or due queries
    if (localDraft.kind === 'report' || localDraft.kind === 'due_query') {
      try {
        const res = await fetch('/api/comam', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: text }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.answerBn) {
            setServerAnswer(data.answerBn);
            speakText(data.answerBn);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch server answer:', err);
      }
    } else if (localDraft.kind === 'sale') {
      speakText(localDraft.summaryBn);
    }

    setIsProcessing(false);
  };

  // Add parsed draft items to active POS cart
  const handleAddToCart = (directCheckout: boolean = false) => {
    if (!draft || draft.items.length === 0) return;

    const cart = useCartStore.getState();

    // Add each item with its quantity
    draft.items.forEach((item) => {
      cart.addItem(item.product, item.qty);
    });

    // Set customer if detected
    cart.setCustomer(draft.customer || null);

    // Set payment method
    if (draft.paymentType === 'Due') {
      cart.setPaymentMethod('Due');
    } else if (draft.paymentType === 'UPI') {
      cart.setPaymentMethod('UPI');
    } else {
      cart.setPaymentMethod('Cash');
    }

    // Close voice assistant
    onClose();

    if (directCheckout && onOpenCheckout) {
      onOpenCheckout();
    }
  };

  // Resolve an ambiguous item with chosen variant
  const handleSelectOption = (itemIndex: number, optionProduct: Product) => {
    if (!draft) return;

    const updatedItems = [...draft.items];
    const targetItem = updatedItems[itemIndex];
    if (!targetItem) return;

    const lineTotal = Math.round(optionProduct.sellingPrice * targetItem.qty * 100) / 100;

    updatedItems[itemIndex] = {
      product: optionProduct,
      productId: optionProduct.id,
      name: optionProduct.name,
      nameBn: optionProduct.nameBn || optionProduct.name,
      qty: targetItem.qty,
      unit: optionProduct.unit,
      unitPrice: optionProduct.sellingPrice,
      lineTotal,
      ambiguous: false,
      options: undefined,
    };

    const newTotal = updatedItems.reduce((acc, it) => acc + it.lineTotal, 0);
    const hasRemainingAmbiguity = updatedItems.some((it) => it.ambiguous);

    setDraft({
      ...draft,
      items: updatedItems,
      total: Math.round(newTotal * 100) / 100,
      needsClarification: hasRemainingAmbiguity,
    });
  };

  const removeDraftItem = (index: number) => {
    if (!draft) return;
    const updatedItems = draft.items.filter((_, i) => i !== index);
    const newTotal = updatedItems.reduce((acc, it) => acc + it.lineTotal, 0);
    setDraft({
      ...draft,
      items: updatedItems,
      total: Math.round(newTotal * 100) / 100,
      needsClarification: updatedItems.some((it) => it.ambiguous),
    });
  };

  const samplePrompts = [
    '২ কেজি চিনি, ১ কেজি চাল',
    '১০ টাকার বিস্কুট ৩ প্যাকেট — রহিমদার নামে বাকি',
    'রহিমদার কত বাকি?',
    'আজ কত বিক্রি হলো?',
    'কোন পণ্য শেষ হয়ে আসছে?',
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden border border-emerald-500/20 shadow-2xl">
        {/* Header with glowing gradient */}
        <div className="relative p-5 bg-gradient-to-r from-emerald-600/10 via-teal-600/10 to-indigo-600/10 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white shadow-md shadow-emerald-500/20">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-1.5">
                  comam <span className="text-emerald-500 text-xs px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">AI</span>
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  বাংলায় মুখে বলুন — স্বয়ংক্রিয়ভাবে বিল ও হিসাব প্রস্তুত হবে
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => setTtsEnabled(!ttsEnabled)}
                title={ttsEnabled ? 'ভয়েস ফিডব্যাক চালু' : 'ভয়েস ফিডব্যাক বন্ধ'}
              >
                {ttsEnabled ? <Volume2 className="h-4 w-4 text-emerald-500" /> : <VolumeX className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Microphone & Input Box */}
          <div className="relative">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Input
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleProcessCommand();
                    }
                  }}
                  placeholder={isListening ? 'শুনছি... বাংলায় বলুন...' : 'মুখে বলুন বা বাংলায় লিখুন (যেমন: ২ কেজি চিনি...)'}
                  className="pr-10 h-11 text-sm bg-background/60 border-border/60 focus-visible:ring-emerald-500/30"
                />
                {inputText && (
                  <button
                    type="button"
                    onClick={() => {
                      setInputText('');
                      setDraft(null);
                      setServerAnswer(null);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Glowing Mic button */}
              <Button
                type="button"
                onClick={toggleListening}
                variant={isListening ? 'destructive' : 'default'}
                className={`h-11 w-11 p-0 rounded-xl transition-all duration-300 ${
                  isListening
                    ? 'animate-pulse ring-4 ring-rose-500/30 shadow-lg shadow-rose-500/30'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20'
                }`}
                title={isListening ? 'শোনা থামান' : 'মাইক অন করুন'}
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>

              <Button
                type="button"
                onClick={() => handleProcessCommand()}
                disabled={!inputText.trim() || isProcessing}
                className="h-11 px-4 bg-primary text-primary-foreground rounded-xl"
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>

            {/* Listening Waveform Indicator */}
            {isListening && (
              <div className="mt-2 flex items-center justify-center gap-1.5 py-1 text-xs text-rose-500 font-medium">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                মাইক্রোফোন চালু আছে — কথা বলুন...
              </div>
            )}

            {errorMsg && (
              <div className="mt-2 text-xs text-rose-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {errorMsg}
              </div>
            )}
          </div>

          {/* Quick Prompts */}
          {!draft && !serverAnswer && (
            <div className="space-y-2">
              <span className="text-xs text-muted-foreground font-medium">উদাহরণ বাক্যসমূহ:</span>
              <div className="flex flex-wrap gap-1.5">
                {samplePrompts.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setInputText(p);
                      handleProcessCommand(p);
                    }}
                    className="text-xs px-2.5 py-1 rounded-lg bg-secondary/60 hover:bg-secondary border border-border/40 text-muted-foreground hover:text-foreground transition-colors text-left"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Server Report / Due Query Answer */}
          {serverAnswer && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold mb-1">হিসাব তথ্য:</h4>
                  <p className="text-sm leading-relaxed">{serverAnswer}</p>
                </div>
              </div>
            </div>
          )}

          {/* Parsed Draft Display */}
          {draft && draft.kind === 'sale' && (
            <div className="space-y-3.5 rounded-xl border border-border/60 bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-semibold">তৈরিকৃত বিল ড্রাফট</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className="text-xs">
                    {draft.paymentType === 'Due' ? 'বাকি' : draft.paymentType === 'UPI' ? 'ইউপিআই' : 'নগদ'}
                  </Badge>
                  {(draft.customer || draft.customerName) && (
                    <Badge variant="secondary" className="text-xs flex items-center gap-1">
                      <User className="w-3 h-3" />
                      {draft.customer?.name || draft.customerName}
                    </Badge>
                  )}
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-2">
                {draft.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 rounded-lg bg-background/80 border border-border/40 space-y-2"
                  >
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium">{item.nameBn || item.name}</span>
                        <div className="text-xs text-muted-foreground">
                          {formatBnNumber(item.qty)} {item.unit} × {formatBnTaka(item.unitPrice)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatBnTaka(item.lineTotal)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeDraftItem(idx)}
                          className="text-muted-foreground hover:text-rose-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Ambiguity Options Picker */}
                    {item.ambiguous && item.options && item.options.length > 0 && (
                      <div className="pt-2 border-t border-dashed border-border/60">
                        <div className="text-xs text-amber-500 font-medium mb-1.5 flex items-center gap-1">
                          <HelpCircle className="w-3.5 h-3.5" />
                          কোন ভ্যারিয়েন্টটি চান? পছন্দ করুন:
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {item.options.map((opt) => (
                            <Button
                              key={opt.productId}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-900 dark:text-amber-200"
                              onClick={() => handleSelectOption(idx, opt.product)}
                            >
                              {opt.nameBn || opt.name} ({formatBnTaka(opt.price)})
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Unknown Items Warning */}
              {draft.unknownItems.length > 0 && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 dark:text-rose-300 space-y-1">
                  <div className="font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    ক্যাটালগে মেলেনি এমন পণ্য:
                  </div>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {draft.unknownItems.map((u, i) => (
                      <li key={i}>
                        {u.text} {u.statedPrice ? `(${formatBnTaka(u.statedPrice)})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Summary and Total */}
              <div className="pt-2 border-t border-border/60 flex items-center justify-between font-semibold">
                <span>সর্বমোট:</span>
                <span className="text-base text-emerald-600 dark:text-emerald-400">
                  {formatBnTaka(draft.total)}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleAddToCart(false)}
                  disabled={draft.needsClarification || draft.items.length === 0}
                  className="flex-1 gap-1.5 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                >
                  <ShoppingCart className="w-4 h-4" />
                  কার্টে যোগ করুন
                </Button>

                <Button
                  type="button"
                  onClick={() => handleAddToCart(true)}
                  disabled={draft.needsClarification || draft.items.length === 0}
                  className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  সরাসরি বিল করুন
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>

              {draft.needsClarification && (
                <p className="text-xs text-center text-amber-500">
                  ⚠️ কার্টে যোগ করার আগে উপরের বিকল্প থেকে একটি নির্দিষ্ট পণ্য বেছে নিন।
                </p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
