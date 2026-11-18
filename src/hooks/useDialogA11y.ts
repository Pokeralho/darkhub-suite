import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Open dialogs, in the order their effects ran. Only the one on top (e.g. an SSH confirm Modal over a Drawer)
// reacts to Escape / Tab; otherwise every open dialog's capture listener would run and Escape would close them all.
type OpenDialog = { ref: RefObject<HTMLElement | null> }
const openStack: OpenDialog[] = []

/** The dialog on top: no other open dialog sits inside it, and it opened last among those. */
function topDialog(): OpenDialog | undefined {
  // React runs a child's effects before its parent's, so a dialog nested in the DOM wins over open order.
  const leaves = openStack.filter((d) => {
    const root = d.ref.current
    return !openStack.some((o) => o !== d && root && o.ref.current && o.ref.current !== root && root.contains(o.ref.current))
  })
  return leaves[leaves.length - 1]
}

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

    const token: OpenDialog = { ref }
    openStack.push(token)

    const onKey = (e: KeyboardEvent) => {
      if (topDialog() !== token) return
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
      const at = openStack.indexOf(token)
      if (at >= 0) openStack.splice(at, 1)
      if (previous && typeof previous.focus === 'function' && previous.isConnected) {
        try { previous.focus() } catch { /* element may be gone */ }
      }
    }
  }, [open, ref])
}
