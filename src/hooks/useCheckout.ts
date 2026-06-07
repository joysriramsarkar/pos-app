import { useState, useCallback } from 'react';

export function useCheckout() {
  const [isCheckoutOpen, setCheckoutOpen] = useState(false);
  const handleOpenCheckout = useCallback(() => {
    setCheckoutOpen(true);
  }, [setCheckoutOpen]);
  return { isCheckoutOpen, setCheckoutOpen, handleOpenCheckout };
}