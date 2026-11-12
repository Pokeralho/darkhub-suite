# DarkHub Suite v0.8.7: a File Converter that uses your GPU and needs nothing installed

The File Converter was rebuilt. Video encodes on the graphics card (or is copied as is when only the container changes),
Office documents convert with nothing installed, and images gain DDS, EXR, HEIC, JPEG XL and camera RAW, among others.

---

## Downloads

| File | Purpose |
|---|---|
| `DarkHub-Setup-0.8.7.exe` | **Installer (recommended)**. Used by the automatic updater. |
| `DarkHub.Setup.0.8.7.exe` | Same installer under the older name, for `install.ps1` from previous versions. |
| `DarkHub.0.8.7-portable.exe` | Portable, runs without installing. |
| `latest.yml` | Update metadata (installer SHA-512). |
| `SHA256SUMS.txt` | SHA-256 of every file above. |

**SHA-256**
```
9f7b7cf83e7af128f4038d82c2fc76fd5fc42b0cfaa432b591dff3723cddb560  DarkHub-Setup-0.8.7.exe / DarkHub.Setup.0.8.7.exe
904910bf1d4b265916606cb910a5f65ed0c4ef29cada44e01668f42e8c5295a9  DarkHub.0.8.7-portable.exe
```

This build was made on the maintainer's PC and is not code-signed, like earlier versions. The installer is larger than
before (it now carries LibreOffice for document conversion).

---

### Video and audio

- **GPU first.** DarkHub tests the encoders of your card (NVIDIA NVENC, AMD AMF, Intel Quick Sync) and uses the first
  that works; on NVIDIA, decoding, scaling and encoding all stay on the GPU. If anything fails, it falls back to the CPU.
- **No re-encoding when it is not needed.** MKV to MP4, MP4 to MKV, AAC to M4A and similar changes copy the streams:
  seconds instead of minutes, with no quality loss.
- **Keeps the PC usable.** CPU encodes run at low priority and leave a quarter of the threads free.
- Progress per file (percent, speed, GPU or copy), **Cancel**, H.264/HEVC/AV1/VP9 choice, speed/quality presets,
  maximum resolution and frame rate. New outputs: M4V, TS, AAC, AIFF, AC3, ALAC. All audio tracks, subtitles and fonts
  are kept where the container allows.

Measured on an RTX 5060 + Ryzen 7 5700 with a 61 s 1080p60 clip:

| Conversion | 0.8.6 | 0.8.7 |
|---|---|---|
| MP4 to MP4 | 33.5 s, CPU 48% | 9.3 s, CPU 2%, higher quality (VMAF 96.8 vs 94.8) |
| MKV (HEVC) to MP4 | 33.7 s | 0.6 s (copy) |
| MP4 to MKV | 36.7 s | 0.6 s (copy) |
| MP4 to WebM (15 s) | 72.7 s | 2.3 s (AV1 on the GPU) |

### Documents, spreadsheets, presentations, e-books

- Word (DOC/DOCX), Excel (XLS/XLSX/XLSB), PowerPoint (PPT/PPTX), OpenDocument, RTF, Visio, Pages/Numbers/Keynote and
  other legacy formats convert to PDF, DOCX, ODT, XLSX, CSV, PPTX, EPUB and more **with nothing installed**: a trimmed
  LibreOffice ships inside DarkHub.
- PDF to text or to PNG/JPG (one image per page), PDF to editable DOCX.
- Markdown, HTML, TXT and EPUB to PDF; CSV/JSON/YAML/XML data conversions with proper CSV parsing.
- A mixed queue only offers formats every file can reach.

### Images

- New inputs: **DDS** (BC1 to BC7, BC6H HDR), TGA, **EXR** and **HDR** (tone handled), PSD, ICO/CUR, **HEIC**,
  **JPEG XL**, QOI, JPEG 2000, PCX, Netpbm and **camera RAW** (CR2, CR3, NEF, ARW, DNG, ORF, RW2, RAF and more).
- New outputs: **DDS** with BC1/BC3/BC4/BC5/BC6H/BC7/RGBA, sRGB and mipmaps, **JPEG XL**, TGA, EXR, HDR, QOI, JPEG 2000,
  PPM, PCX, multi-size **ICO** and **CUR**.
- Lossless option for WebP/AVIF/JXL, optional resize, keep metadata; photos are rotated by their EXIF orientation.

### Fixed

- PDF to TXT failed with every file.
- BMP and ICO outputs were PNG files with another extension.
- Converting to the same format in the same folder overwrote the original file; outputs now get "name (2)".

Full format matrix: `docs/CONVERTER_FORMATS.md`.
