"use client"

import * as React from "react"
import { cn, convertBengaliToEnglishNumerals, convertEnglishToBengaliNumerals } from "@/lib/utils"
import { useLocale } from "next-intl"

function Input({ className, type, onChange, value, ...props }: React.ComponentProps<"input">) {
  const isNumber = type === 'number';
  const locale = useLocale();
  const isBn = locale === 'bn';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isNumber && onChange) {
      // Convert Bengali digits to English digits
      let enValue = convertBengaliToEnglishNumerals(e.target.value);
      
      // Allow only valid numbers (digits, decimal point, negative sign)
      // This strips out random text since it's type="text" now
      enValue = enValue.replace(/[^0-9.-]/g, '');

      // Create a cloned event with the modified value
      const clonedEvent = {
        ...e,
        target: {
          ...e.target,
          value: enValue,
          name: e.target.name
        }
      } as React.ChangeEvent<HTMLInputElement>;
      
      onChange(clonedEvent);
    } else if (onChange) {
      onChange(e);
    }
  };

  // Convert English digits to Bengali digits for display if locale is Bengali and it's a number field
  const displayValue = isNumber && isBn && value !== undefined && value !== null
    ? convertEnglishToBengaliNumerals(String(value))
    : value;

  return (
    <input
      type={isNumber ? "text" : type}
      inputMode={isNumber ? "decimal" : props.inputMode}
      data-slot="input"
      className={cn(
        "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/50 border-input flex h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      onChange={handleChange}
      value={displayValue}
      {...props}
    />
  )
}

export { Input }
