// Script Runner - Zero boilerplate script execution
// Use standalone with botName, or pass existing bot/sdk connection

import { BotSDK } from './index';
import { BotActions } from './actions';
import { formatWorldState } from './formatter';
import type { BotWorldState } from './types';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

// ============ Types ============

export interface ScriptContext {
    bot: BotActions;
    sdk: BotSDK;
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
}

export type ScriptFunction = (ctx: ScriptContext) => Promise<any>;

export interface RunOptions {
    /** Overall timeout in ms (default: none) */
    timeout?: number;
    /** Bot name - required if no connection provided */
    botName?: string;
    /** Existing connection - use instead of botName for MCP context */
    connection?: { bot: BotActions; sdk: BotSDK };
    /** Connect if not connected (default: true) */
    autoConnect?: boolean;
    /** Disconnect when done (default: false) */
    disconnectAfter?: boolean;
    /** Print world state after execution (default: true) */
    printState?: boolean;
}

export interface LogEntry {
    timestamp: Date;
    level: 'log' | 'warn' | 'error';
    message: string;
}

export interface RunResult {
    success: boolean;
    result?: any;
    error?: Error;
    duration: number;
    logs: LogEntry[];
    finalState: BotWorldState | null;
}

// ============ Connection Management ============

interface BotConnection {
    sdk: BotSDK;
    bot: BotActions;
    username: string;
}

const connections = new Map<string, BotConnection>();

function parseEnv(content: string): Record<string, string> {
    const result: Record<string, string> = {};
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
            result[key.trim()] = valueParts.join('=').trim();
        }
    }
    return result;
}

async function getOrCreateConnection(botName: string): Promise<BotConnection> {
    const existing = connections.get(botName);
    if (existing && existing.sdk.isConnected()) {
        return existing;
    }

    const envPath = join(process.cwd(), 'bots', botName, 'bot.env');

    if (!existsSync(envPath)) {
        throw new Error(`Bot "${botName}" not found. Create it first with: bun scripts/create-bot.ts ${botName}`);
    }

    const envContent = await readFile(envPath, 'utf-8');
    const env = parseEnv(envContent);

    const username = env.BOT_USERNAME || botName;
    const password = env.PASSWORD;

    if (!password) {
        throw new Error(`No password found in ${envPath}`);
    }

    let gatewayUrl = 'ws://localhost:7780';
    if (env.SERVER) {
        gatewayUrl = `wss://${env.SERVER}/gateway`;
    }

    console.error(`[Runner] Connecting to bot "${botName}"...`);

    const sdk = new BotSDK({
        botUsername: username,
        password,
        gatewayUrl,
        connectionMode: 'control',
        autoReconnect: false
    });

    const bot = new BotActions(sdk);

    const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Connection timed out after 30s')), 30000);
    });

    await Promise.race([sdk.connect(), timeoutPromise]);

    console.error(`[Runner] Connected to bot "${botName}"`);

    const connection: BotConnection = { sdk, bot, username };
    connections.set(botName, connection);

    return connection;
}

// ============ Core Runner ============

/**
 * Run a script with zero boilerplate.
 *
 * @example
 * // Standalone - auto-connects using botName
 * import { runScript } from '../../sdk/runner';
 *
 * await runScript(async (ctx) => {
 *   await ctx.bot.chopTree();
 * }, { botName: 'mybot' });
 *
 * @example
 * // With existing connection (MCP context)
 * await runScript(async (ctx) => {
 *   await ctx.bot.chopTree();
 * }, { connection: { bot, sdk } });
 */
export async function runScript(
    script: ScriptFunction,
    options: RunOptions = {}
): Promise<RunResult> {
    const {
        timeout,
        botName,
        connection,
        autoConnect = true,
        disconnectAfter = false,
        printState = true
    } = options;

    const startTime = Date.now();
    const logs: LogEntry[] = [];

    // Get bot/sdk either from connection or by connecting
    let bot: BotActions;
    let sdk: BotSDK;
    let managedConnection = false;

    if (connection) {
        bot = connection.bot;
        sdk = connection.sdk;
    } else if (botName) {
        try {
            if (autoConnect) {
                const conn = await getOrCreateConnection(botName);
                bot = conn.bot;
                sdk = conn.sdk;
                managedConnection = true;
            } else {
                const existing = connections.get(botName);
                if (!existing || !existing.sdk.isConnected()) {
                    throw new Error(`Bot "${botName}" is not connected and autoConnect is false`);
                }
                bot = existing.bot;
                sdk = existing.sdk;
                managedConnection = true;
            }
        } catch (error: any) {
            return {
                success: false,
                error,
                duration: Date.now() - startTime,
                logs,
                finalState: null
            };
        }
    } else {
        return {
            success: false,
            error: new Error('Either botName or connection is required'),
            duration: Date.now() - startTime,
            logs,
            finalState: null
        };
    }

    // Create captured console functions
    const capturedLog = (...args: any[]) => {
        logs.push({
            timestamp: new Date(),
            level: 'log',
            message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')
        });
    };

    const capturedWarn = (...args: any[]) => {
        logs.push({
            timestamp: new Date(),
            level: 'warn',
            message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')
        });
    };

    const capturedError = (...args: any[]) => {
        logs.push({
            timestamp: new Date(),
            level: 'error',
            message: args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ')
        });
    };

    // Create script context
    const ctx: ScriptContext = {
        bot,
        sdk,
        log: capturedLog,
        warn: capturedWarn,
        error: capturedError
    };

    // Execute script
    let result: any;
    let error: Error | undefined;

    try {
        if (timeout) {
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(`Script timeout after ${timeout}ms`)), timeout);
            });
            result = await Promise.race([script(ctx), timeoutPromise]);
        } else {
            result = await script(ctx);
        }
    } catch (e: any) {
        error = e;
    }

    // Get final state
    const finalState = sdk.getState();
    const duration = Date.now() - startTime;

    // Print logs if any
    if (logs.length > 0) {
        console.log('');
        console.log('── Console ──');
        for (const log of logs) {
            const prefix = log.level === 'warn' ? '[warn] ' : log.level === 'error' ? '[error] ' : '';
            console.log(prefix + log.message);
        }
    }

    // Print result if any
    if (result !== undefined && !error) {
        console.log('');
        console.log('── Result ──');
        console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
    }

    // Print error if any
    if (error) {
        console.log('');
        console.log('── Error ──');
        console.log(error.message);
        if (error.stack) {
            console.log(error.stack);
        }
    }

    // Print state if requested
    if (printState && finalState) {
        console.log('');
        console.log('── World State ──');
        console.log(formatWorldState(finalState, sdk.getStateAge()));
    }

    // Disconnect if requested (only for managed connections)
    if (disconnectAfter && managedConnection && botName) {
        console.error(`[Runner] Disconnecting bot "${botName}"...`);
        await sdk.disconnect();
        connections.delete(botName);
    }

    return {
        success: !error,
        result: error ? undefined : result,
        error,
        duration,
        logs,
        finalState
    };
}

/**
 * Disconnect a bot by name
 */
export async function disconnectBot(botName: string): Promise<void> {
    const connection = connections.get(botName);
    if (connection) {
        await connection.sdk.disconnect();
        connections.delete(botName);
    }
}

/**
 * Get list of connected bots (managed by runner)
 */
export function listConnectedBots(): string[] {
    return Array.from(connections.keys()).filter(name => {
        const conn = connections.get(name);
        return conn && conn.sdk.isConnected();
    });
}
