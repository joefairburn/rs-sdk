# Script Best Practices

Lessons learned from developing automation scripts. Reference this when writing new scripts to avoid common pitfalls.

## Dialogs & UI Blocking

### Level-Up Dialogs
When a player gains enough XP to level up, a congratulations dialog appears that **blocks all actions**. Your script must handle this:

```typescript
// Check for and dismiss dialogs in your main loop
if (currentState.dialog.isOpen) {
    ctx.log('Dismissing dialog...');
    await ctx.sdk.sendClickDialog(0);
    continue;
}
```

All BotActions methods automatically dismiss blocking UI (level-up dialogs, etc.). Manual dismissal is only needed when using low-level sdk methods directly:
```typescript
await ctx.bot.dismissBlockingUI();
```

### Other Blocking Dialogs
- Welcome messages on login
- NPC conversation dialogs
- Shop interfaces
- Bank interfaces

## Fishing Spots

### Fishing Spots are NPCs, Not Locations
Fishing spots appear in `state.nearbyNpcs`, not `state.nearbyLocs`:

```typescript
// CORRECT
const spot = state.nearbyNpcs.find(npc => /fishing\s*spot/i.test(npc.name));
await ctx.sdk.sendInteractNpc(spot.index, optionIndex);

// WRONG - fishing spots are not locations
const spot = state.nearbyLocs.find(loc => /fishing/i.test(loc.name));
```

### Two Types of "Net" Fishing
Not all "Net" options are the same:

| Spot Options | Fish Type | Level Requirement |
|--------------|-----------|-------------------|
| Net, Bait | Small net (shrimp, anchovies) | **None** |
| Net, Harpoon | Big net (mackerel, cod, bass) | **Level 16+** |

When fishing at level 1, filter for "Net, Bait" spots:
```typescript
const smallNetSpots = fishingSpots.filter(npc =>
    npc.options.some(opt => /^bait$/i.test(opt))
);
```

### Recommended Fishing Locations
- **Draynor Village** (~3087, 3230) - Level 1 friendly, safe area
- **Catherby** (~2844, 3429) - Has both types, watch for level requirements

## State & Activity Detection

### Animation State
The SDK exposes animation IDs for both player and NPCs:

```typescript
// Player animation (-1 = idle/none)
state.player?.animId      // Current animation sequence ID
state.player?.spotanimId  // Spot animation (spell effects, combat hits, etc.)

// NPC animation
const npc = state.nearbyNpcs[0];
npc.animId      // -1 = idle
npc.spotanimId  // -1 = none
```

**Common animation checks:**
```typescript
// Check if player is doing something (not idle)
const isActive = state.player?.animId !== -1;

// Check if player is idle
const isIdle = state.player?.animId === -1;
```

Note: Animation IDs are raw sequence IDs from the game. -1 always means idle/none.

### Other Ways to Detect Player Activity
Animation state is useful, but you can also detect activity through:
- **XP changes** - check if skill XP increased
- **Inventory changes** - check if items appeared/disappeared
- **Game messages** - check `state.gameMessages` for "You catch...", "You mine...", etc.
- **Just keep clicking** - the game queues actions, so continuous clicking often works best

### State Updates
The SDK state is updated via WebSocket. At low FPS (fps=15 in tests), state updates are infrequent. Don't rely on real-time state for fast actions.

## Action Patterns

### Continuous Clicking Works
For many skills, continuously sending the action works better than waiting:

```typescript
// Simple and effective
while (true) {
    await ctx.sdk.sendInteractNpc(spot.index, netOpt.opIndex);
    await new Promise(r => setTimeout(r, 300));  // Small delay
}
```

The game handles queuing and won't break if you click multiple times.

### Don't Over-Engineer Wait Conditions
Complex wait conditions often cause more problems than they solve:
- State might not update fast enough
- Conditions might have edge cases
- Simple polling loops are more reliable

## Inventory Management

### Drop Items to Make Space
For gathering skills, drop items when inventory fills:

```typescript
if (currentState.inventory.length > 20) {
    for (const item of itemsToDrop) {
        await ctx.sdk.sendDropItem(item.slot);
        await new Promise(r => setTimeout(r, 100));
    }
}
```

## Stuckness Detection

### Custom Stuckness Checks
Add script-specific stuckness detection beyond the overall timeout:

```typescript
const STUCK_CONFIG = {
    noProgressTimeoutMs: 15_000,  // 15 seconds without progress
    noXpTimeoutMs: 20_000,        // 20 seconds without XP gain
};

function checkStuck(ctx, stats) {
    const now = Date.now();
    if (now - stats.lastProgressTime > STUCK_CONFIG.noProgressTimeoutMs) {
        return 'No progress for 15s';
    }
    return null;  // Not stuck
}
```

