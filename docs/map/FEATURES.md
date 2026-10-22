<!-- GERADO por electron_feature_map.py em 2026-10-21T21:31:42. NAO edite a mao: rode `npm run map`. -->

# Mapa de funcionalidades (tela -> IPC -> backend)
Fluxo: `src/pages/*.tsx` chama `window.darkhub.<ns>.<metodo>()` -> `electron/preload.js` -> canal IPC -> handler -> servico.

## Diagnostics & Hardware

### Driver Center  (rota `driver`)
- Tela: `src/pages/DriverCenter.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/driverIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `driver.cameraStatus` | `driver:cameraStatus` | `electron/ipc/driverIpc.js:24` | `svc.cameraStatus` |
| `driver.detect` | `driver:detect` | `electron/ipc/driverIpc.js:22` | `svc.detectAdapters` |
| `driver.openOfficial` | `driver:openOfficial` | `electron/ipc/driverIpc.js:31` | `svc.resolveOfficialUrl` |
| `driver.repairCamera` | `driver:repairCamera` | `electron/ipc/driverIpc.js:27` | `svc.repairCamera`<br>`darkos.revertChange` |

### System Monitor  (rota `monitor`)
- Tela: `src/pages/SystemMonitor.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/library/Sparkline.tsx`, `src/components/monitor/AdvancedSensorsPanel.tsx`, `src/components/monitor/LhmSensorTree.tsx`, `src/components/ui/PageHeader.tsx`, `src/hooks/useDeepHardware.ts`, `src/hooks/useSensorHistory.ts`, `src/hooks/useSystemMetrics.ts`
- Arquivos de backend: `electron/hal/HardwareHAL.js`, `electron/hal/collectors/HwSensorsDaemon.js`, `electron/ipc/hwSensorsIpc.js`, `electron/main.js`, `electron/services/HardwareService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `app.getResourceUsage` | `app:getResourceUsage` | `electron/main.js:1619` | `metrics.map`<br>`processes.reduce` |
| `hardware.onUpdate` | `hardware:update` | `nao encontrado` |  |
| `hardware.startPolling` | `hardware:startPolling` | `electron/services/HardwareService.js:51` | `hookedSenders.has`<br>`hookedSenders.add`<br>`sender.once`<br>`hookedSenders.delete` |
| `hardware.stopPolling` | `hardware:stopPolling` | `electron/services/HardwareService.js:69` | `perSender.get`<br>`perSender.set`<br>`perSender.delete`<br>`HAL.getSnapshot (electron/hal/HardwareHAL.js)` |
| `hwsensors.status` | `hwsensors:status` | `electron/ipc/hwSensorsIpc.js:15` | `HwSensorsDaemon.status (electron/hal/collectors/HwSensorsDaemon.js)` |
| `system.enableProcessTracking` | `system:enableProcessTracking` | `electron/main.js:1027` |  |
| `system.runBenchmark` | `system:runBenchmark` | `electron/main.js:1134` | `hrtime.bigint`<br>`parentPort.postMessage`<br>`mops.toFixed`<br>`ms.toFixed` |

### Network & Latency  (rota `networktools`)
- Tela: `src/pages/NetworkTools.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/networkIPC.js`, `electron/services/PowerShellRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `network.adapterInfo` | `network:adapterInfo` | `electron/networkIPC.js:138` | `lines.push`<br>`lines.join` |
| `network.dnsInfo` | `network:dnsInfo` | `electron/networkIPC.js:120` |  |
| `network.flushDns` | `network:flushDns` | `electron/networkIPC.js:107` |  |
| `network.ping` | `network:ping` | `electron/networkIPC.js:30` | `output.match`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `network.portScan` | `network:portScan` | `electron/networkIPC.js:50` | `net.Socket`<br>`socket.setTimeout`<br>`socket.on`<br>`socket.destroy` |
| `network.renewIp` | `network:renewIp` | `electron/networkIPC.js:152` |  |
| `network.resetTcp` | `network:resetTcp` | `electron/networkIPC.js:111` |  |
| `network.tracert` | `network:tracert` | `electron/networkIPC.js:124` | `runCommand() (electron/services/PowerShellRunner.js)` |

### Post-Install Hub  (rota `setuphub`)
- Tela: `src/pages/SetupHub.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/configManager.js`, `electron/machineMarker.js`, `electron/main.js`

| API | canal | handler | chama |
|---|---|---|---|
| `setup.detectHardware` | `setup:detectHardware` | `electron/main.js:3983` | `si.cpu`<br>`si.graphics`<br>`si.baseboard`<br>`si.memLayout` |
| `setup.installWinget` | `setup:installWinget` | `electron/main.js:3916` | `sender.isDestroyed`<br>`sender.send`<br>`appIds.map`<br>`id.startsWith` |
| `setup.onInstallProgress` | `setup:installProgress` | `nao encontrado` |  |

## Gaming & Performance

### DarkPacer (FPS Lock)  (rota `darkpacer`)
- Tela: `src/pages/FramePacer.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/FramePacerEngine.js`, `electron/services/FramePacerOverlay.js`

| API | canal | handler | chama |
|---|---|---|---|
| `framepacer.getMetrics` | `framepacer:getMetrics` | `electron/main.js:1923` | `FramePacerEngine.getMetrics (electron/services/FramePacerEngine.js)` |
| `framepacer.getOverlayStatus` | `framepacer:getOverlayStatus` | `electron/main.js:1949` | `getOverlayStatus() (electron/services/FramePacerOverlay.js)` |
| `framepacer.onMetrics` | `framepacer:metrics` | `nao encontrado` |  |
| `framepacer.setOverlayClickThrough` | `framepacer:setOverlayClickThrough` | `electron/main.js:1941` | `setOverlayClickThrough() (electron/services/FramePacerOverlay.js)` |
| `framepacer.start` | `framepacer:start` | `electron/main.js:1911` | `FramePacerEngine.start (electron/services/FramePacerEngine.js)` |
| `framepacer.stop` | `framepacer:stop` | `electron/main.js:1915` | `FramePacerEngine.stop (electron/services/FramePacerEngine.js)` |
| `framepacer.toggleOverlay` | `framepacer:toggleOverlay` | `electron/main.js:1937` | `toggleFramePacerOverlay() (electron/services/FramePacerOverlay.js)` |
| `framepacer.updateConfig` | `framepacer:updateConfig` | `electron/main.js:1919` | `FramePacerEngine.updateConfig (electron/services/FramePacerEngine.js)` |

### DLL Injector  (rota `dll-injector`)
- Tela: `src/pages/DllInjector.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/PowerShellRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `injector.inject` | `injector:inject` | `electron/main.js:1856` | `i.test`<br>`dllPath.trim`<br>`stdout.includes`<br>`stdout.trim` |

