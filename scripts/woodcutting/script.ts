/**
 * Woodcutting Trainer Script
 *
 * Goal: Train Woodcutting to level 10+ starting from a fresh Lumbridge spawn.
 *
 * Strategy:
 * 1. Walk to Bob's Axes in Lumbridge
 * 2. Buy a bronze axe (16gp - fresh accounts have 25gp)
 * 3. Walk to trees near Lumbridge
 * 4. Chop trees until level 10
 * 5. Drop logs when inventory fills
 */

import { runScript, TestPresets, type ScriptContext, StallError } from '../script-runner';

// Locations
const BOBS_AXES = { x: 3230, z: 3203 };
const LUMBRIDGE_TREES = { x: 3200, z: 3230 }; // Trees west of Lumbridge castle

// Configuration
const TARGET_LEVEL = 10;
const BRONZE_AXE_COST = 16;

function getWoodcuttingLevel(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Woodcutting')?.baseLevel ?? 1;
}

function getWoodcuttingXp(ctx: ScriptContext): number {
    return ctx.state()?.skills.find(s => s.name === 'Woodcutting')?.experience ?? 0;
}

function countLogs(ctx: ScriptContext): number {
    const inv = ctx.state()?.inventory ?? [];
    return inv.filter(i => /logs/i.test(i.name)).length;
}

function hasAxe(ctx: ScriptContext): boolean {
    const inv = ctx.state()?.inventory ?? [];
    const equip = ctx.state()?.equipment ?? [];
    return inv.some(i => /axe/i.test(i.name)) || equip.some(i => /axe/i.test(i.name));
}

function getCoins(ctx: ScriptContext): number {
    const coins = ctx.state()?.inventory.find(i => /coins/i.test(i.name));
    return coins?.count ?? 0;
}

async function dropAllLogs(ctx: ScriptContext): Promise<void> {
    const state = ctx.state();
    if (!state) return;

    const logsItems = state.inventory.filter(item => /logs/i.test(item.name));
    ctx.log(`Dropping ${logsItems.length} logs...`);

    for (const item of logsItems) {
        await ctx.sdk.sendDropItem(item.slot);
        await new Promise(r => setTimeout(r, 150));
    }
}

async function buyAxeFromBob(ctx: ScriptContext): Promise<boolean> {
    const { bot, sdk, log, progress } = ctx;

    // Check if we have enough coins
    const gp = getCoins(ctx);
    log(`Current GP: ${gp}`);

    if (gp < BRONZE_AXE_COST) {
        ctx.error(`Not enough GP for bronze axe (need ${BRONZE_AXE_COST}, have ${gp})`);
        return false;
    }

    // Walk to Bob's Axes
    log(`Walking to Bob's Axes at (${BOBS_AXES.x}, ${BOBS_AXES.z})...`);
    await bot.walkTo(BOBS_AXES.x, BOBS_AXES.z);
    progress();

    // Dismiss any dialogs
    await bot.dismissBlockingUI();
    progress();

    // Log nearby NPCs for debugging
    const state = ctx.state();
    log(`Position: (${state?.player?.worldX}, ${state?.player?.worldZ})`);
    const nearbyNpcs = state?.nearbyNpcs?.slice(0, 5) ?? [];
    log(`Nearby NPCs: ${nearbyNpcs.map(n => n.name).join(', ')}`);

    // Open Bob's shop
    log('Opening shop...');
    let shopResult = await bot.openShop(/bob/i);
    progress();

    if (!shopResult.success) {
        // Try finding any NPC with trade option
        log('Bob not found by name, looking for trade option...');
        const npcWithTrade = state?.nearbyNpcs.find(n =>
            n.optionsWithIndex.some(o => /trade/i.test(o.text))
        );

        if (npcWithTrade) {
            log(`Found tradeable NPC: ${npcWithTrade.name}`);
            const tradeOpt = npcWithTrade.optionsWithIndex.find(o => /trade/i.test(o.text));
            if (tradeOpt) {
                await sdk.sendInteractNpc(npcWithTrade.index, tradeOpt.opIndex);
                await new Promise(r => setTimeout(r, 1500));
                progress();
            }
        }
    }

    // Check if shop opened
    await new Promise(r => setTimeout(r, 500));
    const shopState = ctx.state()?.shop;

    if (!shopState?.isOpen) {
        ctx.error('Failed to open shop');
        return false;
    }

    // Log shop inventory
    log(`Shop open with ${shopState.shopItems.length} items`);
    const axes = shopState.shopItems.filter(i => /axe/i.test(i.name));
    for (const axe of axes) {
        log(`  ${axe.name} - ${axe.buyPrice}gp (stock: ${axe.count})`);
    }

    // Buy bronze axe
    log('Buying bronze axe...');
    const buyResult = await bot.buyFromShop(/bronze axe/i, 1);
    progress();
    log(`Buy result: ${buyResult.message}`);

    // Close shop by walking away
    await sdk.sendWalk(3225, 3210, true);
    await new Promise(r => setTimeout(r, 1000));

    // Verify we got the axe
    const gotAxe = hasAxe(ctx);
    if (gotAxe) {
        log('SUCCESS: Got bronze axe!');
    } else {
        ctx.error('Failed to buy bronze axe');
    }

    return gotAxe;
}

