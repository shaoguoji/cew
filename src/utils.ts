import os from 'os';
import { createPublicClient, createWalletClient, http } from 'viem';
import { sepolia } from 'viem/chains';
import dotenv from 'dotenv';
import fs from 'fs';
import chalk from 'chalk';
import path from 'path';
import inquirer, { QuestionCollection } from 'inquirer';

dotenv.config({ path: path.join(os.homedir(), '.cew', '.env') });

const HOME_DIR = path.join(os.homedir(), '.cew');
if (!fs.existsSync(HOME_DIR)) {
    fs.mkdirSync(HOME_DIR, { recursive: true });
}

export const ENV_PATH = path.join(HOME_DIR, '.env');

// Public client for reading data (balance, nonce, etc.)
export const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com'),
});

// Helper to update .env calculation
export function updateEnv(key: string, value: string) {
    let envContent = '';
    if (fs.existsSync(ENV_PATH)) {
        envContent = fs.readFileSync(ENV_PATH, 'utf8');
    }

    const lines = envContent.split('\n');
    let found = false;
    const newLines = lines.map(line => {
        if (line.startsWith(`${key}=`)) {
            found = true;
            return `${key}=${value}`;
        }
        return line;
    });

    if (!found) {
        newLines.push(`${key}=${value}`);
    }

    // Filter empty lines to keep it clean
    const finalContent = newLines.filter(line => line.trim() !== '').join('\n');
    fs.writeFileSync(ENV_PATH, finalContent + '\n');

    // Update process.env for current session
    process.env[key] = value;
}

export function savePrivateKey(privateKey: string) {
    updateEnv('PRIVATE_KEY', privateKey);
    if (!process.env.RPC_URL) {
        updateEnv('RPC_URL', 'https://ethereum-sepolia-rpc.publicnode.com');
    }
}

export function loadPrivateKey(): string | undefined {
    return process.env.PRIVATE_KEY;
}

export function saveTokenAddress(address: string) {
    updateEnv('TOKEN_ADDRESS', address);
}
export async function waitForKeypress() {
    console.log(chalk.dim('\nPress any key to return to menu...'));
    process.stdin.setRawMode(true);
    process.stdin.resume();
    return new Promise<void>(resolve => {
        process.stdin.once('data', () => {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            resolve();
        });
    });
}
export function loadTokenAddress(): string | undefined {
    return process.env.TOKEN_ADDRESS;
}

export class CancelError extends Error {
    constructor() {
        super('Cancelled');
        this.name = 'CancelError';
    }
}

export function cancellablePrompt<T = any>(questions: QuestionCollection): Promise<T> {
    const promptPromise = inquirer.prompt(questions);
    const ui = (promptPromise as any).ui;

    return new Promise((resolve, reject) => {
        // Handle standard completion
        promptPromise.then((answers) => resolve(answers as any)).catch(reject);

        // Handle ESC
        if (ui && ui.rl) {
            const keypressHandler = (_: any, key: any) => {
                if (key && key.name === 'escape') {
                    try { ui.close(); } catch { }
                    reject(new CancelError());
                }
            };

            ui.rl.input.on('keypress', keypressHandler);

            // Cleanup listener when promise settles
            promptPromise
                .then(() => {
                    ui.rl.input.removeListener('keypress', keypressHandler);
                })
                .catch(() => {
                    ui.rl.input.removeListener('keypress', keypressHandler);
                });
        }
    });
}
