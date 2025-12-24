import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import os from 'os';

const DATA_DIR = path.join(os.homedir(), '.cew', 'data');
const WALLET_FILE = path.join(DATA_DIR, 'wallets.json');

export interface Account {
    address: string;
    path?: string;      // HD Derivation path
    privateKey?: string; // Standard private key
    name: string;
}

export interface Wallet {
    id: string;
    type: 'hd' | 'simple';
    mnemonic?: string;
    accounts: Account[];
    name: string;
}

export interface Network {
    id: string;
    name: string;
    rpcUrl: string;
    chainId: number;
    symbol: string;
    explorerUrl?: string;
}

export interface Token {
    address: string;
    symbol: string;
    decimals: number;
    chainId: number;
    name?: string;
}

export interface StorageData {
    activeWalletId?: string;
    activeAccountAddress?: string;
    activeNetworkId?: string;
    wallets: Wallet[];
    networks: Network[];
    tokens: Token[];
}

// Session State
let sessionKey: Buffer | null = null;
let currentSalt: Buffer | null = null;
let cachedData: StorageData | null = null;

// Encryption Consts
const ALGORITHM = 'aes-256-gcm';
const KEY_LEN = 32;
const SALT_LEN = 16;
const IV_LEN = 12;

function initStore() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

function deriveKey(password: string, salt: Buffer): Buffer {
    return crypto.scryptSync(password, salt, KEY_LEN);
}

export function isStoreInitialized(): boolean {
    return fs.existsSync(WALLET_FILE);
}

export function isStoreEncrypted(): boolean {
    if (!isStoreInitialized()) return false;
    try {
        const raw = fs.readFileSync(WALLET_FILE, 'utf8');
        const json = JSON.parse(raw);
        return !!(json.encrypted && json.salt && json.iv);
    } catch {
        return false;
    }
}

export function unlockStore(password: string) {
    initStore();

    // Case 1: New Store
    if (!fs.existsSync(WALLET_FILE)) {
        currentSalt = crypto.randomBytes(SALT_LEN);
        sessionKey = deriveKey(password, currentSalt);
        const defaultNetworks: Network[] = [
            { id: 'sepolia', name: 'Sepolia', rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com', chainId: 11155111, symbol: 'ETH', explorerUrl: 'https://sepolia.etherscan.io' },
            { id: 'anvil', name: 'Anvil (Local)', rpcUrl: 'http://127.0.0.1:8545', chainId: 31337, symbol: 'ETH' }
        ];
        cachedData = { wallets: [], networks: defaultNetworks, activeNetworkId: 'sepolia', tokens: [] };

        // Save initial
        saveStore(cachedData);
        return;
    }

    const raw = fs.readFileSync(WALLET_FILE, 'utf8');
    let json;
    try {
        json = JSON.parse(raw);
    } catch (e) {
        throw new Error('Corrupted wallet data file');
    }

    // Case 2: Encrypted Store
    if (json.encrypted) {
        currentSalt = Buffer.from(json.salt, 'hex');
        const iv = Buffer.from(json.iv, 'hex');
        const tag = Buffer.from(json.tag, 'hex');
        const text = json.data;

        const key = deriveKey(password, currentSalt);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        try {
            let decrypted = decipher.update(text, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            cachedData = JSON.parse(decrypted);
            sessionKey = key; // Auth success

            // Migration: Ensure networks exist
            if (!cachedData!.networks) {
                cachedData!.networks = [
                    { id: 'sepolia', name: 'Sepolia', rpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com', chainId: 11155111, symbol: 'ETH', explorerUrl: 'https://sepolia.etherscan.io' },
                    { id: 'anvil', name: 'Anvil (Local)', rpcUrl: 'http://127.0.0.1:8545', chainId: 31337, symbol: 'ETH' }
                ];
                cachedData!.activeNetworkId = 'sepolia';
                if (!cachedData!.tokens) cachedData!.tokens = [];
                saveStore(cachedData!); // Save migration immediately
            }
            // Separate check if networks existed but tokens didn't (intermediate state)
            if (!cachedData!.tokens) {
                cachedData!.tokens = [];
                saveStore(cachedData!);
            }
        } catch (e) {
            throw new Error('Incorrect password');
        }
    }
    // Case 3: Legacy Plaintext Store
    else {
        cachedData = json as StorageData;

        // Upgrade immediately
        currentSalt = crypto.randomBytes(SALT_LEN);
        sessionKey = deriveKey(password, currentSalt);
        saveStore(cachedData);
    }
}

export function loadStore(): StorageData {
    if (!cachedData) {
        throw new Error('Wallet locked. Please unlock first.');
    }
    return cachedData;
}

export function saveStore(data: StorageData) {
    cachedData = data; // Update cache

    initStore();
    if (!sessionKey || !currentSalt) throw new Error('Cannot save: Wallet locked');

    // Encrypt
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGORITHM, sessionKey, iv);

    const stringified = JSON.stringify(data);
    let encrypted = cipher.update(stringified, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    const output = {
        encrypted: true,
        salt: currentSalt.toString('hex'),
        iv: iv.toString('hex'),
        tag: tag.toString('hex'),
        data: encrypted
    };

    fs.writeFileSync(WALLET_FILE, JSON.stringify(output, null, 2));
}
