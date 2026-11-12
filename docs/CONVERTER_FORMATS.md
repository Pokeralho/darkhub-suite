# Conversor de Arquivos: matriz de formatos

Tela `converter` (`src/pages/FileConverter.tsx`) → IPC `files:*` (`electron/ipc/converterIpc.js`) → serviços em
`electron/services/converter/`. Nada precisa estar instalado no Windows: tudo abaixo vem dentro do instalador.

| Motor | Onde | Licença | Tamanho |
|---|---|---|---|
| FFmpeg 6.1.1 (gyan essentials) | `node_modules/ffmpeg-static` | GPL | já existia |
| sharp / libvips 8.17 | `node_modules/sharp` | Apache-2.0 / LGPL | já existia |
| LibreOffice 26.2.7.3, enxuto e headless | `vendor/libreoffice` → `resources/libreoffice` (`npm run build:libreoffice`) | MPL-2.0 | 468 MB em disco, ~173 MB em zip |
| texconv (DirectXTex may2026) | `vendor/imagetools` (`npm run build:imagetools`) | MIT | 0,9 MB |
| LibRaw 0.22.0 (`dcraw_emu` + `libraw.dll`) | `vendor/imagetools` | LGPL-2.1 ou CDDL-1.0 | 1,2 MB |
| libheif-js (HEVC via libde265, wasm) | npm `heic-decode` | LGPL-3.0 (wasm separado e substituível) | 3,5 MB |
| libjxl (wasm) | npm `@jsquash/jxl` | Apache-2.0 | 2,2 MB usados |
| pdf.js + @napi-rs/canvas | npm `pdf-parse` (já existia) | Apache-2.0 / MIT | já existia |
| marked, fflate | npm | MIT | < 1 MB |
| Chromium (printToPDF) | o próprio Electron | — | 0 |

Downloads de build têm SHA-256 fixo nos scripts e em `tests/converterVendor.test.ts`.

## Antes desta mudança (0.8.6)

| Categoria | Entrada | Saída | Observação |
|---|---|---|---|
| Imagem | jpg png webp avif tiff gif svg | png jpg webp avif tiff gif bmp ico | BMP gravava PNG com extensão .bmp; ICO gravava um PNG 256 px com extensão .ico; HEIC/BMP/ICO de entrada falhavam |
| Vídeo | mp4 mkv webm mov avi wmv flv | mp4 mkv webm mov avi wmv gif mp3 | sempre recodificava na CPU (libx264/libvpx-vp9 sem `row-mt`), sem progresso, sem cancelar; mesmo formato sobrescrevia a entrada |
| Áudio | mp3 wav flac aac m4a ogg opus wma | os mesmos | sempre recodificava |
| Documento | pdf csv json md + Office com LibreOffice instalado | txt (de pdf), json, csv, xml, html (de md), pdf (Office) | PDF→TXT quebrado (pdf-parse v2 não tem export default); Office exigia LibreOffice instalado |
| Planilha / Apresentação / E-book | — | — | só via LibreOffice instalado, sem opção na tela |

## Agora

### Imagens (`ImageConverter.js`)

Entrada: JPEG, PNG, WebP, AVIF, TIFF, GIF (animado), SVG/SVGZ, **HEIC/HEIF**, **JPEG XL**, **ICO/CUR**, **DDS (BC1–BC7,
BC6H HDR)**, **BMP/DIB**, **TGA**, **PSD** (imagem composta), **EXR** e **Radiance HDR** (tom para sRGB), PCX, SGI, QOI,
JPEG 2000, PBM/PGM/PPM/PAM/PFM, XBM, XWD, Sun Raster, DPX, **RAW de câmera** (CR2, CR3, CRW, NEF, NRW, ARW, SRF, SR2,
DNG, ORF, RW2, RAF, PEF, SRW, X3F, 3FR, ERF, KDC, MRW, MOS, IIQ, RWL, DCR; com fallback para o JPEG embutido via ExifTool).

Saída: PNG, JPEG (mozjpeg), WebP, AVIF, **JPEG XL**, TIFF (LZW), GIF (animado se a entrada for), **BMP de verdade** (24/32
bits), **ICO multi-tamanho** (16–256), **CUR** (32–256, hotspot), **DDS** (BC1, BC3, BC4, BC5, BC6H, BC7, RGBA; sRGB e
mipmaps opcionais), **TGA**, **EXR** (half, linear), **HDR** (linear), QOI, JPEG 2000, PPM, PCX.
Opções: qualidade, sem perdas (WebP/AVIF/JXL), redimensionar, manter metadados; orientação EXIF sempre aplicada e perfil ICC preservado.

Não suportado: escrever HEIC (patente HEVC; use AVIF ou JXL), camadas do PSD (só a imagem composta), PSD de saída.

### Vídeo e áudio (`MediaConverter.js` + `mediaPlan.js`)

Entrada: tudo que o FFmpeg lê (MP4, MKV, WebM, MOV, AVI, WMV, FLV, TS/M2TS, M4V, MPG, VOB, 3GP, OGV...; MP3, WAV, FLAC,
AAC, M4A, OGG, Opus, WMA, AIFF, AC3, DTS, APE, WV...).

Saída de vídeo: MP4, MKV, WebM, MOV, M4V, TS, AVI (Xvid), WMV, FLV, GIF (paleta em duas passagens), MP3 (extrair áudio).
Codecs: H.264, HEVC, AV1 (MP4/MKV), VP9 ou AV1 (WebM). Saída de áudio: MP3, FLAC, WAV, M4A (AAC), AAC (ADTS), Opus, Ogg
Vorbis, WMA, AIFF, AC3, ALAC.

