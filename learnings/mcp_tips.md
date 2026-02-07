# MCP Tips & Gotchas

## Timeout Issues

MCP `execute_code` has a ~60s timeout. Any code with long loops will fail.

**Rule of thumb:**
- MCP: Quick checks, single actions, < 30s total
- gob scripts: Anything with mining loops, long walks, waiting for death

## Non-null assertions don't work

The MCP code runner uses plain JS eval. TypeScript non-null assertions (`!`) cause syntax errors:

```typescript
// WRONG - SyntaxError in MCP
const opt = rock.optionsWithIndex.find(o => /^mine$/i.test(o.text))!;

// RIGHT
const opt = rock.optionsWithIndex.find(o => /^mine$/i.test(o.text));
```

## Scripts Must Use disconnectAfter

Scripts using `runScript()` hang forever after completion unless you pass `disconnectAfter: true`:

```typescript
await runScript(async (ctx) => { ... }, {
  timeout: 5 * 60_000,
  disconnectAfter: true,  // ALWAYS set this
});
```

Without it, `gob run` never exits and you waste time waiting.

## Use `gob add` + `gob stdout`, Not `gob run`

`gob run` blocks until the process exits. Instead:
```bash
gob add --description "Mining" bun bots/mybot/script.ts
# Then check periodically:
gob stdout <id>
```

## Ardougne is a Trap

If a bot spawns in East Ardougne (~2616, 3292):
- Complex building layouts with many doors
- Zoo animals behind fences (can't fight them to die/respawn)
- Shops behind counters (can't reach traders)
- Manhole leads to sewers with only level 3 rats
- **Best option: create a new bot** rather than trying to walk back to Lumbridge
