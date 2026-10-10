import { useEffect, useState } from 'react';
import { useI18n as useCustomerI18n } from '@workspace/i18n';

export function ManualToc({ items }: { items: Array<{ id: string; label: string }> }) {
  const { t, tx } = useCustomerI18n();
  const [active, setActive] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => !!e);
    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) setActive(visible.target.id);
    }, { rootMargin: '-96px 0px -65% 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    history.replaceState(null, '', `#${id}`);
    setActive(id);
  };

  return (
    <aside className="user-manual-toc" aria-label={t('customer.ma9360e0212a4')}>
      <h2 className="user-manual-toc-title">{t('customer.manualOnPage')}</h2>
      <label className="user-manual-toc-select">
        <span className="sr-only">{t('customer.manualJump')}</span>
        <select value={active} onChange={(e) => jump(e.target.value)} data-testid="select-toc-mobile">
          {items.map((item, i) => <option key={item.id} value={item.id}>{`${i + 1}. ${tx(item.label)}`}</option>)}
        </select>
      </label>
      <ol className="user-manual-toc-list">
        {items.map((item, i) => (
          <li key={item.id}>
            <a href={`#${item.id}`} className={`user-manual-toc-link${active === item.id ? ' is-active' : ''}`}
              aria-current={active === item.id ? 'location' : undefined} data-testid={`link-toc-${item.id}`}
              onClick={(e) => { e.preventDefault(); jump(item.id); }}>
              <span className="user-manual-toc-num">{String(i + 1).padStart(2, '0')}</span>
              <span>{tx(item.label)}</span>
            </a>
          </li>
        ))}
      </ol>
    </aside>
  );
}
