// Color math shared by the page and the widget. rgb: [r, g, b] 0-255.
var Colors = (function () {
  function hex(rgb) { return '#' + rgb.map(function (v) { return v.toString(16).padStart(2, '0'); }).join('').toUpperCase(); }
  function hsl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, h = 0, s = 0, d = max - min;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }
  function oklch(rgb) {
    var lin = rgb.map(function (v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    var l = Math.cbrt(0.4122214708 * lin[0] + 0.5363325363 * lin[1] + 0.0514459929 * lin[2]);
    var m = Math.cbrt(0.2119034982 * lin[0] + 0.6806995451 * lin[1] + 0.1073969566 * lin[2]);
    var s = Math.cbrt(0.0883024619 * lin[0] + 0.2817188376 * lin[1] + 0.6299787005 * lin[2]);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    var a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    var b = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    var C = Math.sqrt(a * a + b * b), H = (Math.atan2(b, a) * 180 / Math.PI + 360) % 360;
    return [L, C, C < 0.0005 ? 0 : H];
  }
  function formats(rgb) {
    var h = hsl(rgb), o = oklch(rgb);
    return {
      hex: hex(rgb),
      rgb: 'rgb(' + rgb.join(', ') + ')',
      hsl: 'hsl(' + h[0] + ' ' + h[1] + '% ' + h[2] + '%)',
      oklch: 'oklch(' + o[0].toFixed(3) + ' ' + o[1].toFixed(3) + ' ' + o[2].toFixed(1) + ')'
    };
  }
  // dark or light text on top of this color
  function ink(rgb) { return oklch(rgb)[0] > 0.62 ? '#0b0d12' : '#f4f6fa'; }
  return { hex: hex, formats: formats, ink: ink };
})();
