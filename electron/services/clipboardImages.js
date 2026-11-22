// Pictures on the clipboard. Since Electron 44 the clipboard module is asynchronous and has no readImage /
// writeImage: an image travels as an "image/png" Blob inside a ClipboardItem. The Electron pieces are passed in,
// so this file is unit-tested without Electron.

const PNG = 'image/png'

/** Puts a NativeImage on the clipboard, optionally with a text for programs that paste text instead. */
export async function writeClipboardImage({ clipboard, ClipboardItem }, image, text = null) {
  const data = { [PNG]: new Blob([new Uint8Array(image.toPNG())], { type: PNG }) }
  if (text) data['text/plain'] = String(text)
  await clipboard.write([new ClipboardItem(data)])
}

/** Size of the picture currently on the clipboard, or null when there is none (or it cannot be read). */
export async function clipboardImageSize({ clipboard, nativeImage }) {
  for (const item of await clipboard.read()) {
    if (!item.types.includes(PNG)) continue
    const blob = await item.getType(PNG)
    const image = nativeImage.createFromBuffer(Buffer.from(await blob.arrayBuffer()))
    if (image.isEmpty()) continue
    const { width, height } = image.getSize()
    return { width, height }
  }
  return null
}
