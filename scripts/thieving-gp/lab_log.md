# Lab Log: thieving-gp

Goal: Maximize coins earned through thieving in 5 minutes.

## Strategy Considerations

### Thieving Targets (by level requirement)
| Target | Level | Coins/Success | XP | Notes |
|--------|-------|---------------|-----|-------|
| Man/Woman | 1 | 3 coins | 8 | Easy, ~50% success at lvl 1 |
| Farmer | 10 | 9 coins | 14.5 | Need to train first |
| Warrior | 25 | 18 coins | 26 | Higher level, more damage when stunned |

### Stalls (alternative)
| Stall | Level | Loot | XP | Sell Value | Notes |
|-------|-------|------|-----|------------|-------|
| Tea | 5 | Cup of tea | 16 | 10gp? | Need shop nearby |
| Cake | 5 | Cake | 16 | - | Food source! |
| Silk | 20 | Silk | 24 | 60gp | High value but needs level |

### Damage Mitigation Strategies
1. **Use tutorial food** - Bread heals 5 HP, Shrimps heal 3 HP
2. **Fish for food first** - Net fishing at Al-Kharid is safe
3. **Train HP via combat first** - More HP = more attempts before death
4. **Steal cakes** - Level 5 req, but provides free food

### Expected Performance (v1)
- Starting HP: 10
- Damage per failed pickpocket: 1
- Success rate at level 1: ~50%
- Average attempts before needing food: ~10 (5 failures = 5 damage)
- Tutorial bread: 1 piece = 5 HP = 5 more attempts

---

## Run 001 - Initial Implementation

**Date**: 2026-01-24
**Strategy**: Pickpocket men at Lumbridge, use tutorial bread for healing

**Hypothesis**: Can earn ~100-200 coins in 5 minutes by pickpocketing men.

### Observations

1. **XP gain is massive**: Went from level 1 to level 38 Thieving in 5 minutes (32,000 XP)
2. **GP gain is modest**: Only 120 coins total (~3 coins per successful pickpocket)
3. **Success rate improved with level**: Started at ~50%, ended near 70%+
4. **Stun time is the major bottleneck**: ~4.8 seconds per failed attempt
5. **Dialog dismissal overhead**: Level-up dialogs appeared frequently and added delay
6. **Food usage was minimal**: Only ate once (Shrimps) - tutorial items are sufficient
7. **Men give 3 coins, not 8**: The 8 was XP per success, not coins

### Results

| Metric | Value |
|--------|-------|
| Final GP | 120 |
| Thieving Level | 38 (from 1) |
| Thieving XP | 32,000 |
| Attempts | ~60 |
| Success Rate | ~66% average |
| Food Eaten | 1 |
| Stun Time | ~48+ seconds |

### Outcome
**PARTIAL SUCCESS** - Hypothesis confirmed (100-200 GP range), but lower end. The XP gain is exceptional but GP is bottlenecked by:
1. Low coins per pickpocket (3 GP)
2. Stun time wasting ~15-20% of total time
3. Dialog overhead

### Analysis

The real issue is that Men only give 3 coins. At 60 successes in 5 minutes:
- Men: 60 * 3 = 180 GP theoretical (actual: 120 GP due to missed time)
- Farmers (level 10): 60 * 9 = 540 GP
- Warriors (level 25): 60 * 18 = 1080 GP

**Key insight**: We hit level 10 in ~2 minutes. If we switched to Farmers then, we'd earn 3x more per pickpocket for the remaining 3 minutes!

### Next Steps
1. **v2**: Implement dynamic target switching based on thieving level
2. Reduce dialog dismissal overhead (batch or async)
3. Consider walking to Farmers when level 10 is reached
4. Profile time spent in each activity

---

## Run 002 - Dynamic Target Switching (v2)

**Date**: 2026-01-24
**Strategy**: Start with Men, switch to Farmers at level 10, Warriors at level 25

**Hypothesis**: Can earn 300-500 coins by switching to higher-value targets as level increases.

### Observations

