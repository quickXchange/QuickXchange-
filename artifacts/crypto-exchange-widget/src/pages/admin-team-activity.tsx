import { useState } from 'react';
import {
  useListAdminActivity
} from '@workspace/api-client-react';
import type { AdminAuthorization } from '@workspace/api-client-react';

import { ErrorState, LoadingBlock, exactDateTime, shortId } from '../App';
import { AdminListPagination } from '@/components/admin-list-pagination';

export function ActivityLog({ auth }: { auth: AdminAuthorization }) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [history, setHistory] = useState<string[]>([]);
  const [pageSize, setPageSize] = useState(50);
  const { data: page, isLoading, error, isFetching } = useListAdminActivity({ cursor, limit: pageSize });

  const hasNextPage = !!page?.nextCursor;
  const currentPage = history.length + 1;

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

  const handlePageChange = (requestedPage: number) => {
    if (requestedPage === currentPage - 1) {
      handlePrev();
    } else if (requestedPage === currentPage + 1) {
      handleNext();
    } else if (requestedPage >= 1 && requestedPage <= history.length) {
      const nextHistory = history.slice(0, requestedPage - 1);
      const previousCursor = history[requestedPage - 1];
      setHistory(nextHistory);
      setCursor(previousCursor === '' ? undefined : previousCursor);
    }
  };

  if (isLoading && !page) return <LoadingBlock />;
  if (error || !page) return <ErrorState message="Could not load activity log" />;

  return (
    <div className="panel p-0 flex flex-col">
      <div className="panel-heading px-6 py-4 flex items-center justify-between border-b border-border">
        <h2 className="text-base font-semibold">Activity Log</h2>
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
      <AdminListPagination
        page={currentPage}
        pageSize={pageSize}
        onPageSizeChange={size => {
          setPageSize(size);
          setCursor(undefined);
          setHistory([]);
        }}
        hasNext={hasNextPage}
        itemCount={page.items.length}
        onPageChange={handlePageChange}
        isLoading={isFetching}
        testId="admin-activity-pagination"
        testIds={{ previous: 'button-activity-previous', next: 'button-activity-next', page: 'select-activity-page', range: 'text-activity-range' }}
      />
    </div>
  );
}
