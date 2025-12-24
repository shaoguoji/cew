import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { savePrivateKey, saveTokenAddress, loadTokenAddress } from './utils';
import { getActiveViemAccount } from './walletManager';
import { getPublicClient, getWalletClient, getActiveNetwork } from './networkManager';
import { parseEther, parseAbi, formatEther, parseGwei } from 'viem';
import chalk from 'chalk';
import ora from 'ora';

// 1. Generate Wallet (No changes needed, generation is offline)
export async function generateWallet() {
    const spinner = ora('Generating new wallet...').start();
    try {
        const privateKey = generatePrivateKey();
        const account = privateKeyToAccount(privateKey);

        savePrivateKey(privateKey);

        spinner.succeed(chalk.green('Wallet generated successfully!'));
        console.log(chalk.yellow('Address:'), account.address);
        console.log(chalk.yellow('Private Key:'), privateKey);
        console.log(chalk.gray('(Saved to .env file)'));

        return { address: account.address, privateKey };
    } catch (error) {
        spinner.fail('Failed to generate wallet');
        console.error(error);
        throw error;
    }
}

// 2. Get Balance
export async function getBalance(address?: string) {
    if (!address) {
        try {
            const account = getActiveViemAccount();
            address = account.address;
        } catch (e) {
            console.error(chalk.red('No active account found. Please create or select a wallet.'));
            return;
        }
    }

    const network = getActiveNetwork();
    const publicClient = getPublicClient();
    const spinner = ora(`Fetching balance for ${address} on ${network.name}...`).start();
    try {
        const balance = await publicClient.getBalance({
            address: address as `0x${string}`,
        });

        spinner.stop();
        console.log(chalk.blue(`${network.symbol} Balance: ${formatEther(balance)} ${network.symbol}`));

        // Check for ERC20
        const tokenAddress = loadTokenAddress();
        if (tokenAddress) {
            const tokenSpinner = ora(`Fetching ERC20 balance from ${tokenAddress}...`).start();
            try {
                const abi = parseAbi([
                    'function balanceOf(address) view returns (uint256)',
                    'function decimals() view returns (uint8)',
                    'function symbol() view returns (string)'
                ]);

                const [tokenBalance, decimals, symbol] = await Promise.all([
                    publicClient.readContract({
                        address: tokenAddress as `0x${string}`,
                        abi,
                        functionName: 'balanceOf',
                        args: [address as `0x${string}`]
                    }) as Promise<bigint>,
                    publicClient.readContract({
                        address: tokenAddress as `0x${string}`,
                        abi,
                        functionName: 'decimals'
                    }) as Promise<number>,
                    publicClient.readContract({
                        address: tokenAddress as `0x${string}`,
                        abi,
                        functionName: 'symbol'
                    }) as Promise<string>
                ]);

                tokenSpinner.stop();
                const formatted = Number(tokenBalance) / (10 ** decimals);
                console.log(chalk.cyan(`${symbol} Balance: ${formatted} ${symbol}`));
                console.log(chalk.gray(`(Contract: ${tokenAddress})`));

            } catch (e) {
                tokenSpinner.fail(chalk.red('Failed to fetch token balance (invalid contract?)'));
            }
        }

        return balance;
    } catch (error) {
        spinner.fail('Failed to fetch balance');
        console.error(error);
    }
}

// 3. Transfer ERC20
export async function transferERC20(tokenAddress: string, toAddress: string, amount: string, maxFeePerGasGwei?: string, maxPriorityFeePerGasGwei?: string) {
    let account;
    try {
        account = getActiveViemAccount();
    } catch (e) {
        console.error(chalk.red('No active account found. Please create or select a wallet.'));
        return;
    }

    const walletClient = getWalletClient(account);
    const publicClient = getPublicClient();

    const spinner = ora('Preparing transaction...').start();

    try {
        // ERC20 Transfer ABI
        const abi = parseAbi(['function transfer(address to, uint256 value) returns (bool)', 'function decimals() view returns (uint8)']);

        // Fetch decimals using public client
        const decimals = await publicClient.readContract({
            address: tokenAddress as `0x${string}`,
            abi,
            functionName: 'decimals',
        }) as number;

        const value = BigInt(parseFloat(amount) * (10 ** decimals));
        const maxFeePerGas = maxFeePerGasGwei ? parseGwei(maxFeePerGasGwei) : undefined;
        const maxPriorityFeePerGas = maxPriorityFeePerGasGwei ? parseGwei(maxPriorityFeePerGasGwei) : undefined;

        spinner.text = 'Sending transaction...';

        const hash = await walletClient.writeContract({
            account,
            address: tokenAddress as `0x${string}`,
            abi,
            functionName: 'transfer',
            args: [toAddress as `0x${string}`, value],
            // chain is embedded in client
            maxFeePerGas,
            maxPriorityFeePerGas,
        });

        spinner.succeed(chalk.green('Transaction sent!'));
        const network = getActiveNetwork();
        console.log(chalk.yellow('Tx Hash:'), hash);
        if (network.explorerUrl) {
            console.log(chalk.blue(`Explorer: ${network.explorerUrl}/tx/${hash}`));
        } else {
            console.log(chalk.gray('Explorer URL not configured for this network'));
        }

    } catch (error) {
        spinner.fail('Transfer failed');
        console.error(error);
    }
}

// 3.5 Transfer ETH
export async function transferETH(toAddress: string, amount: string, maxFeePerGasGwei?: string, maxPriorityFeePerGasGwei?: string) {
    let account;
    try {
        account = getActiveViemAccount();
    } catch (e) {
        console.error(chalk.red('No active account found. Please create or select a wallet.'));
        return;
    }

    const walletClient = getWalletClient(account);

    const spinner = ora('Preparing Native Token transaction...').start();

    try {
        const value = parseEther(amount);
        const maxFeePerGas = maxFeePerGasGwei ? parseGwei(maxFeePerGasGwei) : undefined;
        const maxPriorityFeePerGas = maxPriorityFeePerGasGwei ? parseGwei(maxPriorityFeePerGasGwei) : undefined;

        spinner.text = 'Sending...';

        const hash = await walletClient.sendTransaction({
            account,
            to: toAddress as `0x${string}`,
            value,
            maxFeePerGas,
            maxPriorityFeePerGas,
            // chain embedded
        });

        spinner.succeed(chalk.green('Transaction sent!'));
        const network = getActiveNetwork();
        console.log(chalk.yellow('Tx Hash:'), hash);
        if (network.explorerUrl) {
            console.log(chalk.blue(`Explorer: ${network.explorerUrl}/tx/${hash}`));
        } else {
            console.log(chalk.gray('Explorer URL not configured for this network'));
        }

    } catch (error) {
        spinner.fail('Transfer failed');
        console.error(error);
    }
}

// 4. Set Token Address
export async function setTokenAddress(address: string) {
    if (!address.startsWith('0x') || address.length !== 42) {
        console.error(chalk.red('Invalid address format'));
        return;
    }
    saveTokenAddress(address);
    console.log(chalk.green(`Token address set to: ${address}`));
}
