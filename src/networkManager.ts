import { createPublicClient, createWalletClient, http, defineChain, Chain } from 'viem';
import { privateKeyToAccount, mnemonicToAccount } from 'viem/accounts';
import { loadStore, saveStore, Network, Wallet, Account } from './store';
import { getActiveWallet, getActiveAccount } from './walletManager';
import { v4 as uuidv4 } from 'uuid';

export function getActiveNetwork(): Network {
    const store = loadStore();
    if (!store.activeNetworkId) {
        // Fallback or init should have caught this, but just in case
        return store.networks[0];
    }
    const network = store.networks.find(n => n.id === store.activeNetworkId);
    if (!network) throw new Error('Active network configuration not found');
    return network;
}

export function getPublicClient() {
    const network = getActiveNetwork();

    const chain: Chain = defineChain({
        id: network.chainId,
        name: network.name,
        nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: 18 },
        rpcUrls: {
            default: { http: [network.rpcUrl] }
        },
        blockExplorers: network.explorerUrl ? {
            default: { name: 'Explorer', url: network.explorerUrl }
        } : undefined
    });

    return createPublicClient({
        chain,
        transport: http(network.rpcUrl)
    });
}

export function getWalletClient(account: any) { // Viem account object
    const network = getActiveNetwork();

    const chain: Chain = defineChain({
        id: network.chainId,
        name: network.name,
        nativeCurrency: { name: network.symbol, symbol: network.symbol, decimals: 18 },
        rpcUrls: {
            default: { http: [network.rpcUrl] }
        },
        blockExplorers: network.explorerUrl ? {
            default: { name: 'Explorer', url: network.explorerUrl }
        } : undefined
    });

    return createWalletClient({
        account,
        chain,
        transport: http(network.rpcUrl)
    });
}

export function addNetwork(name: string, rpcUrl: string, chainId: number, symbol: string, explorerUrl?: string) {
    const store = loadStore();
    const newNetwork: Network = {
        id: uuidv4(),
        name,
        rpcUrl,
        chainId,
        symbol,
        explorerUrl
    };
    store.networks.push(newNetwork);
    saveStore(store);
    return newNetwork;
}

export function switchNetwork(networkId: string) {
    const store = loadStore();
    const network = store.networks.find(n => n.id === networkId);
    if (!network) throw new Error('Network not found');

    store.activeNetworkId = networkId;
    saveStore(store);
}

export function listNetworks() {
    const store = loadStore();
    return store.networks;
}

export function deleteActiveNetwork() {
    const store = loadStore();
    const networkId = store.activeNetworkId;

    if (!networkId) throw new Error('No active network');
    if (networkId === 'sepolia' || networkId === 'anvil') {
        throw new Error('Cannot delete default networks (Sepolia, Anvil)');
    }

    store.networks = store.networks.filter(n => n.id !== networkId);
    store.activeNetworkId = 'sepolia'; // Fallback to safe default
    saveStore(store);
}
