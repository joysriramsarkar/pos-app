import { useState, useEffect, useRef } from 'react';

/**
 * useDebouncedSearch — eliminates search input lag.
 *
 * Returns:
 *  - `inputValue`      : bind to <Input value={...}> — updates instantly on every keystroke
 *  - `searchQuery`     : use for filtering / API calls — only updates after `delay` ms of inactivity
 *  - `setInputValue`   : call in onChange to keep input responsive
 *  - `clearSearch`     : resets both inputValue and searchQuery immediately
 *
 * Usage:
 *   const { inputValue, searchQuery, setInputValue, clearSearch } = useDebouncedSearch();
 *   <Input value={inputValue} onChange={(e) => setInputValue(e.target.value)} />
 *   const filtered = useMemo(() => items.filter(...searchQuery...), [items, searchQuery]);
 */
export function useDebouncedSearch(initialValue = '', delay = 300) {
  const [inputValue, setInputValue] = useState(initialValue);
  const [searchQuery, setSearchQuery] = useState(initialValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setSearchQuery(inputValue);
    }, delay);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [inputValue, delay]);

  const clearSearch = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setInputValue('');
    setSearchQuery('');
  };

  return { inputValue, searchQuery, setInputValue, clearSearch };
}
