<!-- GERADO por electron_feature_map.py em 2026-10-27T14:31:13. NAO edite a mao: rode `npm run map`. -->

# Mapa de funcionalidades (tela -> IPC -> backend)
Fluxo: `src/pages/*.tsx` chama `window.darkhub.<ns>.<metodo>()` -> `electron/preload.js` -> canal IPC -> handler -> servico.

## DarkHub services

### Juuzou  (rota `juuzou`)
- Tela: `src/pages/Juuzou.tsx`
- Componentes/hooks usados: `src/components/EmbeddedSitePage.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Sem chamadas IPC (tela apenas de interface).

### Kakugan  (rota `kakugan`)
- Tela: `src/pages/Kakugan.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/kakuganIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `kakugan.dashboard` | `kakugan:dashboard` | `electron/ipc/kakuganIpc.js:114` | `client.dashboard` |
| `kakugan.gameNames` | `kakugan:gameNames` | `electron/ipc/kakuganIpc.js:135` | `client.gameNames` |
| `kakugan.getSettings` | `kakugan:getSettings` | `electron/ipc/kakuganIpc.js:107` |  |
| `kakugan.login` | `kakugan:login` | `electron/ipc/kakuganIpc.js:105` | `client.login` |
| `kakugan.logout` | `kakugan:logout` | `electron/ipc/kakuganIpc.js:106` | `client.logout` |
| `kakugan.openSite` | `kakugan:openSite` | `electron/ipc/kakuganIpc.js:136` | `SITE_PAGES.has` |
| `kakugan.searchGames` | `kakugan:searchGames` | `electron/ipc/kakuganIpc.js:134` | `client.searchGames` |
| `kakugan.setSettings` | `kakugan:setSettings` | `electron/ipc/kakuganIpc.js:108` |  |
| `kakugan.state` | `kakugan:state` | `electron/ipc/kakuganIpc.js:101` | `client.status`<br>`client.plans`<br>`client.me` |
| `kakugan.steamLoginCancel` | `kakugan:steamLoginCancel` | `electron/ipc/kakuganIpc.js:118` | `client.steamLoginCancel` |
| `kakugan.steamLoginPoll` | `kakugan:steamLoginPoll` | `electron/ipc/kakuganIpc.js:116` | `client.steamLoginPoll` |
| `kakugan.steamLoginStart` | `kakugan:steamLoginStart` | `electron/ipc/kakuganIpc.js:115` | `client.steamLoginStart` |

### LuluFlix  (rota `luluflix`)
- Tela: `src/pages/LuluFlix.tsx`
- Componentes/hooks usados: `src/components/EmbeddedSitePage.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Sem chamadas IPC (tela apenas de interface).

### Susuya  (rota `share`)
- Tela: `src/pages/Share.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/shareIpc.js`, `electron/main.js`

| API | canal | handler | chama |
|---|---|---|---|
| `share.onEvent` | `share:event` | `nao encontrado` |  |
| `share.qr` | `share:qr` | `electron/ipc/shareIpc.js:181` | `s.startsWith`<br>`QRCode.toDataURL` |
| `share.recentShots` | `share:recentShots` | `electron/ipc/shareIpc.js:208` | `i.test`<br>`globalShortcut.unregister` |
| `share.state` | `share:state` | `electron/ipc/shareIpc.js:137` |  |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1621` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |

## Diagnostics & Hardware

### Driver Center  (rota `driver`)
- Tela: `src/pages/DriverCenter.tsx`
- Componentes/hooks usados: `src/components/drivers/MissingDrivers.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/driverIpc.js`, `electron/ipc/restoreIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `driver.cameraStatus` | `driver:cameraStatus` | `electron/ipc/driverIpc.js:25` | `svc.cameraStatus` |
| `driver.detect` | `driver:detect` | `electron/ipc/driverIpc.js:23` | `svc.detectAdapters` |
| `driver.findDrivers` | `driver:findDrivers` | `electron/ipc/driverIpc.js:35` | `installer.findDrivers` |
| `driver.install` | `driver:install` | `electron/ipc/driverIpc.js:37` | `installer.install`<br>`ids.slice`<br>`sender.send` |
| `driver.onInstallEvent` | `driver:installEvent` | `nao encontrado` |  |
| `driver.openOfficial` | `driver:openOfficial` | `electron/ipc/driverIpc.js:46` | `svc.resolveOfficialUrl` |
| `driver.repairCamera` | `driver:repairCamera` | `electron/ipc/driverIpc.js:28` | `svc.repairCamera`<br>`darkos.revertChange` |
| `restore.status` | `restore:status` | `electron/ipc/restoreIpc.js:12` | `svc.status` |

### Scheduled maintenance  (rota `maintenance`)
- Tela: `src/pages/Maintenance.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/maintenanceIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `maint.onEvent` | `maint:event` | `nao encontrado` |  |
| `maint.runNow` | `maint:runNow` | `electron/ipc/maintenanceIpc.js:40` | `svc.runTask`<br>`svc.start`<br>`svc.stop` |
| `maint.setTask` | `maint:setTask` | `electron/ipc/maintenanceIpc.js:39` | `svc.setTask` |
| `maint.state` | `maint:state` | `electron/ipc/maintenanceIpc.js:38` | `svc.state` |

