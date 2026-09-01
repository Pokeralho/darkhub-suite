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
});
