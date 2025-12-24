#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { getBalance, transferERC20, transferETH, setTokenAddress } from './actions';
import { loadStore, isStoreEncrypted, isStoreInitialized, unlockStore } from './store';
import {
    createHDWallet,
    importMnemonic,
    deriveNewAccount,
    importPrivateKey,
    importKeystore,
    exportKeystore,
    getActiveWallet,
    getActiveAccount,
    deleteActiveWallet,
    deleteActiveAccount
} from './walletManager';
// ... imports
// ... imports
import { waitForKeypress, cancellablePrompt, CancelError, loadTokenAddress } from './utils';
import { addNetwork, switchNetwork, listNetworks, getActiveNetwork } from './networkManager';

const program = new Command();
const ui = new inquirer.ui.BottomBar();

function updateStatus() {


    let wInfo = chalk.red('No Wallet');
    let aInfo = chalk.red('No Account');
    let net = chalk.green('Unknown Network');

    try {
        const wallet = getActiveWallet();
        const account = getActiveAccount();
        // Try to get network safely
        try {
            const network = getActiveNetwork();
            net = chalk.green(network.name);
        } catch {
            net = chalk.red('No Network');
        }

        if (wallet) wInfo = chalk.cyan(wallet.name) + chalk.gray(` (${wallet.type})`);
        if (account) {
            const addrShort = `${account.address.substring(0, 6)}...${account.address.substring(account.address.length - 4)}`;
            aInfo = chalk.cyan(account.name) + chalk.gray(` (${addrShort})`);
        }
    } catch (e: any) {
        if (e.message && e.message.includes('locked')) {
            wInfo = chalk.yellow('🔒 Locked');
            aInfo = chalk.yellow('🔒 Locked');
        } else {
            wInfo = chalk.gray('Initializing...');
            aInfo = chalk.gray('...');
        }
    }
    const hints = chalk.gray('[ESC] Back/Cancel  [⬆/⬇] Navigate  [Enter] Select');

    const line = ` 💼 ${wInfo}  👤 ${aInfo}  🌐 ${net}\n ${hints}`;

    // Force write to bottom bar with newline to prevent overlap with prompt
    ui.updateBottomBar(line + '\n');
}

function printHeader() {
    console.clear();
    ui.log.write(chalk.magenta.bold('\nWelcome to CEW! A simple CLI Ethereum Wallet using Viem 🚀\n'));
    updateStatus();
}

program
    .name('cew')
    .description('A simple CLI Ethereum Wallet using Viem')
    .version('2.0.0');

// Helper to ignore cancel error
async function safeRun(fn: () => Promise<void>) {
    try {
        await fn();
    } catch (error) {
        if (error instanceof CancelError) {
            console.log(chalk.gray('\nOperation cancelled.'));
            return;
        }
        throw error; // Re-throw real errors
    }
}

// Startup Flow
// Startup Flow
async function startup() {
    printHeader();

    try {
        if (!isStoreInitialized()) {
            console.log(chalk.yellow('No existing wallet found. Initializing secure storage...'));
            try {
                const { password } = await cancellablePrompt([{
                    type: 'password',
                    name: 'password',
                    message: 'Create a password for your wallet:',
                    mask: '*'
                }]);

                const { confirm } = await cancellablePrompt([{
                    type: 'password',
                    name: 'confirm',
                    message: 'Confirm password:',
                    mask: '*'
                }]);

                if (password !== confirm) {
                    console.log(chalk.red('Passwords do not match. Exiting.'));
                    process.exit(1);
                }

                unlockStore(password);
                console.log(chalk.green('Wallet initialized securely.'));
                await waitForKeypress();
            } catch (e) {
                if (e instanceof CancelError) process.exit(0);
                throw e;
            }

        } else if (isStoreEncrypted()) {
            let unlocked = false;
            while (!unlocked) {
                try {
                    const { password } = await cancellablePrompt([{
                        type: 'password',
                        name: 'password',
                        message: 'Enter your wallet password:',
                        mask: '*'
                    }]);

                    try {
                        unlockStore(password);
                        unlocked = true;
                        console.log(chalk.green('Unlocked successfully.'));
                    } catch (e) {
                        console.log(chalk.red('Incorrect password. Try again.'));
                    }
                } catch (e) {
                    if (e instanceof CancelError) process.exit(0);
                    throw e;
                }
            }
        } else {
            console.log(chalk.red.bold('WARNING: Unsecured plaintext wallet found!'));
            console.log(chalk.yellow('You must set a password to encrypt your data now.'));

            try {
                const { password } = await cancellablePrompt([{
                    type: 'password',
                    name: 'password',
                    message: 'Create a password to encrypt your wallet:',
                    mask: '*'
                }]);
                const { confirm } = await cancellablePrompt([{
                    type: 'password',
                    name: 'confirm',
                    message: 'Confirm password:',
                    mask: '*'
                }]);
                if (password !== confirm) {
                    console.log(chalk.red('Passwords do not match. Exiting.'));
                    process.exit(1);
                }

                unlockStore(password);
                console.log(chalk.green('Wallet encrypted and upgraded!.'));
                await waitForKeypress();
            } catch (e) {
                if (e instanceof CancelError) process.exit(0);
                throw e;
            }
        }

        mainMenu();

    } catch (error) {
        console.error(chalk.red('Startup failed:'), error);
        process.exit(1);
    }
}

