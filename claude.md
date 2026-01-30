# RS-Agent Bot Guide

You're here to play the mmo game through the progressive development of botting scripts, starting small then adapting to your desires and ideas.

## First Time Setup

**Create a new bot using the setup script:**

Ask the user for a bot name (max 12 chars, alphanumeric). If they skip, use the command without a username to auto-generate a random 9-character name.

```bash
# With custom username
bun scripts/create-bot.ts {username}

# Auto-generate random username
bun scripts/create-bot.ts
```

This automatically creates:
- `bots/{username}/bot.env` - Credentials with auto-generated password
- `bots/{username}/lab_log.md` - Session notes template
- `bots/{username}/script.ts` - Ready-to-run starter script

## MCP Integration (Interactive Mode)

The MCP server auto-discovers via `.mcp.json` when you open the project in Claude Code.

### Quick Start

1. Install dependencies: `bun install` (from project root)
2. Open project in Claude Code — approve the MCP server when prompted
3. Control your bot with suggestions.

### Tools

| Tool | Description |
|------|-------------|
| `execute_code(bot_name, code)` | Run code on a bot. Auto-connects on first use. |
| `list_bots()` | List connected bots |
| `disconnect_bot(name)` | Disconnect a bot |

### Example

```typescript
// Just execute - auto-connects on first use
execute_code({
  bot_name: "mybot",
  code: `
    const state = sdk.getState();
    console.log('Position:', state.player.worldX, state.player.worldZ);

    // Chop trees for 1 minute
    const endTime = Date.now() + 60_000;
    while (Date.now() < endTime) {
      await bot.dismissBlockingUI();
      const tree = sdk.findNearbyLoc(/^tree$/i);
      if (tree) await bot.chopTree(tree);
    }

    return sdk.getInventory();
  `
})
```


**When to use MCP vs Scripts:**
- **MCP**: Interactive exploration, quick tests, conversational bot control
- **Scripts**: Long-running automation, reproducible tasks, version control

See `mcp/README.md` for detailed API reference.

## Session Workflow

This is a **persistent character** - you don't restart fresh each time. The workflow is:

### 1. Check World State First

Before writing any script, check where the bot is and what it has:

```bash
cd bots/{username} && bun --env-file=bot.env ../../sdk/cli.ts
```

This shows: position, inventory, skills, nearby NPCs/objects, and more.

**Exception**: Skip this if you just created the character and know it's at spawn.

**Tutorial Check**: If the character is in the tutorial area, call `await bot.sendSkipTutorial()` before running any other scripts. The tutorial blocks normal gameplay.

### 2. Write Your Script

Edit `bots/{username}/script.ts` with your goal. Keep scripts focused on one task.

### 3. Run the Script

```bash
cd bots/{username} && bun --env-file=bot.env script.ts
```

### 4. Observe and Iterate

Watch the output. After the script finishes (or fails), check state again:

```bash
cd bots/{username} && bun --env-file=bot.env ../../sdk/cli.ts
```


Record observations in `lab_log.md`, then improve the script.

## Script Duration Guidelines

**Start short, extend as you gain confidence:**

| Duration | Use When |
|----------|----------|
| **10-30s** | New script, single actions, untested logic, debugging |
| **2-5 min** | Validated approach, building confidence |
| **10+ min** | Proven strategy, grinding runs |

A failed 5-minute run wastes more time than five 30 second diagnostic runs. **Fail fast and start simple.**

Be extremely cognizant of pathing issues. It's very common to have issues because of closed doors and gates.
Look out for "I can't reach" messages - the solution is often to open closed gates. 

Read and grep in the learnings folder for.


## API Reference

When using MCP `execute_code`, you have access to two objects: `bot` (high-level) and `sdk` (low-level).


### `bot` - High-Level Actions (BotActions)

These methods wait for the **effect to complete**, not just server acknowledgment.

#### Movement
| Method | Description |
|--------|-------------|
| `walkTo(x, z, tolerance?)` | Walk to coordinates. Returns `{success, message}` when arrived or stuck. Default tolerance is 3 tiles. |

#### Woodcutting & Firemaking
| Method | Description |
|--------|-------------|
| `chopTree(target?)` | Chop a tree, wait for logs. Target can be `NearbyLoc`, name string, or RegExp. Returns `{success, logs?, message}`. |
| `burnLogs(logs?)` | Burn logs with tinderbox. Returns `{success, xpGained, message}`. |

