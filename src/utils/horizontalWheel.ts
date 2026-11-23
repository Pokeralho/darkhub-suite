/**
 * Horizontal rows (tab bars, breadcrumbs, toolbars) that overflow can only be scrolled with a trackpad or
 * Shift+wheel, so a normal mouse never reached the hidden items. This installs ONE capture listener on the
 * document: a vertical wheel over a row marked as horizontal (ScrollRow's .dh-scroll-x, or data-hwheel="on")
 * scrolls it sideways. Everything else (pages, lists, tables, code blocks) keeps the normal behaviour.
 */

/** Nearest horizontal row (itself or an ancestor) that overflows sideways, unless a vertical scroller comes first. */
export function findHorizontalScroller(start: Element | null, stopAt?: Element | null): HTMLElement | null {
  let el: Element | null = start;
  while (el && el !== stopAt && el instanceof HTMLElement) {
    if (el.dataset.hwheel === 'off') return null;
    const style = getComputedStyle(el);
    const ox = style.overflowX;
    const oy = style.overflowY;
    const canX = (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
    const canY = (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    if (canY) return null; // a vertical scroller wins: never hijack page/list scrolling
    // only rows meant to be scrolled sideways (ScrollRow, or data-hwheel="on"): a wide table or code block keeps
    // the wheel for the page
    if (canX && (el.classList.contains('dh-scroll-x') || el.dataset.hwheel === 'on')) return el;
    el = el.parentElement;
  }
  return null;
}

/** Pure decision used by the listener (exported for tests): the horizontal delta to apply, or 0. */
export function wheelToHorizontal(e: { deltaX: number; deltaY: number; shiftKey: boolean; ctrlKey: boolean; deltaMode?: number }): number {
  if (e.ctrlKey) return 0; // zoom gesture
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return 0; // already horizontal (trackpad, tilt wheel)
  if (e.shiftKey) return 0; // the browser already maps Shift+wheel to horizontal
  const lines = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  return e.deltaY * lines;
}

let installed = false;

export function installHorizontalWheel(doc: Document = document): () => void {
  if (installed) return () => {};
  installed = true;
  const onWheel = (e: WheelEvent) => {
    const dx = wheelToHorizontal(e);
    if (!dx) return;
    const target = e.target instanceof Element ? e.target : null;
    const scroller = findHorizontalScroller(target);
    if (!scroller) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    const next = Math.max(0, Math.min(max, scroller.scrollLeft + dx));
    if (next === scroller.scrollLeft) return; // at the edge: let the page scroll
    e.preventDefault();
    // instant: the wheel is already incremental, and CSS smooth scrolling would queue/skip the steps
    if (typeof scroller.scrollTo === 'function') scroller.scrollTo({ left: next, behavior: 'instant' as ScrollBehavior });
    else scroller.scrollLeft = next;
  };
  doc.addEventListener('wheel', onWheel, { passive: false, capture: true });
  return () => {
    doc.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
    installed = false;
  };
}
