
import { createClient } from 'genlayer-js';
import { testnetBradbury } from 'genlayer-js/chains';

const RPC_URL = 'https://zksync-os-testnet-genlayer.zksync.dev';
const TX_HASH = '0x68665d12f6bd24829d1554cf5edb396010b18a8cb2c530e654bcf7c04efd4658';

async function check() {
  console.log(`🔍 Checking receipt for ${TX_HASH}...`);
  const client = createClient({
    chain: {
      ...testnetBradbury,
      rpcUrls: {
        default: { http: [RPC_URL] },
        public: { http: [RPC_URL] },
      },
    },
  });

  try {
    const receipt = await client.getTransactionReceipt({ hash: TX_HASH as any });
    console.log('✅ Receipt Found!');
    console.log('Status:', receipt.status);
    console.log('Contract Address:', receipt.contractAddress);
    
    if (receipt.status === 'ACCEPTED' || receipt.status === 'SUCCESS' || (receipt.status as any) === 1) {
       console.log('\n🚀 DEPLOYMENT SUCCESSFUL!');
    } else {
       console.log('\n⏳ Transaction is still processing...');
    }
  } catch (err) {
    console.log('❌ Receipt not found yet. It might still be in consensus.');
  }
}

check();