// Main Menu
async function mainMenu() {
    printHeader();

    // ... imports
    // Imports moved to top

    // ... (inside mainMenu)
    try {
        const { action } = await cancellablePrompt([
            {
                type: 'list',
                name: 'action',
                message: 'What would you like to do?',
                choices: [
                    'Wallet And Account',
                    'Check Balance',
                    'Transfer ETH',
                    'Transfer ERC20',
                    'Set ERC20 Contract Address',
                    'Network Settings',
                    'Exit'
                ]
            }
        ]);

        switch (action) {
            case 'Wallet And Account':
                await walletMenu();
                break;
            case 'Check Balance':
                await safeRun(async () => { await getBalance(); await waitForKeypress(); });
                break;
            case 'Transfer ETH':
                await safeRun(async () => { await handleTransferETH(); await waitForKeypress(); });
                break;
            case 'Transfer ERC20':
                await safeRun(async () => { await handleTransfer(); await waitForKeypress(); });
                break;
            case 'Set ERC20 Contract Address':
                await safeRun(async () => { await handleSetToken(); });
                break;
            case 'Network Settings':
                await networkMenu();
                break;
            case 'Exit':
                console.log('Bye!');
                process.exit(0);
        }
    } catch (error) {
        if (error instanceof CancelError) {
            console.log(chalk.gray('\nExiting...'));
            process.exit(0);
        }
        else console.error(chalk.red('Error:'), error);
    }

    mainMenu();
}

async function walletMenu() {
    printHeader();
    console.log(chalk.bold('❯ Wallet And Account\n'));

    try {
        const { action } = await cancellablePrompt([
            {
                type: 'list',
                name: 'action',
                message: 'Select Option:',
                choices: [
                    'Generate New Wallet',
                    'Generate New Account',
                    'Switch Wallet',
                    'Switch Account',
                    'Import',
                    'Export Account',
                    'Export Wallet',
                    'Delete Current Account',
                    'Delete Current Wallet',
                    'Back'
                ]
            }
        ]);

        switch (action) {
            case 'Generate New Wallet':
                await safeRun(handleGenerateWallet);
                break;
            case 'Generate New Account':
                await safeRun(handleGenerateAccount);
                break;
            case 'Switch Wallet':
                await safeRun(handleSwitchWallet);
                break;
            case 'Switch Account':
                await safeRun(handleSwitchAccount);
                break;
            case 'Import':
                await importMenu();
                break;
            case 'Export Account':
                await exportAccountMenu();
                break;
            case 'Export Wallet':
                await exportWalletMenu();
                break;
            case 'Delete Current Account':
                await safeRun(handleDeleteAccount);
                break;
            case 'Delete Current Wallet':
                await safeRun(handleDeleteWallet);
                break;
            case 'Back':
                return;
        }

        if (action !== 'Back') {
            // Submenus usually handle their own wait or return logic.
            // If safeRun caught cancel, we just loop.
            // If action completed, we also loop.
            // We generally want to stay in walletMenu unless 'Back' is pressed.
            if (action !== 'Import' && action !== 'Export Account' && action !== 'Export Wallet' && action !== 'Delete Current Account' && action !== 'Delete Current Wallet') {
                // The handlers above (Switch, Gen) finish quickly.
                await waitForKeypress();
            }
            await walletMenu();
        }

    } catch (error) {
        if (error instanceof CancelError) return; // Go back to Main Menu
        throw error;
    }
}

