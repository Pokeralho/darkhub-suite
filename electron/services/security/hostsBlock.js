// The section DarkHub keeps in the hosts file. Pure text handling, so it is unit-tested on any platform.

export const TRACKING_BEGIN = '# DarkHub Tracking Blocker - BEGIN'
export const TRACKING_END = '# DarkHub Tracking Blocker - END'

/**
 * Lines of a hosts file without DarkHub's section(s). Only a complete BEGIN..END pair is removed. A BEGIN whose
 * END is missing (file edited by hand, or cut by another tool) loses just its marker line: treating it as "open
 * until the end of the file" used to delete every entry the user had after it.
 */
export function stripTrackingBlocks(lines) {
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes(TRACKING_BEGIN)) {
      let end = -1
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].includes(TRACKING_BEGIN)) break
        if (lines[j].includes(TRACKING_END)) { end = j; break }
      }
      if (end !== -1) i = end
      continue
    }
    if (line.includes(TRACKING_END)) continue
    out.push(line)
  }
  return out
}
