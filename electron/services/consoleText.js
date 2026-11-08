// Native Windows tools (powercfg, netsh, sc...) write redirected output in the console OEM code page, not UTF-8:
// read as UTF-8, "configuração" arrives as "configura��o". Run them with { encoding: 'latin1' } (one char per byte)
// and pass the text here. UTF-8 output is kept; anything else is decoded as code page 850, the OEM page of Portuguese
// and most Western Windows installs (437, used by en-US, agrees with it on the accented letters common in messages).
const CP850_HIGH =
  'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ '

export function decodeConsoleText(latin1) {
  const s = String(latin1 ?? '')
  if (!/[\x80-\xff]/.test(s)) return s
  const bytes = Buffer.from(s, 'latin1')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    let out = ''
    for (const b of bytes) out += b < 0x80 ? String.fromCharCode(b) : CP850_HIGH[b - 0x80]
    return out
  }
}

export default decodeConsoleText