async function handleDeleteAccount() {
    const account = getActiveAccount();
    if (!account) return console.log(chalk.red('No active account.'));

    console.log(chalk.red.bold(`\nWARNING: You are about to remove account ${account.name} (${account.address}) from this wallet.`));
    if (account.privateKey) {
        console.log(chalk.yellow('Make sure you have backed up the Private Key!'));
    }

    const { confirm } = await cancellablePrompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to delete this account?',
        default: false
    }]);

    if (confirm) {
        deleteActiveAccount();
        console.log(chalk.green('Account deleted.'));
        updateStatus();
    } else {
        console.log(chalk.gray('Cancelled.'));
    }
    await waitForKeypress();
}

async function handleDeleteWallet() {
    const wallet = getActiveWallet();
    if (!wallet) return console.log(chalk.red('No active wallet.'));

    console.log(chalk.red.bold(`\nWARNING: You are about to delete the ENTIRE wallet "${wallet.name}" and ALL its accounts.`));
    console.log(chalk.yellow('This action cannot be undone from the CLI. Ensure you have your Seed Phrase or Keys backed up!'));

    const { confirm } = await cancellablePrompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure you want to PERMANENTLY delete this wallet?',
        default: false
    }]);

    if (confirm) {
        deleteActiveWallet();
        console.log(chalk.green('Wallet deleted.'));
        updateStatus();
    } else {
        console.log(chalk.gray('Cancelled.'));
    }
    await waitForKeypress();
}



async function importMenu() {
    printHeader();
    console.log(chalk.bold('❯ Import\n'));
    try {
        const { action } = await cancellablePrompt([{
            type: 'list',
            name: 'action',
            message: 'Import Type:',
            choices: [
                'Account Private Key',
                'Account Keystore File',
                'Wallet Seed phrase',
                'Back'
            ]
        }]);

        switch (action) {
            case 'Account Private Key':
                await safeRun(handleImportPrivateKey);
                break;
            case 'Account Keystore File':
                await safeRun(handleImportKeystore);
                break;
            case 'Wallet Seed phrase':
                await safeRun(handleImportMnemonic);
                break;
            case 'Back':
                return;
        }
        if (action !== 'Back') await waitForKeypress();
        await importMenu(); // Loop

    } catch (e) {
        if (e instanceof CancelError) return;
        throw e;
    }
}

async function exportAccountMenu() {
    printHeader();
    console.log(chalk.bold('❯ Export Account\n'));
    try {
        const { action } = await cancellablePrompt([{
            type: 'list',
            name: 'action',
            message: 'Export Type:',
            choices: [
                'Export Private Key',
                'Export Public Key',
                'Export Address',
                'Back'
            ]
        }]);

        switch (action) {
            case 'Export Private Key':
                await safeRun(handleExportPK);
                break;
            case 'Export Public Key':
                console.log(chalk.yellow('Feature not implemented yet (requires derive)'));
                break;
            case 'Export Address':
                const acc = getActiveAccount();
                if (acc) console.log(chalk.green(acc.address));
                break;
        }
        if (action !== 'Back') await waitForKeypress();
        await exportAccountMenu();

    } catch (e) {
        if (e instanceof CancelError) return;
        throw e;
    }
}

async function exportWalletMenu() {
    printHeader();
    console.log(chalk.bold('❯ Export Wallet\n'));
    try {
        const { action } = await cancellablePrompt([{
            type: 'list',
            name: 'action',
            message: 'Option:',
            choices: [
                'Seed phrase',
                'Back'
            ]
        }]);

        if (action === 'Seed phrase') {
            const wallet = getActiveWallet();
            if (wallet?.mnemonic) {
                console.log(chalk.green('Seed Phrase:'), wallet.mnemonic);
            } else {
                console.log(chalk.red('Current wallet is not an HD wallet or has no seed.'));
            }
            await waitForKeypress();
        }
        await exportWalletMenu(); // Loop

    } catch (e) {
        if (e instanceof CancelError) return;
        throw e;
    }
}

// --- Handlers (Unwrapped, they propagate CancelError usually) ---

