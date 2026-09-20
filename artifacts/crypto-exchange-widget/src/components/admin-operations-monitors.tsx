import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X, ShieldCheck, Play, Power, Filter, CheckCircle, RotateCcw } from 'lucide-react';
import {
  useListBlockchainMonitoringRegistrationGaps,
  useActivateBlockchainMonitoringRegistrationGap,
  useListBlockchainMonitoringWatches,
  useListBlockchainMonitoringMatches,
  useReviewBlockchainMonitoringMatch,
  BlockchainMonitoringWatch,
  BlockchainMonitoringMatch
} from '@workspace/api-client-react';
import { cn, ErrorState, LoadingBlock, ago, exactDateTime, InlineNotice } from '../App';
import { apiErrorText } from '../App';

export function OperationsMonitors() {
  const queryClient = useQueryClient();
  const gapsQuery = useListBlockchainMonitoringRegistrationGaps({ query: { queryKey: ['listBlockchainMonitoringRegistrationGaps'] } });
  const watchesQuery = useListBlockchainMonitoringWatches({ state: 'active', limit: 50 }, { query: { queryKey: ['listBlockchainMonitoringWatches', 'active'] } });
  const matchesQuery = useListBlockchainMonitoringMatches({ state: 'needs_review', limit: 50 }, { query: { queryKey: ['listBlockchainMonitoringMatches', 'needs_review'] } });

  const activateGap = useActivateBlockchainMonitoringRegistrationGap();
  const reviewMatch = useReviewBlockchainMonitoringMatch();

  const handleActivateGap = (orderId: string) => {
    if (!window.confirm(`Activate gap for order ${orderId}?`)) return;
    activateGap.mutate({ orderId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['listBlockchainMonitoringRegistrationGaps'] });
      }
    });
  };

  const handleReviewMatch = (matchId: string, decision: 'approve' | 'reject') => {
    if (!window.confirm(`Are you sure you want to ${decision} this match?`)) return;
    reviewMatch.mutate({ id: matchId, data: { decision } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['listBlockchainMonitoringMatches', 'needs_review'] });
      }
    });
  };

  return (
    <div className="space-y-4">
      {/* Matches */}
      <div className="panel pending-panel rise-in rise-delay-2 mt-4">
        <div className="panel-heading">
          <div><span className="section-kicker">Review</span><h2>Matches Pending Review</h2></div>
        </div>
        {matchesQuery.isLoading ? <LoadingBlock rows={3} /> : matchesQuery.isError ? <ErrorState message="Could not load matches" retry={() => matchesQuery.refetch()} /> : (
          <div className="w-full relative group">
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Watch</th>
                    <th>Observation</th>
                    <th>Confirmations</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(matchesQuery.data?.items || []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-4 text-muted-foreground">No matches need review</td></tr>
                  ) : (matchesQuery.data?.items || []).map((m: BlockchainMonitoringMatch) => (
                    <tr key={m.id}>
                      <td><code className="text-xs">{m.orderId}</code></td>
                      <td><code className="text-xs">{m.watchId}</code></td>
                      <td><code className="text-xs">{m.observationId}</code></td>
                      <td>{m.confirmations} / {m.confirmationsRequired}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button className="button button-primary button-sm" onClick={() => handleReviewMatch(m.id, 'approve')}>Approve</button>
                          <button className="button button-secondary button-sm text-destructive" onClick={() => handleReviewMatch(m.id, 'reject')}>Reject</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Gaps */}
      <div className="panel pending-panel rise-in rise-delay-2 mt-4">
        <div className="panel-heading">
          <div><span className="section-kicker">System</span><h2>Registration Gaps</h2></div>
        </div>
        {gapsQuery.isLoading ? <LoadingBlock rows={3} /> : gapsQuery.isError ? <ErrorState message="Could not load gaps" retry={() => gapsQuery.refetch()} /> : (
          <div className="w-full relative group">
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Network</th>
                    <th>Asset</th>
                    <th>Address</th>
                    <th>Reason</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(gapsQuery.data?.items || []).length === 0 ? (
                    <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">No registration gaps</td></tr>
                  ) : (gapsQuery.data?.items || []).map((gap: any) => (
                    <tr key={gap.order || gap.orderId}>
                      <td><code className="text-xs">{gap.order || gap.orderId}</code></td>
                      <td>{gap.network || gap.networkId}</td>
                      <td>{gap.asset || gap.assetId}</td>
                      <td><code className="text-xs">{gap.address || gap.receivingAddress}</code></td>
                      <td className="text-destructive text-sm">{gap.reason}</td>
                      <td>
                        <button className="button button-secondary button-sm" onClick={() => handleActivateGap(gap.order || gap.orderId)}>Retry Registration</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Watches */}
      <div className="panel pending-panel rise-in rise-delay-2 mt-4">
        <div className="panel-heading">
          <div><span className="section-kicker">Active</span><h2>Blockchain Watches</h2></div>
        </div>
        {watchesQuery.isLoading ? <LoadingBlock rows={3} /> : watchesQuery.isError ? <ErrorState message="Could not load watches" retry={() => watchesQuery.refetch()} /> : (
          <div className="w-full relative group">
            <div className="overflow-x-auto">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Network</th>
                    <th>Address</th>
                    <th>Expected Amount</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {(watchesQuery.data?.items || []).length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-4 text-muted-foreground">No active watches</td></tr>
                  ) : (watchesQuery.data?.items || []).map((w: BlockchainMonitoringWatch) => (
                    <tr key={w.id}>
                      <td><code className="text-xs">{w.orderId}</code></td>
                      <td>{w.monitorNetworkId}</td>
                      <td><code className="text-xs">{w.receivingAddress}</code></td>
                      <td>{w.expectedAmount}</td>
                      <td className="text-xs">{exactDateTime(w.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