### Throw Error to Abort Cleanly
```typescript
if (stuckReason) {
    throw new Error(`STUCK: ${stuckReason}`);
}
```

## Getting to Al Kharid

### Toll Gate is the Only Entrance
There is **no free route** to Al Kharid from Lumbridge. The area is completely fenced - you must pay the 10gp toll at the gate.

### Sourcing 10gp
If starting without coins, sell a **shortbow** at Lumbridge general store - it sells for 20gp (keeps the sword).

```typescript
// Get 10gp+ by selling shortbow
await ctx.bot.walkTo(3211, 3247);  // Lumbridge general store
await ctx.bot.openShop(/shop keeper/i);
await ctx.bot.sellToShop(/shortbow/i);  // Sells for 20gp
await ctx.bot.closeShop();
```

**Note:** Runes sell for only ~1gp each and prices decrease as you sell more. Bronze sword sells for 10gp but you probably want to keep it.

### Passing Through the Toll Gate
The toll gate requires special handling - `openDoor()` doesn't work because it's not a normal door.

```typescript
// Walk to gate
await ctx.bot.walkTo(3268, 3228);

// Click gate to trigger dialog
const gate = ctx.sdk.getState()?.nearbyLocs.find(l => /gate/i.test(l.name));
const openOpt = gate.optionsWithIndex.find(o => /open/i.test(o.text));
await ctx.sdk.sendInteractLoc(gate.x, gate.z, gate.id, openOpt.opIndex);
await new Promise(r => setTimeout(r, 800));

// Handle dialog - click through until "Yes, ok." option appears
for (let i = 0; i < 20; i++) {
    const s = ctx.sdk.getState();
    if (!s?.dialog.isOpen) {
        await new Promise(r => setTimeout(r, 150));
        continue;
    }
    const yesOpt = s.dialog.options.find(o => /yes/i.test(o.text));
    if (yesOpt) {
        await ctx.sdk.sendClickDialog(yesOpt.index);  // Pay toll
        break;
    }
    await ctx.sdk.sendClickDialog(0);  // Click to continue
    await new Promise(r => setTimeout(r, 200));
}

// Wait for gate to open, then walk through (may need retry)
await new Promise(r => setTimeout(r, 500));
for (let i = 0; i < 3; i++) {
    await ctx.bot.walkTo(3277, 3227);  // Inside Al Kharid
    if (ctx.sdk.getState()?.player?.worldX >= 3270) break;  // Success
    await new Promise(r => setTimeout(r, 500));
}
```

### Al Kharid Detection
Position `x >= 3270` means you're inside Al Kharid:
```typescript
const isInAlKharid = ctx.sdk.getState()?.player?.worldX >= 3270;
```

## Buying Kebabs in Al Kharid

### Kebab Seller Uses Dialog, Not Shop
The kebab seller (Karim) at (3273, 3180) uses a **dialog system**, not a shop interface. You must talk to him and select "Yes please." to buy.

```typescript
// Walk to kebab seller
await ctx.bot.walkTo(3273, 3180);

// Find and talk to kebab seller
const seller = ctx.sdk.findNearbyNpc(/kebab/i);
const talkOpt = seller.optionsWithIndex.find(o => /talk/i.test(o.text));
await ctx.sdk.sendInteractNpc(seller.index, talkOpt.opIndex);
await new Promise(r => setTimeout(r, 1000));

// Handle dialog - click through and select "Yes please."
for (let i = 0; i < 15; i++) {
    const s = ctx.sdk.getState();
    if (!s?.dialog.isOpen) {
        await new Promise(r => setTimeout(r, 200));
        continue;
    }

    const buyOpt = s.dialog.options.find(o => /yes/i.test(o.text));
    if (buyOpt) {
        await ctx.sdk.sendClickDialog(buyOpt.index);  // Buy kebab (1gp)
    } else {
        await ctx.sdk.sendClickDialog(0);  // Click to continue
    }
    await new Promise(r => setTimeout(r, 300));
}

// Kebab now in inventory
const kebab = ctx.sdk.findInventoryItem(/kebab/i);
```

**Cost:** 1gp per kebab
**Heals:** 10 HP (random 1-10)

## Location & Spawning

### Verify Spawn Location
Always log the spawn position to verify you're in the right place:
```typescript
ctx.log(`Position: (${state.player?.worldX}, ${state.player?.worldZ})`);
```