### DLSS 5 Manager  (rota `dlss5`)
- Tela: `src/pages/Dlss5Manager.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSConfirmDialog.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/dlss5/Dlss5Service.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1984` |  |
| `dlss5.apply` | `dlss5:apply` | `electron/services/dlss5/Dlss5Service.js:1555` | `sender.send`<br>`service.apply` |
| `dlss5.detectGpu` | `dlss5:detectGpu` | `electron/services/dlss5/Dlss5Service.js:1538` | `service.detectGpu` |
| `dlss5.getRecentGames` | `dlss5:getRecentGames` | `electron/services/dlss5/Dlss5Service.js:1582` | `service.getRecentGames` |
| `dlss5.getSteamGames` | `dlss5:getSteamGames` | `electron/services/dlss5/Dlss5Service.js:1529` | `service.getInstalledSteamGames` |
| `dlss5.onLog` | `dlss5:log` | `nao encontrado` |  |
| `dlss5.openFolder` | `dlss5:openFolder` | `electron/services/dlss5/Dlss5Service.js:1612` |  |
| `dlss5.revert` | `dlss5:revert` | `electron/services/dlss5/Dlss5Service.js:1568` | `sender.send`<br>`service.revert` |
| `dlss5.scanGame` | `dlss5:scanGame` | `electron/services/dlss5/Dlss5Service.js:1546` | `service.scanGameDirectory` |

