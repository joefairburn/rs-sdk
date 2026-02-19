/**
 * Standalone skill tracker for benchmarks.
 * Connects to the gateway in observe mode, samples all skill levels periodically,
 * and writes the data to a JSON file.
 *
 * Config via environment variables:
 *   BOT_NAME          - bot username (default: "agent")
 *   BOT_PASSWORD      - bot password (default: "test")
 *   GATEWAY_URL       - gateway WebSocket URL (default: "ws://localhost:7780")
 *   SAMPLE_INTERVAL_MS - sampling interval in ms (default: 15000)
 *   TRACKING_FILE     - output JSON path (default: "/logs/verifier/skill_tracking.json")
 *
 * Run: bun run benchmark/shared/skill_tracker.ts
 */
import { BotSDK } from '../../sdk/index';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

const botName = process.env.BOT_NAME || 'agent';
const password = process.env.BOT_PASSWORD || 'test';
const gatewayUrl = process.env.GATEWAY_URL || 'ws://localhost:7780';
const intervalMs = parseInt(process.env.SAMPLE_INTERVAL_MS || '15000');
const outFile = process.env.TRACKING_FILE || '/logs/verifier/skill_tracking.json';

interface SkillSnapshot { level: number; xp: number; }
interface Sample { timestamp: string; elapsedMs: number; skills: Record<string, SkillSnapshot>; totalLevel: number; }
interface TrackingData { botName: string; startTime: string; samples: Sample[]; }

async function main() {
  mkdirSync(dirname(outFile), { recursive: true });

  console.log(`[skill-tracker] Connecting to bot "${botName}" in observe mode...`);
  console.log(`[skill-tracker] interval=${intervalMs}ms output=${outFile}`);

  const sdk = new BotSDK({
    botUsername: botName,
    password,
    gatewayUrl,
    connectionMode: 'observe',
    autoLaunchBrowser: false,
    autoReconnect: true,
  });

  // Retry connection up to 3 times (gateway may still be settling after tutorial)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await sdk.connect();
      console.log(`[skill-tracker] Connected (attempt ${attempt}), waiting for game state...`);
      await sdk.waitForCondition(s => s.inGame && s.skills.length > 0, 30000);
      console.log('[skill-tracker] Game state received, starting tracking');
      break;
    } catch (err) {
      console.log(`[skill-tracker] Attempt ${attempt} failed:`, err);
      if (attempt === 3) {
        console.log('[skill-tracker] All attempts failed, giving up');
        process.exit(1);
      }
      sdk.disconnect();
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  // Load existing tracking data if present (survives tracker restarts)
  let trackingData: TrackingData;
  let startTime: Date;
  if (existsSync(outFile)) {
    try {
      const existing = JSON.parse(readFileSync(outFile, 'utf-8')) as TrackingData;
      if (existing.samples && existing.startTime) {
        trackingData = existing;
        startTime = new Date(existing.startTime);
        console.log(`[skill-tracker] Resuming with ${existing.samples.length} existing samples from ${existing.startTime}`);
      } else {
        throw new Error('invalid format');
      }
    } catch {
      startTime = new Date();
      trackingData = { botName, startTime: startTime.toISOString(), samples: [] };
    }
  } else {
    startTime = new Date();
    trackingData = { botName, startTime: startTime.toISOString(), samples: [] };
  }

  function takeSample() {
    const skills = sdk.getSkills();
    if (!skills || skills.length === 0) return;

    const now = new Date();
    const skillMap: Record<string, SkillSnapshot> = {};
    let totalLevel = 0;

    for (const s of skills) {
      skillMap[s.name] = { level: s.baseLevel, xp: s.experience };
      totalLevel += s.baseLevel;
    }

    const sample: Sample = {
      timestamp: now.toISOString(),
      elapsedMs: now.getTime() - startTime.getTime(),
      skills: skillMap,
      totalLevel,
    };

    trackingData.samples.push(sample);

    try {
      writeFileSync(outFile, JSON.stringify(trackingData));
    } catch (err) {
      console.log('[skill-tracker] Failed to write tracking file:', err);
    }

    console.log(`[skill-tracker] Sample #${trackingData.samples.length}: totalLevel=${totalLevel} elapsed=${Math.round(sample.elapsedMs / 1000)}s`);
  }

  takeSample();
  setInterval(() => {
    try { takeSample(); } catch (err) { console.log('[skill-tracker] Error:', err); }
  }, intervalMs);

  // On shutdown, take a final sample and exit
  const dumpAndExit = () => {
    try {
      takeSample();
      console.log(`[skill-tracker] Final sample taken. ${trackingData.samples.length} total samples written to ${outFile}`);
    } catch {}
    process.exit(0);
  };
  process.on('SIGTERM', dumpAndExit);
  process.on('SIGINT', dumpAndExit);

  // Keep alive forever
  await new Promise(() => {});
}

main().catch(err => {
  console.error('[skill-tracker] Fatal:', err);
  process.exit(1);
});