#### Combat & Equipment
| Method | Description |
|--------|-------------|
| `attackNpc(target, timeout?)` | Attack NPC. Target can be `NearbyNpc`, name, or RegExp. Returns `{success, message, reason?}`. |
| `equipItem(target)` | Equip item from inventory. Returns `{success, message}`. |
| `unequipItem(target)` | Unequip item to inventory. Returns `{success, item?, message}`. |
| `eatFood(target)` | Eat food from inventory. Returns `{success, hpGained, message}`. |
| `castSpellOnNpc(target, spellComponent, timeout?)` | Cast spell on NPC. Returns `{success, hit?, xpGained?, message}`. |
| `getEquipment()` | Get all equipped items. Returns `InventoryItem[]`. |
| `findEquippedItem(pattern)` | Find equipped item by name/regex. Returns `InventoryItem \| null`. |

#### Items & Inventory
| Method | Description |
|--------|-------------|
| `pickupItem(target)` | Pick up ground item. Returns `{success, item?, message, reason?}`. |

#### Doors
| Method | Description |
|--------|-------------|
| `openDoor(target?)` | Open door/gate. Returns `{success, message, reason?, door?}`. |

#### NPC Interaction
| Method | Description |
|--------|-------------|
| `talkTo(target)` | Talk to NPC, wait for dialog. Returns `{success, dialog?, message}`. |

#### Shopping
| Method | Description |
|--------|-------------|
| `openShop(target?)` | Open shop via NPC trade. Default finds `/shop\s*keeper/i`. Returns `{success, message}`. |
| `closeShop(timeout?)` | Close shop interface. Returns `{success, message}`. |
| `buyFromShop(target, amount?)` | Buy item from open shop. Returns `{success, item?, message}`. |
| `sellToShop(target, amount?)` | Sell item to shop. Amount can be 1, 5, 10, or 'all'. Returns `{success, amountSold?, message}`. |

#### Banking
| Method | Description |
|--------|-------------|
| `openBank(timeout?)` | Open bank via banker NPC or booth. Returns `{success, message, reason?}`. |
| `closeBank(timeout?)` | Close bank interface. Returns `{success, message}`. |
| `depositItem(target, amount?)` | Deposit item. Amount -1 = all. Returns `{success, amountDeposited?, message}`. |
| `withdrawItem(bankSlot, amount?)` | Withdraw from bank slot. Returns `{success, item?, message}`. |

#### Crafting & Smithing
| Method | Description |
|--------|-------------|
| `fletchLogs(product?)` | Fletch logs with knife. Product: 'shortbow', 'longbow', 'arrow shaft'. Returns `{success, xpGained?, product?, message}`. |
| `craftLeather(product?)` | Craft leather with needle+thread. Product: 'gloves', 'body', 'chaps'. Returns `{success, xpGained?, message}`. |
| `smithAtAnvil(product, options?)` | Smith bars at anvil. Returns `{success, xpGained?, product?, message}`. |

**Smithing products:** `dagger`, `axe`, `mace`, `med helm`, `sword`, `scimitar`, `longsword`, `full helm`, `sq shield`, `warhammer`, `battleaxe`, `chainbody`, `kiteshield`, `claws`, `2h sword`, `plateskirt`, `platelegs`, `platebody`, `bolts`, `throwing knives`

#### UI Helpers
| Method | Description |
|--------|-------------|
| `dismissBlockingUI()` | Close any blocking dialogs (level-ups, etc.). Call this in loops. |
| `skipTutorial()` | Navigate through tutorial dialogs/NPCs. Returns `{success, message}`. |
| `navigateDialog(choices)` | Navigate through dialog options. Choices can be indices, strings, or RegExp. |

#### Condition Waiting
| Method | Description |
|--------|-------------|
| `waitForSkillLevel(skillName, level, timeout?)` | Wait until skill reaches level. Returns `SkillState`. |
| `waitForInventoryItem(pattern, timeout?)` | Wait for item to appear in inventory. Returns `InventoryItem`. |
| `waitForDialogClose(timeout?)` | Wait for dialog to close. |
| `waitForIdle(timeout?)` | Wait for player to stop moving. |

---

### `sdk` - Low-Level SDK (BotSDK)

These methods resolve when server **acknowledges** them (not when effects complete).

#### State Access (Synchronous)
| Method | Description |
|--------|-------------|
| `getState()` | Get full world state. Returns `BotWorldState \| null`. |
| `getStateAge()` | Milliseconds since last state update. |
| `getSkill(name)` | Get skill by name. Returns `{name, level, baseLevel, experience}`. |
| `getSkills()` | Get all skills. Returns `SkillState[]`. |
| `getInventory()` | Get all inventory items. Returns `InventoryItem[]`. |
| `findInventoryItem(pattern)` | Find item by name/regex. Returns `InventoryItem \| null`. |
| `getEquipment()` | Get all equipped items. Returns `InventoryItem[]`. |
| `findEquipmentItem(pattern)` | Find equipped item. Returns `InventoryItem \| null`. |
| `getNearbyNpcs()` | Get all nearby NPCs. Returns `NearbyNpc[]`. |
| `findNearbyNpc(pattern)` | Find NPC by name/regex. Returns `NearbyNpc \| null`. |
| `getNearbyLocs()` | Get all nearby locations (trees, rocks, etc). Returns `NearbyLoc[]`. |
| `findNearbyLoc(pattern)` | Find location by name/regex. Returns `NearbyLoc \| null`. |
| `getGroundItems()` | Get all ground items. Returns `GroundItem[]`. |
| `findGroundItem(pattern)` | Find ground item. Returns `GroundItem \| null`. |
| `getDialog()` | Get current dialog state. Returns `DialogState \| null`. |