Regras:
1. **Cópia sem recodificar** quando o contêiner muda e o codec cabe no destino (ex.: MKV HEVC → MP4, MP4 → MKV, áudio
   AAC → M4A). Áudio incompatível é recodificado sozinho; vídeo continua copiado.
2. **GPU primeiro**: o app testa de verdade NVENC, AMF e Quick Sync com um encode de 5 quadros e usa o primeiro que
   funciona. Na NVIDIA o caminho é todo na GPU (NVDEC → `scale_cuda` → NVENC). Se falhar: GPU só no encode; depois CPU.
3. **PC responsivo** (padrão): FFmpeg em prioridade abaixo do normal e encoders de CPU com no máximo 75% dos threads.
4. Faixas: todas as de áudio; legendas de texto viram `mov_text` no MP4/MOV, MKV copia legendas e anexos (fontes).
5. Progresso por arquivo (%, velocidade, GPU/cópia) e **cancelar** que mata a árvore de processos e apaga a saída parcial.
6. Saída nunca sobrescreve: `nome (2).mp4` se já existir.

### Documentos, planilhas, apresentações, e-books e dados (`DocumentConverter.js` + `docRoutes.js`)

| De | Para | Motor |
|---|---|---|
| Texto: DOC, DOCX, DOCM, DOT(X), ODT, OTT, FODT, RTF, WPD, WPS, ABW, LWP, HWP, Pages, SXW, WRI | PDF, DOCX, DOC, ODT, RTF, TXT, HTML, EPUB | LibreOffice embutido |
| Planilha: XLS, XLSX, XLSM, XLSB, XLT(X), ODS, OTS, FODS, Numbers, SXC, DBF, SLK, WK1 | PDF, XLSX, XLS, ODS, CSV (todas as abas), HTML | LibreOffice embutido |
| Apresentação: PPT, PPTX, PPTM, PPS(X), POT(X), ODP, OTP, FODP, Keynote, SXI | PDF, PPTX, PPT, ODP | LibreOffice embutido |
| Desenho: VSD, VSDX, VDX, ODG, CDR, PUB, WPG | PDF, ODG, PNG, SVG | LibreOffice embutido |
| PDF | TXT, PNG/JPG (uma imagem por página) | pdf.js |
| PDF | DOCX, ODT (editável, layout em caixas), ODG | LibreOffice embutido |
| Markdown | HTML, TXT | marked |
| Markdown | PDF | Chromium do Electron |
| Markdown | DOCX, ODT | marked → LibreOffice |
| HTML | PDF | Chromium (sem JavaScript, sem rede) |
| HTML | TXT | JS |
| HTML | DOCX, ODT, RTF, DOC, EPUB | LibreOffice embutido |
| TXT | PDF / HTML / DOCX, ODT, RTF | Chromium / JS / LibreOffice |
| EPUB | PDF / HTML / TXT | leitor EPUB próprio (fflate) + Chromium |
| CSV, TSV | JSON (RFC 4180, detecta `,` `;` tab `\|`) | JS |
| CSV, TSV | XLSX, ODS, XLS, PDF, HTML | LibreOffice embutido |
| JSON | CSV, XML, YAML | JS |
| YAML | JSON | JS |

Fila mista (ex.: DOCX + XLSX) mostra só os formatos que todos alcançam (`files:docTargets`). LibreOffice roda em lote
(uma inicialização por grupo de arquivos), perfil próprio em `userData/converter/lo-profile`, nunca usa o perfil do usuário.

Não suportado: MOBI/AZW (DRM/proprietário), PDF → PPTX/XLSX, EPUB de saída a partir de PDF.

### Compactados (inalterado)

ZIP e TAR.GZ de saída; extração de ZIP, TAR, GZ, 7Z e RAR pelo `tar.exe` do Windows.

## Medições

RTX 5060 (driver 617.42), Ryzen 7 5700 (16 threads), FFmpeg 6.1.1. Fonte: vídeo 1080p60 H.264 de 61 s (16 Mb/s, AAC)
e a mesma cena em HEVC/MKV. "Antes" = argumentos exatos da 0.8.6; "depois" = plano gerado por `buildMediaPlan`.
CPU = média do processo FFmpeg em % do total de threads; RAM = pico do working set; amostras a cada 500 ms.

| Conversão | Antes | Depois | Ganho |
|---|---|---|---|
| MP4 → MP4 (recodificar) | 33,5 s, CPU 48%, 926 MB, 20,1 MB, VMAF 94,8 | 9,3 s, CPU 2%, 345 MB, 23,6 MB, VMAF 96,8 (NVENC, tudo na GPU) | 3,6× mais rápido, CPU −96%, RAM −63%, qualidade maior |
| MKV (HEVC) → MP4 | 33,7 s, CPU 50%, 946 MB | 0,6 s (cópia sem recodificar, sem perda) | 58× |
| MP4 → MKV | 36,7 s, CPU 49%, 1051 MB | 0,6 s (cópia) | 64× |
| MP4 → WebM (15 s de vídeo) | 72,7 s, CPU 19% (VP9) | 2,3 s, CPU 3% (AV1 NVENC); VMAF 81,5 vs 81,0 | 32× |
| MP4 → MP4 só CPU (PC sem GPU compatível) | 33,5 s, 926 MB, threads livres 0 | 35,0 s, 676 MB, 4 threads livres + prioridade abaixo do normal | mesmo tempo, PC responsivo |

Imagens (1920×1080, uma por vez): DDS BC7 0,8 s (texconv na GPU), BC1/3/4/5 ~0,2 s, JXL 4,7 s (wasm, sem threads), demais < 0,7 s.
Documentos: lote de 4 documentos de texto → PDF 6 s (uma inicialização do LibreOffice); PPTX real de 1,2 MB → PDF 3,3 s;
HTML/Markdown → PDF 0,5 s (Chromium).
