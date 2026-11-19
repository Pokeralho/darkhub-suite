// Every en-US dictionary loaded at startup, in merge order (later entries win). Generated layout; see ../../catalog.ts.
import core from './core';
import nav from './nav';
import sshEager from './sshEager';
import darkos from './darkos';
import realtime from './realtime';
import optimizerUi from './optimizerUi';
import diskMap from './diskMap';
import network from './network';
import devTools from './devTools';
import psToolsEager from './psToolsEager';
import security from './security';
import vault from './vault';
import metadata from './metadata';
import converter from './converter';
import decrypt from './decrypt';
import ocr from './ocr';
import video from './video';
import textEditor from './textEditor';
import saveBackup from './saveBackup';
import overlay from './overlay';
import benchmark from './benchmark';
import gpuBench from './gpuBench';
import startup from './startup';
import usb from './usb';
import maintenance from './maintenance';
import driver from './driver';
import restore from './restore';
import kakugan from './kakugan';
import overlayEditor from './overlayEditor';
import power from './power';
import hub from './hub';
import recoveryEager from './recoveryEager';
import cleaner from './cleaner';
import updater from './updater';
import ultraLatency from './ultraLatency';
import optiscalerUi from './optiscalerUi';
import monitorHw from './monitorHw';
import appUi from './appUi';

export const parts: ReadonlyArray<readonly [number, Record<string, string>]> = [
  [0, core],
  [1, nav],
  [2, sshEager],
  [3, darkos],
  [4, realtime],
  [5, optimizerUi],
  [6, diskMap],
  [7, network],
  [8, devTools],
  [9, psToolsEager],
  [10, security],
  [11, vault],
  [12, metadata],
  [13, converter],
  [14, decrypt],
  [15, ocr],
  [16, video],
  [17, textEditor],
  [18, saveBackup],
  [19, overlay],
  [20, benchmark],
  [21, gpuBench],
  [22, startup],
  [23, usb],
  [24, maintenance],
  [25, driver],
  [26, restore],
  [27, kakugan],
  [28, overlayEditor],
  [29, power],
  [30, hub],
  [31, recoveryEager],
  [32, cleaner],
  [33, updater],
  [34, ultraLatency],
  [35, optiscalerUi],
  [36, monitorHw],
  [37, appUi]
];