#### On-Demand Scanning
| Method | Description |
|--------|-------------|
| `scanNearbyLocs(radius?)` | Scan locations with custom radius (default 15). Returns `NearbyLoc[]`. |
| `scanGroundItems(radius?)` | Scan ground items with custom radius. Returns `GroundItem[]`. |
| `scanFindNearbyLoc(pattern, radius?)` | Find location via on-demand scan. Returns `NearbyLoc \| null`. |
| `scanFindGroundItem(pattern, radius?)` | Find ground item via scan. Returns `GroundItem \| null`. |

#### Raw Actions
| Method | Description |
|--------|-------------|
| `sendWalk(x, z, running?)` | Walk to coordinates. |
| `sendInteractLoc(x, z, locId, option?)` | Interact with location (chop, mine, etc). Option default 1. |
| `sendInteractNpc(npcIndex, option?)` | Interact with NPC. |
| `sendTalkToNpc(npcIndex)` | Talk to NPC. |
| `sendPickup(x, z, itemId)` | Pick up ground item. |
| `sendUseItem(slot, option?)` | Use inventory item (eat, equip, etc). |
| `sendUseEquipmentItem(slot, option?)` | Use equipped item (unequip). |
| `sendDropItem(slot)` | Drop inventory item. |
| `sendUseItemOnItem(sourceSlot, targetSlot)` | Use item on another item. |
| `sendUseItemOnLoc(itemSlot, x, z, locId)` | Use item on location (e.g., ore on furnace). |
| `sendClickDialog(option?)` | Click dialog option (default 0). |
| `sendClickComponent(componentId)` | Click UI component (IF_BUTTON). |
| `sendClickComponentWithOption(componentId, optionIndex?)` | Click component with option (INV_BUTTON). |
| `sendClickInterfaceOption(optionIndex)` | Click interface option by index. |
| `sendShopBuy(slot, amount?)` | Buy from shop. |
| `sendShopSell(slot, amount?)` | Sell to shop. |
| `sendCloseShop()` | Close shop interface. |
| `sendCloseModal()` | Close any modal interface. |
| `sendBankDeposit(slot, amount?)` | Deposit to bank. |
| `sendBankWithdraw(slot, amount?)` | Withdraw from bank. |
| `sendSetCombatStyle(style)` | Set combat style (0-3). |
| `sendSpellOnNpc(npcIndex, spellComponent)` | Cast spell on NPC. |
| `sendSpellOnItem(slot, spellComponent)` | Cast spell on item. |
| `sendSay(message)` | Say message in chat. |
| `sendWait(ticks?)` | Wait server ticks. |
| `sendScreenshot(timeout?)` | Request screenshot. Returns base64 data URL. |

#### Pathfinding
| Method | Description |
|--------|-------------|
| `findPath(destX, destZ, maxWaypoints?)` | Find path using collision data. Returns `{success, waypoints, reachedDestination?}`. |
| `sendFindPath(destX, destZ, maxWaypoints?)` | Alias for findPath. |

#### Condition Waiting
| Method | Description |
|--------|-------------|
| `waitForReady(timeout?)` | Wait for game state to be fully loaded. |
| `waitForCondition(predicate, timeout?)` | Wait for state to match predicate function. |
| `waitForStateChange(timeout?)` | Wait for any state update. |

#### Connection
| Method | Description |
|--------|-------------|
| `isConnected()` | Check if connected to gateway. |
| `getConnectionState()` | Get state: 'connected', 'connecting', 'disconnected', 'reconnecting'. |
| `onStateUpdate(callback)` | Subscribe to state updates. Returns unsubscribe function. |
| `onConnectionStateChange(callback)` | Subscribe to connection changes. |
| `checkBotStatus()` | Check bot status via gateway HTTP endpoint. |

---

### Key Types