async function handleGenerateWallet() {
    const { name } = await cancellablePrompt([{ type: 'input', name: 'name', message: 'Wallet Name:' }]);
    const { mnemonic, address } = await createHDWallet(name);
    console.log(chalk.green('Wallet Created!'));
    console.log('Mnemonic:', mnemonic);
    console.log('First Account:', address);
}

async function handleGenerateAccount() {
    const wallet = getActiveWallet();
    if (!wallet) return console.log(chalk.red('No active wallet.'));

    if (wallet.type === 'hd') {
        const acc = deriveNewAccount(wallet.id);
        console.log(chalk.green('New Account Derived:'), acc.address);
    } else {
        console.log(chalk.red('Start a new wallet or Import a Private Key to add to this bag (Simple Interface limitation).'));
    }
}

async function handleSwitchWallet() {
    const store = loadStore();
    const choices = store.wallets.map(w => ({ name: `${w.name} (${w.accounts.length} accs)`, value: w.id }));
    if (choices.length === 0) return console.log(chalk.yellow('No wallets found.'));

    const { id } = await cancellablePrompt([{
        type: 'list',
        name: 'id',
        message: 'Select Wallet:',
        choices
    }]);

    store.activeWalletId = id;
    const w = store.wallets.find(x => x.id === id);
    if (w && w.accounts.length > 0) store.activeAccountAddress = w.accounts[0].address;

    const { saveStore } = require('./store');
    saveStore(store);
    console.log(chalk.green('Switched Wallet.'));
    updateStatus();
}

async function handleSwitchAccount() {
    const wallet = getActiveWallet();
    if (!wallet) return console.log(chalk.red('No active wallet.'));

    // This prompt needs cancel too.
    if (wallet.accounts.length === 0) return console.log(chalk.red('No accounts in wallet.'));

    const choices = wallet.accounts.map(a => ({ name: `${a.name} - ${a.address}`, value: a.address }));
    const { address } = await cancellablePrompt([{
        type: 'list',
        name: 'address',
        message: 'Select Account:',
        choices
    }]);

    const store = loadStore();
    store.activeAccountAddress = address;
    const { saveStore } = require('./store');
    saveStore(store);
    console.log(chalk.green('Switched Account.'));
    updateStatus();
}

async function handleImportMnemonic() {
    const { name, mnemonic } = await cancellablePrompt([
        { type: 'input', name: 'name', message: 'Wallet Name:' },
        { type: 'input', name: 'mnemonic', message: 'Seed Phrase:' }
    ]);
    try {
        importMnemonic(name, mnemonic);
        console.log(chalk.green('Wallet Imported!'));
    } catch (e: any) {
        console.log(chalk.red('Error:'), e.message);
    }
}

async function handleImportPrivateKey() {
    const wallet = getActiveWallet();
    if (!wallet) return console.log(chalk.red('Create a wallet container first (or we can auto-create one).'));

    const { name, key } = await cancellablePrompt([
        { type: 'input', name: 'name', message: 'Account Name:' },
        { type: 'input', name: 'key', message: 'Private Key:' }
    ]);

    try {
        importPrivateKey(name, key, wallet.id);
        console.log(chalk.green('Account Imported!'));
    } catch (e: any) {
        console.log(chalk.red('Error:'), e.message);
    }
}

async function handleImportKeystore() {
    const wallet = getActiveWallet();
    if (!wallet) return console.log(chalk.red('Create a wallet container first.'));

    const { path: fpath, pass } = await cancellablePrompt([
        { type: 'input', name: 'path', message: 'Keystore File Path:' },
        { type: 'password', name: 'pass', message: 'Password:' }
    ]);

    try {
        const addr = await importKeystore(fpath, pass, wallet.id);
        console.log(chalk.green('Account Imported:'), addr);
    } catch (e: any) {
        console.log(chalk.red('Error:'), e.message);
    }
}

async function handleExportPK() {
    const wallet = getActiveWallet();
    const account = getActiveAccount();
    if (!wallet || !account) return console.log(chalk.red('No active account.'));

    if (account.privateKey) {
        console.log(chalk.yellow('Private Key:'), account.privateKey);
    } else if (wallet.type === 'hd' && wallet.mnemonic && account.path) {
        console.log(chalk.yellow('HD Account Private Key export is strictly protected. Please check "Export Wallet" for Seed Phrase to recover elsewhere.'));
    }
}

