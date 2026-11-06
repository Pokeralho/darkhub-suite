import type { PartitionDisk, PartitionEntry, RescueLayoutItem } from '../../global';

export const MIB = 1024 ** 2;

const kindOf = (p: PartitionEntry): RescueLayoutItem['kind'] => {
  const fs = (p.fileSystem ?? '').toUpperCase();
  if (fs === 'NTFS' || fs === 'REFS') return 'ntfs';
  if (fs.includes('FAT')) return 'fat';
  return p.role === 'linux' ? 'ext' : 'raw';
};

/** The Storage listing in the shape the shared map bar draws. */
export function layoutOf(disk: PartitionDisk): RescueLayoutItem[] {
  const ss = disk.sectorSize;
  const items: RescueLayoutItem[] = [
    ...disk.partitions.map((p) => ({ kind: kindOf(p), index: p.number ?? undefined, start_lba: p.offset / ss, sectors: p.size / ss, size: p.size, fs: p.fileSystem ?? p.role, label: p.letter ? `${p.letter}:` : p.label })),
    ...disk.free.map((g) => ({ kind: 'unallocated' as const, start_lba: g.offset / ss, sectors: g.size / ss, size: g.size }))
  ];
  return items.sort((a, b) => a.start_lba - b.start_lba);
}

/** A free gap trimmed to whole MiB, which is what the service accepts. */
export function alignGap(gap: { offset: number; size: number }) {
  const offset = Math.ceil(gap.offset / MIB) * MIB;
  return { offset, size: Math.floor((gap.offset + gap.size - offset) / MIB) * MIB };
}

export const freeLetters = (used: string[]) => 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((l) => !used.includes(l));
