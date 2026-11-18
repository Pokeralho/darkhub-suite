<!-- GERADO por electron_feature_map.py em 2026-11-18T17:23:01. NAO edite a mao: rode `npm run map`. -->

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
| `kakugan.dashboard` | `kakugan:dashboard` | `electron/ipc/kakuganIpc.js:122` | `client.dashboard` |
| `kakugan.gameNames` | `kakugan:gameNames` | `electron/ipc/kakuganIpc.js:143` | `client.gameNames` |
| `kakugan.getSettings` | `kakugan:getSettings` | `electron/ipc/kakuganIpc.js:115` |  |
| `kakugan.login` | `kakugan:login` | `electron/ipc/kakuganIpc.js:113` | `client.login` |
| `kakugan.logout` | `kakugan:logout` | `electron/ipc/kakuganIpc.js:114` | `client.logout` |
| `kakugan.openSite` | `kakugan:openSite` | `electron/ipc/kakuganIpc.js:144` | `SITE_PAGES.has` |
| `kakugan.searchGames` | `kakugan:searchGames` | `electron/ipc/kakuganIpc.js:142` | `client.searchGames` |
| `kakugan.setSettings` | `kakugan:setSettings` | `electron/ipc/kakuganIpc.js:116` |  |
| `kakugan.state` | `kakugan:state` | `electron/ipc/kakuganIpc.js:109` | `client.status`<br>`client.plans`<br>`client.me` |
| `kakugan.steamLoginCancel` | `kakugan:steamLoginCancel` | `electron/ipc/kakuganIpc.js:126` | `client.steamLoginCancel` |
| `kakugan.steamLoginPoll` | `kakugan:steamLoginPoll` | `electron/ipc/kakuganIpc.js:124` | `client.steamLoginPoll` |
| `kakugan.steamLoginStart` | `kakugan:steamLoginStart` | `electron/ipc/kakuganIpc.js:123` | `client.steamLoginStart` |

### LuluFlix  (rota `luluflix`)
- Tela: `src/pages/LuluFlix.tsx`
- Componentes/hooks usados: `src/components/EmbeddedSitePage.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Sem chamadas IPC (tela apenas de interface).

### Susuya  (rota `share`)
- Tela: `src/pages/Share.tsx`
- Componentes/hooks usados: `src/components/HotkeyCapture.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/hotkey.ts`
- Arquivos de backend: `electron/ipc/shareIpc.js`, `electron/main.js`, `electron/services/susuya/Screenshot.js`

| API | canal | handler | chama |
|---|---|---|---|
| `share.aiStatus` | `share:aiStatus` | `electron/ipc/shareIpc.js:203` | `ai.available` |
| `share.displays` | `share:displays` | `electron/ipc/shareIpc.js:202` | `listDisplays() (electron/services/susuya/Screenshot.js)` |
| `share.onEvent` | `share:event` | `nao encontrado` |  |
| `share.qr` | `share:qr` | `electron/ipc/shareIpc.js:254` | `s.startsWith`<br>`QRCode.toDataURL` |
| `share.recentShots` | `share:recentShots` | `electron/ipc/shareIpc.js:281` | `i.test` |
| `share.state` | `share:state` | `electron/ipc/shareIpc.js:201` |  |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1422` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |

## Diagnostics & Hardware

### Driver Center  (rota `driver`)
- Tela: `src/pages/DriverCenter.tsx`
- Componentes/hooks usados: `src/components/drivers/MissingDrivers.tsx`, `src/components/icons/index.tsx`, `src/components/optimizer/WuDiagnosis.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/driverIpc.js`, `electron/ipc/restoreIpc.js`, `electron/ipc/winToolsIpc.js`, `electron/services/optimizer/wuDiagnose.js`

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
| `wintools.diagnoseWu` | `wintools:diagnoseWu` | `electron/ipc/winToolsIpc.js:17` | `diagnoseWindowsUpdate() (electron/services/optimizer/wuDiagnose.js)` |
| `wintools.run` | `wintools:run` | `electron/ipc/winToolsIpc.js:15` | `engine.run` |

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
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/gpubench/RunOverlay.tsx`, `src/components/icons/index.tsx`, `src/components/library/Sparkline.tsx`, `src/components/monitor/AdvancedSensorsPanel.tsx`, `src/components/monitor/LhmSensorTree.tsx`, `src/components/monitor/PowerPanel.tsx`, `src/components/monitor/PsuCatalogPicker.tsx`, `src/components/monitor/WallCalibration.tsx`, `src/components/ui/PageHeader.tsx`, `src/hooks/useDeepHardware.ts`, `src/hooks/useSensorHistory.ts`, `src/hooks/useSystemMetrics.ts`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/hal/HardwareHAL.js`, `electron/hal/collectors/HwSensorsDaemon.js`, `electron/ipc/gpuBenchIpc.js`, `electron/ipc/hwSensorsIpc.js`, `electron/ipc/overlayIpc.js`, `electron/main.js`, `electron/services/HardwareService.js`, `electron/services/overlay/powerModel.js`, `electron/services/overlay/wallCalibration.js`

| API | canal | handler | chama |
|---|---|---|---|
| `app.getResourceUsage` | `app:getResourceUsage` | `electron/main.js:1495` | `metrics.map`<br>`processes.reduce` |
| `gpubench.cancel` | `gpubench:cancel` | `electron/ipc/gpuBenchIpc.js:35` | `svc.cancel` |
| `gpubench.onEvent` | `gpubench:event` | `nao encontrado` |  |
| `gpubench.viewport` | `gpubench:viewport` | `electron/ipc/gpuBenchIpc.js:30` | `svc.viewport` |
| `hardware.onUpdate` | `hardware:update` | `nao encontrado` |  |
| `hardware.startPolling` | `hardware:startPolling` | `electron/services/HardwareService.js:51` | `hookedSenders.has`<br>`hookedSenders.add`<br>`sender.once`<br>`hookedSenders.delete` |
| `hardware.stopPolling` | `hardware:stopPolling` | `electron/services/HardwareService.js:69` | `perSender.get`<br>`perSender.set`<br>`perSender.delete`<br>`HAL.getSnapshot (electron/hal/HardwareHAL.js)` |
| `hwsensors.status` | `hwsensors:status` | `electron/ipc/hwSensorsIpc.js:46` | `HwSensorsDaemon.status (electron/hal/collectors/HwSensorsDaemon.js)` |
| `overlay.calibrate` | `overlay:calibrate` | `electron/ipc/overlayIpc.js:45` | `svc.power`<br>`points.slice`<br>`pts.some`<br>`svc.setSettings` |
| `overlay.clearCalibration` | `overlay:clearCalibration` | `electron/ipc/overlayIpc.js:61` |  |
| `overlay.power` | `overlay:power` | `electron/ipc/overlayIpc.js:37` |  |
| `overlay.psuSearch` | `overlay:psuSearch` | `electron/ipc/overlayIpc.js:43` |  |
| `overlay.resetEnergy` | `overlay:resetEnergy` | `electron/ipc/overlayIpc.js:38` |  |
| `overlay.setSettings` | `overlay:setSettings` | `electron/ipc/overlayIpc.js:36` |  |
| `overlay.show` | `overlay:show` | `electron/ipc/overlayIpc.js:34` |  |
| `overlay.status` | `overlay:status` | `electron/ipc/overlayIpc.js:33` |  |
| `system.enableProcessTracking` | `system:enableProcessTracking` | `electron/main.js:883` |  |
| `system.runBenchmark` | `system:runBenchmark` | `electron/main.js:990` | `hrtime.bigint`<br>`parentPort.postMessage`<br>`mops.toFixed`<br>`ms.toFixed` |

### Network & Latency  (rota `networktools`)
- Tela: `src/pages/NetworkTools.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/network/LatencyLab.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/networkIPC.js`, `electron/services/NetLatencyService.js`, `electron/services/PowerShellRunner.js`, `electron/services/network/hostValidation.js`, `electron/services/optimizer/DnsEngine.js`