1. **Target selection works correctly** - Code checks for Farmers/Warriors first, falls back to Men
2. **Problem: No Farmers in Lumbridge castle area** - Only Men, Rats, Hans, Cook nearby
3. **Never left Lumbridge** - Always found Men nearby, so never triggered the "walk to find targets" code
4. **Same performance as v1** - ~129 GP, level 39, because we only pickpocketed Men

### Results

| Metric | v1 | v2 |
|--------|----|----|
| Final GP | 120 | 129 |
| Thieving Level | 38 | 39 |
| Thieving XP | 32,000 | 34,400 |

### Root Cause Analysis

The `findPickpocketTarget()` function correctly prioritizes higher-value targets, BUT:
- It only checks NPCs that are **already nearby**
- Since Men are always nearby in Lumbridge, it never triggers the "walk to find targets" branch
- The code to walk to Farmer locations at level 10+ is never executed because Men are found first

### Fix Required

Need **proactive location changes** - not just "if no targets, walk" but "if level >= 10 AND not at Farmer area, walk there FIRST before looking for targets".

---

## Run 003 - Proactive Target Location (v3)

**Date**: 2026-01-24
**Strategy**:
- Level 1-9: Stay at Lumbridge, pickpocket Men
- Level 10+: Walk to Fred's Farm and pickpocket Farmer
- Level 25+: Walk to Al-Kharid and pickpocket Warriors

**Hypothesis**: By proactively moving to higher-value target areas, can earn 400-600 coins.

### Observations

1. **Zone switching triggered correctly** at level 10
2. **FAILED: Pathing issues** - Bot couldn't navigate to farm area
3. **Gates/doors blocked path** - No door opening logic during walkTo
4. **"Fred the Farmer" name mismatch** - Initial regex was `/^farmer$/` which didn't match
5. **Wasted entire run** wandering around, only 15 GP earned

### Results

| Metric | v1 | v2 | v3 |
|--------|----|----|----|
| Final GP | 120 | 129 | 15 |
| Thieving Level | 38 | 39 | 16 |
| Outcome | Timeout | Timeout | Timeout (stuck) |

### Root Cause
1. Navigation to remote zones requires opening gates/doors
2. `walkTo()` doesn't handle obstacles automatically
3. Even with pathfinding, closed gates block movement

### Conclusion
**Zone switching is not viable without door/gate handling.** Better to optimize the Men pickpocketing loop which works reliably.

---

## Run 004 - Optimized Men Loop (v4)