async function chopTrees(ctx: ScriptContext): Promise<void> {
    const { bot, sdk, log, progress } = ctx;

    log(`Walking to trees at (${LUMBRIDGE_TREES.x}, ${LUMBRIDGE_TREES.z})...`);
    await bot.walkTo(LUMBRIDGE_TREES.x, LUMBRIDGE_TREES.z);
    progress();

    let lastXp = getWoodcuttingXp(ctx);
    let logsChopped = 0;
    let stuckCount = 0;
    const MAX_STUCK = 10;

    while (getWoodcuttingLevel(ctx) < TARGET_LEVEL) {
        const state = ctx.state();
        if (!state) {
            await new Promise(r => setTimeout(r, 500));
            continue;
        }

        // Dismiss any level-up dialogs
        if (state.dialog.isOpen) {
            log('Dismissing dialog...');
            await sdk.sendClickDialog(0);
            progress();
            await new Promise(r => setTimeout(r, 300));
            continue;
        }

        // Drop logs if inventory is getting full
        if (state.inventory.length >= 26) {
            await dropAllLogs(ctx);
            continue;
        }

        // Find nearest tree
        const tree = sdk.findNearbyLoc(/^tree$/i);

        if (!tree) {
            log('No tree nearby, walking to tree area...');
            await bot.walkTo(LUMBRIDGE_TREES.x, LUMBRIDGE_TREES.z);
            progress();
            stuckCount++;

            if (stuckCount > MAX_STUCK) {
                throw new StallError('Unable to find trees after multiple attempts');
            }
            continue;
        }

        // Chop the tree
        const result = await bot.chopTree(tree);
        progress();

        const currentXp = getWoodcuttingXp(ctx);
        if (currentXp > lastXp) {
            logsChopped++;
            stuckCount = 0; // Reset stuck counter on success
            log(`[Lvl ${getWoodcuttingLevel(ctx)}] Chopped tree! Logs: ${countLogs(ctx)}, Total: ${logsChopped}, XP: ${currentXp}`);
            lastXp = currentXp;
        } else if (!result.success) {
            log(`Chop failed: ${result.message}`);
            stuckCount++;

            if (stuckCount > MAX_STUCK) {
                throw new StallError(`Stuck: ${stuckCount} failed chop attempts`);
            }
        }

        // Small delay between actions
        await new Promise(r => setTimeout(r, 200));
    }

    log(`=== GOAL ACHIEVED: Woodcutting level ${getWoodcuttingLevel(ctx)}! ===`);
}

// Main script
runScript({
    name: 'woodcutting',
    goal: `Train Woodcutting to level ${TARGET_LEVEL}`,
    preset: TestPresets.LUMBRIDGE_SPAWN,
    timeLimit: 10 * 60 * 1000,  // 10 minutes
    stallTimeout: 45_000,       // 45 seconds
    launchOptions: { usePuppeteer: true },
}, async (ctx) => {
    const { log, progress } = ctx;

    log('=== Woodcutting Trainer ===');
    log(`Goal: Level ${TARGET_LEVEL}`);

    // Wait for state to initialize
    await new Promise(r => setTimeout(r, 2000));
    progress();

    const state = ctx.state();
    if (!state?.player) {
        ctx.error('No player state');
        return;
    }

    log(`Starting at (${state.player.worldX}, ${state.player.worldZ})`);
    log(`Current Woodcutting level: ${getWoodcuttingLevel(ctx)}`);

    // Dismiss any startup dialogs
    await ctx.bot.dismissBlockingUI();
    progress();

    // Step 1: Get an axe if we don't have one
    if (!hasAxe(ctx)) {
        log('No axe found, buying from Bob...');
        const gotAxe = await buyAxeFromBob(ctx);
        if (!gotAxe) {
            ctx.error('Failed to acquire axe, cannot continue');
            return;
        }
    } else {
        log('Already have an axe!');
    }

    // Step 2: Chop trees until target level
    log('Starting woodcutting training...');
    await chopTrees(ctx);

    log('=== Script Complete ===');
});