### System Monitor  (rota `monitor`)
- Tela: `src/pages/SystemMonitor.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/library/Sparkline.tsx`, `src/components/monitor/AdvancedSensorsPanel.tsx`, `src/components/monitor/LhmSensorTree.tsx`, `src/components/ui/PageHeader.tsx`, `src/hooks/useDeepHardware.ts`, `src/hooks/useSensorHistory.ts`, `src/hooks/useSystemMetrics.ts`
- Arquivos de backend: `electron/hal/HardwareHAL.js`, `electron/hal/collectors/HwSensorsDaemon.js`, `electron/ipc/hwSensorsIpc.js`, `electron/ipc/overlayIpc.js`, `electron/main.js`, `electron/services/HardwareService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `app.getResourceUsage` | `app:getResourceUsage` | `electron/main.js:1694` | `metrics.map`<br>`processes.reduce` |
| `hardware.onUpdate` | `hardware:update` | `nao encontrado` |  |
| `hardware.startPolling` | `hardware:startPolling` | `electron/services/HardwareService.js:51` | `hookedSenders.has`<br>`hookedSenders.add`<br>`sender.once`<br>`hookedSenders.delete` |
| `hardware.stopPolling` | `hardware:stopPolling` | `electron/services/HardwareService.js:69` | `perSender.get`<br>`perSender.set`<br>`perSender.delete`<br>`HAL.getSnapshot (electron/hal/HardwareHAL.js)` |
| `hwsensors.status` | `hwsensors:status` | `electron/ipc/hwSensorsIpc.js:46` | `HwSensorsDaemon.status (electron/hal/collectors/HwSensorsDaemon.js)` |
| `overlay.show` | `overlay:show` | `electron/ipc/overlayIpc.js:30` |  |
| `system.enableProcessTracking` | `system:enableProcessTracking` | `electron/main.js:1095` |  |
| `system.runBenchmark` | `system:runBenchmark` | `electron/main.js:1202` | `hrtime.bigint`<br>`parentPort.postMessage`<br>`mops.toFixed`<br>`ms.toFixed` |

### Network & Latency  (rota `networktools`)
- Tela: `src/pages/NetworkTools.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/network/LatencyLab.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/networkIPC.js`, `electron/services/NetLatencyService.js`, `electron/services/PowerShellRunner.js`, `electron/services/optimizer/DnsEngine.js`

| API | canal | handler | chama |
|---|---|---|---|
| `network.adapterInfo` | `network:adapterInfo` | `electron/networkIPC.js:150` | `lines.push`<br>`lines.join` |
| `network.applyLatencyTweak` | `network:applyLatencyTweak` | `electron/networkIPC.js:129` | `NetLatencyService.applyTweak (electron/services/NetLatencyService.js)` |
| `network.bufferbloat` | `network:bufferbloat` | `electron/networkIPC.js:126` | `NetLatencyService.bufferbloat (electron/services/NetLatencyService.js)` |
| `network.dnsInfo` | `network:dnsInfo` | `electron/networkIPC.js:132` |  |
| `network.flushDns` | `network:flushDns` | `electron/networkIPC.js:108` |  |
| `network.latencyPresets` | `network:latencyPresets` | `electron/networkIPC.js:123` | `NetLatencyService.getPresets (electron/services/NetLatencyService.js)` |
| `network.latencyState` | `network:latencyState` | `electron/networkIPC.js:128` | `NetLatencyService.getState (electron/services/NetLatencyService.js)` |
| `network.mtuDiscover` | `network:mtuDiscover` | `electron/networkIPC.js:127` | `NetLatencyService.mtu (electron/services/NetLatencyService.js)` |
| `network.ping` | `network:ping` | `electron/networkIPC.js:31` | `output.match`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `network.portScan` | `network:portScan` | `electron/networkIPC.js:51` | `net.Socket`<br>`socket.setTimeout`<br>`socket.on`<br>`socket.destroy` |
| `network.probe` | `network:probe` | `electron/networkIPC.js:124` | `NetLatencyService.probe (electron/services/NetLatencyService.js)` |
| `network.renewIp` | `network:renewIp` | `electron/networkIPC.js:164` |  |
| `network.resetTcp` | `network:resetTcp` | `electron/networkIPC.js:113` | `NetLatencyService.resetStack (electron/services/NetLatencyService.js)` |
| `network.restoreLatencyTweak` | `network:restoreLatencyTweak` | `electron/networkIPC.js:130` | `NetLatencyService.restoreTweak (electron/services/NetLatencyService.js)` |
| `network.traceHops` | `network:traceHops` | `electron/networkIPC.js:125` | `NetLatencyService.traceroute (electron/services/NetLatencyService.js)` |
| `network.tracert` | `network:tracert` | `electron/networkIPC.js:136` | `runCommand() (electron/services/PowerShellRunner.js)` |
| `optimizer.applyDns` | `optimizer:applyDns` | `electron/main.js:2142` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.dnsBenchmark` | `optimizer:dnsBenchmark` | `electron/main.js:2152` | `DnsEngine.benchmark (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.getDnsState` | `optimizer:getDnsState` | `electron/main.js:2133` | `DnsEngine.getState (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.undoDns` | `optimizer:undoDns` | `electron/main.js:2147` | `DnsEngine.undo (electron/services/optimizer/DnsEngine.js)` |

### Post-Install Hub  (rota `setuphub`)
- Tela: `src/pages/SetupHub.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/setup/RestoreComponentsPanel.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/configManager.js`, `electron/ipc/restoreIpc.js`, `electron/main.js`, `electron/services/ensureElevated.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:2059` |  |
| `restore.install` | `restore:install` | `electron/ipc/restoreIpc.js:13` | `svc.install` |
| `restore.status` | `restore:status` | `electron/ipc/restoreIpc.js:12` | `svc.status` |
| `setup.detectHardware` | `setup:detectHardware` | `electron/main.js:4162` | `si.cpu`<br>`si.graphics`<br>`si.baseboard`<br>`si.memLayout` |
| `setup.installWinget` | `setup:installWinget` | `electron/main.js:4095` | `sender.isDestroyed`<br>`sender.send`<br>`appIds.map`<br>`id.startsWith` |
| `setup.onInstallProgress` | `setup:installProgress` | `nao encontrado` |  |

### Startup manager  (rota `startup`)
- Tela: `src/pages/StartupManager.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Sem chamadas IPC (tela apenas de interface).

### USB ports  (rota `usb`)
- Tela: `src/pages/UsbControl.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Sem chamadas IPC (tela apenas de interface).

## Gaming & Performance

### Before/after benchmark  (rota `benchmark`)
- Tela: `src/pages/Benchmark.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/benchmarkIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `bench.cancel` | `bench:cancel` | `electron/ipc/benchmarkIpc.js:14` | `svc.cancel` |
| `bench.compare` | `bench:compare` | `electron/ipc/benchmarkIpc.js:16` | `svc.compare` |
| `bench.history` | `bench:history` | `electron/ipc/benchmarkIpc.js:15` | `svc.history` |
| `bench.onEvent` | `bench:event` | `nao encontrado` |  |
| `bench.remove` | `bench:remove` | `electron/ipc/benchmarkIpc.js:17` | `svc.remove`<br>`svc.cancel` |
| `bench.run` | `bench:run` | `electron/ipc/benchmarkIpc.js:13` | `svc.run` |

### DarkPacer (FPS Lock)  (rota `darkpacer`)
- Tela: `src/pages/FramePacer.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/FramePacerEngine.js`, `electron/services/FramePacerOverlay.js`

| API | canal | handler | chama |
|---|---|---|---|
| `framepacer.getMetrics` | `framepacer:getMetrics` | `electron/main.js:1998` | `FramePacerEngine.getMetrics (electron/services/FramePacerEngine.js)` |
| `framepacer.getOverlayStatus` | `framepacer:getOverlayStatus` | `electron/main.js:2024` | `getOverlayStatus() (electron/services/FramePacerOverlay.js)` |
| `framepacer.onMetrics` | `framepacer:metrics` | `nao encontrado` |  |
| `framepacer.setOverlayClickThrough` | `framepacer:setOverlayClickThrough` | `electron/main.js:2016` | `setOverlayClickThrough() (electron/services/FramePacerOverlay.js)` |
| `framepacer.start` | `framepacer:start` | `electron/main.js:1986` | `FramePacerEngine.start (electron/services/FramePacerEngine.js)` |
| `framepacer.stop` | `framepacer:stop` | `electron/main.js:1990` | `FramePacerEngine.stop (electron/services/FramePacerEngine.js)` |
| `framepacer.toggleOverlay` | `framepacer:toggleOverlay` | `electron/main.js:2012` | `toggleFramePacerOverlay() (electron/services/FramePacerOverlay.js)` |
| `framepacer.updateConfig` | `framepacer:updateConfig` | `electron/main.js:1994` | `FramePacerEngine.updateConfig (electron/services/FramePacerEngine.js)` |

### DLL Injector  (rota `dll-injector`)
- Tela: `src/pages/DllInjector.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/PowerShellRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `injector.inject` | `injector:inject` | `electron/main.js:1931` | `i.test`<br>`dllPath.trim`<br>`stdout.includes`<br>`stdout.trim` |

### DLSS Manager  (rota `dlss5`)
- Tela: `src/pages/Dlss5Manager.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/diskScanIpc.js`, `electron/ipc/upscaleIpc.js`, `electron/main.js`, `electron/services/dlss5/Dlss5Service.js`

