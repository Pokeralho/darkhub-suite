import { darkosMessages } from './darkosMessages';
import { recoveryMessages } from './recoveryMessages';
import { cleanerMessages } from './cleanerMessages';
import { realtimeMessages } from './realtimeMessages';
import { optimizerUiMessages } from './optimizerUiMessages';
import { diskMapMessages } from './diskMapMessages';
import { networkMessages } from './networkMessages';
import { devToolsMessages } from './devToolsMessages';
import { psToolsMessages } from './psToolsMessages';
import { securityMessages } from './securityMessages';
import { vaultMessages } from './vaultMessages';
import { metadataMessages } from './metadataMessages';
import { converterMessages } from './converterMessages';
import { decryptMessages } from './decryptMessages';
import { ocrMessages } from './ocrMessages';
import { videoMessages } from './videoMessages';
import { textEditorMessages } from './textEditorMessages';
import { maintenanceMessages } from './maintenanceMessages';
import { driverMessages } from './driverMessages';
import { usbMessages } from './usbMessages';
import { restoreMessages } from './restoreMessages';
import { kakuganMessages } from './kakuganMessages';
import { overlayEditorMessages } from './overlayEditorMessages';
import { powerMessages } from './powerMessages';
import { hubMessages } from './hubMessages';
import { startupMessages } from './startupMessages';
import { benchmarkMessages } from './benchmarkMessages';
import { gpuBenchMessages } from './gpuBenchMessages';
import { overlayMessages } from './overlayMessages';
import { saveBackupMessages } from './saveBackupMessages';
import { sshMessages } from './sshMessages';
import { navMessages } from './navMessages';
import { updaterMessages } from './updaterMessages';
import { ultraLatencyMessages } from './ultraLatencyMessages';
import { optiscalerUiMessages } from './optiscalerUiMessages';
import { monitorHwMessages } from './monitorHwMessages';
import { appUiMessages } from './appUiMessages';

import corePt from './locales/pt-BR/core';
import coreEn from './locales/en-US/core';

export type { SupportedLang, LanguageOption } from './languages';
export { availableLanguages } from './languages';

/**
 * Every dictionary of every language, merged. Tests and tools use it; the app itself loads only the active
 * language through ./store.ts (one chunk per language, heavy screens' strings on demand).
 * The strings live in ./locales/<lang>/*.ts.
 */
export const messages: Record<string, Record<string, string>> = {
  'pt-BR': { ...corePt },
  'en-US': { ...coreEn }
};

for (const extra of [navMessages, sshMessages, darkosMessages, realtimeMessages, optimizerUiMessages, diskMapMessages, networkMessages, devToolsMessages, psToolsMessages, securityMessages, vaultMessages, metadataMessages, converterMessages, decryptMessages, ocrMessages, videoMessages, textEditorMessages, saveBackupMessages, overlayMessages, benchmarkMessages, gpuBenchMessages, startupMessages, usbMessages, maintenanceMessages, driverMessages, restoreMessages, kakuganMessages, overlayEditorMessages, powerMessages, hubMessages, recoveryMessages, cleanerMessages, updaterMessages, ultraLatencyMessages, optiscalerUiMessages, monitorHwMessages, appUiMessages]) {
  for (const [code, dict] of Object.entries(extra)) {
    messages[code] = { ...(messages[code] || {}), ...dict };
  }
}

export function getTranslationTemplate(): string {
  return JSON.stringify(messages['en-US'], null, 2);
}
