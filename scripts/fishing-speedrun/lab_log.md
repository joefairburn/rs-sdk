# Lab Log: fishing-speedrun

Goal: Maximize combined Fishing+Cooking level in 10 minutes.

## Current Strategy (v2 - Fish + Cook)

**Preset**: FISHER_COOK_AT_DRAYNOR
- Small fishing net
- Tinderbox
- 5 logs

**Cycle**:
1. Fish until ~20 raw fish (or inventory nearly full)
2. Light fire with tinderbox + logs
3. Use raw fish on fire to cook
4. Drop cooked/burned fish
5. Repeat

**Key Mechanics**:
- Shrimp: 10 XP fishing, 30 XP cooking
- Anchovies: 40 XP fishing, 34 XP cooking
- Fire lasts ~1-2 minutes
- Can cook all fish on one fire if fast enough

---

## Run History

### Run 003 - Initial Fish+Cook Test (Pending)

**Date**: 2026-01-25
**Outcome**: TBD

---

### Previous Runs (Fishing Only)

## Run 002 - Final Working Version (Draynor)

**Date**: 2026-01-25
**Outcome**: success (reached time limit / stuckness detection)
**Duration**: 221s (~3.7 minutes)

### Results
- **Starting Level**: 1
- **Final Level**: 53
- **XP Gained**: 144,000
- **XP/Hour**: ~2.3M
- **Fish Caught**: 57
- **Fish Dropped**: 60

### What Worked
1. Draynor Village fishing spots work at level 1
2. Continuous clicking without waiting for fish completes
3. Level-up dialogs properly dismissed
4. Inventory dropping triggered correctly
5. Mix of shrimp (10 XP) and anchovies (40 XP at level 15+)

---

## Run 001 - Initial Attempts (Catherby Issues)

**Date**: 2026-01-25
**Outcome**: Multiple failures before finding right approach

### Issues Encountered
1. **Catherby "Net, Harpoon" spots require level 35+** - spawned near wrong fishing spots
2. **PlayerState has no `animation` field** - caused false condition exits
3. **Dialog blocking** - level-up dialogs blocked fishing
4. **Waiting too long** - complex wait conditions slowed down the loop

### Key Discoveries
1. **Fishing spots are NPCs, not locations** - use `nearbyNpcs` not `nearbyLocs`
2. **Two types of Net fishing**:
   - "Net, Bait" spots = small net (shrimp/anchovies) - **no level req**
   - "Net, Harpoon" spots = big net (mackerel/cod/bass) - **level 16+ req**
3. **Simple is better** - just click and let the game handle fishing
4. **State synchronization** - don't rely on animation detection

---

## Notes

### Draynor Fishing Spots (Recommended)
- Location: ~3087, 3230
- Options: Net (shrimp/anchovies), Bait (sardine/herring)
- No level requirement for Net fishing
- Safe area, no enemies nearby

### XP Rates
- Shrimp: 10 XP fishing, 30 XP cooking
- Anchovies: 40 XP fishing, 34 XP cooking
- At high levels, mostly anchovies = faster XP

### Cooking Notes
- Raw fish detected by "Raw " prefix in item name
- Fire is a location (NearbyLoc) named "Fire"
- Use fish on fire via `sendUseItemOnLoc`
- May get cooking interface - click first option to cook all
- Burned fish: "Burnt " prefix

### Best Practices
1. Use "Net, Bait" spots for level 1 fishing
2. Don't wait for fishing completion - continuous clicking works
3. Dismiss level-up dialogs promptly
4. Cook fish instead of dropping for extra XP
