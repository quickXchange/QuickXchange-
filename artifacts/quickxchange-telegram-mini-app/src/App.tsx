import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

import { AuthProvider, useAuth } from '@/lib/auth';
import { Shell } from '@/components/layout';

import Home from '@/pages/home';
import Exchange from '@/pages/exchange';
import Orders from '@/pages/orders';
import OrderDetail from '@/pages/order-detail';
import Support from '@/pages/support';
import Account from '@/pages/account';
import NotFound from '@/pages/not-found';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { isLoading, sessionToken, isMock } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!sessionToken && !isMock) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center">
        <h2 className="text-xl font-bold text-foreground mb-2">Auth Error</h2>
        <p className="text-muted-foreground text-sm">
          Please open this app from Telegram to access all features.
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
