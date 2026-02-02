import { runScript, TestPresets } from '../script-runner';

/**
 * Test if ladders/stairs work in other buildings.
 * If Wizard Tower ladder works, we can work around the Lumbridge Castle stair bug.
 */
runScript({
    name: 'ladder-test',
    goal: 'Test ladder/stair functionality in Wizard Tower',
    preset: TestPresets.LUMBRIDGE_SPAWN,
    timeLimit: 120_000,
    stallTimeout: 60_000,
    launchOptions: {
        usePuppeteer: true,
        headless: false,
    },
}, async (ctx) => {
    ctx.log('=== Ladder/Stair Functionality Test ===');

    const startPos = ctx.state()?.player;
    ctx.log(`Starting at: (${startPos?.worldX}, ${startPos?.worldZ}), floor: ${startPos?.level}`);

    // Walk toward Wizard's Tower (south of Draynor Village)
    // It's a long walk, so let's use waypoints
    const waypoints = [
        [3222, 3218], // Start
        [3230, 3220], // East
        [3230, 3200], // South
        [3220, 3180], // Continue south
        [3200, 3170], // West-ish toward Draynor
        [3150, 3170], // West to Draynor area
        [3109, 3168], // Wizard Tower entrance
    ];

    for (const [x, z] of waypoints) {
        ctx.log(`Walking to (${x}, ${z})...`);
        try {
            await ctx.bot.walkTo(x!, z!);
            await new Promise(r => setTimeout(r, 500));

            const pos = ctx.state()?.player;
            ctx.log(`  -> Now at (${pos?.worldX}, ${pos?.worldZ})`);
        } catch (e) {
            ctx.warn(`Walk failed: ${e}`);
        }
    }

    // Check if we're near Wizard's Tower
    const pos = ctx.state()?.player;
    ctx.log(`\nFinal position: (${pos?.worldX}, ${pos?.worldZ})`);

    // Look for ladder
    const ladders = ctx.state()?.nearbyLocs.filter(l => /ladder/i.test(l.name)) ?? [];
    ctx.log(`Ladders found: ${ladders.map(l => `${l.name}@(${l.x},${l.z}) dist=${l.distance} opts:[${l.optionsWithIndex.map(o => o.text).join(',')}]`).join('; ')}`);

    // Look for any climbable object
    const climbables = ctx.state()?.nearbyLocs.filter(l =>
        l.optionsWithIndex.some(o => /climb/i.test(o.text))
    ) ?? [];
    ctx.log(`Climbable objects: ${climbables.map(l => `${l.name}@(${l.x},${l.z})`).join(', ')}`);

    // Try to enter the tower
    ctx.log('\nTrying to enter Wizard Tower...');
    await ctx.bot.walkTo(3109, 3168);
    await new Promise(r => setTimeout(r, 500));

    // Check for door
    const door = ctx.state()?.nearbyLocs.find(l =>
        /door/i.test(l.name) &&
        l.optionsWithIndex.some(o => /open/i.test(o.text))
    );
    if (door) {
        ctx.log(`Opening door at (${door.x}, ${door.z})...`);
        const opt = door.optionsWithIndex.find(o => /open/i.test(o.text));
        if (opt) {
            await ctx.sdk.sendInteractLoc(door.x, door.z, door.id, opt.opIndex);
            await new Promise(r => setTimeout(r, 1000));
        }
    }

    // Walk inside
    await ctx.bot.walkTo(3104, 3162);
    await new Promise(r => setTimeout(r, 500));

    // Find ladder to basement
    const ladder = ctx.state()?.nearbyLocs.find(l =>
        /ladder/i.test(l.name) &&
        l.optionsWithIndex.some(o => /climb.*down/i.test(o.text))
    );

    if (!ladder) {
        ctx.warn('No ladder found inside Wizard Tower');

        // Log what IS nearby
        const nearby = ctx.state()?.nearbyLocs.slice(0, 10) ?? [];
        ctx.log(`Nearby objects: ${nearby.map(l => `${l.name}@(${l.x},${l.z})`).join(', ')}`);
        return;
    }

    ctx.log(`\nFound ladder at (${ladder.x}, ${ladder.z}), distance=${ladder.distance}`);
    ctx.log(`Options: ${ladder.optionsWithIndex.map(o => `${o.opIndex}:${o.text}`).join(', ')}`);

    // Try climbing down
    const priorLevel = ctx.state()?.player?.level ?? 0;
    ctx.log(`\nAttempting to climb down (current floor: ${priorLevel})...`);

    const climbOpt = ladder.optionsWithIndex.find(o => /climb.*down/i.test(o.text));
    if (climbOpt) {
        const result = await ctx.sdk.sendInteractLoc(ladder.x, ladder.z, ladder.id, climbOpt.opIndex);
        ctx.log(`Interaction result: ${JSON.stringify(result)}`);

        // Wait for floor change
        for (let i = 0; i < 5; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const currLevel = ctx.state()?.player?.level ?? 0;
            const currPos = ctx.state()?.player;
            ctx.log(`  Check ${i+1}: floor=${currLevel}, pos=(${currPos?.worldX}, ${currPos?.worldZ})`);

            if (currLevel !== priorLevel) {
                ctx.log('\n*** LADDER WORKS! Floor changed! ***');

                // Look for Sedridor in basement
                const npcs = ctx.state()?.nearbyNpcs.slice(0, 5) ?? [];
                ctx.log(`NPCs in basement: ${npcs.map(n => n.name).join(', ')}`);

                return;
            }
        }

        // Check game messages
        const msgs = ctx.state()?.gameMessages ?? [];
        ctx.log(`\nGame messages: ${msgs.slice(-5).map(m => m.text).join(' | ')}`);

        if (msgs.some(m => /can't reach/i.test(m.text))) {
            ctx.warn('LADDER ALSO FAILS with "can\'t reach" - this is a widespread bug');
        }
    }
});
