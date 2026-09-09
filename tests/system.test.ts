import { describe, it, expect } from 'vitest';
import { messages } from '../src/i18n/messages';

describe('DarkHub Suite Core Verification', () => {
  it('should have valid Portuguese and English dictionaries', () => {
    expect(messages).toBeDefined();
    expect(messages['pt-BR']).toBeDefined();
    expect(messages['en-US']).toBeDefined();
    expect(messages['pt-BR']['app.title']).toBe('DarkHub Suite');
    expect(messages['en-US']['app.title']).toBe('DarkHub Suite');
  });

  it('should include all necessary youtube downloader translations', () => {
    expect(messages['en-US']['youtube.title']).toBe('YouTube & Media Downloader');
    expect(messages['pt-BR']['youtube.title']).toBe('YouTube & Media Downloader');
    expect(messages['en-US']['youtube.search']).toBe('Search');
    expect(messages['pt-BR']['youtube.search']).toBe('Buscar');
  });

  it('should include streaming notice translations for Overwatch/Warzone', () => {
    expect(messages['pt-BR']['optimizer.streamingNotice.title']).toBeDefined();
    expect(messages['en-US']['optimizer.streamingNotice.title']).toBeDefined();
    expect(messages['pt-BR']['optimizer.streamingNotice.revertBtn']).toBeDefined();
    expect(messages['en-US']['optimizer.streamingNotice.revertBtn']).toBeDefined();
  });

  it('should verify shader cache pattern protection for StorageEngine', async () => {
    const StorageEngineModule = await import('../electron/services/optimizer/StorageEngine.js');
    const storageEngine = StorageEngineModule.default;
    expect(storageEngine._isProtectedPath('D3DSCache')).toBe(true);
    expect(storageEngine._isProtectedPath('DirectXShaderCache')).toBe(true);
    expect(storageEngine._isProtectedPath('NV_Shader_Cache')).toBe(true);
    expect(storageEngine._isProtectedPath('NVIDIA Corporation')).toBe(true);
    expect(storageEngine._isProtectedPath('Overwatch')).toBe(true);
    expect(storageEngine._isProtectedPath('AMD_DxCache')).toBe(true);
    expect(storageEngine._isProtectedPath('random_temp_junk_123.tmp')).toBe(false);
  });

  it('should include HAGS and DLSS 5 translations and navigation keys', () => {
    expect(messages['pt-BR']['nav.dlss5']).toBe('DLSS 5 Manager');
    expect(messages['en-US']['nav.dlss5']).toBe('DLSS 5 Manager');
    expect(messages['pt-BR']['home.dlss5Title']).toBe('DLSS 5 & Universal Upscaler');
    expect(messages['en-US']['home.dlss5Title']).toBe('DLSS 5 & Universal Upscaler');
    expect(messages['pt-BR']['optimizer.hags.title']).toBeDefined();
    expect(messages['en-US']['optimizer.hags.title']).toBeDefined();
    expect(messages['pt-BR']['optimizer.hags.revertBtn']).toBeDefined();
    expect(messages['en-US']['optimizer.hags.revertBtn']).toBeDefined();
  });

  it('should verify AppManagerEngine exports HAGS management methods', async () => {
    const AppManagerEngineModule = await import('../electron/services/optimizer/AppManagerEngine.js');
    const appManagerEngine = AppManagerEngineModule.default;
    expect(typeof appManagerEngine.getHagsStatus).toBe('function');
    expect(typeof appManagerEngine.setHagsStatus).toBe('function');
    expect(typeof appManagerEngine.revertHags).toBe('function');
  });
});
