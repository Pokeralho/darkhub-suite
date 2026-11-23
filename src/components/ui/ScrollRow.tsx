import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from '../icons';
import { useI18n } from '../../i18n/I18nProvider';

/**
 * Horizontal row (tab bar, chip filter, toolbar) that never hides items: when the content is wider than the
 * window it scrolls with the mouse wheel (see utils/horizontalWheel), shows arrow buttons at the edges that have
 * more items, and keeps the selected tab ([aria-selected=true] / [aria-current]) in view.
 */
export default function ScrollRow({
  children,
  className = '',
  innerClassName = '',
  role,
  ariaLabel,
  as = 'div',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
  role?: string;
  ariaLabel?: string;
  as?: 'div' | 'nav';
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'role' | 'children'>) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setEdges((p) => (p.left === left && p.right === right ? p : { left, right }));
  }, []);

  useLayoutEffect(() => { measure(); });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
      for (const c of Array.from(el.children)) ro.observe(c);
    }
    return () => { el.removeEventListener('scroll', measure); ro?.disconnect(); };
  }, [measure]);

  // bring the active item into view when it CHANGES (not on every render: that would undo the user's own scrolling)
  const lastActive = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>('[aria-selected="true"],[aria-current="page"],[aria-current="true"]');
    if (!el || !active || active === lastActive.current) return;
    lastActive.current = active;
    const a = active.offsetLeft;
    const b = a + active.offsetWidth;
    if (a < el.scrollLeft) el.scrollLeft = Math.max(0, a - 24);
    else if (b > el.scrollLeft + el.clientWidth) el.scrollLeft = b - el.clientWidth + 24;
  });

  const nudge = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    const step = Math.max(120, Math.round(el.clientWidth * 0.7));
    if (typeof el.scrollBy === 'function') el.scrollBy({ left: dir * step, behavior: 'smooth' });
    else el.scrollLeft += dir * step;
  };

  const Tag = as as any;
  const arrow = (dir: -1 | 1) => (
    <button
      type="button"
      tabIndex={-1}
      aria-label={dir < 0 ? t('common.scrollLeft', 'Rolar para a esquerda') : t('common.scrollRight', 'Rolar para a direita')}
      onClick={() => nudge(dir)}
      className={`absolute top-0 bottom-0 ${dir < 0 ? 'left-0 bg-gradient-to-r' : 'right-0 bg-gradient-to-l'} z-10 w-8 flex items-center justify-center from-zinc-950 via-zinc-950/90 to-transparent text-zinc-400 hover:text-zinc-100`}
    >
      {dir < 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );

  return (
    <div className={`relative min-w-0 ${className}`} data-scrollrow="">
      {edges.left && arrow(-1)}
      <Tag
        ref={ref}
        role={role}
        aria-label={ariaLabel}
        {...rest}
        className={`dh-scroll-x flex overflow-x-auto overflow-y-hidden ${innerClassName}`}
      >
        {children}
      </Tag>
      {edges.right && arrow(1)}
    </div>
  );
}
