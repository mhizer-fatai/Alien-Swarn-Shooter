/**
 * Web3 Wallet Connection & Network Switcher Helper
 */

// Extend window for Ethereum provider
declare global {
  interface Window {
    ethereum?: any;
  }
}

const GENLAYER_BRADBURY_PARAMS = {
  chainId: '0x107d', // 4221 in Hex
  chainName: 'GenLayer Bradbury Testnet',
  nativeCurrency: {
    name: 'GenLayer Token',
    symbol: 'GEN',
    decimals: 18,
  },
  rpcUrls: ['https://zksync-os-testnet-genlayer.zksync.dev'],
  blockExplorerUrls: [], // Provide if available
};

export async function connectAndSwitchNetwork(): Promise<string | null> {
  if (!window.ethereum) {
    throw new Error("No Web3 wallet found. Please install MetaMask or another browser wallet.");
  }

  // 1. Request Accounts
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const account = accounts[0];

  // 2. Switch or Add Network
  try {
    // Attempt to switch to the GenLayer Bradbury network
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: GENLAYER_BRADBURY_PARAMS.chainId }],
    });
  } catch (switchError: any) {
    // Error code 4902 indicates that the chain has not been added to MetaMask.
    if (switchError.code === 4902) {
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [GENLAYER_BRADBURY_PARAMS],
        });
      } catch (addError) {
        throw new Error("Failed to add the GenLayer Bradbury network to your wallet.");
      }
    } else {
      throw new Error("Failed to switch to the GenLayer Bradbury network.");
    }
  }

  return account; // Connection successful
}
