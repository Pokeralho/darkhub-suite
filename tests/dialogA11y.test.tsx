import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, cleanup, act } from '@testing-library/react'
import React, { useRef } from 'react'
import { useDialogA11y } from '../src/hooks/useDialogA11y'

function Dialog({ name, onClose, children }: { name: string; onClose: () => void; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogA11y(ref, true, onClose)
  return (
    <div ref={ref} role="dialog" aria-label={name}>
      <button type="button">{name} first</button>
      <button type="button">{name} last</button>
      {children}
    </div>
  )
}

const press = (init: KeyboardEventInit) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => { document.dispatchEvent(e) })
  return e
}

describe('useDialogA11y', () => {
  beforeEach(() => cleanup())

  it('focuses the first control, closes on Escape and gives focus back', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const onClose = vi.fn()
    const { getByText, unmount } = render(<Dialog name="A" onClose={onClose} />)
    expect(document.activeElement).toBe(getByText('A first'))
    press({ key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('keeps Tab / Shift+Tab inside the dialog', () => {
    const { getByText } = render(<Dialog name="A" onClose={() => {}} />)
    getByText('A last').focus()
    expect(press({ key: 'Tab' }).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(getByText('A first'))
    expect(press({ key: 'Tab', shiftKey: true }).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(getByText('A last'))
  })

  it('with nested dialogs only the top one handles Escape and Tab', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    const { getByText } = render(
      <Dialog name="Outer" onClose={outer}>
        <Dialog name="Inner" onClose={inner} />
      </Dialog>
    )
    press({ key: 'Escape' })
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()
    getByText('Inner last').focus()
    press({ key: 'Tab' })
    expect(document.activeElement).toBe(getByText('Inner first'))
  })
})