| API | canal | handler | chama |
|---|---|---|---|
| `diskscan.pickFolder` | `diskscan:pickFolder` | `electron/ipc/diskScanIpc.js:15` |  |
| `dlss5.detectGpu` | `dlss5:detectGpu` | `electron/services/dlss5/Dlss5Service.js:727` | `service.detectGpu` |
| `dlss5.getSteamGames` | `dlss5:getSteamGames` | `electron/services/dlss5/Dlss5Service.js:718` | `service.getInstalledSteamGames` |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1621` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |
| `upscale.autopilotStatus` | `upscale:autopilotStatus` | `electron/ipc/upscaleIpc.js:47` | `autopilot.status` |
| `upscale.dlssLatest` | `upscale:dlssLatest` | `electron/ipc/upscaleIpc.js:29` | `updater.latest` |

### System Optimizer  (rota `optimizer`)
- Tela: `src/pages/Optimizer.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSOptimizerHint.tsx`, `src/components/icons/index.tsx`, `src/components/optimizer/WindowsToolsPanel.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/darkosIpc.js`, `electron/ipc/winToolsIpc.js`, `electron/main.js`, `electron/services/optimizer/AppManagerEngine.js`, `electron/services/optimizer/DeepTweaksEngine.js`, `electron/services/optimizer/DefenderControlEngine.js`, `electron/services/optimizer/DnsEngine.js`, `electron/services/optimizer/NetworkEngine.js`, `electron/services/optimizer/SystemEngine.js`, `electron/services/optimizer/SystemOptimizerService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `darkos.isDarkOS` | `darkos:isDarkOS` | `electron/ipc/darkosIpc.js:59` | `darkhub.ink` |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `optimizer.advancedNetworkApply` | `optimizer:advancedNetworkApply` | `electron/main.js:2098` | `NetworkEngine.advancedNetworkApply (electron/services/optimizer/NetworkEngine.js)` |
| `optimizer.advancedNetworkRevert` | `optimizer:advancedNetworkRevert` | `electron/main.js:2099` | `NetworkEngine.advancedNetworkRevert (electron/services/optimizer/NetworkEngine.js)` |
| `optimizer.applyDefenderControl` | `optimizer:applyDefenderControl` | `electron/main.js:2253` | `DefenderControlEngine.runNativeDefenderControl (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.applyDns` | `optimizer:applyDns` | `electron/main.js:2142` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.checkIsAdmin` | `optimizer:checkIsAdmin` | `electron/main.js:964` | `SystemOptimizerService.checkIsAdmin (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.checkOperationsStatus` | `optimizer:checkOperationsStatus` | `electron/main.js:945` | `SystemOptimizerService.checkOperationsStatus (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.createRestorePoint` | `optimizer:createRestorePoint` | `electron/main.js:968` | `SystemEngine.createRestorePoint (electron/services/optimizer/SystemEngine.js)` |
| `optimizer.deepTweaksApply` | `optimizer:deepTweaksApply` | `electron/main.js:2121` | `DeepTweaksEngine.applyTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` |
| `optimizer.deepTweaksList` | `optimizer:deepTweaksList` | `electron/main.js:2101` | `DeepTweaksEngine.listTweaks (electron/services/optimizer/DeepTweaksEngine.js)` |
| `optimizer.deepTweaksRevert` | `optimizer:deepTweaksRevert` | `electron/main.js:2122` | `DeepTweaksEngine.revertTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` |
| `optimizer.deepTweaksStatus` | `optimizer:deepTweaksStatus` | `electron/main.js:2114` | `DeepTweaksEngine.checkTweaksStatus (electron/services/optimizer/DeepTweaksEngine.js)` |
| `optimizer.deepTweaksUndo` | `optimizer:deepTweaksUndo` | `electron/main.js:2123` | `DeepTweaksEngine.undoTweaks (electron/services/optimizer/DeepTweaksEngine.js)` |
| `optimizer.disableStartupItem` | `optimizer:disableStartupItem` | `electron/main.js:2080` | `AppManagerEngine.disableStartupItem (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.dnsBenchmark` | `optimizer:dnsBenchmark` | `electron/main.js:2152` | `DnsEngine.benchmark (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.getDefenderControlStatus` | `optimizer:getDefenderControlStatus` | `electron/main.js:2250` | `DefenderControlEngine.getStatus (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.getDnsState` | `optimizer:getDnsState` | `electron/main.js:2133` | `DnsEngine.getState (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.getGpuInfo` | `optimizer:getGpuInfo` | `electron/main.js:2092` | `AppManagerEngine.getGpuInfo (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getGpuPreferences` | `optimizer:getGpuPreferences` | `electron/main.js:2089` | `AppManagerEngine.getGpuPreferences (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getHagsStatus` | `optimizer:getHagsStatus` | `electron/main.js:2093` | `AppManagerEngine.getHagsStatus (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getInstalledPrograms` | `optimizer:getInstalledPrograms` | `electron/main.js:2083` | `AppManagerEngine.getInstalledPrograms (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getRunningProcesses` | `optimizer:getRunningProcesses` | `electron/main.js:2087` | `AppManagerEngine.getRunningProcesses (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getStartupItems` | `optimizer:getStartupItems` | `electron/main.js:2079` | `AppManagerEngine.getStartupItems (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.listBloatware` | `optimizer:listBloatware` | `electron/main.js:2085` | `AppManagerEngine.listBloatware (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.listOperations` | `optimizer:listOperations` | `electron/main.js:941` | `SystemOptimizerService.listOperations (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.listProfiles` | `optimizer:listProfiles` | `electron/main.js:960` | `SystemOptimizerService.listProfiles (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.onRunEvent` | `optimizer:runEvent` | `nao encontrado` |  |
| `optimizer.openTamperSettings` | `optimizer:openTamperSettings` | `electron/main.js:2259` | `DefenderControlEngine.openTamperSettings (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.removeGpuPreference` | `optimizer:removeGpuPreference` | `electron/main.js:2091` | `AppManagerEngine.removeGpuPreference (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.removeSelectedBloatware` | `optimizer:removeSelectedBloatware` | `electron/main.js:2086` | `AppManagerEngine.removeSelectedBloatware (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.restoreImageDefender` | `optimizer:restoreImageDefender` | `electron/main.js:2256` | `DefenderControlEngine.restoreImageDefender (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.revertHags` | `optimizer:revertHags` | `electron/main.js:2095` | `AppManagerEngine.revertHags (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.run` | `optimizer:run` | `electron/main.js:953` | `sender.send`<br>`SystemOptimizerService.runTasks (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.setGpuPreference` | `optimizer:setGpuPreference` | `electron/main.js:2090` | `AppManagerEngine.setGpuPreference (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.setHagsStatus` | `optimizer:setHagsStatus` | `electron/main.js:2094` | `AppManagerEngine.setHagsStatus (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.setProcessPriority` | `optimizer:setProcessPriority` | `electron/main.js:2088` | `AppManagerEngine.setProcessPriority (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.undoDns` | `optimizer:undoDns` | `electron/main.js:2147` | `DnsEngine.undo (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.uninstallProgramWithLeftovers` | `optimizer:uninstallProgramWithLeftovers` | `electron/main.js:2097` | `AppManagerEngine.uninstallProgramWithLeftovers (electron/services/optimizer/AppManagerEngine.js)` |
| `wintools.listFeatures` | `wintools:listFeatures` | `electron/ipc/winToolsIpc.js:11` | `engine.listFeatures` |

### OptiScaler Manager  (rota `optiscaler`)
- Tela: `src/pages/OptiScalerManager.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSConfirmDialog.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/optiscalerManager.js`, `electron/services/SecureDownload.js`, `electron/services/dlss5/Dlss5Service.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `dlss5.getSteamGames` | `dlss5:getSteamGames` | `electron/services/dlss5/Dlss5Service.js:718` | `service.getInstalledSteamGames` |
| `dlss5.scanGame` | `dlss5:scanGame` | `electron/services/dlss5/Dlss5Service.js:735` | `service.scanGameDirectory` |
| `library.list` | `library:list` | `electron/main.js:1387` | `webContents.send` |
| `library.remove` | `library:remove` | `electron/main.js:1435` |  |
| `library.upsert` | `library:upsert` | `electron/main.js:1399` |  |
| `optiscaler.analyze` | `optiscaler:analyze` | `electron/optiscalerManager.js:1226` |  |
| `optiscaler.apply` | `optiscaler:apply` | `electron/optiscalerManager.js:1234` |  |
| `optiscaler.checkUpdate` | `optiscaler:checkUpdate` | `electron/optiscalerManager.js:1274` | `i.test`<br>`fetchJson() (electron/services/SecureDownload.js)`<br>`assetSha256() (electron/services/SecureDownload.js)` |
| `optiscaler.createManualBackup` | `optiscaler:createManualBackup` | `electron/optiscalerManager.js:1266` |  |
| `optiscaler.deleteBackup` | `optiscaler:deleteBackup` | `electron/optiscalerManager.js:1258` |  |
| `optiscaler.downloadUpdate` | `optiscaler:downloadUpdate` | `electron/optiscalerManager.js:1287` |  |
| `optiscaler.listBackups` | `optiscaler:listBackups` | `electron/optiscalerManager.js:1242` |  |
| `optiscaler.restoreBackup` | `optiscaler:restoreBackup` | `electron/optiscalerManager.js:1250` |  |

### In-game overlay  (rota `overlay`)
- Tela: `src/pages/GameOverlay.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/overlayIpc.js`, `electron/services/NativeLatencyClient.js`

| API | canal | handler | chama |
|---|---|---|---|
| `overlay.hide` | `overlay:hide` | `electron/ipc/overlayIpc.js:31` |  |
| `overlay.layouts` | `overlay:layouts` | `electron/ipc/overlayIpc.js:34` |  |
| `overlay.onEvent` | `overlay:event` | `nao encontrado` |  |
| `overlay.pickLogFolder` | `overlay:pickLogFolder` | `electron/ipc/overlayIpc.js:44` |  |
| `overlay.processes` | `overlay:processes` | `electron/ipc/overlayIpc.js:40` | `nativeLatencyClient.listProcesses (electron/services/NativeLatencyClient.js)` |
| `overlay.setSettings` | `overlay:setSettings` | `electron/ipc/overlayIpc.js:32` |  |
| `overlay.show` | `overlay:show` | `electron/ipc/overlayIpc.js:30` |  |
| `overlay.status` | `overlay:status` | `electron/ipc/overlayIpc.js:29` |  |

### Save backup  (rota `savebackup`)
- Tela: `src/pages/SaveBackup.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/saveBackupIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `saves.onEvent` | `saves:event` | `nao encontrado` |  |
| `saves.openFolder` | `saves:openFolder` | `electron/ipc/saveBackupIpc.js:62` | `svc._gameDir`<br>`svc.settings` |
| `saves.versions` | `saves:versions` | `electron/ipc/saveBackupIpc.js:40` | `svc.versions` |

### Ultra Low Latency  (rota `ultra-latency`)
- Tela: `src/pages/UltraLowLatency.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/latencyGuardian.js`, `electron/main.js`, `electron/services/NativeLatencyClient.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `latency.boostNow` | `latency:boostNow` | `electron/latencyGuardian.js:1176` |  |
| `latency.disableUltra` | `latency:disableUltra` | `electron/latencyGuardian.js:1157` |  |
| `latency.enableUltra` | `latency:enableUltra` | `electron/latencyGuardian.js:1112` |  |
| `latency.enableUltraStable` | `latency:enableUltraStable` | `electron/latencyGuardian.js:1122` |  |
| `latency.getConfig` | `latency:getConfig` | `electron/latencyGuardian.js:1044` | `nativeLatencyClient.queryTimer (electron/services/NativeLatencyClient.js)` |
| `latency.setConfig` | `latency:setConfig` | `electron/latencyGuardian.js:1074` |  |

## Overview

### Dashboard  (rota `dashboard`)
- Tela: `src/pages/Dashboard.tsx`
- Componentes/hooks usados: `src/components/ExtensionFrame.tsx`, `src/components/icons/index.tsx`, `src/components/library/Sparkline.tsx`, `src/components/ui/PageHeader.tsx`, `src/hooks/useJunkScanner.ts`, `src/hooks/useRecentActivity.ts`, `src/hooks/useSecurityScore.ts`, `src/hooks/useSensorHistory.ts`, `src/hooks/useSystemMetrics.ts`, `src/lib/extensions.ts`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/hal/HardwareHAL.js`, `electron/ipc/hubIpc.js`, `electron/main.js`, `electron/services/HardwareService.js`, `electron/services/optimizer/MemoryEngine.js`, `electron/services/optimizer/StorageEngine.js`, `electron/services/optimizer/SystemEngine.js`

| API | canal | handler | chama |
|---|---|---|---|
| `ext.call` | `ext:call` | `electron/ipc/hubIpc.js:126` | `host.call` |
| `ext.doc` | `ext:doc` | `electron/ipc/hubIpc.js:125` | `host.doc` |
| `ext.log` | `ext:log` | `electron/ipc/hubIpc.js:129` | `host.log` |
| `hardware.onUpdate` | `hardware:update` | `nao encontrado` |  |
| `hardware.startPolling` | `hardware:startPolling` | `electron/services/HardwareService.js:51` | `hookedSenders.has`<br>`hookedSenders.add`<br>`sender.once`<br>`hookedSenders.delete` |
| `hardware.stopPolling` | `hardware:stopPolling` | `electron/services/HardwareService.js:69` | `perSender.get`<br>`perSender.set`<br>`perSender.delete`<br>`HAL.getSnapshot (electron/hal/HardwareHAL.js)` |
| `hub.list` | `hub:list` | `electron/ipc/hubIpc.js:106` | `svc.list` |
| `hub.onEvent` | `hub:event` | `nao encontrado` |  |
| `library.onActivityLogged` | `library:activityLogged` | `nao encontrado` |  |
| `library.onGameStarted` | `library:gameStarted` | `nao encontrado` |  |
| `library.onGameStopped` | `library:gameStopped` | `nao encontrado` |  |
| `optimizer.applyTweak` | `optimizer:applyTweak` | `electron/main.js:2102` | `MemoryEngine.optimizeRAM (electron/services/optimizer/MemoryEngine.js)`<br>`StorageEngine.cleanTempFiles (electron/services/optimizer/StorageEngine.js)`<br>`SystemEngine.repairWindows (electron/services/optimizer/SystemEngine.js)` |
| `optimizer.createRestorePoint` | `optimizer:createRestorePoint` | `electron/main.js:968` | `SystemEngine.createRestorePoint (electron/services/optimizer/SystemEngine.js)` |
| `security.getSecurityScore` | `security:getSecurityScore` | `electron/main.js:3419` |  |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1621` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |
| `system.getJunkEstimate` | `system:getJunkEstimate` | `electron/main.js:1379` |  |

### Home  (rota `home`)
- Tela: `src/pages/Home.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/ipc/driverIpc.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `driver.detect` | `driver:detect` | `electron/ipc/driverIpc.js:23` | `svc.detectAdapters` |
| `pge.openPortable` | `pge:openPortable` | `electron/main.js:1685` |  |
| `system.getInfo` | `system:getInfo` | `electron/main.js:1026` | `cpuModel.includes`<br>`si.cpu`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `system.getMemory` | `system:getMemory` | `electron/main.js:1901` |  |

### Presets e módulos  (rota `presets`)
- Tela: `src/pages/Presets.tsx`
- Componentes/hooks usados: `src/components/hub/HubPreview.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/lib/extensions.ts`
- Arquivos de backend: `electron/ipc/hubIpc.js`, `electron/main.js`

| API | canal | handler | chama |
|---|---|---|---|
| `ext.devAdd` | `ext:devAdd` | `electron/ipc/hubIpc.js:132` |  |
| `ext.devList` | `ext:devList` | `electron/ipc/hubIpc.js:131` |  |
| `ext.devRemove` | `ext:devRemove` | `electron/ipc/hubIpc.js:137` | `watchers.get`<br>`watchers.delete` |
| `hub.catalog.inspect` | `hub:catalog:inspect` | `electron/ipc/hubIpc.js:117` | `catalog.inspect` |
| `hub.catalog.install` | `hub:catalog:install` | `electron/ipc/hubIpc.js:118` | `catalog.install` |
| `hub.catalog.search` | `hub:catalog:search` | `electron/ipc/hubIpc.js:115` | `catalog.search` |
| `hub.catalog.setServer` | `hub:catalog:setServer` | `electron/ipc/hubIpc.js:114` | `catalog.setServer` |
| `hub.catalog.update` | `hub:catalog:update` | `electron/ipc/hubIpc.js:120` | `catalog.update` |
| `hub.catalog.updates` | `hub:catalog:updates` | `electron/ipc/hubIpc.js:119` | `catalog.updates` |
| `hub.exportMine` | `hub:exportMine` | `electron/ipc/hubIpc.js:111` | `svc.exportMine` |
| `hub.hardware` | `hub:hardware` | `electron/ipc/hubIpc.js:107` | `svc.hardware` |
| `hub.inspect` | `hub:inspect` | `electron/ipc/hubIpc.js:112` | `svc.inspect` |
| `hub.install` | `hub:install` | `electron/ipc/hubIpc.js:109` | `svc.install` |
| `hub.list` | `hub:list` | `electron/ipc/hubIpc.js:106` | `svc.list` |
| `hub.mcp.regenerate` | `hub:mcp:regenerate` | `electron/ipc/hubIpc.js:124` | `mcp.regenerateToken` |
| `hub.mcp.setEnabled` | `hub:mcp:setEnabled` | `electron/ipc/hubIpc.js:123` | `mcp.setEnabled` |
| `hub.mcp.status` | `hub:mcp:status` | `electron/ipc/hubIpc.js:122` | `mcp.status` |
| `hub.onEvent` | `hub:event` | `nao encontrado` |  |
| `hub.openFile` | `hub:openFile` | `electron/ipc/hubIpc.js:139` |  |
| `hub.pendingLink` | `hub:pendingLink` | `electron/ipc/hubIpc.js:121` |  |
| `hub.saveFile` | `hub:saveFile` | `electron/ipc/hubIpc.js:146` | `mcp.init`<br>`host.response`<br>`watchers.values`<br>`w.close` |
| `hub.uninstall` | `hub:uninstall` | `electron/ipc/hubIpc.js:110` | `svc.uninstall` |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1621` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |

### Real-time  (rota `realtime`)
- Tela: `src/pages/Realtime.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/diskScanIpc.js`, `electron/ipc/realtimeIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `diskscan.pickFolder` | `diskscan:pickFolder` | `electron/ipc/diskScanIpc.js:15` |  |
| `realtime.onEvent` | `realtime:event` | `nao encontrado` |  |
| `realtime.quarantineList` | `realtime:quarantineList` | `electron/ipc/realtimeIpc.js:125` | `quarantine.list` |
| `realtime.setConfig` | `realtime:setConfig` | `electron/ipc/realtimeIpc.js:119` | `store.update` |
| `realtime.status` | `realtime:status` | `electron/ipc/realtimeIpc.js:104` | `clamav.status`<br>`clamav.install`<br>`clamav.update`<br>`store.update` |

## Utilities & Tools

### AutoClicker  (rota `autoclicker`)
- Tela: `src/pages/AutoClicker.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/main.js`

| API | canal | handler | chama |
|---|---|---|---|
| `autoclicker.onChanged` | `autoclicker:changed` | `nao encontrado` |  |
| `autoclicker.setHotkey` | `autoclicker:setHotkey` | `electron/main.js:3944` | `hotkey.trim`<br>`stdin.write` |
| `autoclicker.setTabActive` | `autoclicker:setTabActive` | `electron/main.js:3973` |  |
| `autoclicker.start` | `autoclicker:start` | `electron/main.js:3910` |  |
| `autoclicker.status` | `autoclicker:status` | `electron/main.js:3906` |  |
| `autoclicker.stop` | `autoclicker:stop` | `electron/main.js:3921` |  |

### File Converter  (rota `converter`)
- Tela: `src/pages/FileConverter.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/PowerShellRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.grantDroppedFiles` | `dialog:grantDroppedFiles` | `electron/main.js:2034` | `filePaths.slice`<br>`granted.push` |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:2059` |  |
| `files.archiveOperation` | `files:archiveOperation` | `electron/main.js:2533` | `inputFiles.map`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `files.convertDocuments` | `files:convertDocuments` | `electron/main.js:2424` | `outputDir.trim`<br>`outputFormat.trim`<br>`outputFormat.toLowerCase`<br>`inputFile.trim` |
| `files.convertImages` | `files:convertImages` | `electron/main.js:2281` | `outputDir.trim`<br>`outputFormat.toLowerCase`<br>`supported.has`<br>`inputFiles.map` |
| `files.convertMedia` | `files:convertMedia` | `electron/main.js:2333` | `outputDir.trim`<br>`outputFormat.trim`<br>`ffmpegPath.trim`<br>`outputFormat.toLowerCase` |

### Decryption  (rota `decryption`)
- Tela: `src/pages/Decryption.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/lib/cipherTools.ts`
- Sem chamadas IPC (tela apenas de interface).

### Developer Tools  (rota `devtools`)
- Tela: `src/pages/DevTools.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/devtools/ColorPicker.tsx`, `src/devtools/TextToolViews.tsx`, `src/devtools/UnitConverter.tsx`, `src/devtools/color.ts`, `src/devtools/textTools.ts`, `src/devtools/ui.tsx`, `src/devtools/units.ts`
- Sem chamadas IPC (tela apenas de interface).

### Download Manager  (rota `downloads`)
- Tela: `src/pages/Downloads.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/services/downloads/registerDownloadsIPC.js`

| API | canal | handler | chama |
|---|---|---|---|
| `downloads.add` | `downloads:add` | `electron/services/downloads/registerDownloadsIPC.js:49` | `manager.add` |
| `downloads.cancel` | `downloads:cancel` | `electron/services/downloads/registerDownloadsIPC.js:57` | `manager.cancel` |
| `downloads.chooseDir` | `downloads:chooseDir` | `electron/services/downloads/registerDownloadsIPC.js:74` | `manager.shutdown` |
| `downloads.clearFinished` | `downloads:clearFinished` | `electron/services/downloads/registerDownloadsIPC.js:59` | `manager.clearFinished` |
| `downloads.list` | `downloads:list` | `electron/services/downloads/registerDownloadsIPC.js:48` | `manager.list`<br>`manager.getSettings` |
| `downloads.onUpdate` | `downloads:update` | `nao encontrado` |  |
| `downloads.pause` | `downloads:pause` | `electron/services/downloads/registerDownloadsIPC.js:53` | `manager.pause` |
| `downloads.pauseAll` | `downloads:pauseAll` | `electron/services/downloads/registerDownloadsIPC.js:55` | `manager.pauseAll` |
| `downloads.remove` | `downloads:remove` | `electron/services/downloads/registerDownloadsIPC.js:58` | `manager.remove` |
| `downloads.resume` | `downloads:resume` | `electron/services/downloads/registerDownloadsIPC.js:54` | `manager.resume` |
| `downloads.resumeAll` | `downloads:resumeAll` | `electron/services/downloads/registerDownloadsIPC.js:56` | `manager.resumeAll` |
| `downloads.setSettings` | `downloads:setSettings` | `electron/services/downloads/registerDownloadsIPC.js:61` | `manager.setSettings` |
| `downloads.showInFolder` | `downloads:showInFolder` | `electron/services/downloads/registerDownloadsIPC.js:67` | `manager.getFilePath` |

### Library  (rota `library`)
- Tela: `src/pages/Library.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/library/GameCard.tsx`, `src/components/library/GameDiscoveryModal.tsx`, `src/components/library/GameEditorModal.tsx`, `src/components/library/ProfileEditor.tsx`, `src/components/library/types.ts`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/latencyGuardian.js`, `electron/main.js`, `electron/optiscalerManager.js`, `electron/services/appEvents.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:2059` |  |
| `latency.launchGameWithProfile` | `latency:launchGameWithProfile` | `electron/latencyGuardian.js:1221` | `argsArray.map`<br>`pingHost.trim`<br>`proc.once`<br>`proc.on` |
| `library.discover` | `library:discover` | `electron/main.js:1521` | `content.matchAll`<br>`steamPaths.push`<br>`steamPaths.map`<br>`entry.isDirectory` |
| `library.fetchCover` | `library:fetchCover` | `electron/main.js:1450` | `service.fetchCover`<br>`i.test`<br>`folder.startsWith`<br>`exeKey.startsWith` |
| `library.list` | `library:list` | `electron/main.js:1387` | `webContents.send` |
| `library.onUpdated` | `library:updated` | `nao encontrado` |  |
| `library.remove` | `library:remove` | `electron/main.js:1435` |  |
| `library.upsert` | `library:upsert` | `electron/main.js:1399` |  |
| `library.upsertBulk` | `library:upsertBulk` | `electron/main.js:1417` |  |
| `optiscaler.apply` | `optiscaler:apply` | `electron/optiscalerManager.js:1234` |  |

### EXIF Editor  (rota `metadata`)
- Tela: `src/pages/MetaDataEditor.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/metadataIpc.js`, `electron/main.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.grantDroppedFiles` | `dialog:grantDroppedFiles` | `electron/main.js:2034` | `filePaths.slice`<br>`granted.push` |
| `dialog.saveFile` | `dialog:saveFile` | `electron/main.js:2069` |  |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `metax.read` | `metax:read` | `electron/ipc/metadataIpc.js:38` | `service.read` |
| `metax.removeStream` | `metax:removeStream` | `electron/ipc/metadataIpc.js:59` | `service.removeStream` |
| `metax.setFileProps` | `metax:setFileProps` | `electron/ipc/metadataIpc.js:54` | `service.setFileProps` |
| `metax.write` | `metax:write` | `electron/ipc/metadataIpc.js:39` | `service.write` |

### Image OCR  (rota `ocr`)
- Tela: `src/pages/ImageTextExtractor.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/shareIpc.js`, `electron/main.js`, `electron/services/susuya/Screenshot.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `ocr.extractText` | `ocr:extractText` | `electron/main.js:2817` | `base64Data.replace`<br>`img.resize`<br>`img.grayscale`<br>`img.clone` |
| `share.grabRegion` | `share:grabRegion` | `electron/ipc/shareIpc.js:189` | `img.toDataURL`<br>`img.getSize`<br>`grabRegionImage() (electron/services/susuya/Screenshot.js)` |

### Password Vault  (rota `passwords`)
- Tela: `src/pages/PasswordManager.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/components/vault/BrowserExtensionSection.tsx`, `src/components/vault/VaultTransferSection.tsx`
- Arquivos de backend: `electron/ipc/shareIpc.js`, `electron/ipc/vaultBridgeIpc.js`, `electron/main.js`, `electron/services/vaultBridge/nativeHost.js`, `electron/services/vaultBridge/vaultHardening.js`, `electron/vaultCrypto.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:2059` |  |
| `share.qr` | `share:qr` | `electron/ipc/shareIpc.js:181` | `s.startsWith`<br>`QRCode.toDataURL` |
| `vault.add` | `vault:add` | `electron/main.js:3063` | `crypto.randomUUID` |
| `vault.bridgeStatus` | `vaultx:bridgeStatus` | `electron/ipc/vaultBridgeIpc.js:185` |  |
| `vault.copyPassword` | `vault:copyPassword` | `electron/main.js:3126` | `clipboard.writeText`<br>`clipboard.readText`<br>`clipboard.clear` |
| `vault.export` | `vault:export` | `electron/main.js:3183` |  |
| `vault.import` | `vault:import` | `electron/main.js:3192` | `backupVaultFile() (electron/services/vaultBridge/vaultHardening.js)` |
| `vault.init` | `vault:init` | `electron/main.js:2983` | `crypto.randomBytes`<br>`recoveryWords.join`<br>`buildKdf() (electron/vaultCrypto.js)`<br>`derivePasswordFromRecoveryWords() (electron/vaultCrypto.js)` |
| `vault.list` | `vault:list` | `electron/main.js:3048` |  |
| `vault.lock` | `vault:lock` | `electron/main.js:3043` |  |
| `vault.onBridgeChanged` | `vaultx:changed` | `nao encontrado` |  |
| `vault.openExtensionFolder` | `vaultx:openExtensionFolder` | `electron/ipc/vaultBridgeIpc.js:211` |  |
| `vault.registerBrowserHost` | `vaultx:registerHost` | `electron/ipc/vaultBridgeIpc.js:187` | `registry.register`<br>`isBrowserId() (electron/services/vaultBridge/nativeHost.js)` |
| `vault.remove` | `vault:remove` | `electron/main.js:3109` |  |
| `vault.reveal` | `vault:reveal` | `electron/main.js:3118` |  |
| `vault.revokeBrowserClient` | `vaultx:revokeClient` | `electron/ipc/vaultBridgeIpc.js:203` | `pairingStore.revoke`<br>`server.disconnectClient` |
| `vault.setBridgeLanguage` | `vaultx:setLanguage` | `electron/ipc/vaultBridgeIpc.js:218` | `lang.toLowerCase` |
| `vault.status` | `vault:status` | `electron/main.js:2973` |  |
| `vault.unlock` | `vault:unlock` | `electron/main.js:3018` |  |
| `vault.unlockWithRecoveryWords` | `vault:unlockWithRecoveryWords` | `electron/main.js:3030` | `words.trim`<br>`derivePasswordFromRecoveryWords() (electron/vaultCrypto.js)` |
| `vault.unregisterBrowserHost` | `vaultx:unregisterHost` | `electron/ipc/vaultBridgeIpc.js:195` | `registry.unregister`<br>`isBrowserId() (electron/services/vaultBridge/nativeHost.js)` |

### PowerShell Tools  (rota `powershell`)
- Tela: `src/pages/PowerShellTools.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSConfirmDialog.tsx`, `src/components/icons/index.tsx`, `src/components/pstools/CustomScriptRunner.tsx`, `src/components/pstools/HostsEditor.tsx`, `src/components/pstools/ResultView.tsx`, `src/components/pstools/ToolCategory.tsx`, `src/components/pstools/ToolForm.tsx`, `src/components/pstools/psSchema.ts`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/powershellIpc.js`, `electron/services/psTools/psToolBuilders.js`

| API | canal | handler | chama |
|---|---|---|---|
| `powershell.customStart` | `powershell:customStart` | `electron/ipc/powershellIpc.js:95` | `kit.startCustom`<br>`sender.isDestroyed`<br>`sender.send` |
| `powershell.customStatus` | `powershell:customStatus` | `electron/ipc/powershellIpc.js:100` | `kit.isCustomRunning` |
| `powershell.customStop` | `powershell:customStop` | `electron/ipc/powershellIpc.js:99` | `kit.stopCustom` |
| `powershell.exportResult` | `powershell:export` | `electron/ipc/powershellIpc.js:67` | `format.toUpperCase`<br>`kit.exportTo` |
| `powershell.getPolicies` | `powershell:getPolicies` | `electron/ipc/powershellIpc.js:37` | `svc.getPolicies` |
| `powershell.hostsBackup` | `powershell:hostsBackup` | `electron/ipc/powershellIpc.js:90` | `kit.readHostsBackup` |
| `powershell.hostsPreview` | `powershell:hostsPreview` | `electron/ipc/powershellIpc.js:91` | `kit.previewHosts` |
| `powershell.hostsRead` | `powershell:hostsRead` | `electron/ipc/powershellIpc.js:89` | `kit.readHosts` |
| `powershell.hostsWrite` | `powershell:hostsWrite` | `electron/ipc/powershellIpc.js:92` | `kit.writeHosts` |
| `powershell.listScripts` | `powershell:listScripts` | `electron/ipc/powershellIpc.js:38` | `svc.listScripts` |
| `powershell.onCustomEvent` | `powershell:customEvent` | `nao encontrado` |  |
| `powershell.openElevatedTerminal` | `powershell:openElevatedTerminal` | `electron/ipc/powershellIpc.js:41` | `svc.openElevatedTerminal` |
| `powershell.openReport` | `powershell:openReport` | `electron/ipc/powershellIpc.js:82` | `i.test`<br>`generated.has`<br>`f.toLowerCase`<br>`isPlainAbsPath() (electron/services/psTools/psToolBuilders.js)` |
| `powershell.pickFolder` | `powershell:pickFolder` | `electron/ipc/powershellIpc.js:50` | `isPlainAbsPath() (electron/services/psTools/psToolBuilders.js)` |
| `powershell.pickSavePath` | `powershell:pickSavePath` | `electron/ipc/powershellIpc.js:56` | `i.test`<br>`ext.toUpperCase` |
| `powershell.previewTool` | `powershell:previewTool` | `electron/ipc/powershellIpc.js:44` | `kit.preview` |
| `powershell.revealFile` | `powershell:revealFile` | `electron/ipc/powershellIpc.js:76` | `generated.has`<br>`f.toLowerCase`<br>`isPlainAbsPath() (electron/services/psTools/psToolBuilders.js)` |
| `powershell.runScript` | `powershell:runScript` | `electron/ipc/powershellIpc.js:40` | `svc.runScript` |
| `powershell.runTool` | `powershell:runTool` | `electron/ipc/powershellIpc.js:45` | `kit.runTool`<br>`generated.add` |
| `powershell.snippetDelete` | `powershell:snippetDelete` | `electron/ipc/powershellIpc.js:103` | `kit.deleteSnippet` |
| `powershell.snippetSave` | `powershell:snippetSave` | `electron/ipc/powershellIpc.js:102` | `kit.saveSnippet` |
| `powershell.snippetsList` | `powershell:snippetsList` | `electron/ipc/powershellIpc.js:101` | `kit.listSnippets` |
| `powershell.wifiKey` | `powershell:wifiKey` | `electron/ipc/powershellIpc.js:88` | `kit.revealWifiKey` |

### Advanced Security  (rota `security`)
- Tela: `src/pages/AdvancedSecurity.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/security/BlocklistsPanel.tsx`, `src/components/security/HardeningPanel.tsx`, `src/components/security/ProtectiveDnsPanel.tsx`, `src/components/security/ui.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/SecurityService.js`, `electron/services/optimizer/DnsEngine.js`

| API | canal | handler | chama |
|---|---|---|---|
| `optimizer.applyDns` | `optimizer:applyDns` | `electron/main.js:2142` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.getDnsState` | `optimizer:getDnsState` | `electron/main.js:2133` | `DnsEngine.getState (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.undoDns` | `optimizer:undoDns` | `electron/main.js:2147` | `DnsEngine.undo (electron/services/optimizer/DnsEngine.js)` |
| `security.advApplyFirewall` | `security:advApplyFirewall` | `electron/services/SecurityService.js:85` | `adv.applyFirewall` |
| `security.advApplyHashes` | `security:advApplyHashes` | `electron/services/SecurityService.js:87` | `adv.applyHashes` |
| `security.advApplyHosts` | `security:advApplyHosts` | `electron/services/SecurityService.js:83` | `adv.applyHosts` |
| `security.advHardeningApply` | `security:advHardeningApply` | `electron/services/SecurityService.js:90` | `adv.hardeningApply` |
| `security.advHardeningRestore` | `security:advHardeningRestore` | `electron/services/SecurityService.js:91` | `adv.hardeningRestore`<br>`advanced.setDataDir` |
| `security.advRestoreFirewall` | `security:advRestoreFirewall` | `electron/services/SecurityService.js:86` | `adv.restoreFirewall` |
| `security.advRestoreHashes` | `security:advRestoreHashes` | `electron/services/SecurityService.js:88` | `adv.restoreHashes` |
| `security.advRestoreHosts` | `security:advRestoreHosts` | `electron/services/SecurityService.js:84` | `adv.restoreHosts` |
| `security.advSetFeedEnabled` | `security:advSetFeedEnabled` | `electron/services/SecurityService.js:81` | `adv.setEnabled` |
| `security.advStatus` | `security:advStatus` | `electron/services/SecurityService.js:80` | `adv.status` |
| `security.advUpdateFeeds` | `security:advUpdateFeeds` | `electron/services/SecurityService.js:82` | `adv.updateFeeds`<br>`ids.map` |
| `security.auditTracking` | `security:auditTracking` | `electron/main.js:3423` | `custom.map`<br>`content.split`<br>`l.trim`<br>`line.startsWith` |
| `security.blockTracking` | `security:blockTracking` | `electron/main.js:3530` | `custom.map`<br>`d.toLowerCase`<br>`content.split`<br>`line.includes` |
| `security.disablePhishingShield` | `security:disablePhishingShield` | `electron/services/SecurityService.js:111` |  |
| `security.getCommunityRules` | `security:getCommunityRules` | `electron/services/SecurityService.js:131` |  |
| `security.getLiveNetworkConnections` | `security:getLiveNetworkConnections` | `electron/services/SecurityService.js:119` |  |
| `security.getPhishingShieldStatus` | `security:getPhishingShieldStatus` | `electron/services/SecurityService.js:115` |  |
| `security.getTrackingDomains` | `security:getTrackingDomains` | `electron/main.js:3473` | `custom.map`<br>`HOSTNAME_RE.test` |
| `security.importCommunityRules` | `security:importCommunityRules` | `electron/services/SecurityService.js:135` |  |
| `security.killProcess` | `security:killProcess` | `electron/main.js:3609` |  |
| `security.resetCommunityRules` | `security:resetCommunityRules` | `electron/services/SecurityService.js:139` | `promises.stat`<br>`entropyCache.has`<br>`entropyCache.get`<br>`stream.on` |
| `security.scanProcesses` | `security:scanProcesses` | `electron/services/SecurityService.js:99` |  |
| `security.scanUrl` | `security:scanUrl` | `electron/services/SecurityService.js:103` |  |
| `security.setCustomTrackingDomains` | `security:setCustomTrackingDomains` | `electron/main.js:3517` |  |
| `security.unblockTracking` | `security:unblockTracking` | `electron/main.js:3582` |  |

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
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `fs.readFile` | `fs:readFile` | `electron/main.js:3622` |  |

### Text Editor  (rota `texteditor`)
- Tela: `src/pages/TextEditor.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/lib/codeExamples.ts`
- Arquivos de backend: `electron/ipc/codeRunnerIpc.js`, `electron/main.js`, `electron/services/CodeRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `code.cancel` | `code:cancel` | `electron/ipc/codeRunnerIpc.js:13` | `cancelRun() (electron/services/CodeRunner.js)` |
| `code.run` | `code:run` | `electron/ipc/codeRunnerIpc.js:12` | `runCode() (electron/services/CodeRunner.js)` |
| `code.runtimes` | `code:runtimes` | `electron/ipc/codeRunnerIpc.js:11` | `detectRuntimes() (electron/services/CodeRunner.js)` |
| `dialog.saveFile` | `dialog:saveFile` | `electron/main.js:2069` |  |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `fs.readFile` | `fs:readFile` | `electron/main.js:3622` |  |
| `fs.writeFile` | `fs:writeFile` | `electron/main.js:3634` | `hotkey.trim`<br>`globalShortcut.unregister`<br>`globalShortcut.register`<br>`devPath.includes` |

### Video Downloader  (rota `youtube`)
- Tela: `src/pages/YoutubeDownloader.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/ytdlpOptions.js`, `electron/ytdlp.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:2048` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:2059` |  |
| `youtube.cancel` | `youtube:cancel` | `electron/main.js:2807` | `cancelActiveYtDlp() (electron/ytdlp.js)` |
| `youtube.download` | `youtube:download` | `electron/main.js:2669` | `cookiesPath.trim`<br>`cookiesFromBrowser.trim`<br>`userAgent.trim`<br>`client.trim` |
| `youtube.getVideoInfo` | `youtube:getVideoInfo` | `electron/main.js:2557` | `cookiesPath.trim`<br>`cookiesFromBrowserRaw.trim`<br>`userAgentRaw.trim`<br>`clientRaw.trim` |
| `youtube.onProgress` | `youtube:downloadProgress` | `nao encontrado` |  |

## Outros

### darkos  (rota `darkos`)
- Tela: `src/pages/DarkOSCenter.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSConfirmDialog.tsx`, `src/components/darkos/DarkOSProgress.tsx`, `src/components/darkos/DarkOSReleaseCard.tsx`, `src/components/darkos/DarkOSSystemPanel.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/darkosData.ts`
- Arquivos de backend: `electron/configManager.js`, `electron/ipc/darkosIpc.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/UpdateService.js`, `electron/services/downloads/registerDownloadsIPC.js`, `electron/services/optimizer/AppManagerEngine.js`, `electron/services/optimizer/ElevationHelper.js`, `electron/services/optimizer/SystemOptimizerService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `darkos.isDarkOS` | `darkos:isDarkOS` | `electron/ipc/darkosIpc.js:59` | `darkhub.ink` |
| `darkos.latestRelease` | `darkos:latestRelease` | `electron/ipc/darkosIpc.js:61` |  |
| `darkos.onRunEvent` | `darkos:runEvent` | `nao encontrado` |  |
| `darkos.reinstallEdge` | `darkos:reinstallEdge` | `electron/ipc/darkosIpc.js:35` | `svc.revertChange`<br>`ElevationHelper.runElevatedPowerShell (electron/services/optimizer/ElevationHelper.js)` |
| `downloads.add` | `downloads:add` | `electron/services/downloads/registerDownloadsIPC.js:49` | `manager.add` |
| `optimizer.getGpuInfo` | `optimizer:getGpuInfo` | `electron/main.js:2092` | `AppManagerEngine.getGpuInfo (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.run` | `optimizer:run` | `electron/main.js:953` | `sender.send`<br>`SystemOptimizerService.runTasks (electron/services/optimizer/SystemOptimizerService.js)` |
| `settings.getConfig` | `settings:getConfig` | `electron/main.js:1761` | `loadPersistedConfig() (electron/configManager.js)` |
| `settings.updateStartupBehavior` | `settings:updateStartupBehavior` | `electron/main.js:1861` | `runPowerShell() (electron/services/PowerShellRunner.js)`<br>`stripBom() (electron/services/PowerShellRunner.js)`<br>`loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1621` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |
| `system.getLiveStats` | `system:getLiveStats` | `electron/main.js:1906` | `liveCpu.sample` |
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
| `driver.detect` | `driver:detect` | `electron/ipc/driverIpc.js:23` | `svc.detectAdapters` |
| `pge.openPortable` | `pge:openPortable` | `electron/main.js:1685` |  |
| `system.getInfo` | `system:getInfo` | `electron/main.js:1026` | `cpuModel.includes`<br>`si.cpu`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `system.getMemory` | `system:getMemory` | `electron/main.js:1901` |  |

### framepacer  (rota `framepacer`)
- Tela: `src/pages/FramePacer.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/FramePacerEngine.js`, `electron/services/FramePacerOverlay.js`

| API | canal | handler | chama |
|---|---|---|---|
| `framepacer.getMetrics` | `framepacer:getMetrics` | `electron/main.js:1998` | `FramePacerEngine.getMetrics (electron/services/FramePacerEngine.js)` |
| `framepacer.getOverlayStatus` | `framepacer:getOverlayStatus` | `electron/main.js:2024` | `getOverlayStatus() (electron/services/FramePacerOverlay.js)` |
| `framepacer.onMetrics` | `framepacer:metrics` | `nao encontrado` |  |
| `framepacer.setOverlayClickThrough` | `framepacer:setOverlayClickThrough` | `electron/main.js:2016` | `setOverlayClickThrough() (electron/services/FramePacerOverlay.js)` |
| `framepacer.start` | `framepacer:start` | `electron/main.js:1986` | `FramePacerEngine.start (electron/services/FramePacerEngine.js)` |
| `framepacer.stop` | `framepacer:stop` | `electron/main.js:1990` | `FramePacerEngine.stop (electron/services/FramePacerEngine.js)` |
| `framepacer.toggleOverlay` | `framepacer:toggleOverlay` | `electron/main.js:2012` | `toggleFramePacerOverlay() (electron/services/FramePacerOverlay.js)` |
| `framepacer.updateConfig` | `framepacer:updateConfig` | `electron/main.js:1994` | `FramePacerEngine.updateConfig (electron/services/FramePacerEngine.js)` |

### overlay-editor  (rota `overlay-editor`)
- Tela: `src/pages/OverlayEditor.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/overlay/OverlayStage.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/overlayIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `overlay.activateLayout` | `overlay:activateLayout` | `electron/ipc/overlayIpc.js:38` |  |
| `overlay.deleteLayout` | `overlay:deleteLayout` | `electron/ipc/overlayIpc.js:37` |  |
| `overlay.layouts` | `overlay:layouts` | `electron/ipc/overlayIpc.js:34` |  |
| `overlay.newLayout` | `overlay:newLayout` | `electron/ipc/overlayIpc.js:36` |  |
| `overlay.preview` | `overlay:preview` | `electron/ipc/overlayIpc.js:39` |  |
| `overlay.saveLayout` | `overlay:saveLayout` | `electron/ipc/overlayIpc.js:35` |  |
| `overlay.setSettings` | `overlay:setSettings` | `electron/ipc/overlayIpc.js:32` |  |

### settings  (rota `settings`)
- Tela: `src/pages/Settings.tsx`
- Componentes/hooks usados: `src/appVersion.ts`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/configManager.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/UpdateService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `app.getResourceUsage` | `app:getResourceUsage` | `electron/main.js:1694` | `metrics.map`<br>`processes.reduce` |
| `settings.getConfig` | `settings:getConfig` | `electron/main.js:1761` | `loadPersistedConfig() (electron/configManager.js)` |
| `settings.updateLiveServices` | `settings:updateLiveServices` | `electron/main.js:1818` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `settings.updateStartupBehavior` | `settings:updateStartupBehavior` | `electron/main.js:1861` | `runPowerShell() (electron/services/PowerShellRunner.js)`<br>`stripBom() (electron/services/PowerShellRunner.js)`<br>`loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `settings.updateTelemetry` | `settings:updateTelemetry` | `electron/main.js:1790` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `settings.updateWindowBehavior` | `settings:updateWindowBehavior` | `electron/main.js:1842` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `updater.check` | `updater:check` | `electron/services/UpdateService.js:357` |  |
| `updater.getStatus` | `updater:getStatus` | `electron/services/UpdateService.js:351` |  |
| `updater.onEvent` | `updater:event` | `nao encontrado` |  |
| `vault.setAutoLockMinutes` | `vault:setAutoLockMinutes` | `electron/main.js:2978` |  |
