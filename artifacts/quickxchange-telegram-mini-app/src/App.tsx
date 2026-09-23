import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { ShieldAlert } from 'lucide-react';

import { AuthProvider, useAuth } from '@/lib/auth';
import { createSessionAwareQueryClient } from '@/lib/session-expiry';
import { Shell } from '@/components/layout';

import Home from '@/pages/home';
import Exchange from '@/pages/exchange';
import Orders from '@/pages/orders';
import OrderDetail from '@/pages/order-detail';
import Track from '@/pages/track';
import Support from '@/pages/support';
import Account from '@/pages/account';
import NotFound from '@/pages/not-found';

const queryClient = createSessionAwareQueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isLoading, sessionToken } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-background">
        <div className="relative mb-5">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
          <div className="w-10 h-10 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin relative z-10" />
        </div>
        <p className="text-sm font-semibold text-muted-foreground">Connecting to Telegram…</p>
      </div>
    );
  }

  if (!sessionToken) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[100dvh] p-6 text-center premium-glow-bg bg-background">
        <div className="w-16 h-16 rounded-3xl bg-destructive/10 flex items-center justify-center text-destructive mb-6 shadow-lg shadow-destructive/20 relative">
          <div className="absolute inset-0 bg-destructive/20 blur-xl rounded-3xl" />
          <ShieldAlert className="w-8 h-8 relative z-10" />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-3 tracking-tight">Open in Telegram</h2>
        <p className="text-muted-foreground text-sm max-w-[260px] leading-relaxed">
          QuickXchange is designed to be used securely inside Telegram. Please open the bot to access your account.
        </p>
      </div>
    );
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={() => <ProtectedRoute component={Home} />} />
          <Route path="/exchange" component={() => <ProtectedRoute component={Exchange} />} />
          <Route path="/orders" component={() => <ProtectedRoute component={Orders} />} />
          <Route path="/track" component={() => <ProtectedRoute component={Track} />} />
          <Route path="/orders/:id" component={() => <ProtectedRoute component={OrderDetail} />} />
          <Route path="/support" component={() => <ProtectedRoute component={Support} />} />
          <Route path="/account" component={() => <ProtectedRoute component={Account} />} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <Router />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;