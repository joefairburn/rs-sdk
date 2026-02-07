# Mining

Successful patterns for mining automation.

## Finding Rocks

Rocks are **locations** (not NPCs). Filter for rocks with a "Mine" option:

```typescript
const rock = state.nearbyLocs
    .filter(loc => /rocks?$/i.test(loc.name))
    .filter(loc => loc.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
    .sort((a, b) => a.distance - b.distance)[0];
```

## Mining Action

```typescript
// Walk closer if needed (interaction range is ~3 tiles)
if (rock.distance > 3) {
    await ctx.sdk.sendWalk(rock.x, rock.z, true);
    await new Promise(r => setTimeout(r, 1000));
}

const mineOpt = rock.optionsWithIndex.find(o => /^mine$/i.test(o.text));
await ctx.sdk.sendInteractLoc(rock.x, rock.z, rock.id, mineOpt.opIndex);
```

## Detecting Mining Activity

Animation ID 625 indicates active mining:

```typescript
const isMining = state.player?.animId === 625;
const isIdle = state.player?.animId === -1;
```

## Rock IDs → Ore Types (SE Varrock Mine)

Rocks are ALL named "Rocks" — you **must** use the `id` field to tell them apart:

| Rock ID | Ore |
|---------|-----|
| 2091 | **Copper** |
| 2092 | **Tin** |
| 2093 | **Iron** |
| 2095 | **Iron** |
| 2090 | Depleted / empty |
| 2094 | Depleted / empty |
| 450 | Tin (different variant, also seen at this mine) |

**How to mine specific ore:**
```typescript
// Mine copper specifically
const copperRock = state.nearbyLocs
    .filter(loc => loc.id === 2091)
    .filter(loc => loc.optionsWithIndex.some(o => /^mine$/i.test(o.text)))
    .sort((a, b) => a.distance - b.distance)[0];
```

Use `Prospect` option on a rock to discover its ore type if unsure.

## Reliable Locations

| Location | Coordinates | Notes |
|----------|-------------|-------|
| SE Varrock mine | (3285, 3365) | Copper (2091), tin (2092), iron (2093/2095) |
| Lumbridge Swamp mine | - | Interactions fail silently, avoid |

## Counting Ore

```typescript
function countOre(ctx): number {
    const state = ctx.sdk.getState();
    if (!state) return 0;
    return state.inventory
        .filter(i => /ore$/i.test(i.name))
        .reduce((sum, i) => sum + i.count, 0);
}
```

## Drop When Full

```typescript
if (state.inventory.length >= 28) {
    const ores = state.inventory.filter(i => /ore$/i.test(i.name));
    for (const ore of ores) {
        await ctx.sdk.sendDropItem(ore.slot);
        await new Promise(r => setTimeout(r, 100));
    }
}
```
