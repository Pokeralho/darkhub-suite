// A one-off password (host without a saved credential) survives "reconnect" and is dropped when the pane closes.
import { describe, it, expect, vi } from 'vitest';
import { openTerminal, startSession, reconnectPane, closePane, getSshState, hasOneOffPassword } from '../src/components/ssh/sshStore';

describe('sshStore one-off passwords', () => {
  it('reconnect reuses the typed password; closing the pane forgets it', async () => {
    const connect = vi.fn(async () => ({ ok: true }));
    (window as any).darkhub = { ssh: { on: () => () => {}, connect, disconnect: vi.fn(async () => ({ ok: true })) } };
    const pane = openTerminal('host1', 'host1', undefined, undefined, 'pw1');
    await startSession(pane, 80, 24);
    expect((connect.mock.calls[0] as any[])[0]).toMatchObject({ hostId: 'host1', password: 'pw1' });

    const tab = getSshState().tabs.find((t) => t.kind === 'terminal' && t.panes.some((p) => p.sessionId === pane.sessionId))!;
    reconnectPane(tab.id, pane.sessionId);
    const next = (getSshState().tabs.find((t) => t.id === tab.id) as any).panes[0];
    expect(next.sessionId).not.toBe(pane.sessionId);
    await startSession(next, 80, 24);
    expect((connect.mock.calls[1] as any[])[0]).toMatchObject({ sessionId: next.sessionId, password: 'pw1' });
    expect(hasOneOffPassword(pane.sessionId)).toBe(false);

    closePane(tab.id, next.sessionId);
    expect(hasOneOffPassword(next.sessionId)).toBe(false);
  });
});
