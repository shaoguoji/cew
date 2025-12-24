import { generateMnemonic, mnemonicToAccount, english } from 'viem/accounts';
import { privateKeyToAccount } from 'viem/accounts';
import { Wallet, Account, loadStore, saveStore } from './store';
import { Wallet as EthersWallet } from 'ethers';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';


// --- Wallet ---

export async function createHDWallet(name: string) {
    const mnemonic = generateMnemonic(english);
    const store = loadStore();

    const newWallet: Wallet = {
        id: uuidv4(),
        type: 'hd',
        name,
        mnemonic,
        accounts: []
    };

    // Derive first account
    const account = mnemonicToAccount(mnemonic, { addressIndex: 0 });
    newWallet.accounts.push({
        address: account.address,
        path: "m/44'/60'/0'/0/0",
        name: 'Account 1'
    });

    store.wallets.push(newWallet);
    store.activeWalletId = newWallet.id;
    store.activeAccountAddress = account.address;

    saveStore(store);
    return { mnemonic, address: account.address };
}

export function importMnemonic(name: string, mnemonic: string) {
    const store = loadStore();
    // Verify mnemonic? Simple check for now
    if (mnemonic.split(' ').length < 12) throw new Error('Invalid mnemonic');

    const newWallet: Wallet = {
        id: uuidv4(),
        type: 'hd',
        name,
        mnemonic,
        accounts: []
    };

    for (let i = 0; i < 10; i++) {
        const account = mnemonicToAccount(mnemonic, { addressIndex: i });
        newWallet.accounts.push({
            address: account.address,
            path: `m/44'/60'/0'/0/${i}`,
            name: `Account ${i + 1}`
        });
    }

    store.wallets.push(newWallet);
    store.activeWalletId = newWallet.id;
    store.activeAccountAddress = newWallet.accounts[0].address;
    saveStore(store);
}

// --- Accounts ---

export function deriveNewAccount(walletId: string) {
    const store = loadStore();
    const wallet = store.wallets.find(w => w.id === walletId);
    if (!wallet || wallet.type !== 'hd' || !wallet.mnemonic) {
        throw new Error('Cannot derive account: Wallet not found or not HD');
    }

    const index = wallet.accounts.length;
    const account = mnemonicToAccount(wallet.mnemonic, { addressIndex: index });

    const newAccount: Account = {
        address: account.address,
        path: `m/44'/60'/0'/0/${index}`,
        name: `Account ${index + 1}`
    };

    wallet.accounts.push(newAccount);
    store.activeAccountAddress = newAccount.address; // Auto-switch
    saveStore(store);
    return newAccount;
}

export function importPrivateKey(name: string, privateKey: string, walletId: string) {
    const store = loadStore();
    const wallet = store.wallets.find(w => w.id === walletId);
    if (!wallet) throw new Error('Wallet not found');

    // Use viem to verify and get address
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    wallet.accounts.push({
        address: account.address,
        privateKey: privateKey, // Saving RAW private key as per plan (unencrypted locally)
        name
    });

    store.activeAccountAddress = account.address;
    saveStore(store);
    return account.address;
}

// --- Keystore ---

export async function importKeystore(filePath: string, password: string, walletId: string) {
    const fs = require('fs');
    const json = fs.readFileSync(filePath, 'utf8');

    // Ethers v6 Wallet.fromEncryptedJson
    const wallet = await EthersWallet.fromEncryptedJson(json, password);

    return importPrivateKey('Imported Keystore', wallet.privateKey, walletId);
}

export async function exportKeystore(privateKey: string, password: string): Promise<string> {
    const wallet = new EthersWallet(privateKey);
    const json = await wallet.encrypt(password);
    return json;
}

// --- State Helpers ---

export function getActiveWallet() {
    const store = loadStore();
    if (!store.activeWalletId) return null;
    return store.wallets.find(w => w.id === store.activeWalletId);
}

export function getActiveAccount() {
    const store = loadStore();
    const wallet = getActiveWallet();
    if (!wallet || !store.activeAccountAddress) return null;

    return wallet.accounts.find(a => a.address === store.activeAccountAddress);
}

// For compatibility with existing actions.ts, let's export a helper that gets the actual client or PK
export function getActiveViemAccount() {
    const wallet = getActiveWallet();
    const account = getActiveAccount();
    if (!wallet || !account) throw new Error('No active account');

    if (account.privateKey) {
        return privateKeyToAccount(account.privateKey as `0x${string}`);
    }
    if (wallet.type === 'hd' && wallet.mnemonic && account.path) {
        const index = parseInt(account.path.split('/').pop() || '0');
        return mnemonicToAccount(wallet.mnemonic, { addressIndex: index });
    }
    throw new Error('Invalid account state');
}