| API | canal | handler | chama |
|---|---|---|---|
| `network.adapterInfo` | `network:adapterInfo` | `electron/networkIPC.js:143` | `lines.push`<br>`lines.join` |
| `network.applyLatencyTweak` | `network:applyLatencyTweak` | `electron/networkIPC.js:122` | `NetLatencyService.applyTweak (electron/services/NetLatencyService.js)` |
| `network.bufferbloat` | `network:bufferbloat` | `electron/networkIPC.js:119` | `NetLatencyService.bufferbloat (electron/services/NetLatencyService.js)` |
| `network.dnsInfo` | `network:dnsInfo` | `electron/networkIPC.js:125` |  |
| `network.flushDns` | `network:flushDns` | `electron/networkIPC.js:101` |  |
| `network.latencyPresets` | `network:latencyPresets` | `electron/networkIPC.js:116` | `NetLatencyService.getPresets (electron/services/NetLatencyService.js)` |
| `network.latencyState` | `network:latencyState` | `electron/networkIPC.js:121` | `NetLatencyService.getState (electron/services/NetLatencyService.js)` |
| `network.mtuDiscover` | `network:mtuDiscover` | `electron/networkIPC.js:120` | `NetLatencyService.mtu (electron/services/NetLatencyService.js)` |
| `network.ping` | `network:ping` | `electron/networkIPC.js:24` | `output.match`<br>`runCommand() (electron/services/PowerShellRunner.js)`<br>`assertSafeHost() (electron/services/network/hostValidation.js)` |
| `network.portScan` | `network:portScan` | `electron/networkIPC.js:44` | `net.Socket`<br>`socket.setTimeout`<br>`socket.on`<br>`socket.destroy` |
| `network.probe` | `network:probe` | `electron/networkIPC.js:117` | `NetLatencyService.probe (electron/services/NetLatencyService.js)` |
| `network.renewIp` | `network:renewIp` | `electron/networkIPC.js:157` |  |
| `network.resetTcp` | `network:resetTcp` | `electron/networkIPC.js:106` | `NetLatencyService.resetStack (electron/services/NetLatencyService.js)` |
| `network.restoreLatencyTweak` | `network:restoreLatencyTweak` | `electron/networkIPC.js:123` | `NetLatencyService.restoreTweak (electron/services/NetLatencyService.js)` |
| `network.traceHops` | `network:traceHops` | `electron/networkIPC.js:118` | `NetLatencyService.traceroute (electron/services/NetLatencyService.js)` |
| `network.tracert` | `network:tracert` | `electron/networkIPC.js:129` | `runCommand() (electron/services/PowerShellRunner.js)`<br>`assertSafeHost() (electron/services/network/hostValidation.js)` |
| `optimizer.applyDns` | `optimizer:applyDns` | `electron/main.js:1979` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.dnsBenchmark` | `optimizer:dnsBenchmark` | `electron/main.js:1989` | `DnsEngine.benchmark (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.getDnsState` | `optimizer:getDnsState` | `electron/main.js:1970` | `DnsEngine.getState (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.undoDns` | `optimizer:undoDns` | `electron/main.js:1984` | `DnsEngine.undo (electron/services/optimizer/DnsEngine.js)` |

### Post-Install Hub  (rota `setuphub`)
- Tela: `src/pages/SetupHub.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/setup/RestoreComponentsPanel.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/configManager.js`, `electron/ipc/restoreIpc.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/setup/wingetFallback.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1892` |  |
| `restore.install` | `restore:install` | `electron/ipc/restoreIpc.js:13` | `svc.install` |
| `restore.status` | `restore:status` | `electron/ipc/restoreIpc.js:12` | `svc.status` |
| `setup.detectHardware` | `setup:detectHardware` | `electron/main.js:3637` | `si.cpu`<br>`si.graphics`<br>`si.baseboard`<br>`si.memLayout` |
| `setup.installWinget` | `setup:installWinget` | `electron/main.js:3564` | `sender.isDestroyed`<br>`sender.send`<br>`appIds.map`<br>`id.startsWith` |
| `setup.onInstallProgress` | `setup:installProgress` | `nao encontrado` |  |

### DarkHub SSH  (rota `ssh`)
- Tela: `src/pages/Kakugan.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/kakuganIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `kakugan.dashboard` | `kakugan:dashboard` | `electron/ipc/kakuganIpc.js:122` | `client.dashboard` |
| `kakugan.gameNames` | `kakugan:gameNames` | `electron/ipc/kakuganIpc.js:143` | `client.gameNames` |
| `kakugan.getSettings` | `kakugan:getSettings` | `electron/ipc/kakuganIpc.js:115` |  |
| `kakugan.login` | `kakugan:login` | `electron/ipc/kakuganIpc.js:113` | `client.login` |
| `kakugan.logout` | `kakugan:logout` | `electron/ipc/kakuganIpc.js:114` | `client.logout` |
| `kakugan.openSite` | `kakugan:openSite` | `electron/ipc/kakuganIpc.js:144` | `SITE_PAGES.has` |
| `kakugan.searchGames` | `kakugan:searchGames` | `electron/ipc/kakuganIpc.js:142` | `client.searchGames` |
| `kakugan.setSettings` | `kakugan:setSettings` | `electron/ipc/kakuganIpc.js:116` |  |
| `kakugan.state` | `kakugan:state` | `electron/ipc/kakuganIpc.js:109` | `client.status`<br>`client.plans`<br>`client.me` |
| `kakugan.steamLoginCancel` | `kakugan:steamLoginCancel` | `electron/ipc/kakuganIpc.js:126` | `client.steamLoginCancel` |
| `kakugan.steamLoginPoll` | `kakugan:steamLoginPoll` | `electron/ipc/kakuganIpc.js:124` | `client.steamLoginPoll` |
| `kakugan.steamLoginStart` | `kakugan:steamLoginStart` | `electron/ipc/kakuganIpc.js:123` | `client.steamLoginStart` |

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
- Arquivos de backend: `electron/ipc/benchmarkIpc.js`, `electron/ipc/gpuBenchIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `bench.compare` | `bench:compare` | `electron/ipc/benchmarkIpc.js:16` | `svc.compare` |
| `bench.history` | `bench:history` | `electron/ipc/benchmarkIpc.js:15` | `svc.history` |
| `gpubench.cancel` | `gpubench:cancel` | `electron/ipc/gpuBenchIpc.js:35` | `svc.cancel` |
| `gpubench.onEvent` | `gpubench:event` | `nao encontrado` |  |
| `gpubench.remove` | `gpubench:remove` | `electron/ipc/gpuBenchIpc.js:36` | `svc.remove` |
| `gpubench.run` | `gpubench:run` | `electron/ipc/gpuBenchIpc.js:27` | `svc.run` |

### DarkPacer (FPS Lock)  (rota `darkpacer`)
- Tela: `src/pages/FramePacer.tsx`
- Componentes/hooks usados: `src/components/VulkanLowLatencyCard.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/FramePacerEngine.js`, `electron/services/FramePacerOverlay.js`, `electron/services/LowLatencyLayerService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `darkpacer.lowLatencyApply` | `lowlatency:apply` | `electron/main.js:1857` | `LowLatencyLayer.apply (electron/services/LowLatencyLayerService.js)` |
| `darkpacer.lowLatencyStatus` | `lowlatency:getStatus` | `electron/main.js:1853` | `LowLatencyLayer.getStatus (electron/services/LowLatencyLayerService.js)` |
| `framepacer.getMetrics` | `framepacer:getMetrics` | `electron/main.js:1822` | `FramePacerEngine.getMetrics (electron/services/FramePacerEngine.js)` |
| `framepacer.getOverlayStatus` | `framepacer:getOverlayStatus` | `electron/main.js:1848` | `getOverlayStatus() (electron/services/FramePacerOverlay.js)` |
| `framepacer.onMetrics` | `framepacer:metrics` | `nao encontrado` |  |
| `framepacer.setOverlayClickThrough` | `framepacer:setOverlayClickThrough` | `electron/main.js:1840` | `setOverlayClickThrough() (electron/services/FramePacerOverlay.js)` |
| `framepacer.start` | `framepacer:start` | `electron/main.js:1810` | `FramePacerEngine.start (electron/services/FramePacerEngine.js)` |
| `framepacer.stop` | `framepacer:stop` | `electron/main.js:1814` | `FramePacerEngine.stop (electron/services/FramePacerEngine.js)` |
| `framepacer.toggleOverlay` | `framepacer:toggleOverlay` | `electron/main.js:1836` | `toggleFramePacerOverlay() (electron/services/FramePacerOverlay.js)` |
| `framepacer.updateConfig` | `framepacer:updateConfig` | `electron/main.js:1818` | `FramePacerEngine.updateConfig (electron/services/FramePacerEngine.js)` |

### DLL Injector  (rota `dll-injector`)
- Tela: `src/pages/DllInjector.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/injectPolicy.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `injector.inject` | `injector:inject` | `electron/main.js:1768` | `i.test`<br>`dllPath.trim`<br>`stdout.includes`<br>`stdout.trim` |

### DLSS Manager  (rota `dlss5`)
- Tela: `src/pages/Dlss5Manager.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/diskScanIpc.js`, `electron/ipc/upscaleIpc.js`, `electron/main.js`, `electron/services/dlss5/Dlss5Service.js`

| API | canal | handler | chama |
|---|---|---|---|
| `diskscan.pickFolder` | `diskscan:pickFolder` | `electron/ipc/diskScanIpc.js:15` |  |
| `dlss5.detectGpu` | `dlss5:detectGpu` | `electron/services/dlss5/Dlss5Service.js:748` | `service.detectGpu` |
| `dlss5.getSteamGames` | `dlss5:getSteamGames` | `electron/services/dlss5/Dlss5Service.js:739` | `service.getInstalledSteamGames` |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1422` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |
| `upscale.autopilotStatus` | `upscale:autopilotStatus` | `electron/ipc/upscaleIpc.js:47` | `autopilot.status` |
| `upscale.dlssLatest` | `upscale:dlssLatest` | `electron/ipc/upscaleIpc.js:29` | `updater.latest` |

### GPU benchmark  (rota `gpubench`)
- Tela: `src/pages/GpuBench.tsx`
- Componentes/hooks usados: `src/components/gpubench/RankingTop.tsx`, `src/components/gpubench/RunOverlay.tsx`, `src/components/gpubench/StressPanel.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/gpuBenchIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `gpubench.cancel` | `gpubench:cancel` | `electron/ipc/gpuBenchIpc.js:35` | `svc.cancel` |
| `gpubench.link` | `gpubench:link` | `electron/ipc/gpuBenchIpc.js:37` | `svc.link` |
| `gpubench.onEvent` | `gpubench:event` | `nao encontrado` |  |
| `gpubench.openRanking` | `gpubench:openRanking` | `electron/ipc/gpuBenchIpc.js:39` | `svc.openRanking`<br>`svc.cancel` |
| `gpubench.ranking` | `gpubench:ranking` | `electron/ipc/gpuBenchIpc.js:29` | `svc.ranking` |
| `gpubench.remove` | `gpubench:remove` | `electron/ipc/gpuBenchIpc.js:36` | `svc.remove` |
| `gpubench.removeStress` | `gpubench:removeStress` | `electron/ipc/gpuBenchIpc.js:34` | `svc.removeStress` |
| `gpubench.run` | `gpubench:run` | `electron/ipc/gpuBenchIpc.js:27` | `svc.run` |
| `gpubench.status` | `gpubench:status` | `electron/ipc/gpuBenchIpc.js:26` | `svc.status` |
| `gpubench.stress` | `gpubench:stress` | `electron/ipc/gpuBenchIpc.js:28` | `svc.stress` |
| `gpubench.unlink` | `gpubench:unlink` | `electron/ipc/gpuBenchIpc.js:38` | `svc.unlink` |
| `gpubench.viewport` | `gpubench:viewport` | `electron/ipc/gpuBenchIpc.js:30` | `svc.viewport` |

### System Optimizer  (rota `optimizer`)
- Tela: `src/pages/Optimizer.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSOptimizerHint.tsx`, `src/components/icons/index.tsx`, `src/components/optimizer/WindowsToolsPanel.tsx`, `src/components/optimizer/WuDiagnosis.tsx`, `src/components/ui/PageHeader.tsx`, `src/hooks/useDialogA11y.ts`
- Arquivos de backend: `electron/ipc/darkosIpc.js`, `electron/ipc/winToolsIpc.js`, `electron/main.js`, `electron/services/optimizer/AppManagerEngine.js`, `electron/services/optimizer/DeepTweaksEngine.js`, `electron/services/optimizer/DefenderControlEngine.js`, `electron/services/optimizer/DnsEngine.js`, `electron/services/optimizer/NetworkEngine.js`, `electron/services/optimizer/SystemEngine.js`, `electron/services/optimizer/SystemOptimizerService.js`, `electron/services/optimizer/wuDiagnose.js`

| API | canal | handler | chama |
|---|---|---|---|
| `darkos.isDarkOS` | `darkos:isDarkOS` | `electron/ipc/darkosIpc.js:65` | `darkhub.ink` |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `optimizer.advancedNetworkApply` | `optimizer:advancedNetworkApply` | `electron/main.js:1931` | `NetworkEngine.advancedNetworkApply (electron/services/optimizer/NetworkEngine.js)` |
| `optimizer.advancedNetworkRevert` | `optimizer:advancedNetworkRevert` | `electron/main.js:1932` | `NetworkEngine.advancedNetworkRevert (electron/services/optimizer/NetworkEngine.js)` |
| `optimizer.applyDefenderControl` | `optimizer:applyDefenderControl` | `electron/main.js:2090` | `DefenderControlEngine.runNativeDefenderControl (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.applyDns` | `optimizer:applyDns` | `electron/main.js:1979` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.checkIsAdmin` | `optimizer:checkIsAdmin` | `electron/main.js:750` | `SystemOptimizerService.checkIsAdmin (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.checkOperationsStatus` | `optimizer:checkOperationsStatus` | `electron/main.js:731` | `SystemOptimizerService.checkOperationsStatus (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.createRestorePoint` | `optimizer:createRestorePoint` | `electron/main.js:754` | `SystemEngine.createRestorePoint (electron/services/optimizer/SystemEngine.js)` |
| `optimizer.deepTweaksApply` | `optimizer:deepTweaksApply` | `electron/main.js:1958` | `DeepTweaksEngine.applyTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` |
| `optimizer.deepTweaksList` | `optimizer:deepTweaksList` | `electron/main.js:1934` | `DeepTweaksEngine.ensureResolved (electron/services/optimizer/DeepTweaksEngine.js)`<br>`DeepTweaksEngine.listTweaks (electron/services/optimizer/DeepTweaksEngine.js)` |
| `optimizer.deepTweaksRevert` | `optimizer:deepTweaksRevert` | `electron/main.js:1959` | `DeepTweaksEngine.revertTweaks (electron/services/optimizer/DeepTweaksEngine.js)`<br>`sender.send` |
| `optimizer.deepTweaksStatus` | `optimizer:deepTweaksStatus` | `electron/main.js:1951` | `DeepTweaksEngine.checkTweaksStatus (electron/services/optimizer/DeepTweaksEngine.js)` |
| `optimizer.deepTweaksUndo` | `optimizer:deepTweaksUndo` | `electron/main.js:1960` | `DeepTweaksEngine.undoTweaks (electron/services/optimizer/DeepTweaksEngine.js)` |
| `optimizer.disableStartupItem` | `optimizer:disableStartupItem` | `electron/main.js:1913` | `AppManagerEngine.disableStartupItem (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.dnsBenchmark` | `optimizer:dnsBenchmark` | `electron/main.js:1989` | `DnsEngine.benchmark (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.getDefenderControlStatus` | `optimizer:getDefenderControlStatus` | `electron/main.js:2087` | `DefenderControlEngine.getStatus (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.getDnsState` | `optimizer:getDnsState` | `electron/main.js:1970` | `DnsEngine.getState (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.getGpuInfo` | `optimizer:getGpuInfo` | `electron/main.js:1925` | `AppManagerEngine.getGpuInfo (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getGpuPreferences` | `optimizer:getGpuPreferences` | `electron/main.js:1922` | `AppManagerEngine.getGpuPreferences (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getHagsStatus` | `optimizer:getHagsStatus` | `electron/main.js:1926` | `AppManagerEngine.getHagsStatus (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getInstalledPrograms` | `optimizer:getInstalledPrograms` | `electron/main.js:1916` | `AppManagerEngine.getInstalledPrograms (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getRunningProcesses` | `optimizer:getRunningProcesses` | `electron/main.js:1920` | `AppManagerEngine.getRunningProcesses (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.getStartupItems` | `optimizer:getStartupItems` | `electron/main.js:1912` | `AppManagerEngine.getStartupItems (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.listBloatware` | `optimizer:listBloatware` | `electron/main.js:1918` | `AppManagerEngine.listBloatware (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.listOperations` | `optimizer:listOperations` | `electron/main.js:727` | `SystemOptimizerService.listOperations (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.listProfiles` | `optimizer:listProfiles` | `electron/main.js:746` | `SystemOptimizerService.listProfiles (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.onRunEvent` | `optimizer:runEvent` | `nao encontrado` |  |
| `optimizer.openTamperSettings` | `optimizer:openTamperSettings` | `electron/main.js:2096` | `DefenderControlEngine.openTamperSettings (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.removeGpuPreference` | `optimizer:removeGpuPreference` | `electron/main.js:1924` | `AppManagerEngine.removeGpuPreference (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.removeSelectedBloatware` | `optimizer:removeSelectedBloatware` | `electron/main.js:1919` | `AppManagerEngine.removeSelectedBloatware (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.restoreImageDefender` | `optimizer:restoreImageDefender` | `electron/main.js:2093` | `DefenderControlEngine.restoreImageDefender (electron/services/optimizer/DefenderControlEngine.js)` |
| `optimizer.revertHags` | `optimizer:revertHags` | `electron/main.js:1928` | `AppManagerEngine.revertHags (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.run` | `optimizer:run` | `electron/main.js:739` | `sender.send`<br>`SystemOptimizerService.runTasks (electron/services/optimizer/SystemOptimizerService.js)` |
| `optimizer.setGpuPreference` | `optimizer:setGpuPreference` | `electron/main.js:1923` | `AppManagerEngine.setGpuPreference (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.setHagsStatus` | `optimizer:setHagsStatus` | `electron/main.js:1927` | `AppManagerEngine.setHagsStatus (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.setProcessPriority` | `optimizer:setProcessPriority` | `electron/main.js:1921` | `AppManagerEngine.setProcessPriority (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.undoDns` | `optimizer:undoDns` | `electron/main.js:1984` | `DnsEngine.undo (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.uninstallProgramWithLeftovers` | `optimizer:uninstallProgramWithLeftovers` | `electron/main.js:1930` | `AppManagerEngine.uninstallProgramWithLeftovers (electron/services/optimizer/AppManagerEngine.js)` |
| `wintools.diagnoseWu` | `wintools:diagnoseWu` | `electron/ipc/winToolsIpc.js:17` | `diagnoseWindowsUpdate() (electron/services/optimizer/wuDiagnose.js)` |
| `wintools.listFeatures` | `wintools:listFeatures` | `electron/ipc/winToolsIpc.js:13` | `engine.listFeatures` |
| `wintools.run` | `wintools:run` | `electron/ipc/winToolsIpc.js:15` | `engine.run` |

### OptiScaler Manager  (rota `optiscaler`)
- Tela: `src/pages/OptiScalerManager.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSConfirmDialog.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/optiscalerManager.js`, `electron/services/SecureDownload.js`, `electron/services/dlss5/Dlss5Service.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `dlss5.getSteamGames` | `dlss5:getSteamGames` | `electron/services/dlss5/Dlss5Service.js:739` | `service.getInstalledSteamGames` |
| `dlss5.scanGame` | `dlss5:scanGame` | `electron/services/dlss5/Dlss5Service.js:756` | `service.scanGameDirectory` |
| `library.list` | `library:list` | `electron/main.js:1175` | `webContents.send` |
| `library.remove` | `library:remove` | `electron/main.js:1223` |  |
| `library.upsert` | `library:upsert` | `electron/main.js:1187` |  |
| `optiscaler.analyze` | `optiscaler:analyze` | `electron/optiscalerManager.js:1265` |  |
| `optiscaler.apply` | `optiscaler:apply` | `electron/optiscalerManager.js:1273` |  |
| `optiscaler.checkUpdate` | `optiscaler:checkUpdate` | `electron/optiscalerManager.js:1313` | `i.test`<br>`fetchJson() (electron/services/SecureDownload.js)`<br>`assetSha256() (electron/services/SecureDownload.js)` |
| `optiscaler.createManualBackup` | `optiscaler:createManualBackup` | `electron/optiscalerManager.js:1305` |  |
| `optiscaler.deleteBackup` | `optiscaler:deleteBackup` | `electron/optiscalerManager.js:1297` |  |
| `optiscaler.downloadUpdate` | `optiscaler:downloadUpdate` | `electron/optiscalerManager.js:1326` |  |
| `optiscaler.listBackups` | `optiscaler:listBackups` | `electron/optiscalerManager.js:1281` |  |
| `optiscaler.restoreBackup` | `optiscaler:restoreBackup` | `electron/optiscalerManager.js:1289` |  |

### In-game overlay  (rota `overlay`)
- Tela: `src/pages/GameOverlay.tsx`
- Componentes/hooks usados: `src/components/HotkeyCapture.tsx`, `src/components/gpubench/RunOverlay.tsx`, `src/components/icons/index.tsx`, `src/components/monitor/PowerPanel.tsx`, `src/components/monitor/PsuCatalogPicker.tsx`, `src/components/monitor/WallCalibration.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/hotkey.ts`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/ipc/gpuBenchIpc.js`, `electron/ipc/overlayIpc.js`, `electron/services/NativeLatencyClient.js`, `electron/services/overlay/powerModel.js`, `electron/services/overlay/wallCalibration.js`

| API | canal | handler | chama |
|---|---|---|---|
| `gpubench.cancel` | `gpubench:cancel` | `electron/ipc/gpuBenchIpc.js:35` | `svc.cancel` |
| `gpubench.onEvent` | `gpubench:event` | `nao encontrado` |  |
| `gpubench.viewport` | `gpubench:viewport` | `electron/ipc/gpuBenchIpc.js:30` | `svc.viewport` |
| `overlay.calibrate` | `overlay:calibrate` | `electron/ipc/overlayIpc.js:45` | `svc.power`<br>`points.slice`<br>`pts.some`<br>`svc.setSettings` |
| `overlay.clearCalibration` | `overlay:clearCalibration` | `electron/ipc/overlayIpc.js:61` |  |
| `overlay.hide` | `overlay:hide` | `electron/ipc/overlayIpc.js:35` |  |
| `overlay.layouts` | `overlay:layouts` | `electron/ipc/overlayIpc.js:63` |  |
| `overlay.onEvent` | `overlay:event` | `nao encontrado` |  |
| `overlay.pickLogFolder` | `overlay:pickLogFolder` | `electron/ipc/overlayIpc.js:73` |  |
| `overlay.power` | `overlay:power` | `electron/ipc/overlayIpc.js:37` |  |
| `overlay.processes` | `overlay:processes` | `electron/ipc/overlayIpc.js:69` | `nativeLatencyClient.listProcesses (electron/services/NativeLatencyClient.js)` |
| `overlay.psuSearch` | `overlay:psuSearch` | `electron/ipc/overlayIpc.js:43` |  |
| `overlay.resetEnergy` | `overlay:resetEnergy` | `electron/ipc/overlayIpc.js:38` |  |
| `overlay.setSettings` | `overlay:setSettings` | `electron/ipc/overlayIpc.js:36` |  |
| `overlay.show` | `overlay:show` | `electron/ipc/overlayIpc.js:34` |  |
| `overlay.status` | `overlay:status` | `electron/ipc/overlayIpc.js:33` |  |

### Save backup  (rota `savebackup`)
- Tela: `src/pages/SaveBackup.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/saveBackupIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `saves.onEvent` | `saves:event` | `nao encontrado` |  |
| `saves.openFolder` | `saves:openFolder` | `electron/ipc/saveBackupIpc.js:67` | `svc._gameDir`<br>`svc.settings` |
| `saves.versions` | `saves:versions` | `electron/ipc/saveBackupIpc.js:45` | `svc.versions` |

### Ultra Low Latency  (rota `ultra-latency`)
- Tela: `src/pages/UltraLowLatency.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/HotkeyCapture.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/hotkey.ts`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/latencyGuardian.js`, `electron/main.js`, `electron/services/NativeLatencyClient.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `latency.boostNow` | `latency:boostNow` | `electron/latencyGuardian.js:1263` |  |
| `latency.disableUltra` | `latency:disableUltra` | `electron/latencyGuardian.js:1244` |  |
| `latency.enableUltra` | `latency:enableUltra` | `electron/latencyGuardian.js:1199` |  |
| `latency.enableUltraStable` | `latency:enableUltraStable` | `electron/latencyGuardian.js:1209` |  |
| `latency.getConfig` | `latency:getConfig` | `electron/latencyGuardian.js:1150` | `nativeLatencyClient.queryTimer (electron/services/NativeLatencyClient.js)` |
| `latency.setConfig` | `latency:setConfig` | `electron/latencyGuardian.js:1184` |  |

## Overview

### Dashboard  (rota `dashboard`)
- Tela: `src/pages/Dashboard.tsx`
- Componentes/hooks usados: `src/components/ExtensionFrame.tsx`, `src/components/icons/index.tsx`, `src/components/library/Sparkline.tsx`, `src/components/ui/PageHeader.tsx`, `src/hooks/useDialogA11y.ts`, `src/hooks/useJunkScanner.ts`, `src/hooks/useRecentActivity.ts`, `src/hooks/useSecurityScore.ts`, `src/hooks/useSensorHistory.ts`, `src/hooks/useSystemMetrics.ts`, `src/lib/extensions.ts`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/hal/HardwareHAL.js`, `electron/ipc/hubIpc.js`, `electron/main.js`, `electron/services/HardwareService.js`, `electron/services/optimizer/MemoryEngine.js`, `electron/services/optimizer/StorageEngine.js`, `electron/services/optimizer/SystemEngine.js`

| API | canal | handler | chama |
|---|---|---|---|
| `ext.call` | `ext:call` | `electron/ipc/hubIpc.js:151` | `host.call` |
| `ext.doc` | `ext:doc` | `electron/ipc/hubIpc.js:150` | `host.doc` |
| `ext.log` | `ext:log` | `electron/ipc/hubIpc.js:154` | `host.log` |
| `hardware.onUpdate` | `hardware:update` | `nao encontrado` |  |
| `hardware.startPolling` | `hardware:startPolling` | `electron/services/HardwareService.js:51` | `hookedSenders.has`<br>`hookedSenders.add`<br>`sender.once`<br>`hookedSenders.delete` |
| `hardware.stopPolling` | `hardware:stopPolling` | `electron/services/HardwareService.js:69` | `perSender.get`<br>`perSender.set`<br>`perSender.delete`<br>`HAL.getSnapshot (electron/hal/HardwareHAL.js)` |
| `hub.list` | `hub:list` | `electron/ipc/hubIpc.js:131` | `svc.list` |
| `hub.onEvent` | `hub:event` | `nao encontrado` |  |
| `library.onActivityLogged` | `library:activityLogged` | `nao encontrado` |  |
| `library.onGameStarted` | `library:gameStarted` | `nao encontrado` |  |
| `library.onGameStopped` | `library:gameStopped` | `nao encontrado` |  |
| `optimizer.applyTweak` | `optimizer:applyTweak` | `electron/main.js:1935` | `MemoryEngine.optimizeRAM (electron/services/optimizer/MemoryEngine.js)`<br>`StorageEngine.cleanTempFiles (electron/services/optimizer/StorageEngine.js)`<br>`SystemEngine.repairWindows (electron/services/optimizer/SystemEngine.js)` |
| `optimizer.createRestorePoint` | `optimizer:createRestorePoint` | `electron/main.js:754` | `SystemEngine.createRestorePoint (electron/services/optimizer/SystemEngine.js)` |
| `security.getSecurityScore` | `security:getSecurityScore` | `electron/main.js:3088` |  |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1422` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |
| `system.getJunkEstimate` | `system:getJunkEstimate` | `electron/main.js:1167` |  |

### Home  (rota `home`)
- Tela: `src/pages/Home.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/ipc/driverIpc.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `driver.detect` | `driver:detect` | `electron/ipc/driverIpc.js:23` | `svc.detectAdapters` |
| `pge.openPortable` | `pge:openPortable` | `electron/main.js:1486` |  |
| `system.getInfo` | `system:getInfo` | `electron/main.js:814` | `cpuModel.includes`<br>`si.cpu`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `system.getMemory` | `system:getMemory` | `electron/main.js:1738` |  |

### Presets e módulos  (rota `presets`)
- Tela: `src/pages/Presets.tsx`
- Componentes/hooks usados: `src/components/hub/HubPreview.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/lib/extensions.ts`
- Arquivos de backend: `electron/ipc/hubIpc.js`, `electron/main.js`

| API | canal | handler | chama |
|---|---|---|---|
| `ext.devAdd` | `ext:devAdd` | `electron/ipc/hubIpc.js:157` |  |
| `ext.devList` | `ext:devList` | `electron/ipc/hubIpc.js:156` |  |
| `ext.devRemove` | `ext:devRemove` | `electron/ipc/hubIpc.js:162` | `watchers.get`<br>`watchers.delete` |
| `hub.catalog.inspect` | `hub:catalog:inspect` | `electron/ipc/hubIpc.js:142` | `catalog.inspect` |
| `hub.catalog.install` | `hub:catalog:install` | `electron/ipc/hubIpc.js:143` | `catalog.install` |
| `hub.catalog.search` | `hub:catalog:search` | `electron/ipc/hubIpc.js:140` | `catalog.search` |
| `hub.catalog.setServer` | `hub:catalog:setServer` | `electron/ipc/hubIpc.js:139` | `catalog.setServer` |
| `hub.catalog.update` | `hub:catalog:update` | `electron/ipc/hubIpc.js:145` | `catalog.update` |
| `hub.catalog.updates` | `hub:catalog:updates` | `electron/ipc/hubIpc.js:144` | `catalog.updates` |
| `hub.exportMine` | `hub:exportMine` | `electron/ipc/hubIpc.js:136` | `svc.exportMine` |
| `hub.hardware` | `hub:hardware` | `electron/ipc/hubIpc.js:132` | `svc.hardware` |
| `hub.inspect` | `hub:inspect` | `electron/ipc/hubIpc.js:137` | `svc.inspect` |
| `hub.install` | `hub:install` | `electron/ipc/hubIpc.js:134` | `svc.install` |
| `hub.list` | `hub:list` | `electron/ipc/hubIpc.js:131` | `svc.list` |
| `hub.mcp.regenerate` | `hub:mcp:regenerate` | `electron/ipc/hubIpc.js:149` | `mcp.regenerateToken` |
| `hub.mcp.setEnabled` | `hub:mcp:setEnabled` | `electron/ipc/hubIpc.js:148` | `mcp.setEnabled` |
| `hub.mcp.status` | `hub:mcp:status` | `electron/ipc/hubIpc.js:147` | `mcp.status` |
| `hub.onEvent` | `hub:event` | `nao encontrado` |  |
| `hub.openFile` | `hub:openFile` | `electron/ipc/hubIpc.js:164` |  |
| `hub.pendingLink` | `hub:pendingLink` | `electron/ipc/hubIpc.js:146` |  |
| `hub.saveFile` | `hub:saveFile` | `electron/ipc/hubIpc.js:171` | `mcp.init`<br>`host.response`<br>`watchers.values`<br>`w.close` |
| `hub.uninstall` | `hub:uninstall` | `electron/ipc/hubIpc.js:135` | `svc.uninstall` |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1422` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |

### Real-time  (rota `realtime`)
- Tela: `src/pages/Realtime.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/diskScanIpc.js`, `electron/ipc/realtimeIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `diskscan.pickFolder` | `diskscan:pickFolder` | `electron/ipc/diskScanIpc.js:15` |  |
| `realtime.onEvent` | `realtime:event` | `nao encontrado` |  |
| `realtime.quarantineList` | `realtime:quarantineList` | `electron/ipc/realtimeIpc.js:133` | `quarantine.list` |
| `realtime.setConfig` | `realtime:setConfig` | `electron/ipc/realtimeIpc.js:127` | `store.update` |
| `realtime.status` | `realtime:status` | `electron/ipc/realtimeIpc.js:112` | `clamav.status`<br>`clamav.install`<br>`clamav.update`<br>`store.update` |

## Utilities & Tools

### AutoClicker  (rota `autoclicker`)
- Tela: `src/pages/AutoClicker.tsx`
- Componentes/hooks usados: `src/components/HotkeyCapture.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/hotkey.ts`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/main.js`, `electron/services/autoclicker/PointPicker.js`

| API | canal | handler | chama |
|---|---|---|---|
| `autoclicker.macroClear` | `autoclicker:macroClear` | `electron/main.js:3368` | `autoClicker.macroClear` |
| `autoclicker.macroCompileExe` | `autoclicker:macroCompileExe` | `electron/main.js:3392` | `autoClicker.macroCompileExe`<br>`makePointPicker() (electron/services/autoclicker/PointPicker.js)` |
| `autoclicker.macroOpenFile` | `autoclicker:macroOpenFile` | `electron/main.js:3369` | `autoClicker.state`<br>`autoClicker.macroLoadFromPath` |
| `autoclicker.macroPlayStart` | `autoclicker:macroPlayStart` | `electron/main.js:3366` | `autoClicker.macroPlayStart` |
| `autoclicker.macroPlayStop` | `autoclicker:macroPlayStop` | `electron/main.js:3367` | `autoClicker.macroPlayStop` |
| `autoclicker.macroRecordStart` | `autoclicker:macroRecordStart` | `electron/main.js:3364` | `autoClicker.macroRecordStart` |
| `autoclicker.macroRecordStop` | `autoclicker:macroRecordStop` | `electron/main.js:3365` | `autoClicker.macroRecordStop` |
| `autoclicker.macroSaveFile` | `autoclicker:macroSaveFile` | `electron/main.js:3382` | `autoClicker.macroSaveToPath` |
| `autoclicker.macroSetConfig` | `autoclicker:macroSetConfig` | `electron/main.js:3363` | `autoClicker.macroSetConfig` |
| `autoclicker.onChanged` | `autoclicker:changed` | `nao encontrado` |  |
| `autoclicker.setHotkey` | `autoclicker:setHotkey` | `electron/main.js:3361` | `autoClicker.setHotkey` |
| `autoclicker.setTabActive` | `autoclicker:setTabActive` | `electron/main.js:3362` |  |
| `autoclicker.start` | `autoclicker:start` | `electron/main.js:3357` | `autoClicker.start` |
| `autoclicker.status` | `autoclicker:status` | `electron/main.js:3356` | `autoClicker.state` |
| `autoclicker.stop` | `autoclicker:stop` | `electron/main.js:3358` | `autoClicker.stop` |
| `autoclicker.waypointsPickScreen` | `autoclicker:waypointsPickScreen` | `electron/main.js:3410` | `autoClicker.state`<br>`autoClicker.waypointsAddPicked` |
| `autoclicker.waypointsPlay` | `autoclicker:waypointsPlay` | `electron/main.js:3409` | `autoClicker.waypointsPlay` |
| `autoclicker.waypointsSave` | `autoclicker:waypointsSave` | `electron/main.js:3408` | `autoClicker.waypointsSave` |

### Limpeza profunda  (rota `cleaner`)
- Tela: `src/pages/Cleaner.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/recovery/rescueUtils.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/cleanerIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `cleaner.browsers` | `cleaner:browsers` | `electron/ipc/cleanerIpc.js:20` | `svc.browsers` |
| `cleaner.clean` | `cleaner:clean` | `electron/ipc/cleanerIpc.js:19` | `svc.clean` |
| `cleaner.listBackups` | `cleaner:list-backups` | `electron/ipc/cleanerIpc.js:23` | `svc.listBackups` |
| `cleaner.listTargets` | `cleaner:list-targets` | `electron/ipc/cleanerIpc.js:17` | `svc.listTargets` |
| `cleaner.openBackups` | `cleaner:open-backups` | `electron/ipc/cleanerIpc.js:25` | `svc.listBackups` |
| `cleaner.regClean` | `cleaner:reg-clean` | `electron/ipc/cleanerIpc.js:22` | `svc.regClean` |
| `cleaner.regScan` | `cleaner:reg-scan` | `electron/ipc/cleanerIpc.js:21` | `svc.regScan` |
| `cleaner.removeDefinitions` | `cleaner:remove-definitions` | `electron/ipc/cleanerIpc.js:16` | `svc.removeDefinitions` |
| `cleaner.restoreBackup` | `cleaner:restore-backup` | `electron/ipc/cleanerIpc.js:24` | `svc.restoreBackup` |
| `cleaner.scan` | `cleaner:scan` | `electron/ipc/cleanerIpc.js:18` | `svc.scan` |
| `cleaner.status` | `cleaner:status` | `electron/ipc/cleanerIpc.js:14` | `svc.status` |
| `cleaner.updateDefinitions` | `cleaner:update-definitions` | `electron/ipc/cleanerIpc.js:15` | `svc.updateDefinitions` |

### File Converter  (rota `converter`)
- Tela: `src/pages/FileConverter.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/converterIpc.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/converter/DocumentConverter.js`, `electron/services/converter/MediaConverter.js`, `electron/services/converter/docRoutes.js`, `electron/services/converter/vendorTools.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.grantDroppedFiles` | `dialog:grantDroppedFiles` | `electron/main.js:1867` | `filePaths.slice`<br>`granted.push` |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1892` |  |
| `files.archiveOperation` | `files:archiveOperation` | `electron/main.js:2121` | `inputFiles.map`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `files.cancelConvert` | `files:cancelConvert` | `electron/ipc/converterIpc.js:96` | `jobs.get`<br>`job.cancel` |
| `files.convertDocuments` | `files:convertDocuments` | `electron/ipc/converterIpc.js:94` | `documents.convert` |
| `files.convertImages` | `files:convertImages` | `electron/ipc/converterIpc.js:86` | `images.convert` |
| `files.convertMedia` | `files:convertMedia` | `electron/ipc/converterIpc.js:88` | `ffmpegPath.trim`<br>`convertMedia() (electron/services/converter/MediaConverter.js)` |
| `files.converterCapabilities` | `files:converterCapabilities` | `electron/ipc/converterIpc.js:113` | `hw.map`<br>`jobs.values`<br>`job.cancel`<br>`detectHwEncoders() (electron/services/converter/MediaConverter.js)` |
| `files.docTargets` | `files:docTargets` | `electron/ipc/converterIpc.js:108` | `commonOutputs() (electron/services/converter/docRoutes.js)` |
| `files.onConvertProgress` | `files:convertProgress` | `nao encontrado` |  |

### Decryption  (rota `decryption`)
- Tela: `src/pages/Decryption.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/lib/cipherTools.ts`
- Sem chamadas IPC (tela apenas de interface).

### Developer Tools  (rota `devtools`)
- Tela: `src/pages/DevTools.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/devtools/ColorPicker.tsx`, `src/devtools/TextToolViews.tsx`, `src/devtools/UnitConverter.tsx`, `src/devtools/color.ts`, `src/devtools/textTools.ts`, `src/devtools/ui.tsx`, `src/devtools/units.ts`
- Sem chamadas IPC (tela apenas de interface).

### Disk Studio & Rescue  (rota `disk-rescue`)
- Tela: `src/pages/Cleaner.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/recovery/rescueUtils.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/cleanerIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `cleaner.browsers` | `cleaner:browsers` | `electron/ipc/cleanerIpc.js:20` | `svc.browsers` |
| `cleaner.clean` | `cleaner:clean` | `electron/ipc/cleanerIpc.js:19` | `svc.clean` |
| `cleaner.listBackups` | `cleaner:list-backups` | `electron/ipc/cleanerIpc.js:23` | `svc.listBackups` |
| `cleaner.listTargets` | `cleaner:list-targets` | `electron/ipc/cleanerIpc.js:17` | `svc.listTargets` |
| `cleaner.openBackups` | `cleaner:open-backups` | `electron/ipc/cleanerIpc.js:25` | `svc.listBackups` |
| `cleaner.regClean` | `cleaner:reg-clean` | `electron/ipc/cleanerIpc.js:22` | `svc.regClean` |
| `cleaner.regScan` | `cleaner:reg-scan` | `electron/ipc/cleanerIpc.js:21` | `svc.regScan` |
| `cleaner.removeDefinitions` | `cleaner:remove-definitions` | `electron/ipc/cleanerIpc.js:16` | `svc.removeDefinitions` |
| `cleaner.restoreBackup` | `cleaner:restore-backup` | `electron/ipc/cleanerIpc.js:24` | `svc.restoreBackup` |
| `cleaner.scan` | `cleaner:scan` | `electron/ipc/cleanerIpc.js:18` | `svc.scan` |
| `cleaner.status` | `cleaner:status` | `electron/ipc/cleanerIpc.js:14` | `svc.status` |
| `cleaner.updateDefinitions` | `cleaner:update-definitions` | `electron/ipc/cleanerIpc.js:15` | `svc.updateDefinitions` |

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
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1892` |  |
| `latency.launchGameWithProfile` | `latency:launchGameWithProfile` | `electron/latencyGuardian.js:1308` | `argsArray.map`<br>`pingHost.trim`<br>`proc.once`<br>`proc.on` |
| `library.discover` | `library:discover` | `electron/main.js:1309` | `steamSvc.getSteamPath`<br>`steamSvc.getLibraryPaths`<br>`steamPaths.push`<br>`content.matchAll` |
| `library.fetchCover` | `library:fetchCover` | `electron/main.js:1238` | `service.fetchCover`<br>`i.test`<br>`folder.startsWith`<br>`exeKey.startsWith` |
| `library.list` | `library:list` | `electron/main.js:1175` | `webContents.send` |
| `library.onUpdated` | `library:updated` | `nao encontrado` |  |
| `library.remove` | `library:remove` | `electron/main.js:1223` |  |
| `library.upsert` | `library:upsert` | `electron/main.js:1187` |  |
| `library.upsertBulk` | `library:upsertBulk` | `electron/main.js:1205` |  |
| `optiscaler.apply` | `optiscaler:apply` | `electron/optiscalerManager.js:1273` |  |

### EXIF Editor  (rota `metadata`)
- Tela: `src/pages/MetaDataEditor.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/ipc/metadataIpc.js`, `electron/main.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.grantDroppedFiles` | `dialog:grantDroppedFiles` | `electron/main.js:1867` | `filePaths.slice`<br>`granted.push` |
| `dialog.saveFile` | `dialog:saveFile` | `electron/main.js:1902` |  |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
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
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `ocr.extractText` | `ocr:extractText` | `electron/main.js:2393` | `base64Data.replace`<br>`img.resize`<br>`img.grayscale`<br>`img.clone` |
| `share.grabRegion` | `share:grabRegion` | `electron/ipc/shareIpc.js:262` | `img.toDataURL`<br>`img.getSize`<br>`grabRegionImage() (electron/services/susuya/Screenshot.js)` |

### Password Vault  (rota `passwords`)
- Tela: `src/pages/PasswordManager.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/components/vault/BrowserExtensionSection.tsx`, `src/components/vault/VaultTransferSection.tsx`
- Arquivos de backend: `electron/ipc/shareIpc.js`, `electron/ipc/vaultBridgeIpc.js`, `electron/main.js`, `electron/services/vaultBridge/nativeHost.js`, `electron/services/vaultBridge/vaultHardening.js`, `electron/vaultCrypto.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1892` |  |
| `share.qr` | `share:qr` | `electron/ipc/shareIpc.js:254` | `s.startsWith`<br>`QRCode.toDataURL` |
| `vault.add` | `vault:add` | `electron/main.js:2711` | `crypto.randomUUID` |
| `vault.bridgeStatus` | `vaultx:bridgeStatus` | `electron/ipc/vaultBridgeIpc.js:185` |  |
| `vault.changeMasterPassword` | `vault:changeMasterPassword` | `electron/main.js:2787` | `crypto.randomBytes`<br>`recoveryWords.join`<br>`buildKdf() (electron/vaultCrypto.js)`<br>`encryptVaultData() (electron/vaultCrypto.js)` |
| `vault.copyPassword` | `vault:copyPassword` | `electron/main.js:2774` | `clipboard.writeText`<br>`clipboard.readText`<br>`clipboard.clear` |
| `vault.export` | `vault:export` | `electron/main.js:2846` |  |
| `vault.import` | `vault:import` | `electron/main.js:2855` | `backupVaultFile() (electron/services/vaultBridge/vaultHardening.js)` |
| `vault.init` | `vault:init` | `electron/main.js:2604` | `crypto.randomBytes`<br>`recoveryWords.join`<br>`buildKdf() (electron/vaultCrypto.js)`<br>`encryptVaultData() (electron/vaultCrypto.js)` |
| `vault.list` | `vault:list` | `electron/main.js:2696` |  |
| `vault.lock` | `vault:lock` | `electron/main.js:2691` |  |
| `vault.onBridgeChanged` | `vaultx:changed` | `nao encontrado` |  |
| `vault.openExtensionFolder` | `vaultx:openExtensionFolder` | `electron/ipc/vaultBridgeIpc.js:211` |  |
| `vault.registerBrowserHost` | `vaultx:registerHost` | `electron/ipc/vaultBridgeIpc.js:187` | `registry.register`<br>`isBrowserId() (electron/services/vaultBridge/nativeHost.js)` |
| `vault.remove` | `vault:remove` | `electron/main.js:2757` |  |
| `vault.reveal` | `vault:reveal` | `electron/main.js:2766` |  |
| `vault.revokeBrowserClient` | `vaultx:revokeClient` | `electron/ipc/vaultBridgeIpc.js:203` | `pairingStore.revoke`<br>`server.disconnectClient` |
| `vault.setBridgeLanguage` | `vaultx:setLanguage` | `electron/ipc/vaultBridgeIpc.js:218` | `lang.toLowerCase` |
| `vault.status` | `vault:status` | `electron/main.js:2594` |  |
| `vault.unlock` | `vault:unlock` | `electron/main.js:2639` |  |
| `vault.unlockWithRecoveryWords` | `vault:unlockWithRecoveryWords` | `electron/main.js:2651` | `words.trim`<br>`buildKdf() (electron/vaultCrypto.js)`<br>`derivePasswordFromRecoveryWords() (electron/vaultCrypto.js)`<br>`recoveryDeriveOrder() (electron/vaultCrypto.js)` |
| `vault.unregisterBrowserHost` | `vaultx:unregisterHost` | `electron/ipc/vaultBridgeIpc.js:195` | `registry.unregister`<br>`isBrowserId() (electron/services/vaultBridge/nativeHost.js)` |

### PowerShell Tools  (rota `powershell`)
- Tela: `src/pages/SystemMonitor.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/gpubench/RunOverlay.tsx`, `src/components/icons/index.tsx`, `src/components/library/Sparkline.tsx`, `src/components/monitor/AdvancedSensorsPanel.tsx`, `src/components/monitor/LhmSensorTree.tsx`, `src/components/monitor/PowerPanel.tsx`, `src/components/monitor/PsuCatalogPicker.tsx`, `src/components/monitor/WallCalibration.tsx`, `src/components/ui/PageHeader.tsx`, `src/hooks/useDeepHardware.ts`, `src/hooks/useSensorHistory.ts`, `src/hooks/useSystemMetrics.ts`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/hal/HardwareHAL.js`, `electron/hal/collectors/HwSensorsDaemon.js`, `electron/ipc/gpuBenchIpc.js`, `electron/ipc/hwSensorsIpc.js`, `electron/ipc/overlayIpc.js`, `electron/main.js`, `electron/services/HardwareService.js`, `electron/services/overlay/powerModel.js`, `electron/services/overlay/wallCalibration.js`

| API | canal | handler | chama |
|---|---|---|---|
| `app.getResourceUsage` | `app:getResourceUsage` | `electron/main.js:1495` | `metrics.map`<br>`processes.reduce` |
| `gpubench.cancel` | `gpubench:cancel` | `electron/ipc/gpuBenchIpc.js:35` | `svc.cancel` |
| `gpubench.onEvent` | `gpubench:event` | `nao encontrado` |  |
| `gpubench.viewport` | `gpubench:viewport` | `electron/ipc/gpuBenchIpc.js:30` | `svc.viewport` |
| `hardware.onUpdate` | `hardware:update` | `nao encontrado` |  |
| `hardware.startPolling` | `hardware:startPolling` | `electron/services/HardwareService.js:51` | `hookedSenders.has`<br>`hookedSenders.add`<br>`sender.once`<br>`hookedSenders.delete` |
| `hardware.stopPolling` | `hardware:stopPolling` | `electron/services/HardwareService.js:69` | `perSender.get`<br>`perSender.set`<br>`perSender.delete`<br>`HAL.getSnapshot (electron/hal/HardwareHAL.js)` |
| `hwsensors.status` | `hwsensors:status` | `electron/ipc/hwSensorsIpc.js:46` | `HwSensorsDaemon.status (electron/hal/collectors/HwSensorsDaemon.js)` |
| `overlay.calibrate` | `overlay:calibrate` | `electron/ipc/overlayIpc.js:45` | `svc.power`<br>`points.slice`<br>`pts.some`<br>`svc.setSettings` |
| `overlay.clearCalibration` | `overlay:clearCalibration` | `electron/ipc/overlayIpc.js:61` |  |
| `overlay.power` | `overlay:power` | `electron/ipc/overlayIpc.js:37` |  |
| `overlay.psuSearch` | `overlay:psuSearch` | `electron/ipc/overlayIpc.js:43` |  |
| `overlay.resetEnergy` | `overlay:resetEnergy` | `electron/ipc/overlayIpc.js:38` |  |
| `overlay.setSettings` | `overlay:setSettings` | `electron/ipc/overlayIpc.js:36` |  |
| `overlay.show` | `overlay:show` | `electron/ipc/overlayIpc.js:34` |  |
| `overlay.status` | `overlay:status` | `electron/ipc/overlayIpc.js:33` |  |
| `system.enableProcessTracking` | `system:enableProcessTracking` | `electron/main.js:883` |  |
| `system.runBenchmark` | `system:runBenchmark` | `electron/main.js:990` | `hrtime.bigint`<br>`parentPort.postMessage`<br>`mops.toFixed`<br>`ms.toFixed` |

### Advanced Security  (rota `security`)
- Tela: `src/pages/AdvancedSecurity.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/security/BlocklistsPanel.tsx`, `src/components/security/HardeningPanel.tsx`, `src/components/security/ProtectiveDnsPanel.tsx`, `src/components/security/ui.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/SecurityService.js`, `electron/services/optimizer/DnsEngine.js`

| API | canal | handler | chama |
|---|---|---|---|
| `optimizer.applyDns` | `optimizer:applyDns` | `electron/main.js:1979` | `DnsEngine.apply (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.getDnsState` | `optimizer:getDnsState` | `electron/main.js:1970` | `DnsEngine.getState (electron/services/optimizer/DnsEngine.js)` |
| `optimizer.undoDns` | `optimizer:undoDns` | `electron/main.js:1984` | `DnsEngine.undo (electron/services/optimizer/DnsEngine.js)` |
| `security.advApplyFirewall` | `security:advApplyFirewall` | `electron/services/SecurityService.js:87` | `adv.applyFirewall` |
| `security.advApplyHashes` | `security:advApplyHashes` | `electron/services/SecurityService.js:89` | `adv.applyHashes` |
| `security.advApplyHosts` | `security:advApplyHosts` | `electron/services/SecurityService.js:85` | `adv.applyHosts` |
| `security.advHardeningApply` | `security:advHardeningApply` | `electron/services/SecurityService.js:92` | `adv.hardeningApply` |
| `security.advHardeningRestore` | `security:advHardeningRestore` | `electron/services/SecurityService.js:93` | `adv.hardeningRestore`<br>`advanced.setDataDir` |
| `security.advRestoreFirewall` | `security:advRestoreFirewall` | `electron/services/SecurityService.js:88` | `adv.restoreFirewall` |
| `security.advRestoreHashes` | `security:advRestoreHashes` | `electron/services/SecurityService.js:90` | `adv.restoreHashes` |
| `security.advRestoreHosts` | `security:advRestoreHosts` | `electron/services/SecurityService.js:86` | `adv.restoreHosts` |
| `security.advSetFeedEnabled` | `security:advSetFeedEnabled` | `electron/services/SecurityService.js:83` | `adv.setEnabled` |
| `security.advStatus` | `security:advStatus` | `electron/services/SecurityService.js:82` | `adv.status` |
| `security.advUpdateFeeds` | `security:advUpdateFeeds` | `electron/services/SecurityService.js:84` | `adv.updateFeeds`<br>`ids.map` |
| `security.auditTracking` | `security:auditTracking` | `electron/main.js:3092` | `custom.map`<br>`content.split`<br>`l.trim`<br>`line.startsWith` |
| `security.blockTracking` | `security:blockTracking` | `electron/main.js:3199` | `custom.map`<br>`d.toLowerCase`<br>`content.split`<br>`line.includes` |
| `security.disablePhishingShield` | `security:disablePhishingShield` | `electron/services/SecurityService.js:113` |  |
| `security.getCommunityRules` | `security:getCommunityRules` | `electron/services/SecurityService.js:133` |  |
| `security.getLiveNetworkConnections` | `security:getLiveNetworkConnections` | `electron/services/SecurityService.js:121` |  |
| `security.getPhishingShieldStatus` | `security:getPhishingShieldStatus` | `electron/services/SecurityService.js:117` |  |
| `security.getTrackingDomains` | `security:getTrackingDomains` | `electron/main.js:3142` | `custom.map`<br>`HOSTNAME_RE.test` |
| `security.importCommunityRules` | `security:importCommunityRules` | `electron/services/SecurityService.js:137` |  |
| `security.killProcess` | `security:killProcess` | `electron/main.js:3278` |  |
| `security.resetCommunityRules` | `security:resetCommunityRules` | `electron/services/SecurityService.js:141` | `promises.stat`<br>`entropyCache.has`<br>`entropyCache.get`<br>`stream.on` |
| `security.scanProcesses` | `security:scanProcesses` | `electron/services/SecurityService.js:101` |  |
| `security.scanUrl` | `security:scanUrl` | `electron/services/SecurityService.js:105` |  |
| `security.setCustomTrackingDomains` | `security:setCustomTrackingDomains` | `electron/main.js:3186` |  |
| `security.unblockTracking` | `security:unblockTracking` | `electron/main.js:3251` |  |

### Disk map  (rota `spacesniffer`)
- Tela: `src/pages/SpaceSniffer/index.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/ipc/diskScanIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `diskscan.cancel` | `diskscan:cancel` | `electron/ipc/diskScanIpc.js:22` | `svc.cancel` |
| `diskscan.drives` | `diskscan:drives` | `electron/ipc/diskScanIpc.js:14` | `svc.drives` |
| `diskscan.info` | `diskscan:info` | `electron/ipc/diskScanIpc.js:25` | `svc.info` |
| `diskscan.onProgress` | `diskscan:progress` | `nao encontrado` |  |
| `diskscan.pickFolder` | `diskscan:pickFolder` | `electron/ipc/diskScanIpc.js:15` |  |
| `diskscan.recycleInfo` | `diskscan:recycleInfo` | `electron/ipc/diskScanIpc.js:30` | `svc.recycleInfo` |
| `diskscan.start` | `diskscan:start` | `electron/ipc/diskScanIpc.js:19` | `svc.start`<br>`sender.isDestroyed`<br>`sender.send` |
| `diskscan.status` | `diskscan:status` | `electron/ipc/diskScanIpc.js:23` | `svc.status` |

### Summarizer  (rota `summarizer`)
- Tela: `src/pages/TextSummarizer.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/textFile.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `fs.readFile` | `fs:readFile` | `electron/main.js:3291` | `readTextFile() (electron/services/textFile.js)` |

### Text Editor  (rota `texteditor`)
- Tela: `src/pages/TextEditor.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/lib/codeExamples.ts`
- Arquivos de backend: `electron/ipc/codeRunnerIpc.js`, `electron/main.js`, `electron/services/CodeRunner.js`, `electron/services/textFile.js`

| API | canal | handler | chama |
|---|---|---|---|
| `code.cancel` | `code:cancel` | `electron/ipc/codeRunnerIpc.js:13` | `cancelRun() (electron/services/CodeRunner.js)` |
| `code.run` | `code:run` | `electron/ipc/codeRunnerIpc.js:12` | `runCode() (electron/services/CodeRunner.js)` |
| `code.runtimes` | `code:runtimes` | `electron/ipc/codeRunnerIpc.js:11` | `detectRuntimes() (electron/services/CodeRunner.js)` |
| `dialog.saveFile` | `dialog:saveFile` | `electron/main.js:1902` |  |
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `fs.readFile` | `fs:readFile` | `electron/main.js:3291` | `readTextFile() (electron/services/textFile.js)` |
| `fs.writeFile` | `fs:writeFile` | `electron/main.js:3310` | `devPath.includes`<br>`writeTextFile() (electron/services/textFile.js)` |

### Video Downloader  (rota `youtube`)
- Tela: `src/pages/YoutubeDownloader.tsx`
- Componentes/hooks usados: `src/components/HelpTip.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/ytdlpOptions.js`, `electron/ytdlp.js`

| API | canal | handler | chama |
|---|---|---|---|
| `dialog.selectFiles` | `dialog:selectFiles` | `electron/main.js:1881` |  |
| `dialog.selectFolder` | `dialog:selectFolder` | `electron/main.js:1892` |  |
| `youtube.cancel` | `youtube:cancel` | `electron/main.js:2383` | `cancelActiveYtDlp() (electron/ytdlp.js)` |
| `youtube.download` | `youtube:download` | `electron/main.js:2250` | `cookiesPath.trim`<br>`cookiesFromBrowser.trim`<br>`userAgent.trim`<br>`client.trim` |
| `youtube.getVideoInfo` | `youtube:getVideoInfo` | `electron/main.js:2145` | `cookiesPath.trim`<br>`cookiesFromBrowserRaw.trim`<br>`userAgentRaw.trim`<br>`clientRaw.trim` |
| `youtube.onProgress` | `youtube:downloadProgress` | `nao encontrado` |  |

## Outros

### darkos  (rota `darkos`)
- Tela: `src/pages/DarkOSCenter.tsx`
- Componentes/hooks usados: `src/components/darkos/DarkOSConfirmDialog.tsx`, `src/components/darkos/DarkOSProgress.tsx`, `src/components/darkos/DarkOSReleaseCard.tsx`, `src/components/darkos/DarkOSSystemPanel.tsx`, `src/components/darkos/DarkOSUsbCard.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/darkosData.ts`
- Arquivos de backend: `electron/configManager.js`, `electron/ipc/darkosIpc.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/UpdateService.js`, `electron/services/downloads/registerDownloadsIPC.js`, `electron/services/optimizer/AppManagerEngine.js`, `electron/services/optimizer/ElevationHelper.js`, `electron/services/optimizer/SystemOptimizerService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `darkos.isDarkOS` | `darkos:isDarkOS` | `electron/ipc/darkosIpc.js:65` | `darkhub.ink` |
| `darkos.latestRelease` | `darkos:latestRelease` | `electron/ipc/darkosIpc.js:67` |  |
| `darkos.onRunEvent` | `darkos:runEvent` | `nao encontrado` |  |
| `darkos.onUsbEvent` | `darkos:usbEvent` | `nao encontrado` |  |
| `darkos.reinstallEdge` | `darkos:reinstallEdge` | `electron/ipc/darkosIpc.js:50` | `svc.revertChange`<br>`ElevationHelper.runElevatedPowerShell (electron/services/optimizer/ElevationHelper.js)` |
| `darkos.usbDisks` | `darkos:usbDisks` | `electron/ipc/darkosIpc.js:86` | `usb.listDisks` |
| `darkos.usbFindIsos` | `darkos:usbFindIsos` | `electron/ipc/darkosIpc.js:87` | `usb.findIsos` |
| `darkos.usbHashIso` | `darkos:usbHashIso` | `electron/ipc/darkosIpc.js:95` | `usb.hashIso` |
| `darkos.usbPickIso` | `darkos:usbPickIso` | `electron/ipc/darkosIpc.js:88` | `usb.allowIso` |
| `darkos.usbWrite` | `darkos:usbWrite` | `electron/ipc/darkosIpc.js:96` | `usb.write` |
| `downloads.add` | `downloads:add` | `electron/services/downloads/registerDownloadsIPC.js:49` | `manager.add` |
| `optimizer.getGpuInfo` | `optimizer:getGpuInfo` | `electron/main.js:1925` | `AppManagerEngine.getGpuInfo (electron/services/optimizer/AppManagerEngine.js)` |
| `optimizer.run` | `optimizer:run` | `electron/main.js:739` | `sender.send`<br>`SystemOptimizerService.runTasks (electron/services/optimizer/SystemOptimizerService.js)` |
| `settings.getConfig` | `settings:getConfig` | `electron/main.js:1618` | `loadPersistedConfig() (electron/configManager.js)` |
| `settings.updateStartupBehavior` | `settings:updateStartupBehavior` | `electron/main.js:1698` | `runPowerShell() (electron/services/PowerShellRunner.js)`<br>`stripBom() (electron/services/PowerShellRunner.js)`<br>`loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `shell.openExternal` | `shell:openExternal` | `electron/main.js:1422` | `RENDERER_SYSTEM_URIS.has`<br>`raw.toLowerCase`<br>`parsed.toString`<br>`cp.spawn` |
| `system.getLiveStats` | `system:getLiveStats` | `electron/main.js:1743` | `liveCpu.sample` |
| `updater.check` | `updater:check` | `electron/services/UpdateService.js:426` |  |
| `updater.download` | `updater:download` | `electron/services/UpdateService.js:427` |  |
| `updater.getStatus` | `updater:getStatus` | `electron/services/UpdateService.js:420` |  |
| `updater.install` | `updater:install` | `electron/services/UpdateService.js:428` | `webContents.send` |
| `updater.onEvent` | `updater:event` | `nao encontrado` |  |

### dev-icons  (rota `dev-icons`)
- Tela: `src/pages/Home.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/ipc/driverIpc.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`

| API | canal | handler | chama |
|---|---|---|---|
| `driver.detect` | `driver:detect` | `electron/ipc/driverIpc.js:23` | `svc.detectAdapters` |
| `pge.openPortable` | `pge:openPortable` | `electron/main.js:1486` |  |
| `system.getInfo` | `system:getInfo` | `electron/main.js:814` | `cpuModel.includes`<br>`si.cpu`<br>`runCommand() (electron/services/PowerShellRunner.js)` |
| `system.getMemory` | `system:getMemory` | `electron/main.js:1738` |  |

### framepacer  (rota `framepacer`)
- Tela: `src/pages/FramePacer.tsx`
- Componentes/hooks usados: `src/components/VulkanLowLatencyCard.tsx`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`
- Arquivos de backend: `electron/main.js`, `electron/services/FramePacerEngine.js`, `electron/services/FramePacerOverlay.js`, `electron/services/LowLatencyLayerService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `darkpacer.lowLatencyApply` | `lowlatency:apply` | `electron/main.js:1857` | `LowLatencyLayer.apply (electron/services/LowLatencyLayerService.js)` |
| `darkpacer.lowLatencyStatus` | `lowlatency:getStatus` | `electron/main.js:1853` | `LowLatencyLayer.getStatus (electron/services/LowLatencyLayerService.js)` |
| `framepacer.getMetrics` | `framepacer:getMetrics` | `electron/main.js:1822` | `FramePacerEngine.getMetrics (electron/services/FramePacerEngine.js)` |
| `framepacer.getOverlayStatus` | `framepacer:getOverlayStatus` | `electron/main.js:1848` | `getOverlayStatus() (electron/services/FramePacerOverlay.js)` |
| `framepacer.onMetrics` | `framepacer:metrics` | `nao encontrado` |  |
| `framepacer.setOverlayClickThrough` | `framepacer:setOverlayClickThrough` | `electron/main.js:1840` | `setOverlayClickThrough() (electron/services/FramePacerOverlay.js)` |
| `framepacer.start` | `framepacer:start` | `electron/main.js:1810` | `FramePacerEngine.start (electron/services/FramePacerEngine.js)` |
| `framepacer.stop` | `framepacer:stop` | `electron/main.js:1814` | `FramePacerEngine.stop (electron/services/FramePacerEngine.js)` |
| `framepacer.toggleOverlay` | `framepacer:toggleOverlay` | `electron/main.js:1836` | `toggleFramePacerOverlay() (electron/services/FramePacerOverlay.js)` |
| `framepacer.updateConfig` | `framepacer:updateConfig` | `electron/main.js:1818` | `FramePacerEngine.updateConfig (electron/services/FramePacerEngine.js)` |

### overlay-editor  (rota `overlay-editor`)
- Tela: `src/pages/OverlayEditor.tsx`
- Componentes/hooks usados: `src/components/icons/index.tsx`, `src/components/overlay/OverlayStage.tsx`, `src/components/overlay/sanitizeCss.ts`, `src/components/ui/PageHeader.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/ipc/overlayIpc.js`

| API | canal | handler | chama |
|---|---|---|---|
| `overlay.activateLayout` | `overlay:activateLayout` | `electron/ipc/overlayIpc.js:67` |  |
| `overlay.deleteLayout` | `overlay:deleteLayout` | `electron/ipc/overlayIpc.js:66` |  |
| `overlay.layouts` | `overlay:layouts` | `electron/ipc/overlayIpc.js:63` |  |
| `overlay.newLayout` | `overlay:newLayout` | `electron/ipc/overlayIpc.js:65` |  |
| `overlay.preview` | `overlay:preview` | `electron/ipc/overlayIpc.js:68` |  |
| `overlay.saveLayout` | `overlay:saveLayout` | `electron/ipc/overlayIpc.js:64` |  |
| `overlay.setSettings` | `overlay:setSettings` | `electron/ipc/overlayIpc.js:36` |  |

### settings  (rota `settings`)
- Tela: `src/pages/Settings.tsx`
- Componentes/hooks usados: `src/appVersion.ts`, `src/components/icons/index.tsx`, `src/components/ui/PageHeader.tsx`, `src/utils/visibleInterval.ts`
- Arquivos de backend: `electron/configManager.js`, `electron/main.js`, `electron/services/PowerShellRunner.js`, `electron/services/UpdateService.js`

| API | canal | handler | chama |
|---|---|---|---|
| `app.getResourceUsage` | `app:getResourceUsage` | `electron/main.js:1495` | `metrics.map`<br>`processes.reduce` |
| `settings.getConfig` | `settings:getConfig` | `electron/main.js:1618` | `loadPersistedConfig() (electron/configManager.js)` |
| `settings.updateLiveServices` | `settings:updateLiveServices` | `electron/main.js:1642` | `autoClicker.load`<br>`autoClicker.arm`<br>`autoClicker.dispose`<br>`loadPersistedConfig() (electron/configManager.js)` |
| `settings.updateStartupBehavior` | `settings:updateStartupBehavior` | `electron/main.js:1698` | `runPowerShell() (electron/services/PowerShellRunner.js)`<br>`stripBom() (electron/services/PowerShellRunner.js)`<br>`loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `settings.updateWindowBehavior` | `settings:updateWindowBehavior` | `electron/main.js:1679` | `loadPersistedConfig() (electron/configManager.js)`<br>`saveConfig() (electron/configManager.js)` |
| `updater.check` | `updater:check` | `electron/services/UpdateService.js:426` |  |
| `updater.getStatus` | `updater:getStatus` | `electron/services/UpdateService.js:420` |  |
| `updater.onEvent` | `updater:event` | `nao encontrado` |  |
| `vault.setAutoLockMinutes` | `vault:setAutoLockMinutes` | `electron/main.js:2599` |  |
