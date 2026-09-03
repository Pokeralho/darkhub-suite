import { describe, it, expect } from 'vitest';
import { LuaFileParser, LuaEditor } from '../electron/services/SteamLuaService.js';

describe('Steam Lua Tools Engine', () => {
  const sampleLua = `addappid(1245620) -- Elden Ring Base
addappid(2778580, 1, "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef") -- Shadow of the Erdtree DLC
setManifestid(2778580, "1234567890123456789", 15000000000)
-- addappid(2778581, 1, "deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678") -- Bonus Gesture
-- setManifestid(2778581, "9876543210987654321", 500000)
addappid(1245621) -- Digital Soundtrack
`;

  it('should accurately parse active and commented depots, manifests and keys', () => {
    const parsed = LuaFileParser.parse(sampleLua, 1245620, true);
    expect(parsed).toBeDefined();
    expect(parsed.baseAppId).toBe(1245620);
    expect(parsed.depotCount).toBe(1);
    expect(parsed.dlcCount).toBe(1);
    expect(parsed.hasActivePins).toBe(true);

    const erdtree = parsed.entries.find((e: any) => e.id === 2778580);
    expect(erdtree).toBeDefined();
    expect(erdtree.hasKey).toBe(true);
    expect(erdtree.isLocked).toBe(true);
    expect(erdtree.manifestId).toBe("1234567890123456789");
    expect(erdtree.sizeOnDisk).toBe(15000000000);
    expect(erdtree.comment).toBe("Shadow of the Erdtree DLC");

    const bonusGesture = parsed.disabledEntries.find((e: any) => e.id === 2778581);
    expect(bonusGesture).toBeDefined();
    expect(bonusGesture.isEnabled).toBe(false);
    expect(bonusGesture.commentedManifestId).toBe("9876543210987654321");
  });

  it('should toggle depot enabled / disabled state accurately', () => {
    const disabled = LuaEditor.setDepotEnabled(sampleLua, 2778580, false);
    expect(disabled).toContain('-- addappid(2778580');

    const reEnabled = LuaEditor.setDepotEnabled(disabled, 2778580, true);
    expect(reEnabled).toContain('addappid(2778580');
    expect(reEnabled).not.toContain('-- addappid(2778580');
  });

  it('should toggle depot version lock state (depot pinning) accurately', () => {
    const unlocked = LuaEditor.setDepotLocked(sampleLua, 2778580, false);
    expect(unlocked).toContain('-- setManifestid(2778580');

    const reLocked = LuaEditor.setDepotLocked(unlocked, 2778580, true);
    expect(reLocked).toContain('setManifestid(2778580');
    expect(reLocked).not.toContain('-- setManifestid(2778580');
  });

  it('should strip all manifest pins in auto-update mode', () => {
    const autoUpdated = LuaEditor.commentOutManifestPins(sampleLua);
    expect(autoUpdated).toContain('-- setManifestid(2778580');
    expect(autoUpdated).not.toMatch(/^\s*setManifestid/m);
  });
});
