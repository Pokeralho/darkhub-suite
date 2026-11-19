import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import React from 'react'
import { I18nProvider } from '../src/i18n/I18nProvider'
import HotkeyCapture from '../src/components/HotkeyCapture'
import { toLatencyAccelerator } from '../src/pages/UltraLowLatency'

const renderCapture = (onChange = vi.fn(), props: Record<string, unknown> = {}) => {
  render(<I18nProvider><HotkeyCapture value="Ctrl+F1" onChange={onChange} {...props} /></I18nProvider>)
  return { onChange, button: screen.getAllByRole('button')[0] }
}

const key = (init: KeyboardEventInit) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  act(() => { window.dispatchEvent(e) })
  return e
}

describe('HotkeyCapture keyboard focus', () => {
  beforeEach(() => cleanup())

  it('does not intercept Tab / Shift+Tab while idle', () => {
    const { onChange, button } = renderCapture()
    button.focus()
    expect(key({ code: 'Tab', key: 'Tab' }).defaultPrevented).toBe(false)
    expect(key({ code: 'Tab', key: 'Tab', shiftKey: true }).defaultPrevented).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('Tab while recording leaves recording and lets focus move (never captured as a hotkey)', () => {
    const { onChange, button } = renderCapture()
    fireEvent.click(button)
    expect(button.getAttribute('aria-pressed')).toBe('true')
    const e = key({ code: 'Tab', key: 'Tab', shiftKey: true })
    expect(e.defaultPrevented).toBe(false)
    expect(onChange).not.toHaveBeenCalled()
    expect(button.getAttribute('aria-pressed')).toBe('false')
  })

  it('still records real combinations while recording', () => {
    const { onChange, button } = renderCapture()
    fireEvent.click(button)
    const e = key({ code: 'F2', key: 'F2', ctrlKey: true })
    expect(e.defaultPrevented).toBe(true)
    expect(onChange).toHaveBeenCalledWith('Ctrl+F2')
  })

  it('keyboardOnly ignores mouse buttons', () => {
    const { onChange, button } = renderCapture(vi.fn(), { keyboardOnly: true })
    fireEvent.click(button)
    act(() => { window.dispatchEvent(new MouseEvent('mousedown', { button: 3, bubbles: true, cancelable: true })) })
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('toLatencyAccelerator (Ultra Low Latency global hotkey)', () => {
  it('maps HotkeyCapture spelling to Electron accelerators', () => {
    expect(toLatencyAccelerator('Ctrl+F1')).toBe('Ctrl+F1')
    expect(toLatencyAccelerator('Win+Shift+K')).toBe('Super+Shift+K')
    expect(toLatencyAccelerator('F9')).toBe('F9')
  })
  it('rejects bare keys and mouse buttons', () => {
    expect(toLatencyAccelerator('A')).toBeNull()
    expect(toLatencyAccelerator('Tab')).toBeNull()
    expect(toLatencyAccelerator('Mouse4')).toBeNull()
    expect(toLatencyAccelerator('')).toBeNull()
  })
})
