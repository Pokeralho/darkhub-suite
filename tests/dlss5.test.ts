import { describe, it, expect } from 'vitest';
import { messages } from '../src/i18n/messages';
import Dlss5Service from '../electron/services/dlss5/Dlss5Service.js';

describe('DLSS 5 & Universal Neural Upscaler Manager Verification', () => {
  it('should have all DLSS 5 translation keys defined in pt-BR and en-US', () => {
    const requiredKeys = [
      'nav.dlss5',
      'dlss5.title',
      'dlss5.subtitle',
      'dlss5.badgeAi',
      'dlss5.gpuCardTitle',
      'dlss5.gpuProfile',
      'dlss5.profileNvidia',
      'dlss5.profileAmd',
      'dlss5.amdWarningTitle',
      'dlss5.amdWarningDesc',
      'dlss5.gameSelectionTitle',
      'dlss5.selectFolder',
      'dlss5.selectExe',
      'dlss5.engine',
      'dlss5.injectionDir',
      'dlss5.applyBtn',
      'dlss5.revertBtn',
      'dlss5.terminalTitle',
      'dlss5.apiDetected',
      'dlss5.provenanceTitle',
      'dlss5.steamLibrary',
      'dlss5.selectFromSteam',
      'dlss5.routeLabel',
      'dlss5.routeAutoRecommended',
      'dlss5.neuralUpstream',
      'dlss5.neuralUpstreamDesc',
      'dlss5.remixWarningTitle',
      'dlss5.bitness',
      'dlss5.amdEngineLabel',
      'dlss5.amdEngineZluda',
      'dlss5.amdEngineFsr',
      'dlss5.amdEngineZludaDesc',
      'dlss5.amdEngineFsrDesc',
      'dlss5.zludaCache',
      'dlss5.zludaCacheDesc',
      'dlss5.amdHipSdkTitle',
      'dlss5.amdHipSdkDesc',
      'dlss5.amdHipSdkLink'
    ];

    for (const key of requiredKeys) {
      expect(messages['pt-BR'][key], `Missing pt-BR key: ${key}`).toBeDefined();
      expect(messages['en-US'][key], `Missing en-US key: ${key}`).toBeDefined();
    }
  });

  it('should generate properly tuned nvngx.ini for NVIDIA profile with Neural Upstream', () => {
    const service = new Dlss5Service();
    const ini = service.generateNvngxIni('nvidia', {
      enableFrameGen: true,
      enableOverlay: true,
      upscaler: 'dlss',
      primaryApi: 'dx12',
      neuralUpstream: true,
      route: 'optiscaler'
    });

    expect(ini).toContain('PERFIL: NVIDIA GEFORCE (ESTÁVEL - NATIVO)');
    expect(ini).toContain('Dx11Upscaler=dlss');
    expect(ini).toContain('Dx12Upscaler=dlss');
    expect(ini).toContain('VulkanUpscaler=dlss');
    expect(ini).toContain('FGInput=dlssg');
    expect(ini).toContain('FGOutput=dlssg');
    expect(ini).toContain('OverlayMenu=true');
    expect(ini).toContain('NeuralUpstream=true');
    expect(ini).toContain('WorkResolution=render');
    expect(ini).toContain('PassOrdering=pre_upscale');
    expect(ini).toContain('Route=optiscaler');
  });

  it('should generate properly tuned nvngx.ini for AMD profile with ZLUDA HIP Neural Engine & WMMA matrix acceleration', () => {
    const service = new Dlss5Service();
    const ini = service.generateNvngxIni('amd', {
      amdEngine: 'zluda',
      zludaCache: true,
      enableFrameGen: true,
      enableOverlay: true,
      upscaler: 'fsr31',
      primaryApi: 'dx12',
      neuralUpstream: true,
      route: 'optiscaler'
    });

    expect(ini).toContain('PERFIL: AMD RADEON (ZLUDA HIP WMMA ACCELERATED)');
    expect(ini).toContain('Dx11Upscaler=fsr31');
    expect(ini).toContain('Dx12Upscaler=fsr31');
    expect(ini).toContain('VulkanUpscaler=fsr31');
    expect(ini).toContain('FGInput=dlssg');
    expect(ini).toContain('FGOutput=nukems');
    expect(ini).toContain('[ZLUDA]');
    expect(ini).toContain('Enable=true');
    expect(ini).toContain('HipRuntime=true');
    expect(ini).toContain('WmmaAcceleration=true');
    expect(ini).toContain('Fp16Native=true');
    expect(ini).toContain('ArchitectureTarget=rdna3_rdna4');
    expect(ini).toContain('CacheCompilation=true');
    expect(ini).toContain('ZludaBackend=true');
    expect(ini).toContain('WmmaMatrixAccel=true');
    expect(ini).toContain('NeuralUpstream=true');
  });

  it('should generate properly tuned nvngx.ini for AMD profile with FSR 3.1 DirectCompute Fallback', () => {
    const service = new Dlss5Service();
    const ini = service.generateNvngxIni('amd', {
      amdEngine: 'fsr',
      enableFrameGen: true,
      enableOverlay: true,
      upscaler: 'fsr31',
      primaryApi: 'dx12',
      neuralUpstream: true,
      route: 'feeder'
    });

    expect(ini).toContain('PERFIL: AMD RADEON (FSR 3.1 / DIRECTCOMPUTE)');
    expect(ini).toContain('Dx11Upscaler=fsr31');
    expect(ini).toContain('Dx12Upscaler=fsr31');
    expect(ini).toContain('VulkanUpscaler=fsr31');
    expect(ini).toContain('FGInput=dlssg');
    expect(ini).toContain('FGOutput=nukems');
    expect(ini).toContain('[ZLUDA]');
    expect(ini).toContain('Enable=false');
    expect(ini).toContain('ZludaBackend=false');
    expect(ini).toContain('NeuralUpstream=true');
    expect(ini).toContain('Route=feeder');
  });

  it('should disable OverlayMenu on RTX Remix route to protect path-tracing runtime', () => {
    const service = new Dlss5Service();
    const ini = service.generateNvngxIni('nvidia', {
      enableOverlay: true,
      route: 'remix',
      isRemix: true
    });

    expect(ini).toContain('OverlayMenu=false');
    expect(ini).toContain('Route=remix');
  });

  it('should correctly map the 8-route DLSS5-Autopilot matrix based on API, DLSS presence, and bitness', () => {
    const service = new Dlss5Service();

    // 1. D3D12 with native DLSS -> optiscaler
    const routeD3D12Dlss = service.detectAutoRoute({
      graphicsApi: { primaryApi: 'dx12', hasD3D12: true },
      hasDlss: true,
      is64: true
    });
    expect(routeD3D12Dlss.recommendedRoute).toBe('optiscaler');

    // 2. D3D11 with native DLSS -> dlss5-bridge
    const routeD3D11Dlss = service.detectAutoRoute({
      graphicsApi: { primaryApi: 'dx11', hasD3D11: true },
      hasDlss: true,
      is64: true
    });
    expect(routeD3D11Dlss.recommendedRoute).toBe('dlss5-bridge');

    // 3. Vulkan with native DLSS -> dlss5-bridge
    const routeVkDlss = service.detectAutoRoute({
      graphicsApi: { primaryApi: 'vulkan', hasVulkan: true },
      hasDlss: true,
      is64: true
    });
    expect(routeVkDlss.recommendedRoute).toBe('dlss5-bridge');

    // 4. Any game without DLSS -> feeder (DLSS5-Feeder)
    const routeNoDlss = service.detectAutoRoute({
      graphicsApi: { primaryApi: 'dx12', hasD3D12: true },
      hasDlss: false,
      is64: true
    });
    expect(routeNoDlss.recommendedRoute).toBe('feeder');

    // 5. RTX Remix game -> remix
    const routeRemix = service.detectAutoRoute({
      graphicsApi: { primaryApi: 'dx9', hasD3D9: true },
      hasDlss: false,
      isRemix: true,
      is64: true
    });
    expect(routeRemix.recommendedRoute).toBe('remix');

    // 6. DX9 64-bit -> renodx-dlss
    const routeDx9x64 = service.detectAutoRoute({
      graphicsApi: { primaryApi: 'dx9', hasD3D9: true, hasD3D11: false, hasD3D12: false },
      hasDlss: true,
      is64: true
    });
    expect(routeDx9x64.recommendedRoute).toBe('renodx-dlss');

    // 7. DX9 32-bit (x86 legacy) -> dx9-32bit
    const routeDx9x86 = service.detectAutoRoute({
      graphicsApi: { primaryApi: 'dx9', hasD3D9: true, hasD3D11: false, hasD3D12: false },
      hasDlss: true,
      is64: false
    });
    expect(routeDx9x86.recommendedRoute).toBe('dx9-32bit');

    // 8. Pure OpenGL -> opengl-zink
    const routeOpenGL = service.detectAutoRoute({
      graphicsApi: { primaryApi: 'opengl', hasOpenGL: true, hasD3D11: false, hasD3D12: false, hasVulkan: false },
      hasDlss: false,
      is64: true
    });
    expect(routeOpenGL.recommendedRoute).toBe('opengl-zink');
  });

  it('should detect Graphics API and recommend appropriate loader proxy', async () => {
    const service = new Dlss5Service();

    // Test Windows Notepad PE headers
    const notepadPath = 'C:\\Windows\\System32\\notepad.exe';
    const apiResult = await service.detectGraphicsAPI(notepadPath, 'C:\\Windows\\System32', 'C:\\Windows');

    expect(apiResult).toBeDefined();
    expect(apiResult.primaryApi).toBeDefined();
    expect(apiResult.recommendedLoader).toBeDefined();
    expect(apiResult.loaderReason).toBeDefined();
    expect(apiResult.is64).toBe(true);
    expect(apiResult.bitness).toBe('64-bit');
  });

  it('should return authentic provenance and verify upstream repositories', async () => {
    const service = new Dlss5Service();
    const prov = await service.getBinaryProvenance();

    expect(prov.ok).toBe(true);
    expect(prov.upstreamRepositories.length).toBeGreaterThanOrEqual(6);
    expect(prov.upstreamRepositories.some(r => r.url.includes('RedDukeDev/dlss5-image-enhancer-zluda'))).toBe(true);
    expect(prov.upstreamRepositories.some(r => r.url.includes('RedDukeDev/ZLUDA'))).toBe(true);
    expect(prov.upstreamRepositories.some(r => r.url.includes('Kizzuwatnaa/DLSS5-Autopilot'))).toBe(true);
    expect(prov.upstreamRepositories.some(r => r.url.includes('optiscaler'))).toBe(true);
    expect(prov.upstreamRepositories.some(r => r.url.includes('dlssg-to-fsr3'))).toBe(true);
    expect(prov.architecture).toContain('x86_64');
  });

  it('should retrieve installed Steam games safely without crashing', async () => {
    const service = new Dlss5Service();
    const steamGames = await service.getInstalledSteamGames();
    expect(Array.isArray(steamGames)).toBe(true);
  });

  it('should handle scan on invalid paths gracefully', async () => {
    const service = new Dlss5Service();
    const result = await service.scanGameDirectory('Z:\\NonExistentPath_Random_12345');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});
