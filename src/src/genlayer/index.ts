// ============================================================
// GenLayer Module – Public API
// ============================================================
// Import everything you need from one place:
//
//   import { waveManager, GenLayerWaveManager } from '../genlayer';
//   import type { WaveConfig, WaveReport, GenLayerStatus } from '../genlayer';
// ============================================================

export { waveManager, GenLayerWaveManager } from './waveManager';
export { fetchNextWaveConfig, reportWaveResult, GENLAYER_ENABLED } from './client';
export { CONTRACT_ADDRESS_WAVE, GENLAYER_NETWORK } from './config';
export type { WaveConfig, WaveReport, GenLayerStatus } from './types';