### System Optimizer  (rota `optimizer`)
- Tela: `src/pages/Optimizer.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSOptimizerHint.tsx`, `src/components/icons/index.tsx`, `src/components/optimizer/WindowsToolsPanel.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/darkosIpc.js`, `electron/ipc/winToolsIpc.js`, `electron/main.js`, `electron/services/optimizer/AppManagerEngine.js`, `electron/services/optimizer/DeepTweaksEngine.js`, `electron/services/optimizer/DefenderControlEngine.js`, `electron/services/optimizer/DnsEngine.js`, `electron/services/optimizer/NetworkEngine.js`, `electron/services/optimizer/SystemEngine.js`, `electron/services/optimizer/SystemOptimizerService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `darkos.isDarkOS` | `darkos:isDarkOS` | `electron/ipc/darkosIpc.js:59` |  |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `optimizer.advancedNetworkApply` | `optimizer:advancedNetworkApply` | `electron/main.js:2023` | `NetworkEngine.advancedNetworkApply (electron/services/optimizer/NetworkEngine.js)` |
| `optimizer.advancedNetworkRevert` | `optimizer:advancedNetworkRevert` | `electron/main.js:2024` | `NetworkEngine.advancedNetworkRevert (electron/services/optimizer/NetworkEngine.js)` |
| `optimizer.applyDefenderControl` | `optimizer:applyDefenderControl` | `electron/main.js:2178` | `DefenderControlEngine.runNativeDefenderControl (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.applyDns` | `optimizer:applyDns` | `electron/main.js:2067` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.checkIsAdmin` | `optimizer:checkIsAdmin` | `electron/main.js:896` | `SystemOptimizerService.checkIsAdmin (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.checkOperationsStatus` | `optimizer:checkOperationsStatus` | `electron/main.js:877` | `SystemOptimizerService.checkOperationsStatus (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.createRestorePoint` | `optimizer:createRestorePoint` | `electron/main.js:900` | `SystemEngine.createRestorePoint (electron/services/optimizer/SystemEngine.js)` |
| `optimizer.deepTweaksApply` | `optimizer:deepTweaksApply` | `electron/main.js:2046` | `DeepTweaksEngine.applyTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` |
| `optimizer.deepTweaksList` | `optimizer:deepTweaksList` | `electron/main.js:2026` | `DeepTweaksEngine.listTweaks (electron/services/optimizer/DeepTweaksEngine.js)` |
| `optimizer.deepTweaksRevert` | `optimizer:deepTweaksRevert` | `electron/main.js:2047` | `DeepTweaksEngine.revertTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` |
| `optimizer.deepTweaksStatus` | `optimizer:deepTweaksStatus` | `electron/main.js:2039` | `DeepTweaksEngine.checkTweaksStatus (electron/services/optimizer/DeepTweaksEngine.js)` |
| `optimizer.deepTweaksUndo` | `optimizer:deepTweaksUndo` | `electron/main.js:2048` | `DeepTweaksEngine.undoTweaks (electron/services/optimizer/DeepTweaksEngine.js)` |
| `optimizer.disableStartupItem` | `optimizer:disableStartupItem` | `electron/main.js:2005` | `AppManagerEngine.disableStartupItem (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.dnsBenchmark` | `optimizer:dnsBenchmark` | `electron/main.js:2077` | `DnsEngine.benchmark (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.getDefenderControlStatus` | `optimizer:getDefenderControlStatus` | `electron/main.js:2175` | `DefenderControlEngine.getStatus (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.getDnsState` | `optimizer:getDnsState` | `electron/main.js:2058` | `DnsEngine.getState (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.getGpuInfo` | `optimizer:getGpuInfo` | `electron/main.js:2017` | `AppManagerEngine.getGpuInfo (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getGpuPreferences` | `optimizer:getGpuPreferences` | `electron/main.js:2014` | `AppManagerEngine.getGpuPreferences (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getHagsStatus` | `optimizer:getHagsStatus` | `electron/main.js:2018` | `AppManagerEngine.getHagsStatus (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getInstalledPrograms` | `optimizer:getInstalledPrograms` | `electron/main.js:2008` | `AppManagerEngine.getInstalledPrograms (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getRunningProcesses` | `optimizer:getRunningProcesses` | `electron/main.js:2012` | `AppManagerEngine.getRunningProcesses (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getStartupItems` | `optimizer:getStartupItems` | `electron/main.js:2004` | `AppManagerEngine.getStartupItems (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.listBloatware` | `optimizer:listBloatware` | `electron/main.js:2010` | `AppManagerEngine.listBloatware (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.listOperations` | `optimizer:listOperations` | `electron/main.js:873` | `SystemOptimizerService.listOperations (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.listProfiles` | `optimizer:listProfiles` | `electron/main.js:892` | `SystemOptimizerService.listProfiles (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.onRunEvent` | `optimizer:runEvent` | `nao encontrado` |  |
| `optimizer.openTamperSettings` | `optimizer:openTamperSettings` | `electron/main.js:2184` | `DefenderControlEngine.openTamperSettings (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.removeGpuPreference` | `optimizer:removeGpuPreference` | `electron/main.js:2016` | `AppManagerEngine.removeGpuPreference (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.removeSelectedBloatware` | `optimizer:removeSelectedBloatware` | `electron/main.js:2011` | `AppManagerEngine.removeSelectedBloatware (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.restoreImageDefender` | `optimizer:restoreImageDefender` | `electron/main.js:2181` | `DefenderControlEngine.restoreImageDefender (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.revertHags` | `optimizer:revertHags` | `electron/main.js:2020` | `AppManagerEngine.revertHags (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.run` | `optimizer:run` | `electron/main.js:885` | `sender.send`<br>`SystemOptimizerService.runTasks (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.setGpuPreference` | `optimizer:setGpuPreference` | `electron/main.js:2015` | `AppManagerEngine.setGpuPreference (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.setHagsStatus` | `optimizer:setHagsStatus` | `electron/main.js:2019` | `AppManagerEngine.setHagsStatus (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.setProcessPriority` | `optimizer:setProcessPriority` | `electron/main.js:2013` | `AppManagerEngine.setProcessPriority (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.undoDns` | `optimizer:undoDns` | `electron/main.js:2072` | `DnsEngine.undo (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.uninstallProgramWithLeftovers` | `optimizer:uninstallProgramWithLeftovers` | `electron/main.js:2022` | `AppManagerEngine.uninstallProgramWithLeftovers (electron/services/optimizer/AppManagerEngine.js)` |
| `wintools.listFeatures` | `wintools:listFeatures` | `electron/ipc/winToolsIpc.js:11` | `engine.listFeatures` |

### OptiScaler Manager  (rota `optiscaler`)
- Tela: `src/pages/OptiScalerManager.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSConfirmDialog.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/optiscalerManager.js`, `electron/services/dlss5/Dlss5Service.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `dlss5.getSteamGames` | `dlss5:getSteamGames` | `electron/services/dlss5/Dlss5Service.js:1529` | `service.getInstalledSteamGames` |
| `dlss5.scanGame` | `dlss5:scanGame` | `electron/services/dlss5/Dlss5Service.js:1546` | `service.scanGameDirectory` |
| `library.list` | `library:list` | `electron/main.js:1319` | `webContents.send` |
| `library.remove` | `library:remove` | `electron/main.js:1367` |  |
| `library.upsert` | `library:upsert` | `electron/main.js:1331` |  |
| `optiscaler.analyze` | `optiscaler:analyze` | `electron/optiscalerManager.js:1169` |  |
| `optiscaler.apply` | `optiscaler:apply` | `electron/optiscalerManager.js:1177` |  |
| `optiscaler.createManualBackup` | `optiscaler:createManualBackup` | `electron/optiscalerManager.js:1209` |  |
| `optiscaler.deleteBackup` | `optiscaler:deleteBackup` | `electron/optiscalerManager.js:1201` |  |
| `optiscaler.listBackups` | `optiscaler:listBackups` | `electron/optiscalerManager.js:1185` |  |
| `optiscaler.restoreBackup` | `optiscaler:restoreBackup` | `electron/optiscalerManager.js:1193` |  |

### Ultra Low Latency  (rota `ultra-latency`)
- Tela: `src/pages/UltraLowLatency.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/latencyGuardian.js`, `electron/main.js`, `electron/services/NativeLatencyClient.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `latency.boostNow` | `latency:boostNow` | `electron/latencyGuardian.js:1175` |  |
| `latency.disableUltra` | `latency:disableUltra` | `electron/latencyGuardian.js:1156` |  |
| `latency.enableUltra` | `latency:enableUltra` | `electron/latencyGuardian.js:1111` |  |
| `latency.enableUltraStable` | `latency:enableUltraStable` | `electron/latencyGuardian.js:1121` |  |
| `latency.getConfig` | `latency:getConfig` | `electron/latencyGuardian.js:1043` | `nativeLatencyClient.queryTimer (electron/services/NativeLatencyClient.js)` |
| `latency.setConfig` | `latency:setConfig` | `electron/latencyGuardian.js:1073` |  |

## Overview

### Dashboard  (rota `dashboard`)
- Tela: `src/pages/Dashboard.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/library/Sparkline.tsx`, `src/components/ui/PageHeader.tsx`, `src/hooks/useJunkScanner.ts`, `src/hooks/useRecentActivity.ts`, `src/hooks/useSecurityScore.ts`, `src/hooks/useSensorHistory.ts`, `src/hooks/useSystemMetrics.ts`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/hal/HardwareHAL.js`, `electron/main.js`, `electron/services/HardwareService.js`, `electron/services/optimizer/MemoryEngine.js`, `electron/services/optimizer/StorageEngine.js`, `electron/services/optimizer/SystemEngine.js`

| API | canal | handler | chama |
|---|---|---|---|
| `hardware.onUpdate` | `hardware:update` | `nao encontrado` |  |
| `hardware.startPolling` | `hardware:startPolling` | `electron/services/HardwareService.js:51` | `hookedSenders.has`<br>`hookedSenders.add`<br>`sender.once`<br>`hookedSenders.delete` |
| `hardware.stopPolling` | `hardware:stopPolling` | `electron/services/HardwareService.js:69` | `perSender.get`<br>`perSender.set`<br>`perSender.delete`<br>`HAL.getSnapshot (electron/hal/HardwareHAL.js)` |
| `library.onActivityLogged` | `library:activityLogged` | `nao encontrado` |  |
| `library.onGameStarted` | `library:gameStarted` | `nao encontrado` |  |
| `library.onGameStopped` | `library:gameStopped` | `nao encontrado` |  |
| `optimizer.applyTweak` | `optimizer:applyTweak` | `electron/main.js:2027` | `MemoryEngine.optimizeRAM (electron/services/optimizer/MemoryEngine.js)`<br>`StorageEngine.cleanTempFiles (electron/services/optimizer/StorageEngine.js)`<br>`SystemEngine.repairWindows (electron/services/optimizer/SystemEngine.js)` |
| `optimizer.createRestorePoint` | `optimizer:createRestorePoint` | `electron/main.js:900` | `SystemEngine.createRestorePoint (electron/services/optimizer/SystemEngine.js)` |
| `security.getSecurityScore` | `security:getSecurityScore` | `electron/main.js:3240` |  |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1546` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |
| `system.getJunkEstimate` | `system:getJunkEstimate` | `electron/main.js:1311` |  |

### Home  (rota `home`)
- Tela: `src/pages/Home.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/ipc/driverIpc.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `driver.detect` | `driver:detect` | `electron/ipc/driverIpc.js:22` | `svc.detectAdapters` |
| `pge.openPortable` | `pge:openPortable` | `electron/main.js:1610` |  |
| `system.getInfo` | `system:getInfo` | `electron/main.js:958` | `cpuModel.includes`<br>`si.cpu`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `system.getMemory` | `system:getMemory` | `electron/main.js:1826` |  |

## Utilities & Tools

### AutoClicker  (rota `autoclicker`)
- Tela: `src/pages/AutoClicker.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/main.js`

| API | canal | handler | chama |
|---|---|---|---|
| `autoclicker.onChanged` | `autoclicker:changed` | `nao encontrado` |  |
| `autoclicker.setHotkey` | `autoclicker:setHotkey` | `electron/main.js:3765` | `hotkey.trim`<br>`stdin.write` |
| `autoclicker.setTabActive` | `autoclicker:setTabActive` | `electron/main.js:3794` |  |
| `autoclicker.start` | `autoclicker:start` | `electron/main.js:3731` |  |
| `autoclicker.status` | `autoclicker:status` | `electron/main.js:3727` |  |
| `autoclicker.stop` | `autoclicker:stop` | `electron/main.js:3742` |  |

### File Converter  (rota `converter`)
- Tela: `src/pages/FileConverter.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/PowerShellRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.grantDroppedFiles` | `dialog:grantDroppedFiles` | `electron/main.js:1959` | `filePaths.slice`<br>`granted.push` |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1984` |  |
| `files.archiveOperation` | `files:archiveOperation` | `electron/main.js:2458` | `inputFiles.map`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `files.convertDocuments` | `files:convertDocuments` | `electron/main.js:2349` | `outputDir.trim`<br>`outputFormat.trim`<br>`outputFormat.toLowerCase`<br>`inputFile.trim` |
| `files.convertImages` | `files:convertImages` | `electron/main.js:2206` | `outputDir.trim`<br>`outputFormat.toLowerCase`<br>`supported.has`<br>`inputFiles.map` |
| `files.convertMedia` | `files:convertMedia` | `electron/main.js:2258` | `outputDir.trim`<br>`outputFormat.trim`<br>`ffmpegPath.trim`<br>`outputFormat.toLowerCase` |

### Decryption  (rota `decryption`)
- Tela: `src/pages/Decryption.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Sem chamadas IPC (tela apenas de interface).

### Developer Tools  (rota `devtools`)
- Tela: `src/pages/DevTools.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Sem chamadas IPC (tela apenas de interface).

### Download Manager  (rota `downloads`)
- Tela: `src/pages/Downloads.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/services/downloads/registerDownloadsIPC.js`

| API | canal | handler | chama |
|---|---|---|---|
| `downloads.add` | `downloads:add` | `electron/services/downloads/registerDownloadsIPC.js:44` | `manager.add` |
| `downloads.cancel` | `downloads:cancel` | `electron/services/downloads/registerDownloadsIPC.js:52` | `manager.cancel` |
| `downloads.chooseDir` | `downloads:chooseDir` | `electron/services/downloads/registerDownloadsIPC.js:69` | `manager.shutdown` |
| `downloads.clearFinished` | `downloads:clearFinished` | `electron/services/downloads/registerDownloadsIPC.js:54` | `manager.clearFinished` |
| `downloads.list` | `downloads:list` | `electron/services/downloads/registerDownloadsIPC.js:43` | `manager.list`<br>`manager.getSettings` |
| `downloads.onUpdate` | `downloads:update` | `nao encontrado` |  |
| `downloads.pause` | `downloads:pause` | `electron/services/downloads/registerDownloadsIPC.js:48` | `manager.pause` |
| `downloads.pauseAll` | `downloads:pauseAll` | `electron/services/downloads/registerDownloadsIPC.js:50` | `manager.pauseAll` |
| `downloads.remove` | `downloads:remove` | `electron/services/downloads/registerDownloadsIPC.js:53` | `manager.remove` |
| `downloads.resume` | `downloads:resume` | `electron/services/downloads/registerDownloadsIPC.js:49` | `manager.resume` |
| `downloads.resumeAll` | `downloads:resumeAll` | `electron/services/downloads/registerDownloadsIPC.js:51` | `manager.resumeAll` |
| `downloads.setSettings` | `downloads:setSettings` | `electron/services/downloads/registerDownloadsIPC.js:56` | `manager.setSettings` |
| `downloads.showInFolder` | `downloads:showInFolder` | `electron/services/downloads/registerDownloadsIPC.js:62` | `manager.getFilePath` |

### Juuzou  (rota `juuzou`)
- Tela: `src/pages/Juuzou.tsx`
- Componentes/hooks usados: `src/components/EmbeddedSitePage.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Sem chamadas IPC (tela apenas de interface).

### Library  (rota `library`)
- Tela: `src/pages/Library.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/library/GameCard.tsx`, `src/components/library/GameDiscoveryModal.tsx`, `src/components/library/GameEditorModal.tsx`, `src/components/library/ProfileEditor.tsx`, `src/components/library/types.ts`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/latencyGuardian.js`, `electron/main.js`, `electron/optiscalerManager.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1984` |  |
| `latency.launchGameWithProfile` | `latency:launchGameWithProfile` | `electron/latencyGuardian.js:1220` | `argsArray.map`<br>`pingHost.trim`<br>`proc.once`<br>`proc.on` |
| `library.discover` | `library:discover` | `electron/main.js:1446` | `content.matchAll`<br>`steamPaths.push`<br>`steamPaths.map`<br>`entry.isDirectory` |
| `library.fetchCover` | `library:fetchCover` | `electron/main.js:1382` | `service.fetchCover`<br>`i.test`<br>`folder.startsWith`<br>`exeKey.startsWith` |
| `library.list` | `library:list` | `electron/main.js:1319` | `webContents.send` |
| `library.onUpdated` | `library:updated` | `nao encontrado` |  |
| `library.remove` | `library:remove` | `electron/main.js:1367` |  |
| `library.upsert` | `library:upsert` | `electron/main.js:1331` |  |
| `library.upsertBulk` | `library:upsertBulk` | `electron/main.js:1349` |  |
| `optiscaler.apply` | `optiscaler:apply` | `electron/optiscalerManager.js:1177` |  |

### LuluFlix  (rota `luluflix`)
- Tela: `src/pages/LuluFlix.tsx`
- Componentes/hooks usados: `src/components/EmbeddedSitePage.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Sem chamadas IPC (tela apenas de interface).

### EXIF Editor  (rota `metadata`)
- Tela: `src/pages/MetaDataEditor.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/SecureDownload.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1984` |  |
| `metadata.read` | `metadata:read` | `electron/main.js:3799` | `exifr.parse`<br>`exiftool.read` |
| `metadata.remove` | `metadata:remove` | `electron/main.js:3816` | `exiftool.write` |
| `metadata.update` | `metadata:update` | `electron/main.js:3836` | `exiftool.write`<br>`WINGET_ID_RE.test`<br>`id.trim`<br>`fetchJson() (electron/services/SecureDownload.js)` |

### Image OCR  (rota `ocr`)
- Tela: `src/pages/ImageTextExtractor.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/vaultCrypto.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `ocr.extractText` | `ocr:extractText` | `electron/main.js:2733` | `base64Data.replace`<br>`worker.recognize`<br>`worker.terminate`<br>`decryptVaultData() (electron/vaultCrypto.js)` |

### Password Vault  (rota `passwords`)
- Tela: `src/pages/PasswordManager.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/vaultCrypto.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1984` |  |
| `vault.add` | `vault:add` | `electron/main.js:2966` | `crypto.randomUUID` |
| `vault.copyPassword` | `vault:copyPassword` | `electron/main.js:3029` | `clipboard.writeText`<br>`clipboard.readText`<br>`clipboard.clear` |
| `vault.export` | `vault:export` | `electron/main.js:3086` |  |
| `vault.import` | `vault:import` | `electron/main.js:3095` |  |
| `vault.init` | `vault:init` | `electron/main.js:2886` | `crypto.randomBytes`<br>`recoveryWords.join`<br>`buildKdf() (electron/vaultCrypto.js)`<br>`derivePasswordFromRecoveryWords() (electron/vaultCrypto.js)` |
| `vault.list` | `vault:list` | `electron/main.js:2951` |  |
| `vault.lock` | `vault:lock` | `electron/main.js:2946` |  |
| `vault.remove` | `vault:remove` | `electron/main.js:3012` |  |
| `vault.reveal` | `vault:reveal` | `electron/main.js:3021` |  |
| `vault.status` | `vault:status` | `electron/main.js:2876` |  |
| `vault.unlock` | `vault:unlock` | `electron/main.js:2921` |  |
| `vault.unlockWithRecoveryWords` | `vault:unlockWithRecoveryWords` | `electron/main.js:2933` | `words.trim`<br>`derivePasswordFromRecoveryWords() (electron/vaultCrypto.js)` |

### PowerShell Tools  (rota `powershell`)
- Tela: `src/pages/PowerShellTools.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSConfirmDialog.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/powershellIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `powershell.getPolicies` | `powershell:getPolicies` | `electron/ipc/powershellIpc.js:22` | `svc.getPolicies` |
| `powershell.listScripts` | `powershell:listScripts` | `electron/ipc/powershellIpc.js:23` | `svc.listScripts` |
| `powershell.openElevatedTerminal` | `powershell:openElevatedTerminal` | `electron/ipc/powershellIpc.js:26` | `svc.openElevatedTerminal` |
| `powershell.runScript` | `powershell:runScript` | `electron/ipc/powershellIpc.js:25` | `svc.runScript` |

### Advanced Security  (rota `security`)
- Tela: `src/pages/AdvancedSecurity.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/SecurityService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `security.auditTracking` | `security:auditTracking` | `electron/main.js:3244` | `custom.map`<br>`content.split`<br>`l.trim`<br>`line.startsWith` |
| `security.blockTracking` | `security:blockTracking` | `electron/main.js:3351` | `custom.map`<br>`d.toLowerCase`<br>`content.split`<br>`line.includes` |
| `security.checkRansomwareArmor` | `security:checkRansomwareArmor` | `electron/services/SecurityService.js:65` |  |
| `security.disablePhishingShield` | `security:disablePhishingShield` | `electron/services/SecurityService.js:53` |  |
| `security.enablePhishingShield` | `security:enablePhishingShield` | `electron/services/SecurityService.js:49` |  |
| `security.enableRansomwareArmor` | `security:enableRansomwareArmor` | `electron/services/SecurityService.js:69` |  |
| `security.getCommunityRules` | `security:getCommunityRules` | `electron/services/SecurityService.js:73` |  |
| `security.getLiveNetworkConnections` | `security:getLiveNetworkConnections` | `electron/services/SecurityService.js:61` |  |
| `security.getPhishingShieldStatus` | `security:getPhishingShieldStatus` | `electron/services/SecurityService.js:57` |  |
| `security.getTrackingDomains` | `security:getTrackingDomains` | `electron/main.js:3294` | `custom.map`<br>`HOSTNAME_RE.test` |
| `security.importCommunityRules` | `security:importCommunityRules` | `electron/services/SecurityService.js:77` |  |
| `security.killProcess` | `security:killProcess` | `electron/main.js:3430` |  |
| `security.resetCommunityRules` | `security:resetCommunityRules` | `electron/services/SecurityService.js:81` | `promises.stat`<br>`entropyCache.has`<br>`entropyCache.get`<br>`stream.on` |
| `security.scanProcesses` | `security:scanProcesses` | `electron/services/SecurityService.js:41` |  |
| `security.scanUrl` | `security:scanUrl` | `electron/services/SecurityService.js:45` |  |
| `security.setCustomTrackingDomains` | `security:setCustomTrackingDomains` | `electron/main.js:3338` |  |
| `security.unblockTracking` | `security:unblockTracking` | `electron/main.js:3403` |  |

### Disk map  (rota `spacesniffer`)
- Tela: `src/pages/SpaceSniffer/index.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/diskScanIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `diskscan.cancel` | `diskscan:cancel` | `electron/ipc/diskScanIpc.js:22` | `svc.cancel` |
| `diskscan.drives` | `diskscan:drives` | `electron/ipc/diskScanIpc.js:14` | `svc.drives` |
| `diskscan.info` | `diskscan:info` | `electron/ipc/diskScanIpc.js:25` | `svc.info` |
| `diskscan.onProgress` | `diskscan:progress` | `nao encontrado` |  |
| `diskscan.pickFolder` | `diskscan:pickFolder` | `electron/ipc/diskScanIpc.js:15` |  |
| `diskscan.start` | `diskscan:start` | `electron/ipc/diskScanIpc.js:19` | `svc.start`<br>`sender.isDestroyed`<br>`sender.send` |
| `diskscan.status` | `diskscan:status` | `electron/ipc/diskScanIpc.js:23` | `svc.status` |

### Summarizer  (rota `summarizer`)
- Tela: `src/pages/TextSummarizer.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `fs.readFile` | `fs:readFile` | `electron/main.js:3443` |  |

### Text Editor  (rota `texteditor`)
- Tela: `src/pages/TextEditor.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.saveFile` | `dialog:saveFile` | `electron/main.js:1994` |  |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `fs.readFile` | `fs:readFile` | `electron/main.js:3443` |  |
| `fs.writeFile` | `fs:writeFile` | `electron/main.js:3455` | `hotkey.trim`<br>`globalShortcut.unregister`<br>`globalShortcut.register`<br>`devPath.includes` |

### Video Downloader  (rota `youtube`)
- Tela: `src/pages/YoutubeDownloader.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/ytdlp.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1973` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1984` |  |
| `youtube.cancel` | `youtube:cancel` | `electron/main.js:2723` | `cancelActiveYtDlp() (electron/ytdlp.js)` |
| `youtube.download` | `youtube:download` | `electron/main.js:2594` | `cookiesPath.trim`<br>`cookiesFromBrowser.trim`<br>`userAgent.trim`<br>`client.trim` |
| `youtube.getVideoInfo` | `youtube:getVideoInfo` | `electron/main.js:2482` | `cookiesPath.trim`<br>`cookiesFromBrowserRaw.trim`<br>`userAgentRaw.trim`<br>`clientRaw.trim` |
| `youtube.onProgress` | `youtube:downloadProgress` | `nao encontrado` |  |

## Outros

### darkos  (rota `darkos`)
- Tela: `src/pages/DarkOSCenter.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSConfirmDialog.tsx`, `src/components/darkos/DarkOSProgress.tsx`, `src/components/darkos/DarkOSSystemPanel.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/darkosData.ts`
- Arquivos de backend: `electron/configManager.js`, `electron/ipc/darkosIpc.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/UpdateService.js`, `electron/services/optimizer/AppManagerEngine.js`, `electron/services/optimizer/ElevationHelper.js`, `electron/services/optimizer/SystemOptimizerService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `darkos.isDarkOS` | `darkos:isDarkOS` | `electron/ipc/darkosIpc.js:59` |  |
| `darkos.onRunEvent` | `darkos:runEvent` | `nao encontrado` |  |
| `darkos.reinstallEdge` | `darkos:reinstallEdge` | `electron/ipc/darkosIpc.js:35` | `svc.revertChange`<br>`ElevationHelper.runElevatedPowerShell (electron/services/optimizer/ElevationHelper.js)` |
| `optimizer.getGpuInfo` | `optimizer:getGpuInfo` | `electron/main.js:2017` | `AppManagerEngine.getGpuInfo (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.run` | `optimizer:run` | `electron/main.js:885` | `sender.send`<br>`SystemOptimizerService.runTasks (electron/services/optimizer/SystemOptimizerService.js)` |
| `settings.getConfig` | `settings:getConfig` | `electron/main.js:1686` | `loadPersistedConfig() (electron/configManager.js)` |
| `settings.updateStartupBehavior` | `settings:updateStartupBehavior` | `electron/main.js:1786` | `runPowerShell() (electron/services/PowerShellRunner.js)`<br>`stripBom() (electron/services/PowerShellRunner.js)`<br>`loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `system.getLiveStats` | `system:getLiveStats` | `electron/main.js:1831` | `liveCpu.sample` |
| `updater.check` | `updater:check` | `electron/services/UpdateService.js:357` |  |
| `updater.download` | `updater:download` | `electron/services/UpdateService.js:358` |  |
| `updater.getStatus` | `updater:getStatus` | `electron/services/UpdateService.js:351` |  |
| `updater.install` | `updater:install` | `electron/services/UpdateService.js:359` | `webContents.send` |
| `updater.onEvent` | `updater:event` | `nao encontrado` |  |

### dev-icons  (rota `dev-icons`)
- Tela: `src/pages/Home.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/ipc/driverIpc.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `driver.detect` | `driver:detect` | `electron/ipc/driverIpc.js:22` | `svc.detectAdapters` |
| `pge.openPortable` | `pge:openPortable` | `electron/main.js:1610` |  |
| `system.getInfo` | `system:getInfo` | `electron/main.js:958` | `cpuModel.includes`<br>`si.cpu`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `system.getMemory` | `system:getMemory` | `electron/main.js:1826` |  |

### framepacer  (rota `framepacer`)
- Tela: `src/pages/FramePacer.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/FramePacerEngine.js`, `electron/services/FramePacerOverlay.js`

| API | canal | handler | chama |
|---|---|---|---|
| `framepacer.getMetrics` | `framepacer:getMetrics` | `electron/main.js:1923` | `FramePacerEngine.getMetrics (electron/services/FramePacerEngine.js)` |
| `framepacer.getOverlayStatus` | `framepacer:getOverlayStatus` | `electron/main.js:1949` | `getOverlayStatus() (electron/services/FramePacerOverlay.js)` |
| `framepacer.onMetrics` | `framepacer:metrics` | `nao encontrado` |  |
| `framepacer.setOverlayClickThrough` | `framepacer:setOverlayClickThrough` | `electron/main.js:1941` | `setOverlayClickThrough() (electron/services/FramePacerOverlay.js)` |
| `framepacer.start` | `framepacer:start` | `electron/main.js:1911` | `FramePacerEngine.start (electron/services/FramePacerEngine.js)` |
| `framepacer.stop` | `framepacer:stop` | `electron/main.js:1915` | `FramePacerEngine.stop (electron/services/FramePacerEngine.js)` |
| `framepacer.toggleOverlay` | `framepacer:toggleOverlay` | `electron/main.js:1937` | `toggleFramePacerOverlay() (electron/services/FramePacerOverlay.js)` |
| `framepacer.updateConfig` | `framepacer:updateConfig` | `electron/main.js:1919` | `FramePacerEngine.updateConfig (electron/services/FramePacerEngine.js)` |

### settings  (rota `settings`)
- Tela: `src/pages/Settings.tsx`
- Componentes/hooks usados: `src/appVersion.ts`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/configManager.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/UpdateService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `app.getResourceUsage` | `app:getResourceUsage` | `electron/main.js:1619` | `metrics.map`<br>`processes.reduce` |
| `settings.getConfig` | `settings:getConfig` | `electron/main.js:1686` | `loadPersistedConfig() (electron/configManager.js)` |
| `settings.updateLiveServices` | `settings:updateLiveServices` | `electron/main.js:1743` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `settings.updateStartupBehavior` | `settings:updateStartupBehavior` | `electron/main.js:1786` | `runPowerShell() (electron/services/PowerShellRunner.js)`<br>`stripBom() (electron/services/PowerShellRunner.js)`<br>`loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `settings.updateTelemetry` | `settings:updateTelemetry` | `electron/main.js:1715` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `settings.updateWindowBehavior` | `settings:updateWindowBehavior` | `electron/main.js:1767` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `updater.check` | `updater:check` | `electron/services/UpdateService.js:357` |  |
| `updater.getStatus` | `updater:getStatus` | `electron/services/UpdateService.js:351` |  |
| `updater.onEvent` | `updater:event` | `nao encontrado` |  |
| `vault.setAutoLockMinutes` | `vault:setAutoLockMinutes` | `electron/main.js:2881` |  |
