// en-US: the recovery strings needed before its screen loads (menu entry, shared error texts).
const dict: Record<string, string> = {
  "rescue.err.disk_mismatch": "This backup was made on a different disk (different size or identifier). Nothing was written.",
  "rescue.err.same_disk": "Pick a destination on ANOTHER disk: writing to the disk being read would overwrite its own data.",
  "rescue.err.same_disk_unknown": "Could not confirm which disk the destination is on (network folder, virtual drive or mount point without a disk). Pick a folder on a local drive of another disk.",
  "nav.diskrescue": "Disk Studio & Rescue"
};

export default dict;
