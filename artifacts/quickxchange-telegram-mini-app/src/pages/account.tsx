import { useAuth, useAuthHeaders } from '@/lib/auth';
import { Card } from '@/components/ui/card';
import { User, LogOut, Shield } from 'lucide-react';

export default function Account() {
  const { user, sessionToken, isMock } = useAuth();
  const headers = useAuthHeaders();

  return (
    <div className="flex flex-col p-4 space-y-6 pt-10">
      <h1 className="text-2xl font-bold">Account</h1>

      <div className="premium-card p-6 flex items-center space-x-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <User className="w-8 h-8 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold">{user?.displayName || 'Guest'}</h2>
          <p className="text-sm text-muted-foreground">@{user?.username || 'user'}</p>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground px-1">
          Linked QuickXchange
        </h3>
        
        <div className="premium-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-secondary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Account Status</p>
                <p className="text-xs text-muted-foreground">
                  {isMock ? 'Mocked Session' : sessionToken ? 'Authenticated Mini App' : 'Not Linked'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
