import { useState } from 'react';
import {
  Search, ShieldCheck
} from 'lucide-react';
import {
  useListAdminActivity
} from '@workspace/api-client-react';
import type { AdminAuthorization, AdminActivityEvent } from '@workspace/api-client-react';

import { cn, ErrorState, LoadingBlock, exactDateTime, shortId } from '../App';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function ActivityLog({ auth }: { auth: AdminAuthorization }) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<string[]>([]);
  const { data: page, isLoading, error, isFetching } = useListAdminActivity({ cursor, limit: 50 });

  const hasNextPage = !!page?.nextCursor;
  const hasPrevPage = history.length > 0;

  const handleNext = () => {
    if (page?.nextCursor) {
      setHistory(prev => [...prev, cursor || '']);
      setCursor(page.nextCursor);
    }
  };

  const handlePrev = () => {
    if (history.length > 0) {
      const newHistory = [...history];
      const prevCursor = newHistory.pop();
      setHistory(newHistory);
      setCursor(prevCursor === '' ? undefined : prevCursor);
    }
  };

  if (isLoading && !page) return <LoadingBlock />;
  if (error || !page) return <ErrorState message="Could not load activity log" />;

  return (
    <div className="panel p-0 flex flex-col">
      <div className="panel-heading px-6 py-4 flex items-center justify-between border-b border-border">
        <h2 className="text-base font-semibold">Activity Log</h2>
        <div className="flex gap-2">
           {/* Simple pagination controls */}
           <Button variant="outline" size="sm" onClick={handlePrev} disabled={!hasPrevPage || isFetching}>Previous</Button>
           <Button variant="outline" size="sm" onClick={handleNext} disabled={!hasNextPage || isFetching}>Next</Button>
        </div>
      </div>
      
      <div className="table-wrap">
        <table className="admin-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-6 py-3 font-medium text-muted-foreground w-1/4">Operator</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Action</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Target</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Date & Time</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map(event => (
              <tr key={event.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                <td className="px-6 py-3 font-medium">
                  {event.member}
                </td>
                <td className="px-6 py-3">
                  <div className="flex flex-col">
                    <span className="font-semibold text-primary">{event.action}</span>
                    <span className="text-xs text-muted-foreground capitalize">{event.section}</span>
                  </div>
                </td>
                <td className="px-6 py-3">
                  {event.entityId ? (
                    <div className="flex flex-col">
                      <span>{event.entityKind || 'Record'} <code className="text-xs bg-muted px-1 py-0.5 rounded">{shortId(event.entityId)}</code></span>
                      {event.safeLabel && <span className="text-xs text-muted-foreground">{event.safeLabel}</span>}
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">System</span>
                  )}
                </td>
                <td className="px-6 py-3 text-right text-muted-foreground tabular-nums">
                  {exactDateTime(event.occurredAt)}
                </td>
              </tr>
            ))}
            {page.items.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                  No activity found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