```typescript
// Full world state from sdk.getState()
interface BotWorldState {
  tick: number;                    // Game tick counter
  inGame: boolean;                 // Whether logged in and in-game
  player: PlayerState | null;      // Player info (null if not in game)
  skills: SkillState[];            // All skills with levels and XP
  inventory: InventoryItem[];      // Inventory items
  equipment: InventoryItem[];      // Worn equipment
  nearbyNpcs: NearbyNpc[];         // NPCs in view
  nearbyPlayers: NearbyPlayer[];   // Other players nearby
  nearbyLocs: NearbyLoc[];         // Interactive locations (trees, rocks, doors)
  groundItems: GroundItem[];       // Items on the ground
  gameMessages: GameMessage[];     // Recent chat/game messages
  dialog: DialogState;             // Current dialog state
  interface: InterfaceState;       // Open interface (crafting, etc)
  shop: ShopState;                 // Open shop state
  modalOpen: boolean;              // Any modal interface open
  combatStyle?: CombatStyleState;  // Combat style options
  combatEvents: CombatEvent[];     // Recent combat events
}

// Player info from state.player
interface PlayerState {
  name: string;
  combatLevel: number;
  x: number;                       // Local coordinates
  z: number;
  worldX: number;                  // World coordinates (use these for navigation)
  worldZ: number;
  level: number;                   // Map plane: 0=ground, 1=upstairs, etc
  runEnergy: number;               // 0-100
  runWeight: number;
  animId: number;                  // Current animation (-1 = idle)
  combat: {
    inCombat: boolean;
    targetIndex: number;           // -1 if no target
    lastDamageTick: number;
  };
}

// Skill info
interface SkillState {
  name: string;                    // e.g., "Attack", "Woodcutting"
  level: number;                   // Current boosted level
  baseLevel: number;               // Base level (no boosts)
  experience: number;              // Total XP
}

// Item in inventory or equipment
interface InventoryItem {
  slot: number;
  id: number;
  name: string;
  count: number;
  optionsWithIndex: {text: string, opIndex: number}[];
}

// Nearby interactive location (tree, rock, door, etc)
interface NearbyLoc {
  x: number;
  z: number;
  id: number;
  name: string;
  distance: number;
  options: string[];               // e.g., ["Chop down", "Examine"]
  optionsWithIndex: {text: string, opIndex: number}[];
}

// Nearby NPC
interface NearbyNpc {
  index: number;                   // Unique index for targeting
  name: string;
  combatLevel: number;
  x: number;
  z: number;
  distance: number;
  hp: number;
  maxHp: number;
  healthPercent: number | null;
  inCombat: boolean;
  targetIndex: number;             // Who they're targeting
  options: string[];               // e.g., ["Attack", "Talk-to"]
  optionsWithIndex: {text: string, opIndex: number}[];
}

// Ground item
interface GroundItem {
  x: number;
  z: number;
  id: number;
  name: string;
  count: number;
  distance: number;
}

// Dialog state
interface DialogState {
  isOpen: boolean;
  isWaiting: boolean;              // Server processing
  text?: string;                   // Dialog text
  options: {index: number, text: string}[];
}

// Action result (returned by most bot methods)
interface ActionResult {
  success: boolean;
  message?: string;
}
```

---

### Dismiss Level-Up Dialogs

```typescript
// In your main loop - always call this because level ups are blocking.
await bot.dismissBlockingUI();

// Or manually check
if (sdk.getState()?.dialog.isOpen) {
    await sdk.sendClickDialog(0);
}
```

### Main Loop with Timeout

```typescript
const DURATION = 60_000;  // 60 seconds
const startTime = Date.now();

while (Date.now() - startTime < DURATION) {
    await bot.dismissBlockingUI();

    const tree = sdk.findNearbyLoc(/^tree$/i);
    if (tree) {
        await bot.chopTree(tree);
    }

    await new Promise(r => setTimeout(r, 500));
}
```

### Error Handling

```typescript
const result = await bot.chopTree();
if (!result.success) {
    console.log(`Failed: ${result.message}`);
    // Handle failure - maybe walk somewhere else
}
```

## Project Structure

```
bots/
└── {username}/
    ├── bot.env        # Credentials (BOT_USERNAME, PASSWORD, SERVER)
    ├── lab_log.md     # Session notes and observations
    └── script.ts      # Current script

sdk/
├── index.ts           # BotSDK (low-level)
├── actions.ts         # BotActions (high-level)
├── cli.ts             # CLI for checking state
└── types.ts           # Type definitions

learnings/
├── banking.md
├── combat.md
├── shops.md
├── fletching.md
└── ...etc

```

## Troubleshooting

**"No state received"** - Bot isn't connected to game. Open browser first or use `autoLaunchBrowser: true`.

**Script stalls** - Check for open dialogs (`state.dialog.isOpen`). Level-ups block everything.

**"Can't reach"** - Path is blocked. Try walking closer first, or find a different target.

**Wrong target** - Use more specific regex patterns: `/^tree$/i` not `/tree/i` (which matches "tree stump").
