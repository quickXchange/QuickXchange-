import { useCallback, useEffect, useRef, useState } from 'react';

export function useSwapAnimator(performSwap: () => void) {
  const [isSwapping, setIsSwapping] = useState(false);
  const [swapFlipped, setSwapFlipped] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  const resetTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current);
      window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const triggerSwap = useCallback((canSwap: boolean) => {
    if (!canSwap || isSwapping) return;
    
    const prefersReducedMotion = typeof window !== 'undefined' 
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
      : false;

    if (prefersReducedMotion) {
      performSwap();
      setSwapFlipped(f => !f);
      return;
    }

    setIsSwapping(true);
    setSwapFlipped(f => !f);
    
    window.clearTimeout(timerRef.current);
    window.clearTimeout(resetTimerRef.current);
    
    timerRef.current = window.setTimeout(() => {
      performSwap();
      resetTimerRef.current = window.setTimeout(() => {
        setIsSwapping(false);
      }, 150);
    }, 150);
  }, [isSwapping, performSwap]);

  return { isSwapping, swapFlipped, triggerSwap };
}
