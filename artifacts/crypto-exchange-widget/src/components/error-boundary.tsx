import { sourceText } from "@workspace/i18n/runtime";
import { useFallbackI18n as useCustomerI18n } from "@workspace/i18n";
import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

const fallbackCopy = {
  en: {
    title: sourceText("customer.m6da25a6ada70"),
    description: sourceText("customer.mdd583bd52f17"),
    retry: 'Try again',
  },
  de: {
    title: sourceText("customer.m10cc8162daab"),
    description: sourceText("customer.m4be64f22fa01"),
    retry: 'Erneut versuchen',
  },
  es: {
    title: sourceText("customer.md46a0dd97b12"),
    description: sourceText("customer.m344314e8d95d"),
    retry: 'Intentar de nuevo',
  },
  fr: {
    title: sourceText("customer.mf86ad7123062"),
    description: sourceText("customer.mcf64ed6679fe"),
    retry: 'Réessayer',
  },
  ko: {
    title: '문제가 발생했습니다',
    description: '앱의 이 부분에서 오류가 발생했습니다. 앱의 나머지 부분은 계속 실행 중입니다.',
    retry: '다시 시도',
  },
  ru: {
    title: 'Что-то пошло не так',
    description: 'В этой части приложения произошла ошибка. Остальная часть приложения продолжает работать.',
    retry: 'Повторить попытку',
  },
  uk: {
    title: 'Щось пішло не так',
    description: 'У цій частині застосунку сталася помилка. Решта застосунку продовжує працювати.',
    retry: 'Спробувати ще раз',
  },
} as const;

function getFallbackCopy() {
  const language = document.documentElement.lang.toLowerCase().split('-')[0] as keyof typeof fallbackCopy;
  return fallbackCopy[language] ?? fallbackCopy.en;
}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const copy = getFallbackCopy();
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background noise p-6">
      <div className="w-full max-w-md shadow-xl border border-border rounded-3xl overflow-hidden text-center p-8 bg-card relative">
        <div className="flex flex-col items-center">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            {uiText(copy.title)}
          </h1>
          <p className="text-[15px] text-muted-foreground mb-8">
            {uiText(copy.description)}
          </p>
          {import.meta.env.DEV ? (
            <pre className="w-full overflow-x-auto rounded-xl border border-border bg-muted p-4 text-left text-[11px] font-mono text-muted-foreground mb-8 scrollbar-thin">
              {error.message || String(error)}
            </pre>
          ) : null}
          <button
            type="button"
            onClick={resetError}
            className="button button-primary w-full shadow-lg shadow-primary/20"
          >
            {uiText(copy.retry)}
          </button>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      'ErrorBoundary caught an error:',
      toError(error),
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  recoverFromError = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.recoverFromError} />;
  }
}
