type ThemeHost = {
  colorScheme: 'light' | 'dark';
  onEvent?: (event: string, callback: () => void) => void;
  offEvent?: (event: string, callback: () => void) => void;
};

/** Telegram may change appearance while the WebView remains open. */
export function subscribeTelegramTheme(
  host: ThemeHost,
  root: { classList: { toggle: (name: string, enabled: boolean) => unknown } },
): () => void {
  const update = () => root.classList.toggle('dark', host.colorScheme === 'dark');
  update();
  host.onEvent?.('themeChanged', update);
  return () => host.offEvent?.('themeChanged', update);
}