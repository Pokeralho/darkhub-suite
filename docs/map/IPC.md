<!-- GERADO por electron_feature_map.py em 2026-10-23T15:42:17. NAO edite a mao: rode `npm run map`. -->

# Canais IPC (319)

| API (`window.darkhub.`) | canal | handler | chama | usado em |
|---|---|---|---|---|
| `app.getAbout` | `app:getAbout` | `electron/main.js:1653` | `runCommand() (electron/services/PowerShellRunner.js)` | _nao usado_ |
| `app.getResourceUsage` | `app:getResourceUsage` | `electron/main.js:1632` | `metrics.map`<br>`processes.reduce` | `src/pages/Settings.tsx`<br>`src/pages/SystemMonitor.tsx` |
| `autoclicker.getHotkey` | `autoclicker:getHotkey` | `electron/main.js:3774` |  | _nao usado_ |
| `autoclicker.onChanged` | `autoclicker:changed` | _evento main->tela_ |  | `src/pages/AutoClicker.tsx` |
| `autoclicker.setHotkey` | `autoclicker:setHotkey` | `electron/main.js:3778` | `hotkey.trim`<br>`stdin.write` | `src/pages/AutoClicker.tsx` |
| `autoclicker.setTabActive` | `autoclicker:setTabActive` | `electron/main.js:3807` |  | `src/pages/AutoClicker.tsx` |
| `autoclicker.start` | `autoclicker:start` | `electron/main.js:3744` |  | `src/pages/AutoClicker.tsx` |
| `autoclicker.status` | `autoclicker:status` | `electron/main.js:3740` |  | `src/pages/AutoClicker.tsx` |
| `autoclicker.stop` | `autoclicker:stop` | `electron/main.js:3755` |  | `src/pages/AutoClicker.tsx` |
| `autoclicker.toggle` | `autoclicker:toggle` | `electron/main.js:3763` |  | `src/i18n/messages.ts` |
| `clearTrace` | `dev:clearTrace` | **sem handler** |  | _nao usado_ |
| `darkos.applyChange` | `darkos:applyChange` | `electron/ipc/darkosIpc.js:63` |  | _nao usado_ |
| `darkos.createSnapshot` | `darkos:createSnapshot` | `electron/ipc/darkosIpc.js:70` |  | _nao usado_ |
| `darkos.exportDiagnostics` | `darkos:exportDiagnostics` | `electron/ipc/darkosIpc.js:76` | `i.test` | _nao usado_ |
| `darkos.getCatalog` | `darkos:getCatalog` | `electron/ipc/darkosIpc.js:60` |  | _nao usado_ |
| `darkos.getFailures` | `darkos:getFailures` | `electron/ipc/darkosIpc.js:72` |  | _nao usado_ |
| `darkos.getManifest` | `darkos:getManifest` | `electron/ipc/darkosIpc.js:61` |  | _nao usado_ |
| `darkos.getRebootPending` | `darkos:getRebootPending` | `electron/ipc/darkosIpc.js:73` |  | _nao usado_ |
| `darkos.getRemovedApps` | `darkos:getRemovedApps` | `electron/ipc/darkosIpc.js:67` |  | _nao usado_ |
| `darkos.getStatus` | `darkos:getStatus` | `electron/ipc/darkosIpc.js:62` |  | _nao usado_ |
| `darkos.isDarkOS` | `darkos:isDarkOS` | `electron/ipc/darkosIpc.js:59` |  | `src/components/darkos/DarkOSOptimizerHint.tsx`<br>`src/layouts/MainLayout.tsx`<br>`src/pages/DarkOSCenter.tsx` |
| `darkos.listSnapshots` | `darkos:listSnapshots` | `electron/ipc/darkosIpc.js:69` |  | _nao usado_ |
| `darkos.onRunEvent` | `darkos:runEvent` | _evento main->tela_ |  | `src/components/darkos/DarkOSProgress.tsx` |
| `darkos.reinstallEdge` | `darkos:reinstallEdge` | `electron/ipc/darkosIpc.js:35` | `svc.revertChange`<br>`ElevationHelper.runElevatedPowerShell (electron/services/optimizer/ElevationHelper.js)` | `src/components/darkos/DarkOSSystemPanel.tsx` |
| `darkos.restoreAppx` | `darkos:restoreAppx` | `electron/ipc/darkosIpc.js:68` |  | _nao usado_ |
| `darkos.restoreProfile` | `darkos:restoreProfile` | `electron/ipc/darkosIpc.js:66` |  | _nao usado_ |
| `darkos.restoreSnapshot` | `darkos:restoreSnapshot` | `electron/ipc/darkosIpc.js:71` |  | _nao usado_ |
| `darkos.revertChange` | `darkos:revertChange` | `electron/ipc/darkosIpc.js:64` |  | _nao usado_ |
| `darkos.setProfile` | `darkos:setProfile` | `electron/ipc/darkosIpc.js:65` |  | _nao usado_ |
| `darkpacer.closeOverlay` | `framepacer:closeOverlay` | `electron/main.js:1945` | `closeFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.createOverlay` | `framepacer:createOverlay` | `electron/main.js:1940` | `createFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.getMetrics` | `framepacer:getMetrics` | `electron/main.js:1936` | `FramePacerEngine.getMetrics (electron/services/FramePacerEngine.js)` | _nao usado_ |
| `darkpacer.getOverlayStatus` | `framepacer:getOverlayStatus` | `electron/main.js:1962` | `getOverlayStatus() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.onMetrics` | `framepacer:metrics` | _evento main->tela_ |  | _nao usado_ |
| `darkpacer.setOverlayClickThrough` | `framepacer:setOverlayClickThrough` | `electron/main.js:1954` | `setOverlayClickThrough() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.setOverlayConfig` | `framepacer:setOverlayConfig` | `electron/main.js:1958` | `setOverlayConfig() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.start` | `framepacer:start` | `electron/main.js:1924` | `FramePacerEngine.start (electron/services/FramePacerEngine.js)` | _nao usado_ |
| `darkpacer.stop` | `framepacer:stop` | `electron/main.js:1928` | `FramePacerEngine.stop (electron/services/FramePacerEngine.js)` | _nao usado_ |
| `darkpacer.toggleOverlay` | `framepacer:toggleOverlay` | `electron/main.js:1950` | `toggleFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `darkpacer.updateConfig` | `framepacer:updateConfig` | `electron/main.js:1932` | `FramePacerEngine.updateConfig (electron/services/FramePacerEngine.js)` | _nao usado_ |
| `dialog.grantDroppedFiles` | `dialog:grantDroppedFiles` | `electron/main.js:1972` | `filePaths.slice`<br>`granted.push` | `src/pages/FileConverter.tsx` |
| `dialog.saveFile` | `dialog:saveFile` | `electron/main.js:2007` |  | `src/pages/TextEditor.tsx` |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1986` |  | `src/pages/DllInjector.tsx`<br>`src/pages/FileConverter.tsx`<br>`src/pages/ImageTextExtractor.tsx`<br>`src/pages/Library.tsx`<br>`src/pages/MetaDataEditor.tsx`<br>`src/pages/OptiScalerManager.tsx`<br>`src/pages/Optimizer.tsx`<br>`src/pages/PasswordManager.tsx`<br>`src/pages/TextEditor.tsx`<br>`src/pages/TextSummarizer.tsx`<br>`src/pages/UltraLowLatency.tsx`<br>`src/pages/YoutubeDownloader.tsx` |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1997` |  | `src/pages/FileConverter.tsx`<br>`src/pages/Library.tsx`<br>`src/pages/MetaDataEditor.tsx`<br>`src/pages/PasswordManager.tsx`<br>`src/pages/YoutubeDownloader.tsx` |
| `discord.reportError` | `discord:reportError` | `electron/main.js:1917` |  | `src/App.tsx` |
| `discord.sendMessage` | `discord:sendMessage` | `electron/main.js:1910` | `content.trim` | _nao usado_ |
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
| `dlss5.detectGpu` | `dlss5:detectGpu` | `electron/services/dlss5/Dlss5Service.js:727` | `service.detectGpu` | `src/pages/Dlss5Manager.tsx` |
| `dlss5.getRecentGames` | `dlss5:getRecentGames` | `electron/services/dlss5/Dlss5Service.js:759` | `service.getRecentGames` | _nao usado_ |
| `dlss5.getSteamGames` | `dlss5:getSteamGames` | `electron/services/dlss5/Dlss5Service.js:718` | `service.getInstalledSteamGames` | `src/pages/Dlss5Manager.tsx`<br>`src/pages/OptiScalerManager.tsx` |
| `dlss5.onLog` | `dlss5:log` | _evento main->tela_ |  | _nao usado_ |
| `dlss5.openFolder` | `dlss5:openFolder` | `electron/services/dlss5/Dlss5Service.js:769` |  | _nao usado_ |
| `dlss5.revert` | `dlss5:revert` | `electron/services/dlss5/Dlss5Service.js:745` | `sender.send`<br>`service.revert` | _nao usado_ |
| `dlss5.scanGame` | `dlss5:scanGame` | `electron/services/dlss5/Dlss5Service.js:735` | `service.scanGameDirectory` | `src/pages/OptiScalerManager.tsx` |
| `downloads.add` | `downloads:add` | `electron/services/downloads/registerDownloadsIPC.js:49` | `manager.add` | `src/pages/Downloads.tsx` |
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
| `driver.cameraStatus` | `driver:cameraStatus` | `electron/ipc/driverIpc.js:24` | `svc.cameraStatus` | `src/pages/DriverCenter.tsx` |
| `driver.detect` | `driver:detect` | `electron/ipc/driverIpc.js:22` | `svc.detectAdapters` | `src/pages/DriverCenter.tsx`<br>`src/pages/Home.tsx` |
| `driver.openOfficial` | `driver:openOfficial` | `electron/ipc/driverIpc.js:31` | `svc.resolveOfficialUrl` | `src/pages/DriverCenter.tsx` |
| `driver.repairCamera` | `driver:repairCamera` | `electron/ipc/driverIpc.js:27` | `svc.repairCamera`<br>`darkos.revertChange` | `src/pages/DriverCenter.tsx` |
| `files.archiveOperation` | `files:archiveOperation` | `electron/main.js:2471` | `inputFiles.map`<br>`runCommand() (electron/services/PowerShellRunner.js)` | `src/pages/FileConverter.tsx` |
| `files.checkLibreOffice` | `files:checkLibreOffice` | `electron/main.js:2357` |  | _nao usado_ |
| `files.convertDocuments` | `files:convertDocuments` | `electron/main.js:2362` | `outputDir.trim`<br>`outputFormat.trim`<br>`outputFormat.toLowerCase` | `src/pages/FileConverter.tsx` |
| `files.convertImages` | `files:convertImages` | `electron/main.js:2219` | `outputDir.trim`<br>`outputFormat.toLowerCase`<br>`supported.has` | `src/pages/FileConverter.tsx` |
| `files.convertMedia` | `files:convertMedia` | `electron/main.js:2271` | `outputDir.trim`<br>`outputFormat.trim`<br>`ffmpegPath.trim` | `src/pages/FileConverter.tsx` |
| `framepacer.closeOverlay` | `framepacer:closeOverlay` | `electron/main.js:1945` | `closeFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `framepacer.createOverlay` | `framepacer:createOverlay` | `electron/main.js:1940` | `createFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `framepacer.getMetrics` | `framepacer:getMetrics` | `electron/main.js:1936` | `FramePacerEngine.getMetrics (electron/services/FramePacerEngine.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.getOverlayStatus` | `framepacer:getOverlayStatus` | `electron/main.js:1962` | `getOverlayStatus() (electron/services/FramePacerOverlay.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.onMetrics` | `framepacer:metrics` | _evento main->tela_ |  | `src/pages/FramePacer.tsx` |
| `framepacer.setOverlayClickThrough` | `framepacer:setOverlayClickThrough` | `electron/main.js:1954` | `setOverlayClickThrough() (electron/services/FramePacerOverlay.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.setOverlayConfig` | `framepacer:setOverlayConfig` | `electron/main.js:1958` | `setOverlayConfig() (electron/services/FramePacerOverlay.js)` | _nao usado_ |
| `framepacer.start` | `framepacer:start` | `electron/main.js:1924` | `FramePacerEngine.start (electron/services/FramePacerEngine.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.stop` | `framepacer:stop` | `electron/main.js:1928` | `FramePacerEngine.stop (electron/services/FramePacerEngine.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.toggleOverlay` | `framepacer:toggleOverlay` | `electron/main.js:1950` | `toggleFramePacerOverlay() (electron/services/FramePacerOverlay.js)` | `src/pages/FramePacer.tsx` |
| `framepacer.updateConfig` | `framepacer:updateConfig` | `electron/main.js:1932` | `FramePacerEngine.updateConfig (electron/services/FramePacerEngine.js)` | `src/pages/FramePacer.tsx` |
| `fs.readFile` | `fs:readFile` | `electron/main.js:3456` |  | `src/pages/TextEditor.tsx`<br>`src/pages/TextSummarizer.tsx` |
| `fs.writeFile` | `fs:writeFile` | `electron/main.js:3468` | `hotkey.trim`<br>`globalShortcut.unregister`<br>`globalShortcut.register` | `src/pages/TextEditor.tsx` |
| `getTrace` | `dev:getTrace` | **sem handler** |  | _nao usado_ |
| `hardware.onUpdate` | `hardware:update` | _evento main->tela_ |  | `src/hooks/useSystemMetrics.ts` |
| `hardware.startPolling` | `hardware:startPolling` | `electron/services/HardwareService.js:51` | `hookedSenders.has`<br>`hookedSenders.add`<br>`sender.once` | `src/hooks/useSystemMetrics.ts` |
| `hardware.stopPolling` | `hardware:stopPolling` | `electron/services/HardwareService.js:69` | `perSender.get`<br>`perSender.set`<br>`perSender.delete` | `src/hooks/useSystemMetrics.ts` |
| `hwsensors.setEnabled` | `hwsensors:setEnabled` | `electron/ipc/hwSensorsIpc.js:18` | `SensorBus.setAdvanced (electron/hal/collectors/SensorBus.js)`<br>`HwSensorsDaemon.status (electron/hal/collectors/HwSensorsDaemon.js)`<br>`isPawnIoInstalled() (electron/hal/collectors/HwSensorsDaemon.js)` | _nao usado_ |
| `hwsensors.status` | `hwsensors:status` | `electron/ipc/hwSensorsIpc.js:15` | `HwSensorsDaemon.status (electron/hal/collectors/HwSensorsDaemon.js)` | `src/components/monitor/AdvancedSensorsPanel.tsx` |
| `injector.inject` | `injector:inject` | `electron/main.js:1869` | `i.test`<br>`dllPath.trim`<br>`stdout.includes` | `src/pages/DllInjector.tsx` |
| `latency.boostNow` | `latency:boostNow` | `electron/latencyGuardian.js:1175` |  | `src/pages/UltraLowLatency.tsx` |
| `latency.disableUltra` | `latency:disableUltra` | `electron/latencyGuardian.js:1156` |  | `src/pages/UltraLowLatency.tsx` |
| `latency.enableUltra` | `latency:enableUltra` | `electron/latencyGuardian.js:1111` |  | `src/pages/UltraLowLatency.tsx` |
| `latency.enableUltraStable` | `latency:enableUltraStable` | `electron/latencyGuardian.js:1121` |  | `src/pages/UltraLowLatency.tsx` |
| `latency.getConfig` | `latency:getConfig` | `electron/latencyGuardian.js:1043` | `nativeLatencyClient.queryTimer (electron/services/NativeLatencyClient.js)` | `src/components/GuardianWidget.tsx`<br>`src/pages/UltraLowLatency.tsx` |
| `latency.getCpuTopology` | `latency:getCpuTopology` | `electron/latencyGuardian.js:1064` | `nativeLatencyClient.getCpuTopology (electron/services/NativeLatencyClient.js)` | _nao usado_ |
| `latency.launchGameWithProfile` | `latency:launchGameWithProfile` | `electron/latencyGuardian.js:1220` | `argsArray.map`<br>`pingHost.trim`<br>`proc.once` | `src/pages/Library.tsx` |
| `latency.queryTimer` | `latency:queryTimer` | `electron/latencyGuardian.js:1055` | `nativeLatencyClient.queryTimer (electron/services/NativeLatencyClient.js)` | _nao usado_ |
| `latency.setConfig` | `latency:setConfig` | `electron/latencyGuardian.js:1073` |  | `src/components/GuardianWidget.tsx`<br>`src/pages/UltraLowLatency.tsx` |
| `latency.toggleUltra` | `latency:toggleUltra` | `electron/latencyGuardian.js:1165` |  | _nao usado_ |
| `library.discover` | `library:discover` | `electron/main.js:1459` | `content.matchAll`<br>`steamPaths.push`<br>`steamPaths.map` | `src/pages/Library.tsx` |
| `library.fetchCover` | `library:fetchCover` | `electron/main.js:1395` | `service.fetchCover`<br>`i.test`<br>`folder.startsWith` | `src/components/library/GameCard.tsx` |
| `library.list` | `library:list` | `electron/main.js:1332` | `webContents.send` | `src/pages/Library.tsx`<br>`src/pages/OptiScalerManager.tsx` |
| `library.onActivityLogged` | `library:activityLogged` | _evento main->tela_ |  | `src/hooks/useRecentActivity.ts` |
| `library.onGameStarted` | `library:gameStarted` | _evento main->tela_ |  | `src/hooks/useRecentActivity.ts` |
| `library.onGameStopped` | `library:gameStopped` | _evento main->tela_ |  | `src/hooks/useRecentActivity.ts` |
| `library.onUpdated` | `library:updated` | _evento main->tela_ |  | `src/pages/Library.tsx` |
| `library.remove` | `library:remove` | `electron/main.js:1380` |  | `src/pages/Library.tsx`<br>`src/pages/OptiScalerManager.tsx` |
| `library.upsert` | `library:upsert` | `electron/main.js:1344` |  | `src/components/library/GameCard.tsx`<br>`src/pages/Library.tsx`<br>`src/pages/OptiScalerManager.tsx` |
| `library.upsertBulk` | `library:upsertBulk` | `electron/main.js:1362` |  | `src/pages/Library.tsx` |
| `metadata.read` | `metadata:read` | `electron/main.js:3812` | `exifr.parse`<br>`exiftool.read` | `src/pages/MetaDataEditor.tsx` |
| `metadata.remove` | `metadata:remove` | `electron/main.js:3829` | `exiftool.write` | `src/pages/MetaDataEditor.tsx` |
| `metadata.update` | `metadata:update` | `electron/main.js:3849` | `exiftool.write`<br>`WINGET_ID_RE.test`<br>`id.trim` | `src/pages/MetaDataEditor.tsx` |
| `network.adapterInfo` | `network:adapterInfo` | `electron/networkIPC.js:138` | `lines.push`<br>`lines.join` | `src/pages/NetworkTools.tsx` |
| `network.dnsInfo` | `network:dnsInfo` | `electron/networkIPC.js:120` |  | `src/pages/NetworkTools.tsx` |
| `network.flushDns` | `network:flushDns` | `electron/networkIPC.js:107` |  | `src/pages/NetworkTools.tsx` |
| `network.ping` | `network:ping` | `electron/networkIPC.js:30` | `output.match`<br>`runCommand() (electron/services/PowerShellRunner.js)` | `src/pages/NetworkTools.tsx` |
| `network.portScan` | `network:portScan` | `electron/networkIPC.js:50` | `net.Socket`<br>`socket.setTimeout`<br>`socket.on` | `src/pages/NetworkTools.tsx` |
| `network.renewIp` | `network:renewIp` | `electron/networkIPC.js:152` |  | `src/pages/NetworkTools.tsx` |
| `network.resetTcp` | `network:resetTcp` | `electron/networkIPC.js:111` |  | `src/pages/NetworkTools.tsx` |
| `network.tracert` | `network:tracert` | `electron/networkIPC.js:124` | `runCommand() (electron/services/PowerShellRunner.js)` | `src/pages/NetworkTools.tsx` |
| `ocr.extractText` | `ocr:extractText` | `electron/main.js:2746` | `base64Data.replace`<br>`worker.recognize`<br>`worker.terminate` | `src/pages/ImageTextExtractor.tsx` |
| `onIpcTrace` | `dev:ipcTrace` | _evento main->tela_ |  | _nao usado_ |
| `optimizer.advancedNetworkApply` | `optimizer:advancedNetworkApply` | `electron/main.js:2036` | `NetworkEngine.advancedNetworkApply (electron/services/optimizer/NetworkEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.advancedNetworkRevert` | `optimizer:advancedNetworkRevert` | `electron/main.js:2037` | `NetworkEngine.advancedNetworkRevert (electron/services/optimizer/NetworkEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.analyze` | `optimizer:analyze` | `electron/main.js:894` | `SystemOptimizerService.analyze (electron/services/optimizer/SystemOptimizerService.js)` | _nao usado_ |
| `optimizer.applyCpuUnpark` | `optimizer:applyCpuUnpark` | `electron/main.js:2215` | `SystemEngine.applyCpuUnpark (electron/services/optimizer/SystemEngine.js)` | _nao usado_ |
| `optimizer.applyDefenderControl` | `optimizer:applyDefenderControl` | `electron/main.js:2191` | `DefenderControlEngine.runNativeDefenderControl (electron/services/optimizer/DefenderControlEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.applyDns` | `optimizer:applyDns` | `electron/main.js:2080` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.applyExtremeKernelMod` | `optimizer:applyExtremeKernelMod` | `electron/main.js:2203` | `SystemEngine.applyExtremeKernelMod (electron/services/optimizer/SystemEngine.js)` | _nao usado_ |
| `optimizer.applyExtremeNetworkMod` | `optimizer:applyExtremeNetworkMod` | `electron/main.js:2212` | `SystemEngine.applyExtremeNetworkMod (electron/services/optimizer/SystemEngine.js)` | _nao usado_ |
| `optimizer.applyMsiMode` | `optimizer:applyMsiMode` | `electron/main.js:2200` | `SystemEngine.applyMsiMode (electron/services/optimizer/SystemEngine.js)` | _nao usado_ |
| `optimizer.applyTweak` | `optimizer:applyTweak` | `electron/main.js:2040` | `MemoryEngine.optimizeRAM (electron/services/optimizer/MemoryEngine.js)`<br>`StorageEngine.cleanTempFiles (electron/services/optimizer/StorageEngine.js)`<br>`SystemEngine.repairWindows (electron/services/optimizer/SystemEngine.js)` | `src/pages/Dashboard.tsx` |
| `optimizer.checkIsAdmin` | `optimizer:checkIsAdmin` | `electron/main.js:909` | `SystemOptimizerService.checkIsAdmin (electron/services/optimizer/SystemOptimizerService.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.checkOperationsStatus` | `optimizer:checkOperationsStatus` | `electron/main.js:890` | `SystemOptimizerService.checkOperationsStatus (electron/services/optimizer/SystemOptimizerService.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.createRestorePoint` | `optimizer:createRestorePoint` | `electron/main.js:913` | `SystemEngine.createRestorePoint (electron/services/optimizer/SystemEngine.js)` | `src/pages/Dashboard.tsx`<br>`src/pages/Optimizer.tsx` |
| `optimizer.deepTweaksAnalyze` | `optimizer:deepTweaksAnalyze` | `electron/main.js:2053` | `DeepTweaksEngine.listTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`ids.includes`<br>`selected.flatMap` | _nao usado_ |
| `optimizer.deepTweaksApply` | `optimizer:deepTweaksApply` | `electron/main.js:2059` | `DeepTweaksEngine.applyTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` | `src/pages/Optimizer.tsx` |
| `optimizer.deepTweaksList` | `optimizer:deepTweaksList` | `electron/main.js:2039` | `DeepTweaksEngine.listTweaks (electron/services/optimizer/DeepTweaksEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.deepTweaksRevert` | `optimizer:deepTweaksRevert` | `electron/main.js:2060` | `DeepTweaksEngine.revertTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` | `src/pages/Optimizer.tsx` |
| `optimizer.deepTweaksStatus` | `optimizer:deepTweaksStatus` | `electron/main.js:2052` | `DeepTweaksEngine.checkTweaksStatus (electron/services/optimizer/DeepTweaksEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.deepTweaksUndo` | `optimizer:deepTweaksUndo` | `electron/main.js:2061` | `DeepTweaksEngine.undoTweaks (electron/services/optimizer/DeepTweaksEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.disableService` | `optimizer:disableService` | `electron/main.js:2020` | `AppManagerEngine.disableService (electron/services/optimizer/AppManagerEngine.js)` | _nao usado_ |
| `optimizer.disableStartupItem` | `optimizer:disableStartupItem` | `electron/main.js:2018` | `AppManagerEngine.disableStartupItem (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.dnsBenchmark` | `optimizer:dnsBenchmark` | `electron/main.js:2090` | `DnsEngine.benchmark (electron/services/optimizer/DnsEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getAuditLog` | `optimizer:getAuditLog` | `electron/main.js:917` | `runCommand() (electron/services/PowerShellRunner.js)`<br>`runPowerShell() (electron/services/PowerShellRunner.js)`<br>`stripBom() (electron/services/PowerShellRunner.js)` | _nao usado_ |
| `optimizer.getDefenderControlStatus` | `optimizer:getDefenderControlStatus` | `electron/main.js:2188` | `DefenderControlEngine.getStatus (electron/services/optimizer/DefenderControlEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getDnsState` | `optimizer:getDnsState` | `electron/main.js:2071` | `DnsEngine.getState (electron/services/optimizer/DnsEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getGpuInfo` | `optimizer:getGpuInfo` | `electron/main.js:2030` | `AppManagerEngine.getGpuInfo (electron/services/optimizer/AppManagerEngine.js)` | `src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Optimizer.tsx` |
| `optimizer.getGpuPreferences` | `optimizer:getGpuPreferences` | `electron/main.js:2027` | `AppManagerEngine.getGpuPreferences (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getHagsStatus` | `optimizer:getHagsStatus` | `electron/main.js:2031` | `AppManagerEngine.getHagsStatus (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getInstalledPrograms` | `optimizer:getInstalledPrograms` | `electron/main.js:2021` | `AppManagerEngine.getInstalledPrograms (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getRunningProcesses` | `optimizer:getRunningProcesses` | `electron/main.js:2025` | `AppManagerEngine.getRunningProcesses (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.getServices` | `optimizer:getServices` | `electron/main.js:2019` | `AppManagerEngine.getServices (electron/services/optimizer/AppManagerEngine.js)` | _nao usado_ |
| `optimizer.getStartupItems` | `optimizer:getStartupItems` | `electron/main.js:2017` | `AppManagerEngine.getStartupItems (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.globalRecommendedTweaks` | `optimizer:globalRecommendedTweaks` | `electron/main.js:2062` | `DeepTweaksEngine.applyRecommended (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` | _nao usado_ |
| `optimizer.listBloatware` | `optimizer:listBloatware` | `electron/main.js:2023` | `AppManagerEngine.listBloatware (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.listOperations` | `optimizer:listOperations` | `electron/main.js:886` | `SystemOptimizerService.listOperations (electron/services/optimizer/SystemOptimizerService.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.listProfiles` | `optimizer:listProfiles` | `electron/main.js:905` | `SystemOptimizerService.listProfiles (electron/services/optimizer/SystemOptimizerService.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.onRunEvent` | `optimizer:runEvent` | _evento main->tela_ |  | `src/hooks/useOptimizerProgress.ts`<br>`src/pages/Optimizer.tsx` |
| `optimizer.openTamperSettings` | `optimizer:openTamperSettings` | `electron/main.js:2197` | `DefenderControlEngine.openTamperSettings (electron/services/optimizer/DefenderControlEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.removeGpuPreference` | `optimizer:removeGpuPreference` | `electron/main.js:2029` | `AppManagerEngine.removeGpuPreference (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.removeSelectedBloatware` | `optimizer:removeSelectedBloatware` | `electron/main.js:2024` | `AppManagerEngine.removeSelectedBloatware (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.restoreImageDefender` | `optimizer:restoreImageDefender` | `electron/main.js:2194` | `DefenderControlEngine.restoreImageDefender (electron/services/optimizer/DefenderControlEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.revertExtremeKernelMod` | `optimizer:revertExtremeKernelMod` | `electron/main.js:2206` | `SystemEngine.revertExtremeKernelMod (electron/services/optimizer/SystemEngine.js)` | _nao usado_ |
| `optimizer.revertHags` | `optimizer:revertHags` | `electron/main.js:2033` | `AppManagerEngine.revertHags (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.revertServicesTweak` | `optimizer:revertServicesTweak` | `electron/main.js:2209` | `ServicesEngine.revertServicesTweak (electron/services/optimizer/ServicesEngine.js)` | _nao usado_ |
| `optimizer.run` | `optimizer:run` | `electron/main.js:898` | `sender.send`<br>`SystemOptimizerService.runTasks (electron/services/optimizer/SystemOptimizerService.js)` | `src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Optimizer.tsx` |
| `optimizer.runRoutine` | `optimizer:runRoutine` | `electron/main.js:2100` | `sender.send`<br>`routineId.startsWith`<br>`routineId.split` | _nao usado_ |
| `optimizer.setDnsServers` | `optimizer:setDnsServers` | `electron/main.js:2076` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` | _nao usado_ |
| `optimizer.setGpuPreference` | `optimizer:setGpuPreference` | `electron/main.js:2028` | `AppManagerEngine.setGpuPreference (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.setHagsStatus` | `optimizer:setHagsStatus` | `electron/main.js:2032` | `AppManagerEngine.setHagsStatus (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.setProcessPriority` | `optimizer:setProcessPriority` | `electron/main.js:2026` | `AppManagerEngine.setProcessPriority (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.undoDns` | `optimizer:undoDns` | `electron/main.js:2085` | `DnsEngine.undo (electron/services/optimizer/DnsEngine.js)` | `src/pages/Optimizer.tsx` |
| `optimizer.uninstallProgram` | `optimizer:uninstallProgram` | `electron/main.js:2022` | `AppManagerEngine.uninstallProgram (electron/services/optimizer/AppManagerEngine.js)` | _nao usado_ |
| `optimizer.uninstallProgramWithLeftovers` | `optimizer:uninstallProgramWithLeftovers` | `electron/main.js:2035` | `AppManagerEngine.uninstallProgramWithLeftovers (electron/services/optimizer/AppManagerEngine.js)` | `src/pages/Optimizer.tsx` |
| `optiscaler.analyze` | `optiscaler:analyze` | `electron/optiscalerManager.js:1226` |  | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.apply` | `optiscaler:apply` | `electron/optiscalerManager.js:1234` |  | `src/pages/Library.tsx`<br>`src/pages/OptiScalerManager.tsx` |
| `optiscaler.checkUpdate` | `optiscaler:checkUpdate` | `electron/optiscalerManager.js:1274` | `i.test`<br>`fetchJson() (electron/services/SecureDownload.js)`<br>`assetSha256() (electron/services/SecureDownload.js)` | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.createManualBackup` | `optiscaler:createManualBackup` | `electron/optiscalerManager.js:1266` |  | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.deleteBackup` | `optiscaler:deleteBackup` | `electron/optiscalerManager.js:1258` |  | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.downloadUpdate` | `optiscaler:downloadUpdate` | `electron/optiscalerManager.js:1287` |  | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.listBackups` | `optiscaler:listBackups` | `electron/optiscalerManager.js:1242` |  | `src/pages/OptiScalerManager.tsx` |
| `optiscaler.restoreBackup` | `optiscaler:restoreBackup` | `electron/optiscalerManager.js:1250` |  | `src/pages/OptiScalerManager.tsx` |
| `pge.openPortable` | `pge:openPortable` | `electron/main.js:1623` |  | `src/layouts/MainLayout.tsx`<br>`src/pages/Home.tsx` |
| `powershell.getPolicies` | `powershell:getPolicies` | `electron/ipc/powershellIpc.js:22` | `svc.getPolicies` | `src/pages/PowerShellTools.tsx` |
| `powershell.getSignature` | `powershell:getSignature` | `electron/ipc/powershellIpc.js:24` | `svc.getSignature` | _nao usado_ |
| `powershell.listScripts` | `powershell:listScripts` | `electron/ipc/powershellIpc.js:23` | `svc.listScripts` | `src/pages/PowerShellTools.tsx` |
| `powershell.openElevatedTerminal` | `powershell:openElevatedTerminal` | `electron/ipc/powershellIpc.js:26` | `svc.openElevatedTerminal` | `src/pages/PowerShellTools.tsx` |
| `powershell.runScript` | `powershell:runScript` | `electron/ipc/powershellIpc.js:25` | `svc.runScript` | `src/pages/PowerShellTools.tsx` |
| `realtime.clamavInstall` | `realtime:clamavInstall` | `electron/ipc/realtimeIpc.js:115` | `clamav.install`<br>`clamav.update`<br>`clamav.status` | _nao usado_ |
| `realtime.clamavUpdate` | `realtime:clamavUpdate` | `electron/ipc/realtimeIpc.js:121` | `clamav.update`<br>`clamav.status` | _nao usado_ |
| `realtime.onEvent` | `realtime:event` | _evento main->tela_ |  | `src/pages/Realtime.tsx` |
| `realtime.quarantineDelete` | `realtime:quarantineDelete` | `electron/ipc/realtimeIpc.js:114` | `quarantine.remove` | _nao usado_ |
| `realtime.quarantineList` | `realtime:quarantineList` | `electron/ipc/realtimeIpc.js:106` | `quarantine.list` | `src/pages/Realtime.tsx` |
| `realtime.quarantineRestore` | `realtime:quarantineRestore` | `electron/ipc/realtimeIpc.js:107` | `quarantine.list`<br>`quarantine.restore`<br>`store.update` | _nao usado_ |
| `realtime.scanFiles` | `realtime:scanFiles` | `electron/ipc/realtimeIpc.js:122` | `protection.scanNow`<br>`optimizer.stop`<br>`protection.stop` | _nao usado_ |
| `realtime.setConfig` | `realtime:setConfig` | `electron/ipc/realtimeIpc.js:105` | `store.update` | `src/pages/Realtime.tsx` |
| `realtime.status` | `realtime:status` | `electron/ipc/realtimeIpc.js:104` |  | `src/pages/Realtime.tsx` |
| `security.auditTracking` | `security:auditTracking` | `electron/main.js:3257` | `custom.map`<br>`content.split`<br>`l.trim` | `src/pages/AdvancedSecurity.tsx` |
| `security.blockTracking` | `security:blockTracking` | `electron/main.js:3364` | `custom.map`<br>`d.toLowerCase`<br>`content.split` | `src/pages/AdvancedSecurity.tsx` |
| `security.checkRansomwareArmor` | `security:checkRansomwareArmor` | `electron/services/SecurityService.js:67` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.disablePhishingShield` | `security:disablePhishingShield` | `electron/services/SecurityService.js:55` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.enablePhishingShield` | `security:enablePhishingShield` | `electron/services/SecurityService.js:51` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.enableRansomwareArmor` | `security:enableRansomwareArmor` | `electron/services/SecurityService.js:71` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.getCommunityRules` | `security:getCommunityRules` | `electron/services/SecurityService.js:75` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.getLiveNetworkConnections` | `security:getLiveNetworkConnections` | `electron/services/SecurityService.js:63` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.getPhishingShieldStatus` | `security:getPhishingShieldStatus` | `electron/services/SecurityService.js:59` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.getSecurityScore` | `security:getSecurityScore` | `electron/main.js:3253` |  | `src/hooks/useSecurityScore.ts` |
| `security.getTrackingDomains` | `security:getTrackingDomains` | `electron/main.js:3307` | `custom.map`<br>`HOSTNAME_RE.test` | `src/pages/AdvancedSecurity.tsx` |
| `security.importCommunityRules` | `security:importCommunityRules` | `electron/services/SecurityService.js:79` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.killProcess` | `security:killProcess` | `electron/main.js:3443` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.optimizeLatency` | `security:optimizeLatency` | `electron/main.js:3432` | `runPowerShell() (electron/services/PowerShellRunner.js)` | _nao usado_ |
| `security.resetCommunityRules` | `security:resetCommunityRules` | `electron/services/SecurityService.js:83` | `promises.stat`<br>`entropyCache.has`<br>`entropyCache.get` | `src/pages/AdvancedSecurity.tsx` |
| `security.scanMalware` | `security:scanMalware` | `electron/main.js:3125` | `si.processes`<br>`safeRegex.test`<br>`reason.push` | _nao usado_ |
| `security.scanProcesses` | `security:scanProcesses` | `electron/services/SecurityService.js:43` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.scanUrl` | `security:scanUrl` | `electron/services/SecurityService.js:47` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.setCustomTrackingDomains` | `security:setCustomTrackingDomains` | `electron/main.js:3351` |  | `src/pages/AdvancedSecurity.tsx` |
| `security.unblockTracking` | `security:unblockTracking` | `electron/main.js:3416` |  | `src/pages/AdvancedSecurity.tsx` |
| `settings.getConfig` | `settings:getConfig` | `electron/main.js:1699` | `loadPersistedConfig() (electron/configManager.js)` | `src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Settings.tsx` |
| `settings.updateLiveServices` | `settings:updateLiveServices` | `electron/main.js:1756` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` | `src/pages/Settings.tsx` |
| `settings.updateStartupBehavior` | `settings:updateStartupBehavior` | `electron/main.js:1799` | `runPowerShell() (electron/services/PowerShellRunner.js)`<br>`stripBom() (electron/services/PowerShellRunner.js)`<br>`loadPersistedConfig() (electron/configManager.js)` | `src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Settings.tsx` |
| `settings.updateTelemetry` | `settings:updateTelemetry` | `electron/main.js:1728` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` | `src/pages/Settings.tsx` |
| `settings.updateWindowBehavior` | `settings:updateWindowBehavior` | `electron/main.js:1780` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` | `src/pages/Settings.tsx` |
| `setup.detectHardware` | `setup:detectHardware` | `electron/main.js:3996` | `si.cpu`<br>`si.graphics`<br>`si.baseboard` | `src/pages/SetupHub.tsx` |
| `setup.installWinget` | `setup:installWinget` | `electron/main.js:3929` | `sender.isDestroyed`<br>`sender.send`<br>`appIds.map` | `src/pages/SetupHub.tsx` |
| `setup.onInstallProgress` | `setup:installProgress` | _evento main->tela_ |  | `src/pages/SetupHub.tsx` |
| `share.cancel` | `share:cancel` | `electron/ipc/shareIpc.js:139` | `jobs.get` | _nao usado_ |
| `share.capture` | `share:capture` | `electron/ipc/shareIpc.js:154` |  | _nao usado_ |
| `share.copy` | `share:copy` | `electron/ipc/shareIpc.js:148` | `s.startsWith`<br>`clipboard.writeText` | _nao usado_ |
| `share.onEvent` | `share:event` | _evento main->tela_ |  | `src/pages/Share.tsx` |
| `share.openFolder` | `share:openFolder` | `electron/ipc/shareIpc.js:155` |  | _nao usado_ |
| `share.pickAndUpload` | `share:pickAndUpload` | `electron/ipc/shareIpc.js:125` | `results.push` | _nao usado_ |
| `share.recentShots` | `share:recentShots` | `electron/ipc/shareIpc.js:162` | `i.test`<br>`globalShortcut.unregister` | `src/pages/Share.tsx` |
| `share.remove` | `share:delete` | `electron/ipc/shareIpc.js:140` | `history.find`<br>`client.remove`<br>`i.test` | _nao usado_ |
| `share.setConfig` | `share:setConfig` | `electron/ipc/shareIpc.js:117` |  | _nao usado_ |
| `share.state` | `share:state` | `electron/ipc/shareIpc.js:116` |  | `src/pages/Share.tsx` |
| `share.uploadFiles` | `share:uploadPaths` | `electron/ipc/shareIpc.js:133` | `results.push` | _nao usado_ |
| `share.uploadScreenshot` | `share:uploadFile` | `electron/ipc/shareIpc.js:156` |  | _nao usado_ |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1559` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString` | `src/pages/Dashboard.tsx`<br>`src/pages/Dlss5Manager.tsx`<br>`src/pages/Share.tsx` |
| `system.enableProcessTracking` | `system:enableProcessTracking` | `electron/main.js:1040` |  | `src/pages/SystemMonitor.tsx` |
| `system.getAdvancedHardware` | `system:getAdvancedHardware` | `electron/main.js:1054` | `si.graphics`<br>`si.baseboard`<br>`si.bios` | _nao usado_ |
| `system.getBios` | `system:getBios` | `electron/main.js:1112` | `si.baseboard`<br>`si.bios` | `src/components/DetailedHardwareInfo.tsx` |
| `system.getDeepCategory` | `system:getDeepCategory` | `electron/main.js:1033` | `DeepHardwareService.getCategory (electron/services/DeepHardwareService.js)` | _nao usado_ |
| `system.getDeepHardwareInfo` | `system:getDeepHardwareInfo` | `electron/main.js:1029` | `DeepHardwareService.getDeepInfo (electron/services/DeepHardwareService.js)` | _nao usado_ |
| `system.getGraphics` | `system:getGraphics` | `electron/main.js:1101` | `si.graphics` | `src/components/DetailedHardwareInfo.tsx` |
| `system.getInfo` | `system:getInfo` | `electron/main.js:971` | `cpuModel.includes`<br>`si.cpu`<br>`runCommand() (electron/services/PowerShellRunner.js)` | `src/components/DetailedHardwareInfo.tsx`<br>`src/pages/Home.tsx` |
| `system.getJunkEstimate` | `system:getJunkEstimate` | `electron/main.js:1324` |  | `src/hooks/useJunkScanner.ts` |
| `system.getLatency` | `system:getLatency` | `electron/main.js:1143` |  | _nao usado_ |
| `system.getLiveStats` | `system:getLiveStats` | `electron/main.js:1844` | `liveCpu.sample` | `src/components/darkos/DarkOSSystemPanel.tsx` |
| `system.getMemory` | `system:getMemory` | `electron/main.js:1839` |  | `src/pages/Home.tsx` |
| `system.getMetrics` | `system:getMetrics` | `electron/main.js:1219` | `si.networkStats`<br>`si.fsStats` | _nao usado_ |
| `system.getNetwork` | `system:getNetwork` | `electron/main.js:1282` | `si.networkInterfaces`<br>`si.networkStats` | _nao usado_ |
| `system.getSnapshot` | `system:getSnapshot` | `electron/main.js:882` | `HardwareHAL.getSnapshot (electron/hal/HardwareHAL.js)` | _nao usado_ |
| `system.getStorage` | `system:getStorage` | `electron/main.js:1309` | `si.fsSize` | `src/components/DetailedHardwareInfo.tsx` |
| `system.getTemperatures` | `system:getTemperatures` | `electron/main.js:1135` | `si.sensorsTemperatures` | `src/components/DetailedHardwareInfo.tsx` |
| `system.runBenchmark` | `system:runBenchmark` | `electron/main.js:1147` | `hrtime.bigint`<br>`parentPort.postMessage`<br>`mops.toFixed` | `src/pages/SystemMonitor.tsx` |
| `telemetry.testBugReport` | `telemetry:testBugReport` | `electron/main.js:1902` |  | _nao usado_ |
| `updater.check` | `updater:check` | `electron/services/UpdateService.js:357` |  | `src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Settings.tsx` |
| `updater.download` | `updater:download` | `electron/services/UpdateService.js:358` |  | `src/components/UpdaterOverlay.tsx`<br>`src/components/darkos/DarkOSSystemPanel.tsx` |
| `updater.getStatus` | `updater:getStatus` | `electron/services/UpdateService.js:351` |  | `src/components/UpdaterOverlay.tsx`<br>`src/components/darkos/DarkOSSystemPanel.tsx`<br>`src/pages/Settings.tsx` |
| `updater.install` | `updater:install` | `electron/services/UpdateService.js:359` | `webContents.send` | `src/components/UpdaterOverlay.tsx`<br>`src/components/darkos/DarkOSSystemPanel.tsx` |
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
| `vault.add` | `vault:add` | `electron/main.js:2979` | `crypto.randomUUID` | `src/pages/PasswordManager.tsx` |
| `vault.changeMasterPassword` | `vault:changeMasterPassword` | `electron/main.js:3055` | `buildKdf() (electron/vaultCrypto.js)`<br>`unwrapVaultKeyWithPassword() (electron/vaultCrypto.js)`<br>`wrapVaultKeyWithPassword() (electron/vaultCrypto.js)` | _nao usado_ |
| `vault.copyPassword` | `vault:copyPassword` | `electron/main.js:3042` | `clipboard.writeText`<br>`clipboard.readText`<br>`clipboard.clear` | `src/pages/PasswordManager.tsx` |
| `vault.export` | `vault:export` | `electron/main.js:3099` |  | `src/pages/PasswordManager.tsx` |
| `vault.import` | `vault:import` | `electron/main.js:3108` |  | `src/pages/PasswordManager.tsx` |
| `vault.init` | `vault:init` | `electron/main.js:2899` | `crypto.randomBytes`<br>`recoveryWords.join`<br>`buildKdf() (electron/vaultCrypto.js)` | `src/pages/PasswordManager.tsx` |
| `vault.list` | `vault:list` | `electron/main.js:2964` |  | `src/pages/PasswordManager.tsx` |
| `vault.lock` | `vault:lock` | `electron/main.js:2959` |  | `src/pages/PasswordManager.tsx` |
| `vault.regenerateRecoveryWords` | `vault:regenerateRecoveryWords` | `electron/main.js:3081` | `recoveryWords.join`<br>`buildKdf() (electron/vaultCrypto.js)`<br>`derivePasswordFromRecoveryWords() (electron/vaultCrypto.js)` | _nao usado_ |
| `vault.remove` | `vault:remove` | `electron/main.js:3025` |  | `src/pages/PasswordManager.tsx` |
| `vault.reveal` | `vault:reveal` | `electron/main.js:3034` |  | `src/pages/PasswordManager.tsx` |
| `vault.setAutoLockMinutes` | `vault:setAutoLockMinutes` | `electron/main.js:2894` |  | `src/pages/Settings.tsx` |
| `vault.status` | `vault:status` | `electron/main.js:2889` |  | `src/pages/PasswordManager.tsx` |
| `vault.unlock` | `vault:unlock` | `electron/main.js:2934` |  | `src/pages/PasswordManager.tsx` |
| `vault.unlockWithRecoveryWords` | `vault:unlockWithRecoveryWords` | `electron/main.js:2946` | `words.trim`<br>`derivePasswordFromRecoveryWords() (electron/vaultCrypto.js)` | `src/pages/PasswordManager.tsx` |
| `vault.update` | `vault:update` | `electron/main.js:3002` | `entries.findIndex`<br>`entries.slice` | _nao usado_ |
| `window.close` | `window:close` | `electron/main.js:4162` | `HardwareService.init (electron/services/HardwareService.js)`<br>`UpdateService.init (electron/services/UpdateService.js)`<br>`UpdateService.destroy (electron/services/UpdateService.js)` | `src/layouts/MainLayout.tsx` |
| `window.isMaximized` | `window:isMaximized` | `electron/main.js:4158` |  | _nao usado_ |
| `window.maximize` | `window:maximize` | `electron/main.js:4150` |  | `src/layouts/MainLayout.tsx` |
| `window.minimize` | `window:minimize` | `electron/main.js:4146` |  | `src/layouts/MainLayout.tsx` |
| `wintools.listFeatures` | `wintools:listFeatures` | `electron/ipc/winToolsIpc.js:11` | `engine.listFeatures` | `src/components/optimizer/WindowsToolsPanel.tsx` |
| `wintools.openPanel` | `wintools:openPanel` | `electron/ipc/winToolsIpc.js:14` | `engine.openPanel` | _nao usado_ |
| `wintools.run` | `wintools:run` | `electron/ipc/winToolsIpc.js:13` | `engine.run` | _nao usado_ |
| `wintools.setFeature` | `wintools:setFeature` | `electron/ipc/winToolsIpc.js:12` | `engine.setFeature` | _nao usado_ |
| `youtube.cancel` | `youtube:cancel` | `electron/main.js:2736` | `cancelActiveYtDlp() (electron/ytdlp.js)` | `src/pages/YoutubeDownloader.tsx` |
| `youtube.download` | `youtube:download` | `electron/main.js:2607` | `cookiesPath.trim`<br>`cookiesFromBrowser.trim`<br>`userAgent.trim` | `src/i18n/messages.ts`<br>`src/pages/YoutubeDownloader.tsx` |
| `youtube.getVideoInfo` | `youtube:getVideoInfo` | `electron/main.js:2495` | `cookiesPath.trim`<br>`cookiesFromBrowserRaw.trim`<br>`userAgentRaw.trim` | `src/pages/YoutubeDownloader.tsx` |
| `youtube.onProgress` | `youtube:downloadProgress` | _evento main->tela_ |  | `src/pages/YoutubeDownloader.tsx` |
