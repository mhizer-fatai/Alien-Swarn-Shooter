// ============================================================
// GenLayer Module – Configuration
// ============================================================
// After deploying in GenLayer Studio:
//   1. Copy the contract address.
//   2. Add to .env: VITE_GENLAYER_CONTRACT_ADDRESS=0xYourAddress
//   3. Set VITE_GENLAYER_NETWORK to "testnet-bradbury" or "localnet"
//      (defaults to "testnet-bradbury" — no extra setup needed)
// ============================================================

/** Addresses for the modular GenLayer Intelligent Contracts */
export const CONTRACT_ADDRESS_WAVE = '0xf21d3ECb36C5BeB2dDb879AB7573793a65a8292F'; // On Studionet
export const CONTRACT_ADDRESS_REFEREE = '0x00EE0a27C224abDf30f52FFCb9cBc5F6Da2a538b';
export const CONTRACT_ADDRESS_BOUNTY = '0x9658E123E73621770BaA716ee714d4cb888a86A7';
export const CONTRACT_ADDRESS_BOSS = '0xA6EBecE2b9A6B3C21c00a30DAbb9DECF126D5AAb';

/** Which GenLayer network to connect to ("testnet-bradbury" | "localnet") */
export const GENLAYER_NETWORK =
  (import.meta.env.VITE_GENLAYER_NETWORK as string) || 'testnet-bradbury';

/** Set to false to completely bypass GenLayer and use fallback wave logic */
export const GENLAYER_ENABLED = CONTRACT_ADDRESS_WAVE.length > 10;
