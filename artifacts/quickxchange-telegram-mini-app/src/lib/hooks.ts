import { useEffect } from 'react';

export function useBackButton(onClick: () => void, isVisible: boolean = true) {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    if (isVisible) {
      tg.BackButton.show();
    } else {
      tg.BackButton.hide();
    }

    tg.BackButton.onClick(onClick);

    return () => {
      tg.BackButton.offClick(onClick);
      tg.BackButton.hide();
    };
  }, [onClick, isVisible]);
}

export function useHapticFeedback() {
  return {
    impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light') => {
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
    },
    notification: (type: 'error' | 'success' | 'warning' = 'success') => {
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
    },
    selection: () => {
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged();
    }
  };
}
