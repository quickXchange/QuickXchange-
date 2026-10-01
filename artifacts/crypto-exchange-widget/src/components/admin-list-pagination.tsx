import { useEffect, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './admin-list-pagination.css';

export interface AdminListPaginationProps {
  page: number;
  pageSize: number;
  total?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  isLoading?: boolean;
  hasNext?: boolean;
  itemCount?: number;
  status?: ReactNode;
  className?: string;
  testId?: string;
  testIds?: {
    pageSize?: string;
    page?: string;
    previous?: string;
    next?: string;
    range?: string;
  };
}

/** One footer for numeric, client-side, and cursor-backed Admin directories.
 * Unknown totals stay unknown: a full server page is not a global count.
 */
export function AdminListPagination({
  page, pageSize, total, onPageChange, onPageSizeChange, isLoading = false,
  hasNext = false, itemCount, status, className = '', testId, testIds,
}: AdminListPaginationProps) {
  const hasTotal = total !== undefined;
  const count = Math.max(0, total ?? 0);
  const size = Math.max(1, pageSize);
  const totalPages = hasTotal ? Math.max(1, Math.ceil(count / size)) : undefined;
  const currentPage = Math.max(1, totalPages ? Math.min(page, totalPages) : page);
  const first = hasTotal
    ? count === 0 ? 0 : (currentPage - 1) * size + 1
    : itemCount ? (currentPage - 1) * size + 1 : 0;
  const last = hasTotal ? Math.min(currentPage * size, count)
    : itemCount ? (currentPage - 1) * size + itemCount : 0;
  const canGoNext = hasTotal ? currentPage < (totalPages ?? 1) : hasNext;

  useEffect(() => {
    // Do not reset server paging when the next query has not loaded its total.
    if (!isLoading && hasTotal && currentPage !== page) onPageChange(currentPage);
  }, [isLoading, hasTotal, currentPage, page, onPageChange]);

  // Large directories get a compact window and first/last page jumps instead
  // of creating tens of thousands of native options.
  const lastSelectablePage = totalPages ?? currentPage + (hasNext ? 1 : 0);
  const pages = lastSelectablePage <= 200
    ? Array.from({ length: lastSelectablePage }, (_, index) => index + 1)
    : [...new Set([1, ...Array.from({ length: 21 }, (_, index) => currentPage - 10 + index)
      .filter(value => value > 0 && value <= lastSelectablePage), lastSelectablePage])].sort((a, b) => a - b);

  return (
    <nav
      className={`admin-list-pagination ${className}`}
      aria-label="List pagination"
      aria-busy={isLoading}
      data-testid={testId}
    >
      <div className="admin-list-pagination-summary">
        <span className="admin-list-pagination-range" data-testid={testIds?.range} aria-live="polite">
          {isLoading && !hasTotal && itemCount === undefined ? 'Loading results…'
            : <>Showing {first.toLocaleString()} to {last.toLocaleString()}
              {hasTotal ? <> of {count.toLocaleString()}</> : null} results</>}
        </span>
        {status}
      </div>
      <div className="admin-list-pagination-controls">
        <label className="admin-list-pagination-size">
          <span className="admin-list-pagination-label">Results per page</span>
          <select
            className="admin-list-pagination-select"
            aria-label="Results per page"
            value={size}
            disabled={isLoading || !onPageSizeChange}
            data-testid={testIds?.pageSize}
            onChange={event => {
              onPageSizeChange?.(Number(event.target.value));
              onPageChange(1);
            }}
          >
            {[...new Set([10, 25, 50, 100, size])].sort((a, b) => a - b)
              .map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="admin-list-pagination-page">
          <span className="admin-list-pagination-label">Page</span>
          <select
            className="admin-list-pagination-select"
            aria-label="Current page"
            value={currentPage}
            disabled={isLoading || lastSelectablePage <= 1}
            data-testid={testIds?.page}
            onChange={event => onPageChange(Number(event.target.value))}
          >
            {pages.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <div className="admin-list-pagination-arrows">
          <button
            type="button"
            className="admin-list-pagination-arrow"
            aria-label="Previous page"
            disabled={isLoading || currentPage <= 1}
            data-testid={testIds?.previous}
            onClick={() => onPageChange(currentPage - 1)}
          ><ChevronLeft size={16} aria-hidden="true" /></button>
          <button
            type="button"
            className="admin-list-pagination-arrow"
            aria-label="Next page"
            disabled={isLoading || !canGoNext}
            data-testid={testIds?.next}
            onClick={() => onPageChange(currentPage + 1)}
          ><ChevronRight size={16} aria-hidden="true" /></button>
        </div>
      </div>
    </nav>
  );
}