<!-- GERADO por electron_feature_map.py em 2026-11-11T18:57:04. NAO edite a mao: rode `npm run map`. -->

# Canais IPC (537)

| API (`window.darkhub.`) | canal | handler | chama | usado em |
|---|---|---|---|---|
| `app.getAbout` | `app:getAbout` | `electron/main.js:1491` | `runCommand() (electron/services/PowerShellRunner.js)` | _nao usado_ |
| `app.getResourceUsage` | `app:getResourceUsage` | `electron/main.js:1470` | `metrics.map`<br>`processes.reduce` | `src/pages/Settings.tsx`<br>`src/pages/SystemMonitor.tsx` |
| `autoclicker.getHotkey` | `autoclicker:getHotkey` | `electron/main.js:3396` |  | _nao usado_ |
| `autoclicker.onChanged` | `autoclicker:changed` | _evento main->tela_ |  | `src/pages/AutoClicker.tsx` |
| `autoclicker.setHotkey` | `autoclicker:setHotkey` | `electron/main.js:3397` | `autoClicker.setHotkey` | `src/pages/AutoClicker.tsx` |
| `autoclicker.setTabActive` | `autoclicker:setTabActive` | `electron/main.js:3398` |  | `src/pages/AutoClicker.tsx` |
| `autoclicker.start` | `autoclicker:start` | `electron/main.js:3393` | `autoClicker.start` | `src/pages/AutoClicker.tsx` |
| `autoclicker.status` | `autoclicker:status` | `electron/main.js:3392` | `autoClicker.state` | `src/pages/AutoClicker.tsx` |
| `autoclicker.stop` | `autoclicker:stop` | `electron/main.js:3394` | `autoClicker.stop` | `src/pages/AutoClicker.tsx` |
| `autoclicker.toggle` | `autoclicker:toggle` | `electron/main.js:3395` | `autoClicker.toggle` | `src/i18n/messages.ts` |
| `bench.cancel` | `bench:cancel` | `electron/ipc/benchmarkIpc.js:14` | `svc.cancel` | _nao usado_ |
| `bench.compare` | `bench:compare` | `electron/ipc/benchmarkIpc.js:16` | `svc.compare` | `src/pages/Benchmark.tsx` |
| `bench.history` | `bench:history` | `electron/ipc/benchmarkIpc.js:15` | `svc.history` | `src/pages/Benchmark.tsx` |
| `bench.onEvent` | `bench:event` | _evento main->tela_ |  | _nao usado_ |
| `bench.remove` | `bench:remove` | `electron/ipc/benchmarkIpc.js:17` | `svc.remove`<br>`svc.cancel` | _nao usado_ |
| `bench.run` | `bench:run` | `electron/ipc/benchmarkIpc.js:13` | `svc.run` | _nao usado_ |
| `cleaner.browsers` | `cleaner:browsers` | `electron/ipc/cleanerIpc.js:20` | `svc.browsers` | `src/pages/Cleaner.tsx` |
| `cleaner.clean` | `cleaner:clean` | `electron/ipc/cleanerIpc.js:19` | `svc.clean` | `src/pages/Cleaner.tsx` |
| `cleaner.listBackups` | `cleaner:list-backups` | `electron/ipc/cleanerIpc.js:23` | `svc.listBackups` | `src/pages/Cleaner.tsx` |
| `cleaner.listTargets` | `cleaner:list-targets` | `electron/ipc/cleanerIpc.js:17` | `svc.listTargets` | `src/pages/Cleaner.tsx` |
| `cleaner.openBackups` | `cleaner:open-backups` | `electron/ipc/cleanerIpc.js:25` | `svc.listBackups` | `src/pages/Cleaner.tsx` |
| `cleaner.regClean` | `cleaner:reg-clean` | `electron/ipc/cleanerIpc.js:22` | `svc.regClean` | `src/pages/Cleaner.tsx` |
| `cleaner.regScan` | `cleaner:reg-scan` | `electron/ipc/cleanerIpc.js:21` | `svc.regScan` | `src/pages/Cleaner.tsx` |
| `cleaner.removeDefinitions` | `cleaner:remove-definitions` | `electron/ipc/cleanerIpc.js:16` | `svc.removeDefinitions` | `src/pages/Cleaner.tsx` |
| `cleaner.restoreBackup` | `cleaner:restore-backup` | `electron/ipc/cleanerIpc.js:24` | `svc.restoreBackup` | `src/pages/Cleaner.tsx` |
| `cleaner.scan` | `cleaner:scan` | `electron/ipc/cleanerIpc.js:18` | `svc.scan` | `src/pages/Cleaner.tsx` |
| `cleaner.status` | `cleaner:status` | `electron/ipc/cleanerIpc.js:14` | `svc.status` | `src/pages/Cleaner.tsx` |
| `cleaner.updateDefinitions` | `cleaner:update-definitions` | `electron/ipc/cleanerIpc.js:15` | `svc.updateDefinitions` | `src/pages/Cleaner.tsx` |
| `clearTrace` | `dev:clearTrace` | **sem handler** |  | _nao usado_ |
| `code.cancel` | `code:cancel` | `electron/ipc/codeRunnerIpc.js:13` | `cancelRun() (electron/services/CodeRunner.js)` | `src/pages/TextEditor.tsx` |
| `code.run` | `code:run` | `electron/ipc/codeRunnerIpc.js:12` | `runCode() (electron/services/CodeRunner.js)` | `src/pages/TextEditor.tsx` |
| `code.runtimes` | `code:runtimes` | `electron/ipc/codeRunnerIpc.js:11` | `detectRuntimes() (electron/services/CodeRunner.js)` | `src/pages/TextEditor.tsx` |
| `darkos.applyChange` | `darkos:applyChange` | `electron/ipc/darkosIpc.js:66` |  | _nao usado_ |
| `darkos.createSnapshot` | `darkos:createSnapshot` | `electron/ipc/darkosIpc.js:73` |  | _nao usado_ |
| `darkos.exportDiagnostics` | `darkos:exportDiagnostics` | `electron/ipc/darkosIpc.js:95` | `i.test` | _nao usado_ |
| `darkos.getCatalog` | `darkos:getCatalog` | `electron/ipc/darkosIpc.js:63` |  | _nao usado_ |
| `darkos.getFailures` | `darkos:getFailures` | `electron/ipc/darkosIpc.js:75` |  | _nao usado_ |
| `darkos.getManifest` | `darkos:getManifest` | `electron/ipc/darkosIpc.js:64` |  | _nao usado_ |
| `darkos.getRebootPending` | `darkos:getRebootPending` | `electron/ipc/darkosIpc.js:76` | `sender.isDestroyed`<br>`sender.send` | _nao usado_ |
| `darkos.getRemovedApps` | `darkos:getRemovedApps` | `electron/ipc/darkosIpc.js:70` |  | _nao usado_ |
| `darkos.getStatus` | `darkos:getStatus` | `electron/ipc/darkosIpc.js:65` |  | _nao usado_ |
| `darkos.isDarkOS` | `darkos:isDarkOS` | `electron/ipc/darkosIpc.js:60` | `darkhub.ink` | `src/components/darkos/DarkOSOptimizerHint.tsx`<br>`src/layouts/MainLayout.tsx`<br>`src/pages/DarkOSCenter.tsx` |
| `darkos.latestRelease` | `darkos:latestRelease` | `electron/ipc/darkosIpc.js:62` |  | `src/components/darkos/DarkOSReleaseCard.tsx`<br>`src/components/darkos/DarkOSUsbCard.tsx` |
| `darkos.listSnapshots` | `darkos:listSnapshots` | `electron/ipc/darkosIpc.js:72` |  | _nao usado_ |
| `darkos.onRunEvent` | `darkos:runEvent` | _evento main->tela_ |  | `src/components/darkos/DarkOSProgress.tsx` |
| `darkos.onUsbEvent` | `darkos:usbEvent` | _evento main->tela_ |  | `src/components/darkos/DarkOSUsbCard.tsx` |
| `darkos.reinstallEdge` | `darkos:reinstallEdge` | `electron/ipc/darkosIpc.js:36` | `svc.revertChange`<br>`ElevationHelper.runElevatedPowerShell (electron/services/optimizer/ElevationHelper.js)` | `src/components/darkos/DarkOSSystemPanel.tsx` |
| `darkos.restoreAppx` | `darkos:restoreAppx` | `electron/ipc/darkosIpc.js:71` |  | _nao usado_ |
| `darkos.restoreProfile` | `darkos:restoreProfile` | `electron/ipc/darkosIpc.js:69` |  | _nao usado_ |
| `darkos.restoreSnapshot` | `darkos:restoreSnapshot` | `electron/ipc/darkosIpc.js:74` |  | _nao usado_ |
| `darkos.revertChange` | `darkos:revertChange` | `electron/ipc/darkosIpc.js:67` |  | _nao usado_ |
| `darkos.setProfile` | `darkos:setProfile` | `electron/ipc/darkosIpc.js:68` |  | _nao usado_ |
| `darkos.usbCancel` | `darkos:usbCancel` | `electron/ipc/darkosIpc.js:92` | `usb.cancel` | _nao usado_ |
| `darkos.usbDisks` | `darkos:usbDisks` | `electron/ipc/darkosIpc.js:81` | `usb.listDisks` | `src/components/darkos/DarkOSUsbCard.tsx` |
| `darkos.usbFindIsos` | `darkos:usbFindIsos` | `electron/ipc/darkosIpc.js:82` | `usb.findIsos` | `src/components/darkos/DarkOSUsbCard.tsx` |
| `darkos.usbHashIso` | `darkos:usbHashIso` | `electron/ipc/darkosIpc.js:90` | `usb.hashIso` | `src/components/darkos/DarkOSUsbCard.tsx` |
| `darkos.usbPickIso` | `darkos:usbPickIso` | `electron/ipc/darkosIpc.js:83` | `usb.allowIso` | `src/components/darkos/DarkOSUsbCard.tsx` |
| `darkos.usbWrite` | `darkos:usbWrite` | `electron/ipc/darkosIpc.js:91` | `usb.write` | `src/components/darkos/DarkOSUsbCard.tsx` |
| `darkpacer.closeOverlay` | `framepacer:closeOverlay` | `electron/main.js:1731` | `closeFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.createOverlay` | `framepacer:createOverlay` | `electron/main.js:1726` | `createFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.getMetrics` | `framepacer:getMetrics` | `electron/main.js:1722` | `FramePacerEngine.getMetrics (electron/services/FramePacerEngine.js)` | _nao usado_ |
| `darkpacer.getOverlayStatus` | `framepacer:getOverlayStatus` | `electron/main.js:1748` | `getOverlayStatus() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.onMetrics` | `framepacer:metrics` | _evento main->tela_ |  | _nao usado_ |
| `darkpacer.setOverlayClickThrough` | `framepacer:setOverlayClickThrough` | `electron/main.js:1740` | `setOverlayClickThrough() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.setOverlayConfig` | `framepacer:setOverlayConfig` | `electron/main.js:1744` | `setOverlayConfig() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.start` | `framepacer:start` | `electron/main.js:1710` | `FramePacerEngine.start (electron/services/FramePacerEngine.js)` | _nao usado_ |
| `darkpacer.stop` | `framepacer:stop` | `electron/main.js:1714` | `FramePacerEngine.stop (electron/services/FramePacerEngine.js)` | _nao usado_ |
| `darkpacer.toggleOverlay` | `framepacer:toggleOverlay` | `electron/main.js:1736` | `toggleFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.updateConfig` | `framepacer:updateConfig` | `electron/main.js:1718` | `FramePacerEngine.updateConfig (electron/services/FramePacerEngine.js)` | _nao usado_ |
| `dialog.grantDroppedFiles` | `dialog:grantDroppedFiles` | `electron/main.js:1758` | `filePaths.slice`<br>`granted.push` | `src/pages/FileConverter.tsx`<br>`src/pages/MetaDataEditor.tsx` |
| `dialog.saveFile` | `dialog:saveFile` | `electron/main.js:1793` |  | `src/pages/MetaDataEditor.tsx`<br>`src/pages/TextEditor.tsx` |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1772` |  | `src/pages/DllInjector.tsx`<br>`src/pages/FileConverter.tsx`<br>`src/pages/ImageTextExtractor.tsx`<br>`src/pages/Library.tsx`<br>`src/pages/MetaDataEditor.tsx`<br>`src/pages/OptiScalerManager.tsx`<br>`src/pages/Optimizer.tsx`<br>`src/pages/PasswordManager.tsx`<br>`src/pages/TextEditor.tsx`<br>`src/pages/TextSummarizer.tsx`<br>`src/pages/UltraLowLatency.tsx`<br>`src/pages/YoutubeDownloader.tsx` |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1783` |  | `src/components/setup/RestoreComponentsPanel.tsx`<br>`src/pages/FileConverter.tsx`<br>`src/pages/Library.tsx`<br>`src/pages/PasswordManager.tsx`<br>`src/pages/YoutubeDownloader.tsx` |
| `diskscan.cancel` | `diskscan:cancel` | `electron/ipc/diskScanIpc.js:22` | `svc.cancel` | `src/pages/SpaceSniffer/index.tsx` |
| `diskscan.drives` | `diskscan:drives` | `electron/ipc/diskScanIpc.js:14` | `svc.drives` | `src/pages/SpaceSniffer/index.tsx` |
| `diskscan.exportReport` | `diskscan:export` | `electron/ipc/diskScanIpc.js:31` | `svc.pathOf`<br>`svc.exportTo` | _nao usado_ |
| `diskscan.info` | `diskscan:info` | `electron/ipc/diskScanIpc.js:25` | `svc.info` | `src/pages/SpaceSniffer/index.tsx` |
| `diskscan.onProgress` | `diskscan:progress` | _evento main->tela_ |  | `src/pages/SpaceSniffer/index.tsx` |
| `diskscan.open` | `diskscan:open` | `electron/ipc/diskScanIpc.js:27` | `svc.open` | _nao usado_ |
| `diskscan.pickFolder` | `diskscan:pickFolder` | `electron/ipc/diskScanIpc.js:15` |  | `src/pages/Dlss5Manager.tsx`<br>`src/pages/Realtime.tsx`<br>`src/pages/SpaceSniffer/index.tsx` |
| `diskscan.reveal` | `diskscan:reveal` | `electron/ipc/diskScanIpc.js:28` | `svc.reveal` | _nao usado_ |
| `diskscan.start` | `diskscan:start` | `electron/ipc/diskScanIpc.js:19` | `svc.start`<br>`sender.isDestroyed`<br>`sender.send` | `src/pages/SpaceSniffer/index.tsx` |
| `diskscan.status` | `diskscan:status` | `electron/ipc/diskScanIpc.js:23` | `svc.status` | `src/pages/SpaceSniffer/index.tsx` |
| `diskscan.tag` | `diskscan:tag` | `electron/ipc/diskScanIpc.js:26` | `svc.setTag` | _nao usado_ |
| `diskscan.trash` | `diskscan:trash` | `electron/ipc/diskScanIpc.js:29` | `svc.trash` | _nao usado_ |
| `diskscan.view` | `diskscan:view` | `electron/ipc/diskScanIpc.js:24` | `svc.view` | _nao usado_ |
| `dlss5.detectGpu` | `dlss5:detectGpu` | `electron/services/dlss5/Dlss5Service.js:730` | `service.detectGpu` | `src/pages/Dlss5Manager.tsx` |
| `dlss5.getRecentGames` | `dlss5:getRecentGames` | `electron/services/dlss5/Dlss5Service.js:762` | `service.getRecentGames` | _nao usado_ |
| `dlss5.getSteamGames` | `dlss5:getSteamGames` | `electron/services/dlss5/Dlss5Service.js:721` | `service.getInstalledSteamGames` | `src/pages/Dlss5Manager.tsx`<br>`src/pages/OptiScalerManager.tsx` |
| `dlss5.onLog` | `dlss5:log` | _evento main->tela_ |  | _nao usado_ |
| `dlss5.openFolder` | `dlss5:openFolder` | `electron/services/dlss5/Dlss5Service.js:772` |  | _nao usado_ |
| `dlss5.revert` | `dlss5:revert` | `electron/services/dlss5/Dlss5Service.js:748` | `sender.send`<br>`service.revert` | _nao usado_ |
| `dlss5.scanGame` | `dlss5:scanGame` | `electron/services/dlss5/Dlss5Service.js:738` | `service.scanGameDirectory` | `src/pages/OptiScalerManager.tsx` |
| `downloads.add` | `downloads:add` | `electron/services/downloads/registerDownloadsIPC.js:49` | `manager.add` | `src/components/darkos/DarkOSReleaseCard.tsx`<br>`src/pages/Downloads.tsx` |
| `downloads.cancel` | `downloads:cancel` | `electron/services/downloads/registerDownloadsIPC.js:57` | `manager.cancel` | `src/pages/Downloads.tsx` |
| `downloads.chooseDir` | `downloads:chooseDir` | `electron/services/downloads/registerDownloadsIPC.js:74` | `manager.shutdown` | `src/pages/Downloads.tsx` |
| `downloads.clearFinished` | `downloads:clearFinished` | `electron/services/downloads/registerDownloadsIPC.js:59` | `manager.clearFinished` | `src/pages/Downloads.tsx` |
| `downloads.getSettings` | `downloads:getSettings` | `electron/services/downloads/registerDownloadsIPC.js:60` | `manager.getSettings` | _nao usado_ |
| `downloads.list` | `downloads:list` | `electron/services/downloads/registerDownloadsIPC.js:48` | `manager.list`<br>`manager.getSettings` | `src/pages/Downloads.tsx` |
| `downloads.onUpdate` | `downloads:update` | _evento main->tela_ |  | `src/pages/Downloads.tsx` |
| `downloads.pause` | `downloads:pause` | `electron/services/downloads/registerDownloadsIPC.js:53` | `manager.pause` | `src/pages/Downloads.tsx` |
| `downloads.pauseAll` | `downloads:pauseAll` | `electron/services/downloads/registerDownloadsIPC.js:55` | `manager.pauseAll` | `src/pages/Downloads.tsx` |
| `downloads.remove` | `downloads:remove` | `electron/services/downloads/registerDownloadsIPC.js:58` | `manager.remove` | `src/pages/Downloads.tsx` |
| `downloads.resume` | `downloads:resume` | `electron/services/downloads/registerDownloadsIPC.js:54` | `manager.resume` | `src/pages/Downloads.tsx` |
| `downloads.resumeAll` | `downloads:resumeAll` | `electron/services/downloads/registerDownloadsIPC.js:56` | `manager.resumeAll` | `src/pages/Downloads.tsx` |
| `downloads.setSettings` | `downloads:setSettings` | `electron/services/downloads/registerDownloadsIPC.js:61` | `manager.setSettings` | `src/pages/Downloads.tsx` |
| `downloads.showInFolder` | `downloads:showInFolder` | `electron/services/downloads/registerDownloadsIPC.js:67` | `manager.getFilePath` | `src/pages/Downloads.tsx` |
| `driver.cameraStatus` | `driver:cameraStatus` | `electron/ipc/driverIpc.js:25` | `svc.cameraStatus` | `src/pages/DriverCenter.tsx` |
| `driver.detect` | `driver:detect` | `electron/ipc/driverIpc.js:23` | `svc.detectAdapters` | `src/pages/DriverCenter.tsx`<br>`src/pages/Home.tsx` |
| `driver.findDrivers` | `driver:findDrivers` | `electron/ipc/driverIpc.js:35` | `installer.findDrivers` | `src/components/drivers/MissingDrivers.tsx` |
| `driver.install` | `driver:install` | `electron/ipc/driverIpc.js:37` | `installer.install`<br>`ids.slice`<br>`sender.send` | `src/components/drivers/MissingDrivers.tsx` |
| `driver.onInstallEvent` | `driver:installEvent` | _evento main->tela_ |  | `src/components/drivers/MissingDrivers.tsx` |
| `driver.openOfficial` | `driver:openOfficial` | `electron/ipc/driverIpc.js:46` | `svc.resolveOfficialUrl` | `src/pages/DriverCenter.tsx` |
| `driver.repairCamera` | `driver:repairCamera` | `electron/ipc/driverIpc.js:28` | `svc.repairCamera`<br>`darkos.revertChange` | `src/pages/DriverCenter.tsx` |
| `driver.scanMissing` | `driver:scanMissing` | `electron/ipc/driverIpc.js:34` | `installer.scan` | _nao usado_ |
| `ext.call` | `ext:call` | `electron/ipc/hubIpc.js:129` | `host.call` | `src/components/ExtensionFrame.tsx` |
| `ext.devAdd` | `ext:devAdd` | `electron/ipc/hubIpc.js:135` |  | `src/pages/Presets.tsx` |
| `ext.devList` | `ext:devList` | `electron/ipc/hubIpc.js:134` |  | `src/pages/Presets.tsx` |
| `ext.devRemove` | `ext:devRemove` | `electron/ipc/hubIpc.js:140` | `watchers.get`<br>`watchers.delete` | `src/pages/Presets.tsx` |
| `ext.doc` | `ext:doc` | `electron/ipc/hubIpc.js:128` | `host.doc` | `src/components/ExtensionFrame.tsx` |
| `ext.log` | `ext:log` | `electron/ipc/hubIpc.js:132` | `host.log` | `src/components/ExtensionFrame.tsx` |
| `ext.logs` | `ext:logs` | `electron/ipc/hubIpc.js:133` | `host.getLogs` | `src/pages/ExtensionPage.tsx` |
| `files.archiveOperation` | `files:archiveOperation` | `electron/main.js:2261` | `inputFiles.map`<br>`runCommand() (electron/services/PowerShellRunner.js)` | `src/pages/FileConverter.tsx` |
| `files.checkLibreOffice` | `files:checkLibreOffice` | `electron/main.js:2147` |  | _nao usado_ |
| `files.convertDocuments` | `files:convertDocuments` | `electron/main.js:2152` | `outputDir.trim`<br>`outputFormat.trim`<br>`outputFormat.toLowerCase` | `src/pages/FileConverter.tsx` |
| `files.convertImages` | `files:convertImages` | `electron/main.js:2009` | `outputDir.trim`<br>`outputFormat.toLowerCase`<br>`supported.has` | `src/pages/FileConverter.tsx` |
| `files.convertMedia` | `files:convertMedia` | `electron/main.js:2061` | `outputDir.trim`<br>`outputFormat.trim`<br>`ffmpegPath.trim` | `src/pages/FileConverter.tsx` |
| `framepacer.closeOverlay` | `framepacer:closeOverlay` | `electron/main.js:1731` | `closeFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `framepacer.createOverlay` | `framepacer:createOverlay` | `electron/main.js:1726` | `createFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `framepacer.getMetrics` | `framepacer:getMetrics` | `electron/main.js:1722` | `FramePacerEngine.getMetrics (electron/services/FramePacerEngine.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.getOverlayStatus` | `framepacer:getOverlayStatus` | `electron/main.js:1748` | `getOverlayStatus() (electron/services/FramePacerOverlay.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.onMetrics` | `framepacer:metrics` | _evento main->tela_ |  | `src/pages/FramePacer.tsx` |
| `framepacer.setOverlayClickThrough` | `framepacer:setOverlayClickThrough` | `electron/main.js:1740` | `setOverlayClickThrough() (electron/services/FramePacerOverlay.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.setOverlayConfig` | `framepacer:setOverlayConfig` | `electron/main.js:1744` | `setOverlayConfig() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `framepacer.start` | `framepacer:start` | `electron/main.js:1710` | `FramePacerEngine.start (electron/services/FramePacerEngine.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.stop` | `framepacer:stop` | `electron/main.js:1714` | `FramePacerEngine.stop (electron/services/FramePacerEngine.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.toggleOverlay` | `framepacer:toggleOverlay` | `electron/main.js:1736` | `toggleFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.updateConfig` | `framepacer:updateConfig` | `electron/main.js:1718` | `FramePacerEngine.updateConfig (electron/services/FramePacerEngine.js)` | `src/pages/FramePacer.tsx` |
| `fs.readFile` | `fs:readFile` | `electron/main.js:3336` |  | `src/pages/TextEditor.tsx`<br>`src/pages/TextSummarizer.tsx` |
| `fs.writeFile` | `fs:writeFile` | `electron/main.js:3348` | `devPath.includes` | `src/pages/TextEditor.tsx` |
| `getTrace` | `dev:getTrace` | **sem handler** |  | _nao usado_ |
| `gpubench.cancel` | `gpubench:cancel` | `electron/ipc/gpuBenchIpc.js:35` | `svc.cancel` | `src/components/gpubench/StressPanel.tsx`<br>`src/components/monitor/WallCalibration.tsx`<br>`src/pages/Benchmark.tsx`<br>`src/pages/GpuBench.tsx` |
| `gpubench.link` | `gpubench:link` | `electron/ipc/gpuBenchIpc.js:37` | `svc.link` | `src/pages/GpuBench.tsx` |
| `gpubench.onEvent` | `gpubench:event` | _evento main->tela_ |  | `src/components/gpubench/RunOverlay.tsx`<br>`src/components/gpubench/StressPanel.tsx`<br>`src/pages/Benchmark.tsx`<br>`src/pages/GpuBench.tsx` |
| `gpubench.openRanking` | `gpubench:openRanking` | `electron/ipc/gpuBenchIpc.js:39` | `svc.openRanking`<br>`svc.cancel` | `src/pages/GpuBench.tsx` |
| `gpubench.ranking` | `gpubench:ranking` | `electron/ipc/gpuBenchIpc.js:29` | `svc.ranking` | `src/components/gpubench/RankingTop.tsx` |
| `gpubench.remove` | `gpubench:remove` | `electron/ipc/gpuBenchIpc.js:36` | `svc.remove` | `src/pages/Benchmark.tsx`<br>`src/pages/GpuBench.tsx` |
| `gpubench.removeStress` | `gpubench:removeStress` | `electron/ipc/gpuBenchIpc.js:34` | `svc.removeStress` | `src/components/gpubench/StressPanel.tsx` |
| `gpubench.run` | `gpubench:run` | `electron/ipc/gpuBenchIpc.js:27` | `svc.run` | `src/pages/Benchmark.tsx`<br>`src/pages/GpuBench.tsx` |
| `gpubench.status` | `gpubench:status` | `electron/ipc/gpuBenchIpc.js:26` | `svc.status` | `src/pages/GpuBench.tsx` |
| `gpubench.stress` | `gpubench:stress` | `electron/ipc/gpuBenchIpc.js:28` | `svc.stress` | `src/components/gpubench/StressPanel.tsx` |
| `gpubench.unlink` | `gpubench:unlink` | `electron/ipc/gpuBenchIpc.js:38` | `svc.unlink` | `src/pages/GpuBench.tsx` |
| `gpubench.viewport` | `gpubench:viewport` | `electron/ipc/gpuBenchIpc.js:30` | `svc.viewport` | `src/components/gpubench/RunOverlay.tsx` |
| `hardware.onUpdate` | `hardware:update` | _evento main->tela_ |  | `src/hooks/useSystemMetrics.ts` |
| `hardware.startPolling` | `hardware:startPolling` | `electron/services/HardwareService.js:51` | `hookedSenders.has`<br>`hookedSenders.add`<br>`sender.once` | `src/hooks/useSystemMetrics.ts` |
| `hardware.stopPolling` | `hardware:stopPolling` | `electron/services/HardwareService.js:69` | `perSender.get`<br>`perSender.set`<br>`perSender.delete` | `src/hooks/useSystemMetrics.ts` |
| `hub.builtins` | `hub:builtins` | `electron/ipc/hubIpc.js:111` | `svc.builtins` | _nao usado_ |
| `hub.catalog.detail` | `hub:catalog:detail` | `electron/ipc/hubIpc.js:119` | `catalog.detail` | _nao usado_ |
| `hub.catalog.inspect` | `hub:catalog:inspect` | `electron/ipc/hubIpc.js:120` | `catalog.inspect` | `src/pages/Presets.tsx` |
| `hub.catalog.install` | `hub:catalog:install` | `electron/ipc/hubIpc.js:121` | `catalog.install` | `src/pages/Presets.tsx` |
| `hub.catalog.search` | `hub:catalog:search` | `electron/ipc/hubIpc.js:118` | `catalog.search` | `src/pages/Presets.tsx` |
| `hub.catalog.server` | `hub:catalog:server` | `electron/ipc/hubIpc.js:116` | `catalog.publicServer` | _nao usado_ |
| `hub.catalog.setServer` | `hub:catalog:setServer` | `electron/ipc/hubIpc.js:117` | `catalog.setServer` | `src/pages/Presets.tsx` |
| `hub.catalog.update` | `hub:catalog:update` | `electron/ipc/hubIpc.js:123` | `catalog.update` | `src/pages/Presets.tsx` |
| `hub.catalog.updates` | `hub:catalog:updates` | `electron/ipc/hubIpc.js:122` | `catalog.updates` | `src/pages/Presets.tsx` |
| `hub.exportMine` | `hub:exportMine` | `electron/ipc/hubIpc.js:114` | `svc.exportMine` | `src/pages/Presets.tsx` |
| `hub.hardware` | `hub:hardware` | `electron/ipc/hubIpc.js:110` | `svc.hardware` | `src/pages/Presets.tsx` |
| `hub.inspect` | `hub:inspect` | `electron/ipc/hubIpc.js:115` | `svc.inspect` | `src/pages/Presets.tsx` |
| `hub.install` | `hub:install` | `electron/ipc/hubIpc.js:112` | `svc.install` | `src/pages/Presets.tsx` |
| `hub.list` | `hub:list` | `electron/ipc/hubIpc.js:109` | `svc.list` | `src/lib/extensions.ts`<br>`src/pages/Presets.tsx` |
| `hub.mcp.answer` | `hub:mcp:answer` | `electron/ipc/hubIpc.js:141` | `approvals.get` | _nao usado_ |
| `hub.mcp.regenerate` | `hub:mcp:regenerate` | `electron/ipc/hubIpc.js:127` | `mcp.regenerateToken` | `src/pages/Presets.tsx` |
| `hub.mcp.setEnabled` | `hub:mcp:setEnabled` | `electron/ipc/hubIpc.js:126` | `mcp.setEnabled` | `src/pages/Presets.tsx` |
| `hub.mcp.status` | `hub:mcp:status` | `electron/ipc/hubIpc.js:125` | `mcp.status` | `src/pages/Presets.tsx` |
| `hub.onEvent` | `hub:event` | _evento main->tela_ |  | `src/App.tsx`<br>`src/components/ExtensionFrame.tsx`<br>`src/components/hub/HubApproval.tsx`<br>`src/lib/extensions.ts`<br>`src/pages/Presets.tsx` |
| `hub.openFile` | `hub:openFile` | `electron/ipc/hubIpc.js:142` |  | `src/pages/Presets.tsx` |
| `hub.pendingLink` | `hub:pendingLink` | `electron/ipc/hubIpc.js:124` |  | `src/App.tsx`<br>`src/pages/Presets.tsx` |
| `hub.saveFile` | `hub:saveFile` | `electron/ipc/hubIpc.js:149` | `mcp.init`<br>`host.response`<br>`watchers.values` | `src/pages/Presets.tsx` |
| `hub.uninstall` | `hub:uninstall` | `electron/ipc/hubIpc.js:113` | `svc.uninstall` | `src/pages/Presets.tsx` |
| `hwsensors.setEnabled` | `hwsensors:setEnabled` | `electron/ipc/hwSensorsIpc.js:49` | `SensorBus.setAdvanced (electron/hal/collectors/SensorBus.js)`<br>`HwSensorsDaemon.status (electron/hal/collectors/HwSensorsDaemon.js)`<br>`isPawnIoInstalled() (electron/hal/collectors/HwSensorsDaemon.js)` | _nao usado_ |
| `hwsensors.status` | `hwsensors:status` | `electron/ipc/hwSensorsIpc.js:46` | `HwSensorsDaemon.status (electron/hal/collectors/HwSensorsDaemon.js)` | `src/components/monitor/AdvancedSensorsPanel.tsx` |
| `injector.inject` | `injector:inject` | `electron/main.js:1674` | `i.test`<br>`dllPath.trim`<br>`stdout.includes` | `src/pages/DllInjector.tsx` |
| `kakugan.accountInput` | `kakugan:accountInput` | `electron/ipc/kakuganIpc.js:128` | `client.accountInput` | _nao usado_ |
| `kakugan.dashboard` | `kakugan:dashboard` | `electron/ipc/kakuganIpc.js:114` | `client.dashboard` | `src/pages/Kakugan.tsx` |
| `kakugan.gameNames` | `kakugan:gameNames` | `electron/ipc/kakuganIpc.js:135` | `client.gameNames` | `src/pages/Kakugan.tsx` |
| `kakugan.getSettings` | `kakugan:getSettings` | `electron/ipc/kakuganIpc.js:107` |  | `src/pages/Kakugan.tsx` |
| `kakugan.login` | `kakugan:login` | `electron/ipc/kakuganIpc.js:105` | `client.login` | `src/pages/Kakugan.tsx` |
| `kakugan.logout` | `kakugan:logout` | `electron/ipc/kakuganIpc.js:106` | `client.logout` | `src/pages/Kakugan.tsx` |
| `kakugan.openSite` | `kakugan:openSite` | `electron/ipc/kakuganIpc.js:136` | `SITE_PAGES.has` | `src/pages/Kakugan.tsx` |
| `kakugan.removeAccount` | `kakugan:removeAccount` | `electron/ipc/kakuganIpc.js:133` | `client.removeAccount` | _nao usado_ |
| `kakugan.searchGames` | `kakugan:searchGames` | `electron/ipc/kakuganIpc.js:134` | `client.searchGames` | `src/pages/Kakugan.tsx` |
| `kakugan.setSettings` | `kakugan:setSettings` | `electron/ipc/kakuganIpc.js:108` |  | `src/pages/Kakugan.tsx` |
| `kakugan.state` | `kakugan:state` | `electron/ipc/kakuganIpc.js:101` | `client.status`<br>`client.plans`<br>`client.me` | `src/pages/Kakugan.tsx` |
| `kakugan.steamLoginCancel` | `kakugan:steamLoginCancel` | `electron/ipc/kakuganIpc.js:118` | `client.steamLoginCancel` | `src/pages/Kakugan.tsx` |
| `kakugan.steamLoginCode` | `kakugan:steamLoginCode` | `electron/ipc/kakuganIpc.js:117` | `client.steamLoginCode` | _nao usado_ |
| `kakugan.steamLoginPoll` | `kakugan:steamLoginPoll` | `electron/ipc/kakuganIpc.js:116` | `client.steamLoginPoll` | `src/pages/Kakugan.tsx` |
| `kakugan.steamLoginStart` | `kakugan:steamLoginStart` | `electron/ipc/kakuganIpc.js:115` | `client.steamLoginStart` | `src/pages/Kakugan.tsx` |
| `kakugan.updateAccount` | `kakugan:updateAccount` | `electron/ipc/kakuganIpc.js:119` | `games.map`<br>`client.updateAccount` | _nao usado_ |
| `latency.boostNow` | `latency:boostNow` | `electron/latencyGuardian.js:1176` |  | `src/pages/UltraLowLatency.tsx` |
| `latency.disableUltra` | `latency:disableUltra` | `electron/latencyGuardian.js:1157` |  | `src/pages/UltraLowLatency.tsx` |
| `latency.enableUltra` | `latency:enableUltra` | `electron/latencyGuardian.js:1112` |  | `src/pages/UltraLowLatency.tsx` |
| `latency.enableUltraStable` | `latency:enableUltraStable` | `electron/latencyGuardian.js:1122` |  | `src/pages/UltraLowLatency.tsx` |
| `latency.getConfig` | `latency:getConfig` | `electron/latencyGuardian.js:1044` | `nativeLatencyClient.queryTimer (electron/services/NativeLatencyClient.js)` | `src/components/GuardianWidget.tsx`<br>`src/pages/UltraLowLatency.tsx` |
| `latency.getCpuTopology` | `latency:getCpuTopology` | `electron/latencyGuardian.js:1065` | `nativeLatencyClient.getCpuTopology (electron/services/NativeLatencyClient.js)` | _nao usado_ |
| `latency.launchGameWithProfile` | `latency:launchGameWithProfile` | `electron/latencyGuardian.js:1221` | `argsArray.map`<br>`pingHost.trim`<br>`proc.once` | `src/pages/Library.tsx` |
| `latency.queryTimer` | `latency:queryTimer` | `electron/latencyGuardian.js:1056` | `nativeLatencyClient.queryTimer (electron/services/NativeLatencyClient.js)` | _nao usado_ |
| `latency.setConfig` | `latency:setConfig` | `electron/latencyGuardian.js:1074` |  | `src/components/GuardianWidget.tsx`<br>`src/pages/UltraLowLatency.tsx` |
| `latency.toggleUltra` | `latency:toggleUltra` | `electron/latencyGuardian.js:1166` |  | _nao usado_ |
| `library.discover` | `library:discover` | `electron/main.js:1297` | `content.matchAll`<br>`steamPaths.push`<br>`steamPaths.map` | `src/pages/Library.tsx` |
| `library.fetchCover` | `library:fetchCover` | `electron/main.js:1226` | `service.fetchCover`<br>`i.test`<br>`folder.startsWith` | `src/components/library/GameCard.tsx` |
| `library.list` | `library:list` | `electron/main.js:1163` | `webContents.send` | `src/pages/Library.tsx`<br>`src/pages/OptiScalerManager.tsx` |
| `library.onActivityLogged` | `library:activityLogged` | _evento main->tela_ |  | `src/hooks/useRecentActivity.ts` |
| `library.onGameStarted` | `library:gameStarted` | _evento main->tela_ |  | `src/hooks/useRecentActivity.ts` |
| `library.onGameStopped` | `library:gameStopped` | _evento main->tela_ |  | `src/hooks/useRecentActivity.ts` |
| `library.onUpdated` | `library:updated` | _evento main->tela_ |  | `src/pages/Library.tsx` |
| `library.remove` | `library:remove` | `electron/main.js:1211` |  | `src/pages/Library.tsx`<br>`src/pages/OptiScalerManager.tsx` |
| `library.upsert` | `library:upsert` | `electron/main.js:1175` |  | `src/pages/Library.tsx`<br>`src/pages/OptiScalerManager.tsx` |
| `library.upsertBulk` | `library:upsertBulk` | `electron/main.js:1193` |  | `src/pages/Library.tsx` |
| `maint.onEvent` | `maint:event` | _evento main->tela_ |  | `src/pages/Maintenance.tsx` |
| `maint.runNow` | `maint:runNow` | `electron/ipc/maintenanceIpc.js:40` | `svc.runTask`<br>`svc.start`<br>`svc.stop` | `src/pages/Maintenance.tsx` |
| `maint.setTask` | `maint:setTask` | `electron/ipc/maintenanceIpc.js:39` | `svc.setTask` | `src/pages/Maintenance.tsx` |
| `maint.state` | `maint:state` | `electron/ipc/maintenanceIpc.js:38` | `svc.state` | `src/pages/Maintenance.tsx` |
| `metadata.read` | `metadata:read` | `electron/main.js:3400` | `exifr.parse`<br>`exiftool.read` | _nao usado_ |
| `metadata.remove` | `metadata:remove` | `electron/main.js:3417` | `exiftool.write` | _nao usado_ |
| `metadata.update` | `metadata:update` | `electron/main.js:3437` | `exiftool.write`<br>`WINGET_ID_RE.test`<br>`id.trim` | _nao usado_ |
| `metax.read` | `metax:read` | `electron/ipc/metadataIpc.js:38` | `service.read` | `src/pages/MetaDataEditor.tsx` |
| `metax.removeStream` | `metax:removeStream` | `electron/ipc/metadataIpc.js:59` | `service.removeStream` | `src/pages/MetaDataEditor.tsx` |
| `metax.setFileProps` | `metax:setFileProps` | `electron/ipc/metadataIpc.js:54` | `service.setFileProps` | `src/pages/MetaDataEditor.tsx` |
| `metax.write` | `metax:write` | `electron/ipc/metadataIpc.js:39` | `service.write` | `src/pages/MetaDataEditor.tsx` |
| `network.adapterInfo` | `network:adapterInfo` | `electron/networkIPC.js:150` | `lines.push`<br>`lines.join` | `src/pages/NetworkTools.tsx` |
| `network.applyLatencyTweak` | `network:applyLatencyTweak` | `electron/networkIPC.js:129` | `NetLatencyService.applyTweak (electron/services/NetLatencyService.js)` | `src/components/network/LatencyLab.tsx` |
| `network.bufferbloat` | `network:bufferbloat` | `electron/networkIPC.js:126` | `NetLatencyService.bufferbloat (electron/services/NetLatencyService.js)` | `src/components/network/LatencyLab.tsx` |
| `network.dnsInfo` | `network:dnsInfo` | `electron/networkIPC.js:132` |  | `src/pages/NetworkTools.tsx` |
| `network.flushDns` | `network:flushDns` | `electron/networkIPC.js:108` |  | `src/pages/NetworkTools.tsx` |
| `network.latencyPresets` | `network:latencyPresets` | `electron/networkIPC.js:123` | `NetLatencyService.getPresets (electron/services/NetLatencyService.js)` | `src/components/network/LatencyLab.tsx` |
| `network.latencyState` | `network:latencyState` | `electron/networkIPC.js:128` | `NetLatencyService.getState (electron/services/NetLatencyService.js)` | `src/components/network/LatencyLab.tsx` |
| `network.mtuDiscover` | `network:mtuDiscover` | `electron/networkIPC.js:127` | `NetLatencyService.mtu (electron/services/NetLatencyService.js)` | `src/components/network/LatencyLab.tsx` |
| `network.ping` | `network:ping` | `electron/networkIPC.js:31` | `output.match`<br>`runCommand() (electron/services/PowerShellRunner.js)` | `src/pages/NetworkTools.tsx` |
| `network.portScan` | `network:portScan` | `electron/networkIPC.js:51` | `net.Socket`<br>`socket.setTimeout`<br>`socket.on` | `src/pages/NetworkTools.tsx` |
| `network.probe` | `network:probe` | `electron/networkIPC.js:124` | `NetLatencyService.probe (electron/services/NetLatencyService.js)` | `src/components/network/LatencyLab.tsx` |
| `network.renewIp` | `network:renewIp` | `electron/networkIPC.js:164` |  | `src/pages/NetworkTools.tsx` |
| `network.resetTcp` | `network:resetTcp` | `electron/networkIPC.js:113` | `NetLatencyService.resetStack (electron/services/NetLatencyService.js)` | `src/pages/NetworkTools.tsx` |
| `network.restoreLatencyTweak` | `network:restoreLatencyTweak` | `electron/networkIPC.js:130` | `NetLatencyService.restoreTweak (electron/services/NetLatencyService.js)` | `src/components/network/LatencyLab.tsx` |
| `network.traceHops` | `network:traceHops` | `electron/networkIPC.js:125` | `NetLatencyService.traceroute (electron/services/NetLatencyService.js)` | `src/components/network/LatencyLab.tsx` |
| `network.tracert` | `network:tracert` | `electron/networkIPC.js:136` | `runCommand() (electron/services/PowerShellRunner.js)` | `src/pages/NetworkTools.tsx` |
| `ocr.extractText` | `ocr:extractText` | `electron/main.js:2531` | `base64Data.replace`<br>`img.resize`<br>`img.grayscale` | `src/pages/ImageTextExtractor.tsx` |
| `onIpcTrace` | `dev:ipcTrace` | _evento main->tela_ |  | _nao usado_ |
| `optimizer.advancedNetworkApply` | `optimizer:advancedNetworkApply` | `electron/main.js:1822` | `NetworkEngine.advancedNetworkApply (electron/services/optimizer/NetworkEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.advancedNetworkRevert` | `optimizer:advancedNetworkRevert` | `electron/main.js:1823` | `NetworkEngine.advancedNetworkRevert (electron/services/optimizer/NetworkEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.analyze` | `optimizer:analyze` | `electron/main.js:725` | `SystemOptimizerService.analyze (electron/services/optimizer/SystemOptimizerService.js)` | _nao usado_ |
| `optimizer.applyCpuUnpark` | `optimizer:applyCpuUnpark` | `electron/main.js:2005` | `SystemEngine.applyCpuUnpark (electron/services/optimizer/SystemEngine.js)` | _nao usado_ |
| `optimizer.applyDefenderControl` | `optimizer:applyDefenderControl` | `electron/main.js:1981` | `DefenderControlEngine.runNativeDefenderControl (electron/services/optimizer/DefenderControlEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.applyDns` | `optimizer:applyDns` | `electron/main.js:1870` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` | `src/components/network/LatencyLab.tsx`<br>`src/components/security/ProtectiveDnsPanel.tsx`<br>`src/pages/Optimizer.tsx` |
| `optimizer.applyExtremeKernelMod` | `optimizer:applyExtremeKernelMod` | `electron/main.js:1993` | `SystemEngine.applyExtremeKernelMod (electron/services/optimizer/SystemEngine.js)` | _nao usado_ |
| `optimizer.applyExtremeNetworkMod` | `optimizer:applyExtremeNetworkMod` | `electron/main.js:2002` | `SystemEngine.applyExtremeNetworkMod (electron/services/optimizer/SystemEngine.js)` | _nao usado_ |
| `optimizer.applyMsiMode` | `optimizer:applyMsiMode` | `electron/main.js:1990` | `SystemEngine.applyMsiMode (electron/services/optimizer/SystemEngine.js)` | _nao usado_ |
| `optimizer.applyTweak` | `optimizer:applyTweak` | `electron/main.js:1826` | `MemoryEngine.optimizeRAM (electron/services/optimizer/MemoryEngine.js)`<br>`StorageEngine.cleanTempFiles (electron/services/optimizer/StorageEngine.js)`<br>`SystemEngine.repairWindows (electron/services/optimizer/SystemEngine.js)` | `src/pages/Dashboard.tsx` |
| `optimizer.checkIsAdmin` | `optimizer:checkIsAdmin` | `electron/main.js:740` | `SystemOptimizerService.checkIsAdmin (electron/services/optimizer/SystemOptimizerService.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.checkOperationsStatus` | `optimizer:checkOperationsStatus` | `electron/main.js:721` | `SystemOptimizerService.checkOperationsStatus (electron/services/optimizer/SystemOptimizerService.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.createRestorePoint` | `optimizer:createRestorePoint` | `electron/main.js:744` | `SystemEngine.createRestorePoint (electron/services/optimizer/SystemEngine.js)` | `src/pages/Dashboard.tsx`<br>`src/pages/Optimizer.tsx` |
| `optimizer.deepTweaksAnalyze` | `optimizer:deepTweaksAnalyze` | `electron/main.js:1843` | `DeepTweaksEngine.listTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`ids.includes`<br>`selected.flatMap` | _nao usado_ |
| `optimizer.deepTweaksApply` | `optimizer:deepTweaksApply` | `electron/main.js:1849` | `DeepTweaksEngine.applyTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` | `src/pages/Optimizer.tsx` |
| `optimizer.deepTweaksList` | `optimizer:deepTweaksList` | `electron/main.js:1825` | `DeepTweaksEngine.listTweaks (electron/services/optimizer/DeepTweaksEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.deepTweaksRevert` | `optimizer:deepTweaksRevert` | `electron/main.js:1850` | `DeepTweaksEngine.revertTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` | `src/pages/Optimizer.tsx` |
| `optimizer.deepTweaksStatus` | `optimizer:deepTweaksStatus` | `electron/main.js:1842` | `DeepTweaksEngine.checkTweaksStatus (electron/services/optimizer/DeepTweaksEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.deepTweaksUndo` | `optimizer:deepTweaksUndo` | `electron/main.js:1851` | `DeepTweaksEngine.undoTweaks (electron/services/optimizer/DeepTweaksEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.disableService` | `optimizer:disableService` | `electron/main.js:1806` | `AppManagerEngine.disableService (electron/services/optimizer/AppManagerEngine.js)` | _nao usado_ |
| `optimizer.disableStartupItem` | `optimizer:disableStartupItem` | `electron/main.js:1804` | `AppManagerEngine.disableStartupItem (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.dnsBenchmark` | `optimizer:dnsBenchmark` | `electron/main.js:1880` | `DnsEngine.benchmark (electron/services/optimizer/DnsEngine.js)` | `src/components/network/LatencyLab.tsx`<br>`src/pages/Optimizer.tsx` |
| `optimizer.getAuditLog` | `optimizer:getAuditLog` | `electron/main.js:748` | `runCommand() (electron/services/PowerShellRunner.js)`<br>`runPowerShell() (electron/services/PowerShellRunner.js)`<br>`stripBom() (electron/services/PowerShellRunner.js)` | _nao usado_ |
| `optimizer.getDefenderControlStatus` | `optimizer:getDefenderControlStatus` | `electron/main.js:1978` | `DefenderControlEngine.getStatus (electron/services/optimizer/DefenderControlEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getDnsState` | `optimizer:getDnsState` | `electron/main.js:1861` | `DnsEngine.getState (electron/services/optimizer/DnsEngine.js)` | `src/components/network/LatencyLab.tsx`<br>`src/components/security/ProtectiveDnsPanel.tsx`<br>`src/pages/Optimizer.tsx` |
| `optimizer.getGpuInfo` | `optimizer:getGpuInfo` | `electron/main.js:1816` | `AppManagerEngine.getGpuInfo (electron/services/optimizer/AppManagerEngine.js)` | `src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Optimizer.tsx` |
| `optimizer.getGpuPreferences` | `optimizer:getGpuPreferences` | `electron/main.js:1813` | `AppManagerEngine.getGpuPreferences (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getHagsStatus` | `optimizer:getHagsStatus` | `electron/main.js:1817` | `AppManagerEngine.getHagsStatus (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getInstalledPrograms` | `optimizer:getInstalledPrograms` | `electron/main.js:1807` | `AppManagerEngine.getInstalledPrograms (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getRunningProcesses` | `optimizer:getRunningProcesses` | `electron/main.js:1811` | `AppManagerEngine.getRunningProcesses (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getServices` | `optimizer:getServices` | `electron/main.js:1805` | `AppManagerEngine.getServices (electron/services/optimizer/AppManagerEngine.js)` | _nao usado_ |
| `optimizer.getStartupItems` | `optimizer:getStartupItems` | `electron/main.js:1803` | `AppManagerEngine.getStartupItems (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.globalRecommendedTweaks` | `optimizer:globalRecommendedTweaks` | `electron/main.js:1852` | `DeepTweaksEngine.applyRecommended (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` | _nao usado_ |
| `optimizer.listBloatware` | `optimizer:listBloatware` | `electron/main.js:1809` | `AppManagerEngine.listBloatware (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.listOperations` | `optimizer:listOperations` | `electron/main.js:717` | `SystemOptimizerService.listOperations (electron/services/optimizer/SystemOptimizerService.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.listProfiles` | `optimizer:listProfiles` | `electron/main.js:736` | `SystemOptimizerService.listProfiles (electron/services/optimizer/SystemOptimizerService.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.onRunEvent` | `optimizer:runEvent` | _evento main->tela_ |  | `src/hooks/useOptimizerProgress.ts`<br>`src/pages/Optimizer.tsx` |
| `optimizer.openTamperSettings` | `optimizer:openTamperSettings` | `electron/main.js:1987` | `DefenderControlEngine.openTamperSettings (electron/services/optimizer/DefenderControlEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.removeGpuPreference` | `optimizer:removeGpuPreference` | `electron/main.js:1815` | `AppManagerEngine.removeGpuPreference (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.removeSelectedBloatware` | `optimizer:removeSelectedBloatware` | `electron/main.js:1810` | `AppManagerEngine.removeSelectedBloatware (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.restoreImageDefender` | `optimizer:restoreImageDefender` | `electron/main.js:1984` | `DefenderControlEngine.restoreImageDefender (electron/services/optimizer/DefenderControlEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.revertExtremeKernelMod` | `optimizer:revertExtremeKernelMod` | `electron/main.js:1996` | `SystemEngine.revertExtremeKernelMod (electron/services/optimizer/SystemEngine.js)` | _nao usado_ |
| `optimizer.revertHags` | `optimizer:revertHags` | `electron/main.js:1819` | `AppManagerEngine.revertHags (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.revertServicesTweak` | `optimizer:revertServicesTweak` | `electron/main.js:1999` | `ServicesEngine.revertServicesTweak (electron/services/optimizer/ServicesEngine.js)` | _nao usado_ |
| `optimizer.run` | `optimizer:run` | `electron/main.js:729` | `sender.send`<br>`SystemOptimizerService.runTasks (electron/services/optimizer/SystemOptimizerService.js)` | `src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Optimizer.tsx` |
| `optimizer.runRoutine` | `optimizer:runRoutine` | `electron/main.js:1890` | `sender.send`<br>`routineId.startsWith`<br>`routineId.split` | _nao usado_ |
| `optimizer.setDnsServers` | `optimizer:setDnsServers` | `electron/main.js:1866` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` | _nao usado_ |
| `optimizer.setGpuPreference` | `optimizer:setGpuPreference` | `electron/main.js:1814` | `AppManagerEngine.setGpuPreference (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.setHagsStatus` | `optimizer:setHagsStatus` | `electron/main.js:1818` | `AppManagerEngine.setHagsStatus (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.setProcessPriority` | `optimizer:setProcessPriority` | `electron/main.js:1812` | `AppManagerEngine.setProcessPriority (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.undoDns` | `optimizer:undoDns` | `electron/main.js:1875` | `DnsEngine.undo (electron/services/optimizer/DnsEngine.js)` | `src/components/network/LatencyLab.tsx`<br>`src/components/security/ProtectiveDnsPanel.tsx`<br>`src/pages/Optimizer.tsx` |
| `optimizer.uninstallProgram` | `optimizer:uninstallProgram` | `electron/main.js:1808` | `AppManagerEngine.uninstallProgram (electron/services/optimizer/AppManagerEngine.js)` | _nao usado_ |
| `optimizer.uninstallProgramWithLeftovers` | `optimizer:uninstallProgramWithLeftovers` | `electron/main.js:1821` | `AppManagerEngine.uninstallProgramWithLeftovers (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optiscaler.analyze` | `optiscaler:analyze` | `electron/optiscalerManager.js:1226` |  | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.apply` | `optiscaler:apply` | `electron/optiscalerManager.js:1234` |  | `src/pages/Library.tsx`<br>`src/pages/OptiScalerManager.tsx` |
| `optiscaler.checkUpdate` | `optiscaler:checkUpdate` | `electron/optiscalerManager.js:1274` | `i.test`<br>`fetchJson() (electron/services/SecureDownload.js)`<br>`assetSha256() (electron/services/SecureDownload.js)` | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.createManualBackup` | `optiscaler:createManualBackup` | `electron/optiscalerManager.js:1266` |  | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.deleteBackup` | `optiscaler:deleteBackup` | `electron/optiscalerManager.js:1258` |  | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.downloadUpdate` | `optiscaler:downloadUpdate` | `electron/optiscalerManager.js:1287` |  | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.listBackups` | `optiscaler:listBackups` | `electron/optiscalerManager.js:1242` |  | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.restoreBackup` | `optiscaler:restoreBackup` | `electron/optiscalerManager.js:1250` |  | `src/pages/OptiScalerManager.tsx` |
| `overlay.activateLayout` | `overlay:activateLayout` | `electron/ipc/overlayIpc.js:67` |  | `src/pages/OverlayEditor.tsx` |
| `overlay.calibrate` | `overlay:calibrate` | `electron/ipc/overlayIpc.js:45` | `svc.power`<br>`points.slice`<br>`pts.some` | `src/components/monitor/WallCalibration.tsx` |
| `overlay.clearCalibration` | `overlay:clearCalibration` | `electron/ipc/overlayIpc.js:61` |  | `src/components/monitor/WallCalibration.tsx` |
| `overlay.deleteLayout` | `overlay:deleteLayout` | `electron/ipc/overlayIpc.js:66` |  | `src/pages/OverlayEditor.tsx` |
| `overlay.hide` | `overlay:hide` | `electron/ipc/overlayIpc.js:35` |  | `src/pages/GameOverlay.tsx` |
| `overlay.layouts` | `overlay:layouts` | `electron/ipc/overlayIpc.js:63` |  | `src/pages/GameOverlay.tsx`<br>`src/pages/OverlayEditor.tsx` |
| `overlay.newLayout` | `overlay:newLayout` | `electron/ipc/overlayIpc.js:65` |  | `src/pages/OverlayEditor.tsx` |
| `overlay.onEvent` | `overlay:event` | _evento main->tela_ |  | `src/pages/GameOverlay.tsx` |
| `overlay.pickLogFolder` | `overlay:pickLogFolder` | `electron/ipc/overlayIpc.js:73` |  | `src/pages/GameOverlay.tsx` |
| `overlay.power` | `overlay:power` | `electron/ipc/overlayIpc.js:37` |  | `src/components/monitor/AdvancedSensorsPanel.tsx`<br>`src/components/monitor/PowerPanel.tsx`<br>`src/components/monitor/WallCalibration.tsx` |
| `overlay.preview` | `overlay:preview` | `electron/ipc/overlayIpc.js:68` |  | `src/pages/OverlayEditor.tsx` |
| `overlay.processes` | `overlay:processes` | `electron/ipc/overlayIpc.js:69` | `nativeLatencyClient.listProcesses (electron/services/NativeLatencyClient.js)` | `src/pages/GameOverlay.tsx` |
| `overlay.psuCatalogStatus` | `overlay:psuCatalogStatus` | `electron/ipc/overlayIpc.js:42` |  | _nao usado_ |
| `overlay.psuSearch` | `overlay:psuSearch` | `electron/ipc/overlayIpc.js:43` |  | `src/components/monitor/PsuCatalogPicker.tsx` |
| `overlay.resetEnergy` | `overlay:resetEnergy` | `electron/ipc/overlayIpc.js:38` |  | `src/components/monitor/PowerPanel.tsx` |
| `overlay.saveLayout` | `overlay:saveLayout` | `electron/ipc/overlayIpc.js:64` |  | `src/pages/OverlayEditor.tsx` |
| `overlay.setSettings` | `overlay:setSettings` | `electron/ipc/overlayIpc.js:36` |  | `src/components/monitor/PowerPanel.tsx`<br>`src/pages/GameOverlay.tsx`<br>`src/pages/OverlayEditor.tsx` |
| `overlay.show` | `overlay:show` | `electron/ipc/overlayIpc.js:34` |  | `src/pages/GameOverlay.tsx`<br>`src/pages/SystemMonitor.tsx` |
| `overlay.status` | `overlay:status` | `electron/ipc/overlayIpc.js:33` |  | `src/components/monitor/PowerPanel.tsx`<br>`src/pages/GameOverlay.tsx` |
| `pge.openPortable` | `pge:openPortable` | `electron/main.js:1461` |  | `src/layouts/MainLayout.tsx`<br>`src/pages/Home.tsx` |
| `powershell.customStart` | `powershell:customStart` | `electron/ipc/powershellIpc.js:95` | `kit.startCustom`<br>`sender.isDestroyed`<br>`sender.send` | `src/components/pstools/CustomScriptRunner.tsx` |
| `powershell.customStatus` | `powershell:customStatus` | `electron/ipc/powershellIpc.js:100` | `kit.isCustomRunning` | `src/components/pstools/CustomScriptRunner.tsx` |
| `powershell.customStop` | `powershell:customStop` | `electron/ipc/powershellIpc.js:99` | `kit.stopCustom` | `src/components/pstools/CustomScriptRunner.tsx` |
| `powershell.exportResult` | `powershell:export` | `electron/ipc/powershellIpc.js:67` | `format.toUpperCase`<br>`kit.exportTo` | `src/components/pstools/ResultView.tsx` |
| `powershell.getPolicies` | `powershell:getPolicies` | `electron/ipc/powershellIpc.js:37` | `svc.getPolicies` | `src/pages/PowerShellTools.tsx` |
| `powershell.getSignature` | `powershell:getSignature` | `electron/ipc/powershellIpc.js:39` | `svc.getSignature` | _nao usado_ |
| `powershell.hostsBackup` | `powershell:hostsBackup` | `electron/ipc/powershellIpc.js:90` | `kit.readHostsBackup` | `src/components/pstools/HostsEditor.tsx` |
| `powershell.hostsPreview` | `powershell:hostsPreview` | `electron/ipc/powershellIpc.js:91` | `kit.previewHosts` | `src/components/pstools/HostsEditor.tsx` |
| `powershell.hostsRead` | `powershell:hostsRead` | `electron/ipc/powershellIpc.js:89` | `kit.readHosts` | `src/components/pstools/HostsEditor.tsx` |
| `powershell.hostsWrite` | `powershell:hostsWrite` | `electron/ipc/powershellIpc.js:92` | `kit.writeHosts` | `src/components/pstools/HostsEditor.tsx` |
| `powershell.listScripts` | `powershell:listScripts` | `electron/ipc/powershellIpc.js:38` | `svc.listScripts` | `src/pages/PowerShellTools.tsx` |
| `powershell.onCustomEvent` | `powershell:customEvent` | _evento main->tela_ |  | `src/components/pstools/CustomScriptRunner.tsx` |
| `powershell.openElevatedTerminal` | `powershell:openElevatedTerminal` | `electron/ipc/powershellIpc.js:41` | `svc.openElevatedTerminal` | `src/pages/PowerShellTools.tsx` |
| `powershell.openReport` | `powershell:openReport` | `electron/ipc/powershellIpc.js:82` | `i.test`<br>`generated.has`<br>`f.toLowerCase` | `src/components/pstools/ResultView.tsx` |
| `powershell.pickFolder` | `powershell:pickFolder` | `electron/ipc/powershellIpc.js:50` | `isPlainAbsPath() (electron/services/psTools/psToolBuilders.js)` | `src/components/pstools/ToolForm.tsx`<br>`src/pages/PowerShellTools.tsx` |
| `powershell.pickSavePath` | `powershell:pickSavePath` | `electron/ipc/powershellIpc.js:56` | `i.test`<br>`ext.toUpperCase` | `src/components/pstools/ToolForm.tsx` |
| `powershell.previewTool` | `powershell:previewTool` | `electron/ipc/powershellIpc.js:44` | `kit.preview` | `src/components/pstools/ToolCategory.tsx` |
| `powershell.revealFile` | `powershell:revealFile` | `electron/ipc/powershellIpc.js:76` | `generated.has`<br>`f.toLowerCase`<br>`isPlainAbsPath() (electron/services/psTools/psToolBuilders.js)` | `src/components/pstools/ResultView.tsx` |
| `powershell.runScript` | `powershell:runScript` | `electron/ipc/powershellIpc.js:40` | `svc.runScript` | `src/pages/PowerShellTools.tsx` |
| `powershell.runTool` | `powershell:runTool` | `electron/ipc/powershellIpc.js:45` | `kit.runTool`<br>`generated.add` | `src/components/pstools/ToolCategory.tsx` |
| `powershell.snippetDelete` | `powershell:snippetDelete` | `electron/ipc/powershellIpc.js:103` | `kit.deleteSnippet` | `src/components/pstools/CustomScriptRunner.tsx` |
| `powershell.snippetSave` | `powershell:snippetSave` | `electron/ipc/powershellIpc.js:102` | `kit.saveSnippet` | `src/components/pstools/CustomScriptRunner.tsx` |
| `powershell.snippetsList` | `powershell:snippetsList` | `electron/ipc/powershellIpc.js:101` | `kit.listSnippets` | `src/components/pstools/CustomScriptRunner.tsx` |
| `powershell.wifiKey` | `powershell:wifiKey` | `electron/ipc/powershellIpc.js:88` | `kit.revealWifiKey` | `src/components/pstools/ResultView.tsx` |
| `realtime.clamavInstall` | `realtime:clamavInstall` | `electron/ipc/realtimeIpc.js:134` | `clamav.install`<br>`clamav.update`<br>`clamav.status` | _nao usado_ |
| `realtime.clamavUpdate` | `realtime:clamavUpdate` | `electron/ipc/realtimeIpc.js:140` | `clamav.update`<br>`clamav.status` | _nao usado_ |
| `realtime.onEvent` | `realtime:event` | _evento main->tela_ |  | `src/pages/Realtime.tsx` |
| `realtime.quarantineDelete` | `realtime:quarantineDelete` | `electron/ipc/realtimeIpc.js:133` | `quarantine.remove` | _nao usado_ |
| `realtime.quarantineList` | `realtime:quarantineList` | `electron/ipc/realtimeIpc.js:125` | `quarantine.list` | `src/pages/Realtime.tsx` |
| `realtime.quarantineRestore` | `realtime:quarantineRestore` | `electron/ipc/realtimeIpc.js:126` | `quarantine.list`<br>`quarantine.restore`<br>`store.update` | _nao usado_ |
| `realtime.scanFiles` | `realtime:scanFiles` | `electron/ipc/realtimeIpc.js:141` | `protection.scanNow`<br>`clamav.status`<br>`clamav.update` | _nao usado_ |
| `realtime.setConfig` | `realtime:setConfig` | `electron/ipc/realtimeIpc.js:119` | `store.update` | `src/pages/Realtime.tsx` |
| `realtime.status` | `realtime:status` | `electron/ipc/realtimeIpc.js:104` | `clamav.status`<br>`clamav.install`<br>`clamav.update` | `src/pages/Realtime.tsx` |
| `recovery.backupTable` | `recovery:backup-table` | `electron/ipc/recoveryIpc.js:25` | `svc.backupTable` | _nao usado_ |
| `recovery.cancel` | `recovery:cancel` | `electron/ipc/recoveryIpc.js:33` | `svc.cancel` | _nao usado_ |
| `recovery.cancelCarve` | `recovery:cancel-carve` | `electron/ipc/recoveryIpc.js:32` | `svc.cancel` | _nao usado_ |
| `recovery.clone` | `recovery:clone` | `electron/ipc/recoveryIpc.js:27` | `svc.clone` | _nao usado_ |
| `recovery.inspectDisk` | `recovery:inspect-disk` | `electron/ipc/recoveryIpc.js:20` | `svc.inspectDisk` | _nao usado_ |
| `recovery.listDrives` | `recovery:list-drives` | `electron/ipc/recoveryIpc.js:19` | `svc.listDrives` | _nao usado_ |
| `recovery.onProgress` | `recovery:progress` | _evento main->tela_ |  | _nao usado_ |
| `recovery.partitionApply` | `recovery:partition-apply` | `electron/ipc/recoveryIpc.js:39` | `parts.apply` | _nao usado_ |
| `recovery.partitionLimits` | `recovery:partition-limits` | `electron/ipc/recoveryIpc.js:36` | `parts.limits` | _nao usado_ |
| `recovery.partitionList` | `recovery:list-partitions` | `electron/ipc/recoveryIpc.js:35` | `parts.list` | _nao usado_ |
| `recovery.partitionPlan` | `recovery:partition-plan` | `electron/ipc/recoveryIpc.js:37` | `parts.plan` | _nao usado_ |
| `recovery.pickFolder` | `recovery:pick-folder` | `electron/ipc/recoveryIpc.js:54` |  | _nao usado_ |
| `recovery.pickImage` | `recovery:pick-image` | `electron/ipc/recoveryIpc.js:58` |  | _nao usado_ |
| `recovery.readSector` | `recovery:read-sector` | `electron/ipc/recoveryIpc.js:21` | `svc.readSector` | _nao usado_ |
| `recovery.repairHeader` | `recovery:repair-header` | `electron/ipc/recoveryIpc.js:23` | `svc.repairHeader` | _nao usado_ |
| `recovery.restoreBackup` | `recovery:restore-backup` | `electron/ipc/recoveryIpc.js:26` | `svc.restoreBackup` | _nao usado_ |
| `recovery.setActive` | `recovery:set-active` | `electron/ipc/recoveryIpc.js:24` | `svc.setActive` | _nao usado_ |
| `recovery.smart` | `recovery:smart` | `electron/ipc/recoveryIpc.js:30` | `svc.smart` | _nao usado_ |
| `recovery.startCarve` | `recovery:start-carve` | `electron/ipc/recoveryIpc.js:31` | `svc.startCarving` | _nao usado_ |
| `recovery.status` | `recovery:status` | `electron/ipc/recoveryIpc.js:34` | `svc.status` | _nao usado_ |
| `recovery.surfaceTest` | `recovery:surface-test` | `electron/ipc/recoveryIpc.js:29` | `svc.surfaceTest` | _nao usado_ |
| `recovery.verify` | `recovery:verify` | `electron/ipc/recoveryIpc.js:28` | `svc.verify` | _nao usado_ |
| `recovery.writeSector` | `recovery:write-sector` | `electron/ipc/recoveryIpc.js:22` | `svc.writeSector` | _nao usado_ |
| `restore.install` | `restore:install` | `electron/ipc/restoreIpc.js:13` | `svc.install` | `src/components/setup/RestoreComponentsPanel.tsx` |
| `restore.status` | `restore:status` | `electron/ipc/restoreIpc.js:12` | `svc.status` | `src/components/drivers/MissingDrivers.tsx`<br>`src/components/setup/RestoreComponentsPanel.tsx` |
| `saves.addCustom` | `saves:addCustom` | `electron/ipc/saveBackupIpc.js:49` | `svc.settings`<br>`svc.setSettings`<br>`custom.filter` | _nao usado_ |
| `saves.backup` | `saves:backup` | `electron/ipc/saveBackupIpc.js:38` | `svc.backup` | _nao usado_ |
| `saves.backupAll` | `saves:backupAll` | `electron/ipc/saveBackupIpc.js:39` | `svc.backupAll` | _nao usado_ |
| `saves.onEvent` | `saves:event` | _evento main->tela_ |  | `src/pages/SaveBackup.tsx` |
| `saves.openFolder` | `saves:openFolder` | `electron/ipc/saveBackupIpc.js:62` | `svc._gameDir`<br>`svc.settings` | `src/pages/SaveBackup.tsx` |
| `saves.pickFolder` | `saves:pickFolder` | `electron/ipc/saveBackupIpc.js:45` |  | _nao usado_ |
| `saves.previewRestore` | `saves:previewRestore` | `electron/ipc/saveBackupIpc.js:41` | `svc.previewRestore` | _nao usado_ |
| `saves.removeCustom` | `saves:removeCustom` | `electron/ipc/saveBackupIpc.js:57` | `svc.settings`<br>`svc.setSettings`<br>`custom.filter` | _nao usado_ |
| `saves.removeVersion` | `saves:removeVersion` | `electron/ipc/saveBackupIpc.js:43` | `svc.removeVersion` | _nao usado_ |
| `saves.restore` | `saves:restore` | `electron/ipc/saveBackupIpc.js:42` | `svc.restore` | _nao usado_ |
| `saves.scan` | `saves:scan` | `electron/ipc/saveBackupIpc.js:37` | `svc.scan` | _nao usado_ |
| `saves.setSettings` | `saves:setSettings` | `electron/ipc/saveBackupIpc.js:44` | `svc.setSettings` | _nao usado_ |
| `saves.versions` | `saves:versions` | `electron/ipc/saveBackupIpc.js:40` | `svc.versions` | `src/pages/SaveBackup.tsx` |
| `security.advApplyFirewall` | `security:advApplyFirewall` | `electron/services/SecurityService.js:85` | `adv.applyFirewall` | `src/components/security/BlocklistsPanel.tsx` |
| `security.advApplyHashes` | `security:advApplyHashes` | `electron/services/SecurityService.js:87` | `adv.applyHashes` | `src/components/security/BlocklistsPanel.tsx` |
| `security.advApplyHosts` | `security:advApplyHosts` | `electron/services/SecurityService.js:83` | `adv.applyHosts` | `src/components/security/BlocklistsPanel.tsx` |
| `security.advHardeningApply` | `security:advHardeningApply` | `electron/services/SecurityService.js:90` | `adv.hardeningApply` | `src/components/security/HardeningPanel.tsx` |
| `security.advHardeningRestore` | `security:advHardeningRestore` | `electron/services/SecurityService.js:91` | `adv.hardeningRestore`<br>`advanced.setDataDir` | `src/components/security/HardeningPanel.tsx` |
| `security.advHardeningStatus` | `security:advHardeningStatus` | `electron/services/SecurityService.js:89` | `adv.hardeningStatus` | _nao usado_ |
| `security.advRestoreFirewall` | `security:advRestoreFirewall` | `electron/services/SecurityService.js:86` | `adv.restoreFirewall` | `src/components/security/BlocklistsPanel.tsx` |
| `security.advRestoreHashes` | `security:advRestoreHashes` | `electron/services/SecurityService.js:88` | `adv.restoreHashes` | `src/components/security/BlocklistsPanel.tsx` |
| `security.advRestoreHosts` | `security:advRestoreHosts` | `electron/services/SecurityService.js:84` | `adv.restoreHosts` | `src/components/security/BlocklistsPanel.tsx` |
| `security.advSetFeedEnabled` | `security:advSetFeedEnabled` | `electron/services/SecurityService.js:81` | `adv.setEnabled` | `src/components/security/BlocklistsPanel.tsx` |
| `security.advStatus` | `security:advStatus` | `electron/services/SecurityService.js:80` | `adv.status` | `src/pages/AdvancedSecurity.tsx` |
| `security.advUpdateFeeds` | `security:advUpdateFeeds` | `electron/services/SecurityService.js:82` | `adv.updateFeeds`<br>`ids.map` | `src/components/security/BlocklistsPanel.tsx` |
| `security.auditTracking` | `security:auditTracking` | `electron/main.js:3137` | `custom.map`<br>`content.split`<br>`l.trim` | `src/pages/AdvancedSecurity.tsx` |
| `security.blockTracking` | `security:blockTracking` | `electron/main.js:3244` | `custom.map`<br>`d.toLowerCase`<br>`content.split` | `src/pages/AdvancedSecurity.tsx` |
| `security.checkRansomwareArmor` | `security:checkRansomwareArmor` | `electron/services/SecurityService.js:123` |  | _nao usado_ |
| `security.disablePhishingShield` | `security:disablePhishingShield` | `electron/services/SecurityService.js:111` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.enablePhishingShield` | `security:enablePhishingShield` | `electron/services/SecurityService.js:107` |  | _nao usado_ |
| `security.enableRansomwareArmor` | `security:enableRansomwareArmor` | `electron/services/SecurityService.js:127` |  | _nao usado_ |
| `security.getCommunityRules` | `security:getCommunityRules` | `electron/services/SecurityService.js:131` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.getLiveNetworkConnections` | `security:getLiveNetworkConnections` | `electron/services/SecurityService.js:119` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.getPhishingShieldStatus` | `security:getPhishingShieldStatus` | `electron/services/SecurityService.js:115` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.getSecurityScore` | `security:getSecurityScore` | `electron/main.js:3133` |  | `src/hooks/useSecurityScore.ts` |
| `security.getTrackingDomains` | `security:getTrackingDomains` | `electron/main.js:3187` | `custom.map`<br>`HOSTNAME_RE.test` | `src/pages/AdvancedSecurity.tsx` |
| `security.importCommunityRules` | `security:importCommunityRules` | `electron/services/SecurityService.js:135` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.killProcess` | `security:killProcess` | `electron/main.js:3323` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.optimizeLatency` | `security:optimizeLatency` | `electron/main.js:3312` | `runPowerShell() (electron/services/PowerShellRunner.js)` | _nao usado_ |
| `security.resetCommunityRules` | `security:resetCommunityRules` | `electron/services/SecurityService.js:139` | `promises.stat`<br>`entropyCache.has`<br>`entropyCache.get` | `src/pages/AdvancedSecurity.tsx` |
| `security.scanMalware` | `security:scanMalware` | `electron/main.js:3005` | `si.processes`<br>`safeRegex.test`<br>`reason.push` | _nao usado_ |
| `security.scanProcesses` | `security:scanProcesses` | `electron/services/SecurityService.js:99` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.scanUrl` | `security:scanUrl` | `electron/services/SecurityService.js:103` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.setCustomTrackingDomains` | `security:setCustomTrackingDomains` | `electron/main.js:3231` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.unblockTracking` | `security:unblockTracking` | `electron/main.js:3296` |  | `src/pages/AdvancedSecurity.tsx` |
| `settings.getConfig` | `settings:getConfig` | `electron/main.js:1537` | `loadPersistedConfig() (electron/configManager.js)` | `src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Settings.tsx` |
| `settings.updateLiveServices` | `settings:updateLiveServices` | `electron/main.js:1561` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` | `src/pages/Settings.tsx` |
| `settings.updateStartupBehavior` | `settings:updateStartupBehavior` | `electron/main.js:1604` | `runPowerShell() (electron/services/PowerShellRunner.js)`<br>`stripBom() (electron/services/PowerShellRunner.js)`<br>`loadPersistedConfig() (electron/configManager.js)` | `src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Settings.tsx` |
| `settings.updateWindowBehavior` | `settings:updateWindowBehavior` | `electron/main.js:1585` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` | `src/pages/Settings.tsx` |
| `setup.detectHardware` | `setup:detectHardware` | `electron/main.js:3613` | `si.cpu`<br>`si.graphics`<br>`si.baseboard` | `src/pages/SetupHub.tsx` |
| `setup.installWinget` | `setup:installWinget` | `electron/main.js:3540` | `sender.isDestroyed`<br>`sender.send`<br>`appIds.map` | `src/pages/SetupHub.tsx` |
| `setup.onInstallProgress` | `setup:installProgress` | _evento main->tela_ |  | `src/pages/SetupHub.tsx` |
| `share.aiStatus` | `share:aiStatus` | `electron/ipc/shareIpc.js:203` | `ai.available` | `src/pages/Share.tsx` |
| `share.cancel` | `share:cancel` | `electron/ipc/shareIpc.js:238` | `jobs.get` | _nao usado_ |
| `share.capture` | `share:capture` | `electron/ipc/shareIpc.js:259` |  | _nao usado_ |
| `share.captureRegion` | `share:captureRegion` | `electron/ipc/shareIpc.js:260` |  | _nao usado_ |
| `share.copy` | `share:copy` | `electron/ipc/shareIpc.js:247` | `s.startsWith`<br>`clipboard.writeText` | _nao usado_ |
| `share.displays` | `share:displays` | `electron/ipc/shareIpc.js:202` | `listDisplays() (electron/services/susuya/Screenshot.js)` | `src/pages/Share.tsx` |
| `share.enhance` | `share:enhance` | `electron/ipc/shareIpc.js:205` | `i.test` | _nao usado_ |
| `share.grabRegion` | `share:grabRegion` | `electron/ipc/shareIpc.js:262` | `img.toDataURL`<br>`img.getSize`<br>`grabRegionImage() (electron/services/susuya/Screenshot.js)` | `src/pages/ImageTextExtractor.tsx` |
| `share.onEvent` | `share:event` | _evento main->tela_ |  | `src/App.tsx`<br>`src/pages/Share.tsx` |
| `share.openFolder` | `share:openFolder` | `electron/ipc/shareIpc.js:274` |  | _nao usado_ |
| `share.pickAndUpload` | `share:pickAndUpload` | `electron/ipc/shareIpc.js:224` | `results.push` | _nao usado_ |
| `share.qr` | `share:qr` | `electron/ipc/shareIpc.js:254` | `s.startsWith`<br>`QRCode.toDataURL` | `src/components/vault/VaultTransferSection.tsx`<br>`src/pages/Share.tsx` |
| `share.recentShots` | `share:recentShots` | `electron/ipc/shareIpc.js:281` | `i.test` | `src/pages/Share.tsx` |
| `share.remove` | `share:delete` | `electron/ipc/shareIpc.js:239` | `history.find`<br>`client.remove`<br>`i.test` | _nao usado_ |
| `share.setConfig` | `share:setConfig` | `electron/ipc/shareIpc.js:211` |  | _nao usado_ |
| `share.state` | `share:state` | `electron/ipc/shareIpc.js:201` |  | `src/pages/Share.tsx` |
| `share.uploadFiles` | `share:uploadPaths` | `electron/ipc/shareIpc.js:232` | `results.push` | _nao usado_ |
| `share.uploadScreenshot` | `share:uploadFile` | `electron/ipc/shareIpc.js:275` |  | _nao usado_ |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1397` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString` | `src/components/darkos/DarkOSReleaseCard.tsx`<br>`src/components/hub/HubPreview.tsx`<br>`src/pages/Dashboard.tsx`<br>`src/pages/Dlss5Manager.tsx`<br>`src/pages/Presets.tsx`<br>`src/pages/Share.tsx` |
| `startup.list` | `startup:list` | `electron/ipc/startupIpc.js:12` | `svc.list` | _nao usado_ |
| `startup.setEnabled` | `startup:setEnabled` | `electron/ipc/startupIpc.js:13` | `svc.setEnabled` | _nao usado_ |
| `startup.undo` | `startup:undo` | `electron/ipc/startupIpc.js:14` | `svc.undo` | _nao usado_ |
| `system.enableProcessTracking` | `system:enableProcessTracking` | `electron/main.js:871` |  | `src/pages/SystemMonitor.tsx` |
| `system.getAdvancedHardware` | `system:getAdvancedHardware` | `electron/main.js:885` | `si.graphics`<br>`si.baseboard`<br>`si.bios` | _nao usado_ |
| `system.getBios` | `system:getBios` | `electron/main.js:943` | `si.baseboard`<br>`si.bios` | `src/components/DetailedHardwareInfo.tsx` |
| `system.getDeepCategory` | `system:getDeepCategory` | `electron/main.js:864` | `DeepHardwareService.getCategory (electron/services/DeepHardwareService.js)` | _nao usado_ |
| `system.getDeepHardwareInfo` | `system:getDeepHardwareInfo` | `electron/main.js:860` | `DeepHardwareService.getDeepInfo (electron/services/DeepHardwareService.js)` | _nao usado_ |
| `system.getGraphics` | `system:getGraphics` | `electron/main.js:932` | `si.graphics` | `src/components/DetailedHardwareInfo.tsx` |
| `system.getInfo` | `system:getInfo` | `electron/main.js:802` | `cpuModel.includes`<br>`si.cpu`<br>`runCommand() (electron/services/PowerShellRunner.js)` | `src/components/DetailedHardwareInfo.tsx`<br>`src/pages/Home.tsx` |
| `system.getJunkEstimate` | `system:getJunkEstimate` | `electron/main.js:1155` |  | `src/hooks/useJunkScanner.ts` |
| `system.getLatency` | `system:getLatency` | `electron/main.js:974` |  | _nao usado_ |
| `system.getLiveStats` | `system:getLiveStats` | `electron/main.js:1649` | `liveCpu.sample` | `src/components/darkos/DarkOSSystemPanel.tsx` |
| `system.getMemory` | `system:getMemory` | `electron/main.js:1644` |  | `src/pages/Home.tsx` |
| `system.getMetrics` | `system:getMetrics` | `electron/main.js:1050` | `si.networkStats`<br>`si.fsStats` | _nao usado_ |
| `system.getNetwork` | `system:getNetwork` | `electron/main.js:1113` | `si.networkInterfaces`<br>`si.networkStats` | _nao usado_ |
| `system.getSnapshot` | `system:getSnapshot` | `electron/main.js:713` | `HardwareHAL.getSnapshot (electron/hal/HardwareHAL.js)` | _nao usado_ |
| `system.getStorage` | `system:getStorage` | `electron/main.js:1140` | `si.fsSize` | `src/components/DetailedHardwareInfo.tsx` |
| `system.getTemperatures` | `system:getTemperatures` | `electron/main.js:966` | `si.sensorsTemperatures` | `src/components/DetailedHardwareInfo.tsx` |
| `system.runBenchmark` | `system:runBenchmark` | `electron/main.js:978` | `hrtime.bigint`<br>`parentPort.postMessage`<br>`mops.toFixed` | `src/pages/SystemMonitor.tsx` |
| `updater.check` | `updater:check` | `electron/services/UpdateService.js:387` |  | `src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Settings.tsx` |
| `updater.download` | `updater:download` | `electron/services/UpdateService.js:388` |  | `src/components/UpdaterOverlay.tsx`<br>`src/components/darkos/DarkOSSystemPanel.tsx` |
| `updater.getStatus` | `updater:getStatus` | `electron/services/UpdateService.js:381` |  | `src/components/UpdaterOverlay.tsx`<br>`src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Settings.tsx` |
| `updater.install` | `updater:install` | `electron/services/UpdateService.js:389` | `webContents.send` | `src/components/UpdaterOverlay.tsx`<br>`src/components/darkos/DarkOSSystemPanel.tsx` |
| `updater.onEvent` | `updater:event` | _evento main->tela_ |  | `src/components/UpdaterOverlay.tsx`<br>`src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Settings.tsx` |
| `upscale.autopilotInstall` | `upscale:autopilotInstall` | `electron/ipc/upscaleIpc.js:48` | `autopilot.install` | _nao usado_ |
| `upscale.autopilotLaunch` | `upscale:autopilotLaunch` | `electron/ipc/upscaleIpc.js:49` | `autopilot.launch` | _nao usado_ |
| `upscale.autopilotStatus` | `upscale:autopilotStatus` | `electron/ipc/upscaleIpc.js:47` | `autopilot.status` | `src/pages/Dlss5Manager.tsx` |
| `upscale.dlssLatest` | `upscale:dlssLatest` | `electron/ipc/upscaleIpc.js:29` | `updater.latest` | `src/pages/Dlss5Manager.tsx` |
| `upscale.inspectGame` | `upscale:inspectGame` | `electron/ipc/upscaleIpc.js:30` | `updater.inspect` | _nao usado_ |
| `upscale.onLog` | `upscale:log` | _evento main->tela_ |  | _nao usado_ |
| `upscale.restoreGame` | `upscale:restoreGame` | `electron/ipc/upscaleIpc.js:32` | `updater.restore` | _nao usado_ |
| `upscale.scanLibrary` | `upscale:scanLibrary` | `electron/ipc/upscaleIpc.js:34` | `updater.latest`<br>`steam.getInstalledSteamGames`<br>`updater.inspect` | _nao usado_ |
| `upscale.updateGame` | `upscale:updateGame` | `electron/ipc/upscaleIpc.js:31` | `updater.update` | _nao usado_ |
| `usb.eject` | `usb:eject` | `electron/ipc/usbIpc.js:18` | `svc.eject` | _nao usado_ |
| `usb.keepDisabled` | `usb:keepDisabled` | `electron/ipc/usbIpc.js:14` | `svc.keepDisabled` | _nao usado_ |
| `usb.list` | `usb:list` | `electron/ipc/usbIpc.js:12` | `svc.list` | _nao usado_ |
| `usb.setDeviceEnabled` | `usb:setDeviceEnabled` | `electron/ipc/usbIpc.js:13` | `svc.setDeviceEnabled` | _nao usado_ |
| `usb.setSelectiveSuspend` | `usb:setSelectiveSuspend` | `electron/ipc/usbIpc.js:17` | `svc.setSelectiveSuspend` | _nao usado_ |
| `usb.setStorageBlocked` | `usb:setStorageBlocked` | `electron/ipc/usbIpc.js:15` | `svc.setStorageBlocked` | _nao usado_ |
| `usb.setWriteProtect` | `usb:setWriteProtect` | `electron/ipc/usbIpc.js:16` | `svc.setWriteProtect` | _nao usado_ |
| `vault.add` | `vault:add` | `electron/main.js:2777` | `crypto.randomUUID` | `src/pages/PasswordManager.tsx` |
| `vault.bridgeStatus` | `vaultx:bridgeStatus` | `electron/ipc/vaultBridgeIpc.js:185` |  | `src/components/vault/BrowserExtensionSection.tsx` |
| `vault.changeMasterPassword` | `vault:changeMasterPassword` | `electron/main.js:2853` | `buildKdf() (electron/vaultCrypto.js)`<br>`unwrapVaultKeyWithPassword() (electron/vaultCrypto.js)`<br>`wrapVaultKeyWithPassword() (electron/vaultCrypto.js)` | _nao usado_ |
| `vault.copyPassword` | `vault:copyPassword` | `electron/main.js:2840` | `clipboard.writeText`<br>`clipboard.readText`<br>`clipboard.clear` | `src/pages/PasswordManager.tsx` |
| `vault.export` | `vault:export` | `electron/main.js:2897` |  | `src/pages/PasswordManager.tsx` |
| `vault.import` | `vault:import` | `electron/main.js:2906` | `backupVaultFile() (electron/services/vaultBridge/vaultHardening.js)` | `src/pages/PasswordManager.tsx` |
| `vault.init` | `vault:init` | `electron/main.js:2697` | `crypto.randomBytes`<br>`recoveryWords.join`<br>`buildKdf() (electron/vaultCrypto.js)` | `src/pages/PasswordManager.tsx` |
| `vault.list` | `vault:list` | `electron/main.js:2762` |  | `src/pages/PasswordManager.tsx` |
| `vault.lock` | `vault:lock` | `electron/main.js:2757` |  | `src/pages/PasswordManager.tsx` |
| `vault.onBridgeChanged` | `vaultx:changed` | _evento main->tela_ |  | `src/components/vault/BrowserExtensionSection.tsx` |
| `vault.openExtensionFolder` | `vaultx:openExtensionFolder` | `electron/ipc/vaultBridgeIpc.js:211` |  | `src/components/vault/BrowserExtensionSection.tsx` |
| `vault.regenerateRecoveryWords` | `vault:regenerateRecoveryWords` | `electron/main.js:2879` | `recoveryWords.join`<br>`buildKdf() (electron/vaultCrypto.js)`<br>`derivePasswordFromRecoveryWords() (electron/vaultCrypto.js)` | _nao usado_ |
| `vault.registerBrowserHost` | `vaultx:registerHost` | `electron/ipc/vaultBridgeIpc.js:187` | `registry.register`<br>`isBrowserId() (electron/services/vaultBridge/nativeHost.js)` | `src/components/vault/BrowserExtensionSection.tsx` |
| `vault.remove` | `vault:remove` | `electron/main.js:2823` |  | `src/pages/PasswordManager.tsx` |
| `vault.reveal` | `vault:reveal` | `electron/main.js:2832` |  | `src/pages/PasswordManager.tsx` |
| `vault.revokeBrowserClient` | `vaultx:revokeClient` | `electron/ipc/vaultBridgeIpc.js:203` | `pairingStore.revoke`<br>`server.disconnectClient` | `src/components/vault/BrowserExtensionSection.tsx` |
| `vault.setAutoLockMinutes` | `vault:setAutoLockMinutes` | `electron/main.js:2692` |  | `src/pages/Settings.tsx` |
| `vault.setBridgeLanguage` | `vaultx:setLanguage` | `electron/ipc/vaultBridgeIpc.js:218` | `lang.toLowerCase` | `src/components/vault/BrowserExtensionSection.tsx` |
| `vault.status` | `vault:status` | `electron/main.js:2687` |  | `src/pages/PasswordManager.tsx` |
| `vault.transferCancel` | `vault:transferCancel` | `electron/main.js:2948` |  | _nao usado_ |
| `vault.transferReceive` | `vault:transferReceive` | `electron/main.js:2960` | `bytes.toString`<br>`crypto.randomUUID`<br>`registerVaultBridgeIPC() (electron/ipc/vaultBridgeIpc.js)` | _nao usado_ |
| `vault.transferSend` | `vault:transferSend` | `electron/main.js:2928` | `crypto.randomUUID`<br>`sealVault() (electron/services/vaultTransfer/vaultTransfer.js)`<br>`makeCode() (electron/services/vaultTransfer/vaultTransfer.js)` | _nao usado_ |
| `vault.unlock` | `vault:unlock` | `electron/main.js:2732` |  | `src/pages/PasswordManager.tsx` |
| `vault.unlockWithRecoveryWords` | `vault:unlockWithRecoveryWords` | `electron/main.js:2744` | `words.trim`<br>`derivePasswordFromRecoveryWords() (electron/vaultCrypto.js)` | `src/pages/PasswordManager.tsx` |
| `vault.unregisterBrowserHost` | `vaultx:unregisterHost` | `electron/ipc/vaultBridgeIpc.js:195` | `registry.unregister`<br>`isBrowserId() (electron/services/vaultBridge/nativeHost.js)` | `src/components/vault/BrowserExtensionSection.tsx` |
| `vault.update` | `vault:update` | `electron/main.js:2800` | `entries.findIndex`<br>`entries.slice` | _nao usado_ |
| `window.close` | `window:close` | `electron/main.js:3773` | `HardwareService.init (electron/services/HardwareService.js)`<br>`UpdateService.init (electron/services/UpdateService.js)`<br>`argv.find` | `src/layouts/MainLayout.tsx` |
| `window.isMaximized` | `window:isMaximized` | `electron/main.js:3769` |  | _nao usado_ |
| `window.maximize` | `window:maximize` | `electron/main.js:3761` |  | `src/layouts/MainLayout.tsx` |
| `window.minimize` | `window:minimize` | `electron/main.js:3757` |  | `src/layouts/MainLayout.tsx` |
| `wintools.diagnoseWu` | `wintools:diagnoseWu` | `electron/ipc/winToolsIpc.js:17` | `diagnoseWindowsUpdate() (electron/services/optimizer/wuDiagnose.js)` | `src/components/optimizer/WuDiagnosis.tsx` |
| `wintools.listFeatures` | `wintools:listFeatures` | `electron/ipc/winToolsIpc.js:13` | `engine.listFeatures` | `src/components/optimizer/WindowsToolsPanel.tsx` |
| `wintools.openPanel` | `wintools:openPanel` | `electron/ipc/winToolsIpc.js:16` | `engine.openPanel` | _nao usado_ |
| `wintools.run` | `wintools:run` | `electron/ipc/winToolsIpc.js:15` | `engine.run` | `src/components/optimizer/WuDiagnosis.tsx` |
| `wintools.setFeature` | `wintools:setFeature` | `electron/ipc/winToolsIpc.js:14` | `engine.setFeature` | _nao usado_ |
| `youtube.cancel` | `youtube:cancel` | `electron/main.js:2521` | `cancelActiveYtDlp() (electron/ytdlp.js)` | `src/pages/YoutubeDownloader.tsx` |
| `youtube.download` | `youtube:download` | `electron/main.js:2390` | `cookiesPath.trim`<br>`cookiesFromBrowser.trim`<br>`userAgent.trim` | `src/i18n/messages.ts`<br>`src/pages/YoutubeDownloader.tsx` |
| `youtube.getVideoInfo` | `youtube:getVideoInfo` | `electron/main.js:2285` | `cookiesPath.trim`<br>`cookiesFromBrowserRaw.trim`<br>`userAgentRaw.trim` | `src/pages/YoutubeDownloader.tsx` |
| `youtube.onProgress` | `youtube:downloadProgress` | _evento main->tela_ |  | `src/pages/YoutubeDownloader.tsx` |

## Handlers sem metodo no preload

- `picker:result`
