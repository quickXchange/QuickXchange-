import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminListPagination, type AdminListPaginationProps } from '../src/components/admin-list-pagination';

const markup = (props: Partial<AdminListPaginationProps> = {}) => renderToStaticMarkup(
  <AdminListPagination page={1} pageSize={50} total={893} onPageChange={() => {}} onPageSizeChange={() => {}} {...props} />
);

test('shared footer reports actual ranges and server totals, not just page length', () => {
  assert.match(markup(), /Showing 1 to 50 of 893 results/);
  assert.match(markup({ page: 2 }), /Showing 51 to 100 of 893 results/);
  assert.match(markup({ page: 18 }), /Showing 851 to 893 of 893 results/);
});

test('previous and next arrows disable at the real boundaries', () => {
  assert.match(markup(), /aria-label="Previous page" disabled=""/);
  assert.doesNotMatch(markup(), /aria-label="Next page" disabled=""/);
  assert.match(markup({ page: 18 }), /aria-label="Next page" disabled=""/);
  assert.doesNotMatch(markup({ page: 18 }), /aria-label="Previous page" disabled=""/);
});

test('empty and out-of-range totals render safely', () => {
  const empty = markup({ total: 0 });
  assert.match(empty, /Showing 0 to 0 of 0 results/);
  assert.match(empty, /aria-label="Previous page" disabled=""/);
  assert.match(empty, /aria-label="Next page" disabled=""/);
  assert.match(markup({ page: 20, total: 12 }), /Showing 1 to 12 of 12 results/);
});

test('unknown-total contracts never invent a global count', () => {
  const unknown = markup({ total: undefined, page: 2, pageSize: 25, itemCount: 25, hasNext: true });
  assert.match(unknown, /Showing 26 to 50 results/);
  assert.doesNotMatch(unknown, / of \d+ results/);
  assert.doesNotMatch(unknown, /aria-label="Next page" disabled=""/);
  assert.match(markup({ total: undefined, itemCount: 10, hasNext: false }), /aria-label="Next page" disabled=""/);
});

test('all requested page sizes and current-page selection are present', () => {
  const html = markup();
  for (const size of [10, 25, 50, 100]) assert.match(html, new RegExp(`<option value="${size}"`));
  assert.match(html, /aria-label="Current page"/);
  assert.match(html, /aria-label="Results per page"/);
  assert.match(markup({ isLoading: true }), /aria-label="Results per page" disabled=""/);
});

test('generic form styling explicitly excludes the compact footer selectors', () => {
  const widgetDir = process.env.ADMIN_PAGINATION_WIDGET_DIR!;
  for (const file of ['src/index.css', 'src/admin-redesign.css']) {
    const css = readFileSync(`${widgetDir}/${file}`, 'utf8');
    const selectors = css.match(/[^{]*:is\(input, select, textarea\):not\([^{]+\{/g) ?? [];
    assert.ok(selectors.length > 0, `Expected generic form contract in ${file}`);
    for (const selector of selectors) assert.ok(selector.includes(':not(.admin-list-pagination-select)'), selector);
  }
});