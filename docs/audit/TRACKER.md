# Auditoria item por item

Status: ⬜ não testado · 🟡 em andamento · ✅ ok · ❌ com problema

Abra cada item com `npm run dev -- --page=<rota>` (ou `npm run dev:admin -- -Page <rota>` se precisar de administrador).

| # | Grupo | Rota | Tela | Arquivo | Chamadas IPC | Testes automáticos | Admin | Status | Observações |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Diagnostics & Hardware | `driver` | Driver Center | `src/pages/DriverCenter.tsx` | 2 | driverCenter | sim | ⬜ | |
| 2 | Diagnostics & Hardware | `monitor` | System Monitor | `src/pages/SystemMonitor.tsx` | 6 | — | não | ⬜ | |
| 3 | Diagnostics & Hardware | `networktools` | Network & Latency | `src/pages/NetworkTools.tsx` | 8 | — | sim | ⬜ | |
| 4 | Diagnostics & Hardware | `setuphub` | Post-Install Hub | `src/pages/SetupHub.tsx` | 3 | — | sim | ⬜ | |
| 5 | Gaming & Performance | `darkpacer` | DarkPacer (FPS Lock) | `src/pages/FramePacer.tsx` | 8 | — | não | ⬜ | |
| 6 | Gaming & Performance | `dll-injector` | DLL Injector | `src/pages/DllInjector.tsx` | 2 | — | sim | ⬜ | |
| 7 | Gaming & Performance | `dlss5` | DLSS 5 Manager | `src/pages/Dlss5Manager.tsx` | 10 | dlss5, dlss5Lifecycle | não | ⬜ | |
| 8 | Gaming & Performance | `optimizer` | System Optimizer | `src/pages/Optimizer.tsx` | 39 | optimizerAudit, system | sim | ⬜ | |
| 9 | Gaming & Performance | `optiscaler` | OptiScaler Manager | `src/pages/OptiScalerManager.tsx` | 12 | optiscaler | não | ⬜ | |
| 10 | Gaming & Performance | `ultra-latency` | Ultra Low Latency | `src/pages/UltraLowLatency.tsx` | 7 | — | sim | ⬜ | |
| 11 | Overview | `darkos` | DarkOS | `src/pages/DarkOSCenter.tsx` | 13 | darkosService | sim | ⬜ | |
| 12 | Overview | `dashboard` | Dashboard | `src/pages/Dashboard.tsx` | 11 | — | não | ⬜ | |
| 13 | Overview | `home` | Home | `src/pages/Home.tsx` | 2 | — | não | ⬜ | |
| 14 | Utilities & Tools | `autoclicker` | AutoClicker | `src/pages/AutoClicker.tsx` | 6 | — | não | ⬜ | |
| 15 | Utilities & Tools | `converter` | File Converter | `src/pages/FileConverter.tsx` | 7 | — | não | ⬜ | |
| 16 | Utilities & Tools | `decryption` | Decryption | `src/pages/Decryption.tsx` | 0 | — | não | ⬜ | |
| 17 | Utilities & Tools | `devtools` | Developer Tools | `src/pages/DevTools.tsx` | 0 | — | não | ⬜ | |
| 18 | Utilities & Tools | `downloads` | Download Manager | `src/pages/Downloads.tsx` | 13 | downloads | não | ⬜ | |
| 19 | Utilities & Tools | `juuzou` | Juuzou | `src/pages/Juuzou.tsx` | 0 | — | não | ⬜ | |
| 20 | Utilities & Tools | `library` | Library | `src/pages/Library.tsx` | 11 | — | não | ⬜ | |
| 21 | Utilities & Tools | `luluflix` | LuluFlix | `src/pages/LuluFlix.tsx` | 0 | — | não | ⬜ | |
| 22 | Utilities & Tools | `metadata` | EXIF Editor | `src/pages/MetaDataEditor.tsx` | 5 | — | não | ⬜ | |
| 23 | Utilities & Tools | `ocr` | Image OCR | `src/pages/ImageTextExtractor.tsx` | 2 | — | não | ⬜ | |
| 24 | Utilities & Tools | `passwords` | Password Vault | `src/pages/PasswordManager.tsx` | 14 | — | não | ⬜ | |
| 25 | Utilities & Tools | `powershell` | PowerShell Tools | `src/pages/PowerShellTools.tsx` | 4 | powershellTools | sim | ⬜ | |
| 26 | Utilities & Tools | `security` | Advanced Security | `src/pages/AdvancedSecurity.tsx` | 17 | — | sim | ⬜ | |
| 27 | Utilities & Tools | `summarizer` | Summarizer | `src/pages/TextSummarizer.tsx` | 2 | — | não | ⬜ | |
| 28 | Utilities & Tools | `texteditor` | Text Editor | `src/pages/TextEditor.tsx` | 4 | — | não | ⬜ | |
| 29 | Utilities & Tools | `youtube` | Video Downloader | `src/pages/YoutubeDownloader.tsx` | 6 | — | não | ⬜ | |
| 30 | Outros | `settings` | settings | `src/pages/Settings.tsx` | 10 | — | não | ⬜ | |
