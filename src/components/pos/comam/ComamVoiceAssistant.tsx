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
  User,
  UserPlus,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useCartStore, useProductsStore, useCustomersStore } from '@/stores/pos-store';
import { parseComamCommand, type ComamDraft } from '@/lib/comam/comam-engine';
import { correctTranscriptWithCatalog } from '@/lib/comam/comam-matcher';
import { formatBnTaka, formatBnNumber, formatForBengaliSpeech } from '@/lib/comam/bn-parser';

/**
 * Pick the recognition alternative that best fits this shop's catalog.
 * bn-BD recognizers return several guesses; the first is often the worst
 * for English brand names spoken in Bengali. Each candidate is repaired
 * against the catalog (নেভিকাড -> নেভিকাট) and scored by how completely
 * it parses into billable items.
 */
function pickBestTranscript(candidates: string[], products: Product[], customers: any[]): string {
  let best = candidates[0] || '';
  let bestScore = -Infinity;
  for (const raw of candidates) {
    const corrected = correctTranscriptWithCatalog(raw, products as any);
    const d = parseComamCommand(corrected, products as any, customers as any);
    const score = d.items.length * 3 - d.unknownItems.length * 2 - (d.needsClarification ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = corrected;
    }
  }
  return best;
}
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
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasSpeechSupport, setHasSpeechSupport] = useState(true);

  // Browser bn-BD speech recognition is the ear (restored by request:
  // it hears this shop's speech better than the server ASR did).
  // English brand names are handled downstream: several recognition
  // alternatives are requested and the one that best matches the
  // catalog wins, with phonetic repair (see pickBestTranscript).
  const recognitionRef = useRef<any>(null);
  const latestTranscriptRef = useRef('');
  const handleProcessCommandRef = useRef<((cmd?: string) => Promise<void>) | null>(null);

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
      // Ask for several hypotheses: the top one is frequently wrong for
      // English brand names spoken in Bengali (Navy Cut, Gold Flake);
      // pickBestTranscript keeps the guess that actually matches this
      // shop's catalog and repairs the rest phonetically.
      try {
        recognition.maxAlternatives = 5;
      } catch {}

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMsg(null);
        latestTranscriptRef.current = '';
        setInputText('');
        setDraft(null);
        setServerAnswer(null);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        const finalParts: string[] = [];
        for (const result of Array.from(event.results) as any[]) {
          if (result.isFinal) {
            const alternatives = Array.from(result)
              .map((r: any) => r.transcript)
              .filter(Boolean);
            const best = pickBestTranscript(
              alternatives.length > 0 ? alternatives : [''],
              useProductsStore.getState().products,
              useCustomersStore.getState().customers
            );
            if (best) finalParts.push(best);
          } else {
            interim += result[0].transcript;
          }
        }
        const transcript = (finalParts.join(' ') + (interim ? (finalParts.length > 0 ? ' ' : '') + interim : '')).trim();
        latestTranscriptRef.current = transcript;
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
        const spokenText = latestTranscriptRef.current.trim();
        if (spokenText.length >= 2 && handleProcessCommandRef.current) {
          handleProcessCommandRef.current(spokenText);
        }
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

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Load natural speech synthesis voices
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const updateVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) setVoices(v);
    };
    updateVoices();
    window.speechSynthesis.addEventListener('voiceschanged', updateVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', updateVoices);
    };
  }, []);

  // Text-To-Speech readback with natural voice selection & decimal pronunciation fix
  const speakText = useCallback(
    (text: string) => {
      if (!ttsEnabled || typeof window === 'undefined' || !window.speechSynthesis) return;
      try {
        window.speechSynthesis.cancel();

        // Convert decimals (e.g. ১০২৩.৫ -> ১০২৩ দশমিক ৫) so TTS speaks "দশমিক" instead of "পুঁটকি"
        const speechText = formatForBengaliSpeech(text);
        if (!speechText) return;

        const utterance = new SpeechSynthesisUtterance(speechText);
        utterance.lang = 'bn-BD';
        utterance.rate = 0.94; // natural, clear cadence
        utterance.pitch = 1.0;

        // Prioritize natural Bengali voices (Edge/Windows Microsoft Online Natural or Google বাংলা)
        const currentVoices = voices.length > 0 ? voices : window.speechSynthesis.getVoices();
        const bestVoice =
          currentVoices.find(
            (v) =>
              (v.lang.startsWith('bn') || v.lang.includes('Bengali')) &&
              (v.name.includes('Natural') || v.name.includes('Online'))
          ) ||
          currentVoices.find(
            (v) =>
              (v.lang === 'bn-BD' || v.lang === 'bn-IN' || v.lang.startsWith('bn')) &&
              v.name.includes('Google')
          ) ||
          currentVoices.find(
            (v) =>
              v.lang === 'bn-BD' ||
              v.lang === 'bn-IN' ||
              v.lang.startsWith('bn') ||
              v.name.toLowerCase().includes('bengali') ||
              v.name.includes('বাংলা')
          );

        if (bestVoice) {
          utterance.voice = bestVoice;
        }

        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.warn('TTS error:', err);
      }
    },
    [ttsEnabled, voices]
  );

  // Auto-clear and auto-start listening when assistant opens
  useEffect(() => {
    if (isOpen) {
      // 1. Clear previous text and cards
      setInputText('');
      setDraft(null);
      setServerAnswer(null);
      setErrorMsg(null);
      latestTranscriptRef.current = '';

      // 2. Auto-start listening immediately with retry
      let isCancelled = false;
      const tryStart = (retriesLeft = 5) => {
        if (isCancelled) return;
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e: any) {
            if (retriesLeft > 0) {
              setTimeout(() => tryStart(retriesLeft - 1), 150);
            }
          }
        } else if (retriesLeft > 0) {
          setTimeout(() => tryStart(retriesLeft - 1), 100);
        }
      };

      tryStart(5);
      return () => {
        isCancelled = true;
      };
    } else {
      // Stop and cancel speech when closed
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    }
  }, [isOpen]);

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
      setInputText('');
      setDraft(null);
      setServerAnswer(null);
      latestTranscriptRef.current = '';
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.warn('Start recognition failed:', e);
      }
    }
  };

  // Create new customer on 1-click
  const handleCreateCustomer = async (customerName: string) => {
    if (!customerName) return;
    setIsCreatingCustomer(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customerName, phone: '' }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'নতুন গ্রাহক তৈরি করা যায়নি');
      }

      const { data: newCustomer } = await res.json();
      useCustomersStore.getState().addCustomer(newCustomer);

      setDraft((prev) =>
        prev
          ? {
              ...prev,
              customer: newCustomer,
              hasUnknownCustomer: false,
            }
          : null
      );

      speakText(`${newCustomer.name} নামে নতুন গ্রাহক তৈরি করা হয়েছে।`);
    } catch (err: any) {
      console.error('Failed to create customer:', err);
      setErrorMsg(err.message || 'নতুন গ্রাহক তৈরি করা যায়নি।');
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  // Process command locally and through API
  const handleProcessCommand = async (commandToProcess?: string) => {
    const text = (commandToProcess || inputText).trim();
    if (!text) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setServerAnswer(null);

    try {
      // 1. Instant deterministic parse client-side. Repair the heard/typed
      // words against the catalog first, so ASR spellings (নেভিকাড,
      // গোল্ডফ্রেক, পেপারবোর্ড) bill as their real products; the input box
      // shows the repaired sentence so the shopkeeper can verify it.
      const correctedText = correctTranscriptWithCatalog(text, products);
      if (correctedText !== text) setInputText(correctedText);
      const localDraft = parseComamCommand(correctedText, products, customers);
      setDraft(localDraft);

      // 2. Call server API for reports or due queries
      if (localDraft.kind === 'report' || localDraft.kind === 'due_query') {
        try {
          const res = await fetch('/api/comam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command: correctedText }),
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
      } else if (localDraft.kind === 'unknown') {
        if (localDraft.summaryBn) {
          speakText(localDraft.summaryBn);
        }
      }
    } catch (err) {
      console.error('Comam command processing error:', err);
      setErrorMsg('কমান্ডটি প্রক্রিয়া করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    handleProcessCommandRef.current = handleProcessCommand;
  });

  // Add parsed draft items to active POS cart
  const handleAddToCart = (directCheckout: boolean = false) => {
    if (!draft || draft.items.length === 0) return;

    // Guard: an unregistered customer cannot be billed directly with an imaginary ID.
    // Must create the customer first OR sell as walk-in cash customer!
    if (!draft.customer && draft.hasUnknownCustomer) {
      setErrorMsg(`"${draft.customerName}" গ্রাহক তালিকায় নেই। প্রথমে গ্রাহক তৈরি করুন অথবা সাধারণ ক্রেতা হিসেবে বিল করুন।`);
      return;
    }

    const cart = useCartStore.getState();

    // Add each item with its quantity
    draft.items.forEach((item) => {
      cart.addItem(item.product, item.qty);
    });

    // Set customer if detected (registered customer object only)
    if (draft.customer) {
      cart.setCustomer(draft.customer);
    } else {
      cart.setCustomer(null);
    }

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

          {/* Unrecognized Command Notice */}
          {draft && draft.kind === 'unknown' && (
            <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    পণ্য চিহ্নিত করা যায়নি
                  </h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {draft.summaryBn || 'আপনার কথার সাথে ক্যাটালগের কোনো পণ্যের নাম মেলেনি। পণ্যের সঠিক নাম বা পরিমাণ স্পষ্ট করে বলুন।'}
                  </p>
                </div>
              </div>

              {draft.unknownItems.length > 0 && (
                <div className="p-2.5 rounded-lg bg-background/80 border border-border/40 space-y-1.5 text-xs">
                  <span className="font-medium text-muted-foreground">চিহ্নিত না হওয়া অংশ:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {draft.unknownItems.map((u, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {u.text} {u.statedPrice ? `(${formatBnTaka(u.statedPrice)})` : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Prompts */}
          {(!draft || draft.kind === 'unknown') && !serverAnswer && (
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
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-200 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold mb-1">হিসাব তথ্য:</h4>
                  <p className="text-sm leading-relaxed">{serverAnswer}</p>
                </div>
              </div>
              {draft?.customerName && !draft.customer && (
                <div className="pt-2 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    &ldquo;{draft.customerName}&rdquo; নামে নতুন গ্রাহক যোগ করবেন?
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleCreateCustomer(draft.customerName!)}
                    disabled={isCreatingCustomer}
                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-sm"
                  >
                    {isCreatingCustomer ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    &ldquo;{draft.customerName}&rdquo; নতুন গ্রাহক তৈরি করুন
                  </Button>
                </div>
              )}
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

              {/* Unknown Customer Notice and 1-Click Creation */}
              {draft.hasUnknownCustomer && draft.customerName && (
                <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <UserPlus className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                        গ্রাহক পাওয়া যায়নি
                      </h4>
                      <p className="text-xs text-amber-800 dark:text-amber-300">
                        &ldquo;<span className="font-semibold">{draft.customerName}</span>&rdquo; নামে খাতার তালিকায় কোনো গ্রাহক নেই। আপনি কি এই নামে নতুন গ্রাহক তৈরি করতে চান?
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleCreateCustomer(draft.customerName!)}
                      disabled={isCreatingCustomer}
                      className="h-8 text-xs bg-amber-600 hover:bg-amber-500 text-white gap-1.5 shadow-sm"
                    >
                      {isCreatingCustomer ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <UserPlus className="w-3.5 h-3.5" />
                      )}
                      &ldquo;{draft.customerName}&rdquo; নতুন গ্রাহক তৈরি করুন
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                hasUnknownCustomer: false,
                                customer: null,
                                customerName: null,
                                paymentType: 'Cash',
                              }
                            : null
                        );
                      }}
                      className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    >
                      সাধারণ ক্রেতা (নগদ) হিসেবে বিল করুন
                    </Button>
                  </div>
                </div>
              )}

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
              <div className="pt-2 flex flex-col gap-2">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleAddToCart(false)}
                    disabled={
                      draft.needsClarification ||
                      draft.items.length === 0 ||
                      (draft.hasUnknownCustomer && draft.paymentType === 'Due')
                    }
                    className="flex-1 gap-1.5 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  >
                    <ShoppingCart className="w-4 h-4" />
                    কার্টে যোগ করুন
                  </Button>

                  <Button
                    type="button"
                    onClick={() => handleAddToCart(true)}
                    disabled={
                      draft.needsClarification ||
                      draft.items.length === 0 ||
                      (draft.hasUnknownCustomer && draft.paymentType === 'Due')
                    }
                    className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white"
                  >
                    সরাসরি বিল করুন
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>

                {draft.hasUnknownCustomer && draft.paymentType === 'Due' && (
                  <p className="text-xs text-center text-amber-600 dark:text-amber-400">
                    ⚠️ বাকিতে বিক্রি করার আগে উপরে &ldquo;{draft.customerName}&rdquo; গ্রাহক তৈরি করুন।
                  </p>
                )}

                {draft.needsClarification && (
                  <p className="text-xs text-center text-amber-500">
                    ⚠️ কার্টে যোগ করার আগে উপরের বিকল্প থেকে একটি নির্দিষ্ট পণ্য বেছে নিন।
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