**Date**: 2026-01-24
**Strategy**: Stay at Lumbridge, but optimize the pickpocketing loop:
- Remove zone switching complexity
- Faster dialog dismissal (don't wait between dismissals)
- Track actual GP/hour rate
- Consider reducing HP eating threshold

**Hypothesis**: Optimized Men loop can reach 150-180 GP in 5 minutes.

### Implementation Notes
- Removed all zone switching code
- Simplified to just Men/Women targeting

### Results

| Metric | v4 |
|--------|-----|
| Final GP | 96 |
| Thieving Level | ~31 |
| Thieving XP | 25,600 |
| Success Rate | 53% |
| Food Eaten | 2 |

### Observations
1. **Ran out of food** - Only had 2 food items (Shrimps + Bread from tutorial)
2. **"HP low but no food!"** warnings at end of run
3. **Lower success rate** than v1/v2 (53% vs 65%) - could be variance
4. **Script stalled** when HP was low and no food available

### Root Cause
The bottleneck is **not enough food**. Tutorial items (1 Bread + 1 Shrimps) only last ~30 attempts worth of failures.

### Fix Required
Need to **source more food**:
1. Buy bread from Lumbridge general store
2. Or steal cakes from cake stall (level 5) - provides food AND thieving XP

---

## Run 005 - Shop Buying Attempt (v5)

**Date**: 2026-01-24
**Strategy**: Buy bread from Lumbridge general store when food runs low

### Results
- Final GP: 108
- Shop opened successfully
- **Failed**: "Item not found in shop: /bread/i"
- Lumbridge General Store sells tools, NOT food!

### Root Cause
Wrong shop - general stores don't sell food. Would need:
- Al-Kharid kebab shop (but gates block path)
- Fish and cook (time consuming)
- Just accept limited food

---

## Run 006 - Conservative Eating (v6)

**Date**: 2026-01-24
**Strategy**:
- Remove shop logic (doesn't work)
- Lower eat threshold to HP <= 3 (more conservative)
- Accept that food is limited

### Results

| Metric | v6 | Best Previous |
|--------|----|---------------|
| **Final GP** | **180** | 129 (v2) |
| Thieving Level | 42 | 39 |
| Thieving XP | 48,000 | 34,400 |
| Success Rate | 83% | 65% |
| Attempts | 70 | ~60 |
| Food Eaten | 0 | 2 |

### Observations
1. **50% improvement over v1/v2!** (180 GP vs ~120 GP)
2. **Zero food needed** - lucky RNG, fewer failures caused damage
3. **Higher success rate** - 83% vs 65% in earlier runs
4. **More attempts** - 70 vs 60 = more efficient loop
5. **Level 42 thieving** achieved

### Analysis
The improvement came from:
1. **Simpler code** - fewer conditionals, faster loop
2. **Good RNG** - fewer failed pickpockets
3. **Higher thieving level = higher success rate** - compounds over time

---

## Learnings (Final)

### 1. Strategic Findings
- **Simple is best**: v6 (simplest code) achieved 180 GP, 50% better than complex v2/v3
- **Men pickpocketing is reliable**: Consistent 3 GP per pickpocket
- **Zone switching not viable**: walkTo doesn't handle doors/gates
- **Shop buying failed**: Lumbridge general store doesn't sell food
- **70 pickpockets in 5 min**: ~14 per minute when optimized
- **Level 42 thieving achievable**: 48,000 XP in 5 minutes
- **Success rate improves with level**: 50% at level 1 → 85%+ at level 40

### 2. Process & Tooling Reflections
- **Lab log methodology works**: Systematic hypothesis → run → observe → iterate
- **Verify assumptions first**: "Fred the Farmer" name, shop inventory, gate navigation
- **events.jsonl is essential**: Shows exactly what happened
- **Simpler code often wins**: Complex zone switching failed, simple loop succeeded

### 3. SDK Issues & Gaps
- **walkTo doesn't handle doors/gates**: Major limitation for navigation
- **Shop inventory unknown upfront**: Had to discover Lumbridge store doesn't sell food
- **Consider adding walkToWithDoors()**: High-level API that opens obstacles

### Summary Table

| Version | Strategy | GP | Level | Notes |
|---------|----------|-----|-------|-------|
| v1 | Basic Men loop | 120 | 38 | Baseline |
| v2 | Dynamic targeting | 129 | 39 | No Farmers nearby |
| v3 | Zone switching | 15 | 16 | Failed - gates |
| v4 | Optimized loop | 96 | 31 | Ran out of food |
| v5 | Shop buying | 108 | - | Shop has no food |
| v6 | Conservative eat | 180 | 42 | Good RNG, Men only |
| v7 | Zone + doors | 339 | 44 | First big win - Farmers |
| v8 | Al-Kharid kebabs | 206 | 43 | Regression - Men, not Warriors |
| v9 | Warrior targeting | 36 | 26 | Failed - Warriors not found |
| v10 | Farmers only | 195 | 38 | Regression - zone re-walking |
| **v11** | **Optimized zones** | **393** | **45** | **NEW BEST - 327% of baseline!** |

---

## Run 007 - Zone Switching with Door Handling (v7)

**Date**: 2026-01-24
**Strategy**:
- Level 1-9: Pickpocket Men at Lumbridge (3 GP each)
- Level 10+: Walk to Farmers, opening doors/gates along the way (9 GP each)
- Implemented `walkToWithDoors()` helper that detects and opens gates

### Key Fixes
1. **Door handling**: Check for nearby doors with "Open" option after failed walks
2. **Correct Farmer location**: (3167, 3283) near crop patches, NOT Fred's Farm
3. **Fred the Farmer ≠ Farmer**: Fred is a quest NPC, not thievable!

### Results

| Metric | v7 | v6 | Improvement |
|--------|----|----|-------------|
| **Final GP** | **339** | 180 | +88% |
| Thieving Level | 44 | 42 | +2 |
| Thieving XP | 56,700 | 48,000 | +18% |
| Success Rate | 60% | 83% | Lower on Farmers |
| Food Eaten | 2 | 0 | More damage |

### Observations
1. **Zone switching succeeded!** Bot navigated through gates to reach Farmers
2. **9 GP per Farmer** vs 3 GP per Man = 3x coins per pickpocket
3. **Lower success rate on Farmers** (60% vs 83% on Men) but offset by higher GP
4. **~38 Farmer pickpockets** × 9 GP = 342 GP (matches actual result)

### Key Insight
The user's suggestion to "just look for doors while walking and open them" was the breakthrough. Simple solution, huge improvement.

---

## Run 008 - Al-Kharid Kebabs for Unlimited Food (v8)

**Date**: 2026-01-25
**Strategy**:
- Level 1-9: Pickpocket Men at Lumbridge (build up coins + levels)
- Level 10+: Sell bronze sword (10gp) → Pay Al-Kharid toll → Buy kebabs
- With kebabs: Can sustain pickpocketing indefinitely without HP issues

**Hypothesis**: With unlimited kebab food, can push for 400+ GP by never running out of food.

### Implementation Notes

From script_best_practices.md:
1. **Sell bronze sword** at Lumbridge general store for 10gp
2. **Toll gate dialog handling** - must click through dialog and select "Yes" option
3. **Al-Kharid detection**: `x >= 3270` means inside Al-Kharid
4. **Kebab shop location**: Need to find in Al-Kharid

### Results

| Metric | v8 | v7 | Change |
|--------|----|----|--------|
| Final GP | **206** | 339 | **-39%** |
| Thieving Level | 43 | 44 | -1 |
| Thieving XP | 53,600 | 56,700 | -5% |
| Food Eaten | 1 | 2 | -1 |
| Attempts | ~82 | ~60 | +37% |
| Success Rate | 81% | 60% | +35% |

### Observations

1. **REGRESSION**: 206 GP vs 339 GP (v7) - Al-Kharid setup didn't pay off
2. **Kebab buying partially failed**: Only bought 1 kebab despite trying for 5 (dialog flow issues)
3. **Still pickpocketing Men (3 GP)**: Even in Al-Kharid, we're getting Men not Warriors
4. **Zone wandering**: "No targets in zone - moving around..." cost significant time
5. **Setup overhead**: ~40 seconds lost on selling shortbow, paying toll, walking
6. **Ate Shrimps, not Kebab**: Food system worked but only needed 1 eat

### Root Cause Analysis

**Why v8 was worse than v7:**

| Factor | v7 (Farmers) | v8 (Al-Kharid) |
|--------|--------------|----------------|
| Target | Farmers (9 GP) | Men (3 GP) |
| GP per pickpocket | 9 | 3 |
| Setup time | ~30s walk | ~60s (sell + toll + walk) |
| Location stability | Good | Wandering issues |

The fundamental flaw: **We entered Al-Kharid but still pickpocketed Men (3 GP) instead of Warriors (18 GP)**. The regex pattern includes Warriors but:
- Warriors need level 25+ (we had it)
- But `findPickpocketTarget()` finds the nearest match - Men are more common than Warriors
- We should have **prioritized by value**, not distance

### Fix Ideas for v9

1. **Prioritize high-value targets**: Sort by GP/pickpocket, not distance
2. **Skip Al-Kharid unless targeting Warriors**: If Men-only, Farmers are 3x better
3. **Walk TO Warriors specifically**: Warriors spawn near Al-Kharid palace guards
4. **Or revert to v7 strategy**: Farmers gave 339 GP, Al-Kharid Men gave 206 GP

---

## Run 009 - Warrior Targeting (v9)

**Date**: 2026-01-25
**Strategy**:
- Level 1-9: Men at Lumbridge (3 GP)
- Level 10-24: Farmers (9 GP)
- Level 25+: Enter Al-Kharid for Warriors (18 GP)

### Results

| Metric | v9 |
|--------|-----|
| Final GP | **36** |
| Thieving Level | 26 |
| Notes | FAILURE - Warriors not found |

### Root Cause
Warriors at (3301, 3175) don't exist or don't have Pickpocket option. The script spent the entire remaining time in "No targets in zone - moving around..." loop.

---

## Run 010 - Farmers Only (v10)

**Date**: 2026-01-25
**Strategy**: Remove Al-Kharid, just use Men→Farmers (same as v7)

### Results

| Metric | v10 |
|--------|-----|
| Final GP | **195** |
| Thieving Level | ~38 |
| Success Rate | 46% |
| Notes | REGRESSION - constant zone re-walking |

### Root Cause
Zone radius (20 tiles) too small - player keeps leaving zone during pickpocketing, triggering unnecessary walks. Many "Level X: Moving to Farmers" messages.

---

## Run 011 - Optimized Zone Handling (v11) ⭐ NEW BEST

**Date**: 2026-01-25
**Strategy**:
- Same as v10 (Men→Farmers)
- Larger zone radius (40 tiles instead of 20)
- Walk TO zone center when no targets (not random)

### Results

| Metric | v11 | v7 (baseline) | Improvement |
|--------|-----|---------------|-------------|
| **Final GP** | **393** | 339 | **+16%** |
| Thieving Level | 45 | 44 | +1 |
| Thieving XP | 65,400 | 56,700 | +15% |
| Success Rate | 61% | 60% | +1% |
| Attempts | ~73 | ~60 | +22% |
| Food Eaten | 2 | 2 | Same |

### Key Changes That Worked
1. **Larger zone radius (40 vs 20)**: Eliminated constant zone re-walking
2. **Directed walking**: Walk TO Farmer spawn point instead of random movement
3. **No Al-Kharid overhead**: Stayed with proven Farmer strategy

### Analysis
v11 is the new best with **393 GP**, beating v7's 339 GP by 16%! The key insight was that zone radius and walking behavior were causing inefficiency in v10 - players would leave the small zone during pickpocketing and waste time walking back.

---

## Learnings (Updated after v11)

### 1. Strategic Findings

**What Works:**
- **Farmers at 9 GP each** are the optimal target (3x Men, reliable)
- **Large zone radius (40 tiles)** prevents wasteful re-walking
- **Directed walking** (to spawn point, not random) finds targets faster
- **Simple strategies beat complex ones**: v11 (393 GP) vs v8 (206 GP)

**What Doesn't Work:**
- **Al-Kharid Warriors** - Either don't exist at expected location or can't be pickpocketed
- **Small zone radius (20 tiles)** - Players drift during pickpocketing, causing re-walks
- **Random wandering** - Walk TO known spawn points instead
- **Complex setup** (toll, kebabs) wastes time if target isn't better

**Key Numbers:**
| Target | GP/Success | Level Req | Reliability |
|--------|------------|-----------|-------------|
| Men | 3 GP | 1 | High |
| Farmers | 9 GP | 10 | High |
| Warriors | 18 GP | 25 | UNRELIABLE |

### 2. Process & Tooling Reflections

- **Iterative debugging works**: v8→v9→v10→v11 each identified a specific issue
- **Version tracking essential**: Easy to compare and identify regressions
- **"No targets in zone" log message** was key to diagnosing wandering issues
- **Success rate + GP rate** together tell the full story

### 3. SDK Issues & Gaps

- **Browser stability**: Multiple "Bot not connected" crashes during runs
- **NPC locations unclear**: Warriors expected at (3301, 3175) didn't exist
- **Kebab seller dialog** requires manual handling (not shop API)
- **Zone detection** needs larger radius for roaming NPCs

### 4. Evolution Summary

```
v1 (120 GP) → Basic loop
v7 (339 GP) → Farmers + doors = 183% improvement
v11 (393 GP) → Optimized zones = 327% improvement over v1
```

The biggest wins came from:
1. **Switching to Farmers** (3x GP per pickpocket)
2. **Door handling** (enables zone transitions)
3. **Zone optimization** (prevents wasteful re-walking)

