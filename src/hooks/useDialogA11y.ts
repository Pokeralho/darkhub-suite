import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keyboard basics for a modal dialog (pair it with role="dialog" aria-modal="true" on the container):
 *  - moves focus into the dialog when it opens (first focusable element, else the container),
 *  - keeps Tab / Shift+Tab inside the dialog,
 *  - Escape calls `onClose` (pass undefined while the dialog must not be dismissed, e.g. mid-download),
 *  - gives focus back to the element that had it when the dialog closes.
 */
export function useDialogA11y(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose?: () => void
): void {
  // Callers pass inline handlers: keep the latest one without re-running the open effect (focus would jump).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = (typeof document !== 'undefined' ? document.activeElement : null) as HTMLElement | null
    const root = ref.current
    // An autoFocus field inside the dialog already has focus: keep it.
    if (root && !(previous && root.contains(previous))) {
      const first = root.querySelector<HTMLElement>('[data-autofocus]') ?? root.querySelector<HTMLElement>(FOCUSABLE)
      if (first) first.focus()
      else {
        if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1')
        root.focus()
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onCloseRef.current) {
          e.stopPropagation()
          onCloseRef.current()
        }
        return
      }
      if (e.key !== 'Tab') return
      const el = ref.current
      if (!el) return
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      const inside = active ? el.contains(active) : false
      if (e.shiftKey && (active === firstItem || !inside)) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && (active === lastItem || !inside)) {
        e.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      if (previous && typeof previous.focus === 'function' && previous.isConnected) {
        try { previous.focus() } catch { /* element may be gone */ }
      }
    }
  }, [open, ref])
}