async function handleTransfer() {
    const answers = await cancellablePrompt([
        {
            type: 'input',
            name: 'token',
            message: 'Token Contract Address:',
            default: loadTokenAddress() || '0xb8119Af65964BF83b0c44E8DD07e4bEbD3432d5c'
        },
        {
            type: 'input',
            name: 'to',
            message: 'Recipient Address:'
        },
        {
            type: 'input',
            name: 'amount',
            message: 'Amount:'
        },
        {
            type: 'input',
            name: 'maxFeePerGas',
            message: 'Max Fee Per Gas (Gwei) [Optional]:',
        },
        {
            type: 'input',
            name: 'maxPriorityFeePerGas',
            message: 'Max Priority Fee Per Gas (Gwei) [Optional]:',
        }
    ]);
    // If we are here, we finished prompt. 
    // If user cancelled in prompt, it threw, and safeRun catches it.
    await transferERC20(answers.token, answers.to, answers.amount, answers.maxFeePerGas, answers.maxPriorityFeePerGas);
}

async function handleTransferETH() {
    const answers = await cancellablePrompt([
        {
            type: 'input',
            name: 'to',
            message: 'Recipient Address:'
        },
        {
            type: 'input',
            name: 'amount',
            message: 'Amount (ETH):'
        },
        {
            type: 'input',
            name: 'maxFeePerGas',
            message: 'Max Fee Per Gas (Gwei) [Optional]:',
        },
        {
            type: 'input',
            name: 'maxPriorityFeePerGas',
            message: 'Max Priority Fee Per Gas (Gwei) [Optional]:',
        }
    ]);
    await transferETH(answers.to, answers.amount, answers.maxFeePerGas, answers.maxPriorityFeePerGas);
}

async function handleSetToken() {
    const { tokenAddress } = await cancellablePrompt([{
        type: 'input',
        name: 'tokenAddress',
        message: 'Enter ERC20 Token Contract Address:',
        validate: input => input.startsWith('0x') && input.length === 42 || 'Invalid address format'
    }]);
    await setTokenAddress(tokenAddress);
}

async function networkMenu() {
    printHeader();
    console.log(chalk.bold('❯ Network Settings\n'));

    try {
        const { action } = await cancellablePrompt([{
            type: 'list',
            name: 'action',
            message: 'Option:',
            choices: [
                'Switch Network',
                'Add Custom Network',
                'List Networks',
                'Back'
            ]
        }]);

        switch (action) {
            case 'Switch Network':
                await safeRun(handleSwitchNetwork);
                break;
            case 'Add Custom Network':
                await safeRun(handleAddNetwork);
                break;
            case 'List Networks':
                const networks = listNetworks();
                console.table(networks.map(n => ({ Name: n.name, ID: n.id, RPC: n.rpcUrl, ChainID: n.chainId })));
                await waitForKeypress();
                break;
            case 'Back':
                return;
        }

        await networkMenu();

    } catch (e) {
        if (e instanceof CancelError) return;
        throw e;
    }
}

async function handleSwitchNetwork() {
    const networks = listNetworks();
    const { id } = await cancellablePrompt([{
        type: 'list',
        name: 'id',
        message: 'Select Network:',
        choices: networks.map(n => ({ name: `${n.name} (${n.rpcUrl})`, value: n.id }))
    }]);

    switchNetwork(id);
    console.log(chalk.green('Network switched!'));
    updateStatus();
}

async function handleAddNetwork() {
    const answers = await cancellablePrompt([
        { type: 'input', name: 'name', message: 'Network Name:' },
        { type: 'input', name: 'rpcUrl', message: 'RPC URL:' },
        { type: 'input', name: 'chainId', message: 'Chain ID:' },
        { type: 'input', name: 'symbol', message: 'Currency Symbol (default ETH):', default: 'ETH' },
        { type: 'input', name: 'explorerUrl', message: 'Explorer URL (optional):' }
    ]);

    addNetwork(answers.name, answers.rpcUrl, parseInt(answers.chainId), answers.symbol, answers.explorerUrl);
    console.log(chalk.green('Network added successfully!'));
}

// Start
if (!process.argv.slice(2).length) {
    startup().catch(e => { console.error('Unhandled Rejection:', e); process.exit(1); });
} else {
    program.parse(process.argv);
}
