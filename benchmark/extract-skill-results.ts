#!/usr/bin/env bun
/**
 * Extract skill XP tracking data from Harbor job results for the skills-30m graph viewer.
 *
 * Detects skill from job dir name: {skill}-xp-30m-{model}-...
 * Groups by model -> skill instead of model -> timeHorizon.
 *
 * Usage:
 *   bun benchmark/extract-skill-results.ts                          # Auto-discover all jobs/
 *   bun benchmark/extract-skill-results.ts jobs/woodcutting-xp-30m-* # Specific job dirs
 *   bun benchmark/extract-skill-results.ts --filter 30m-opus        # Filter by pattern
 *
 * Output:
 *   benchmark/results/skills-30m/_combined.json  — { model: { skill: { finalXp, finalLevel, samples[], tokenUsage } } }
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

const RESULTS_DIR = join(import.meta.dir, 'results', 'skills-30m');
const JOBS_DIR = join(import.meta.dir, '..', 'jobs');

const KNOWN_MODELS = ['opus', 'sonnet46', 'sonnet45', 'haiku', 'codex', 'gemini', 'glm', 'kimi'];

const KNOWN_SKILLS = [
  'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic',
  'woodcutting', 'fishing', 'mining', 'cooking', 'fletching', 'crafting',
  'smithing', 'firemaking', 'thieving',
];

interface Sample {
  timestamp: string;
  elapsedMs: number;
  skills: Record<string, { level: number; xp: number }>;
  totalLevel: number;
}

interface TrackingData {
  botName: string;
  startTime: string;
  samples: Sample[];
}

interface TokenUsage {
  inputTokens: number;
  cacheTokens: number;
  outputTokens: number;
}

function detectModel(dirName: string): string {
  const lower = dirName.toLowerCase();
  for (const m of KNOWN_MODELS) {
    if (lower.includes(`-${m}-`) || lower.endsWith(`-${m}`)) return m;
  }
  return 'unknown';
}

/** Detect model from config.json when directory name doesn't contain it */
function detectModelFromConfig(jobDir: string): string {
  const configPath = join(jobDir, 'config.json');
  if (!existsSync(configPath)) return 'unknown';
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const modelName = config?.agents?.[0]?.model_name || '';
    const lower = modelName.toLowerCase();
    for (const m of KNOWN_MODELS) {
      if (lower.includes(m)) return m;
    }
    const agentName = config?.agents?.[0]?.name || '';
    if (agentName.includes('codex')) return 'codex';
    if (agentName.includes('gemini')) return 'gemini';
    if (agentName.includes('kimi') || agentName.includes('opencode')) return 'kimi';
  } catch {}
  return 'unknown';
}

/** Detect skill from directory name: {skill}-xp-30m-{model}-... */
function detectSkill(dirName: string): string | null {
  const lower = dirName.toLowerCase();
  for (const skill of KNOWN_SKILLS) {
    if (lower.startsWith(`${skill}-xp-30m`)) return skill;
  }
  // Fallback: try config.json task path
  return null;
}

function detectSkillFromConfig(jobDir: string): string | null {
  const configPath = join(jobDir, 'config.json');
  if (!existsSync(configPath)) return null;
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const taskPath = config?.tasks?.[0]?.path || '';
    const lower = taskPath.toLowerCase();
    for (const skill of KNOWN_SKILLS) {
      if (lower.includes(`${skill}-xp-30m`)) return skill;
    }
  } catch {}
  return null;
}

/** Get all trial directories (handles both flat and timestamp-nested layouts) */
function getTrialDirs(jobDir: string): string[] {
  const trials: string[] = [];
  const entries = readdirSync(jobDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subDir = join(jobDir, entry.name);

    if (existsSync(join(subDir, 'verifier')) || existsSync(join(subDir, 'agent'))) {
      trials.push(subDir);
    } else {
      try {
        const subEntries = readdirSync(subDir, { withFileTypes: true });
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          const nested = join(subDir, sub.name);
          if (existsSync(join(nested, 'verifier')) || existsSync(join(nested, 'agent'))) {
            trials.push(nested);
          }
        }
      } catch {}
    }
  }
  return trials;
}

/** Parse reward JSON embedded in test-stdout.txt via __REWARD_JSON_START__/__REWARD_JSON_END__ markers */
function parseRewardFromStdout(stdoutPath: string): any | null {
  if (!existsSync(stdoutPath)) return null;
  try {
    const content = readFileSync(stdoutPath, 'utf-8');
    const startMarker = '__REWARD_JSON_START__';
    const endMarker = '__REWARD_JSON_END__';
    const startIdx = content.indexOf(startMarker);
    const endIdx = content.indexOf(endMarker);
    if (startIdx === -1 || endIdx === -1) return null;
    const jsonStr = content.slice(startIdx + startMarker.length, endIdx).trim();
    return JSON.parse(jsonStr);
  } catch {}
  return null;
}

/** Walk a job directory and find tracking data from reward.json, skill_tracking.json, or test-stdout.txt */
function findTracking(jobDir: string): TrackingData | null {
  for (const trialDir of getTrialDirs(jobDir)) {
    const rewardPath = join(trialDir, 'verifier', 'reward.json');
    if (existsSync(rewardPath)) {
      try {
        const reward = JSON.parse(readFileSync(rewardPath, 'utf-8'));
        if (reward.tracking?.samples?.length > 0) return reward.tracking;
      } catch {}
    }

    const trackingPath = join(trialDir, 'verifier', 'skill_tracking.json');
    if (existsSync(trackingPath)) {
      try {
        const tracking = JSON.parse(readFileSync(trackingPath, 'utf-8'));
        if (tracking.samples?.length > 0) return tracking;
      } catch {}
    }

    // Fallback: parse reward JSON from test-stdout.txt (survives Modal file download failures)
    const stdoutPath = join(trialDir, 'verifier', 'test-stdout.txt');
    const stdoutReward = parseRewardFromStdout(stdoutPath);
    if (stdoutReward?.tracking?.samples?.length > 0) return stdoutReward.tracking;
  }
  return null;
}

/** Extract final skill XP/level from reward.json or test-stdout.txt fallback */
function findRewardData(jobDir: string): { xp: number; level: number } | null {
  for (const trialDir of getTrialDirs(jobDir)) {
    const rewardPath = join(trialDir, 'verifier', 'reward.json');
    if (existsSync(rewardPath)) {
      try {
        const reward = JSON.parse(readFileSync(rewardPath, 'utf-8'));
        if (reward.xp !== undefined) return { xp: reward.xp, level: reward.level ?? 1 };
      } catch {}
    }

    // Fallback: parse from test-stdout.txt
    const stdoutPath = join(trialDir, 'verifier', 'test-stdout.txt');
    const stdoutReward = parseRewardFromStdout(stdoutPath);
    if (stdoutReward?.xp !== undefined) return { xp: stdoutReward.xp, level: stdoutReward.level ?? 1 };
  }
  return null;
}

/** Extract token usage from trial result.json */
function findTokenUsage(jobDir: string): TokenUsage | null {
  for (const trialDir of getTrialDirs(jobDir)) {
    const resultPath = join(trialDir, 'result.json');
    if (!existsSync(resultPath)) continue;
    try {
      const result = JSON.parse(readFileSync(resultPath, 'utf-8'));
      const ar = result.agent_result;
      if (ar && (ar.n_input_tokens || ar.n_output_tokens)) {
        return {
          inputTokens: ar.n_input_tokens || 0,
          cacheTokens: ar.n_cache_tokens || 0,
          outputTokens: ar.n_output_tokens || 0,
        };
      }
    } catch {}
  }
  return null;
}

// ── Main ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let filter = '';
let explicitDirs: string[] = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--filter' && args[i + 1]) {
    filter = args[++i];
  } else {
    explicitDirs.push(args[i]);
  }
}

// Resolve job directories
let jobDirs: string[];
if (explicitDirs.length > 0) {
  jobDirs = explicitDirs.map(d => d.startsWith('/') ? d : join(process.cwd(), d));
} else if (existsSync(JOBS_DIR)) {
  jobDirs = readdirSync(JOBS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .filter(d => {
      const name = d.name.toLowerCase();
      // Only match skill-xp-30m jobs
      const isSkill30m = KNOWN_SKILLS.some(s => name.startsWith(`${s}-xp-30m`));
      if (!isSkill30m) return false;
      return !filter || name.includes(filter);
    })
    .map(d => join(JOBS_DIR, d.name));
} else {
  console.log('No jobs/ directory found. Pass job directories as arguments.');
  process.exit(1);
}

if (jobDirs.length === 0) {
  console.log('No matching skill-xp-30m job directories found.');
  process.exit(1);
}

mkdirSync(RESULTS_DIR, { recursive: true });

// Extract and group by model -> skill
const combined: Record<string, Record<string, {
  jobName: string;
  finalXp: number;
  finalLevel: number;
  durationSeconds: number;
  sampleCount: number;
  samples: Sample[];
  tokenUsage?: TokenUsage;
}>> = {};

let extracted = 0;

for (const dir of jobDirs) {
  const jobName = basename(dir);
  let model = detectModel(jobName);
  if (model === 'unknown') model = detectModelFromConfig(dir);
  let skill = detectSkill(jobName);
  if (!skill) skill = detectSkillFromConfig(dir);

  if (model === 'unknown') {
    console.log(`  skip: ${jobName} (can't detect model)`);
    continue;
  }
  if (!skill) {
    console.log(`  skip: ${jobName} (can't detect skill)`);
    continue;
  }

  const tracking = findTracking(dir);
  const reward = findRewardData(dir);
  const tokenUsage = findTokenUsage(dir);

  // We need at least reward data or tracking data
  if (!tracking && !reward) {
    console.log(`  skip: ${jobName} (no tracking or reward data)`);
    continue;
  }

  const samples = tracking?.samples || [];
  const durationSeconds = samples.length > 0
    ? samples[samples.length - 1].elapsedMs / 1000
    : 0;

  // Prefer reward.json for final XP (it's the verifier's authoritative value)
  const finalXp = reward?.xp ?? 0;
  const finalLevel = reward?.level ?? 1;

  if (!combined[model]) combined[model] = {};

  // Keep best run per model+skill: prefer significantly more samples (better tracking),
  // then highest XP among runs with comparable sample counts
  const existing = combined[model][skill];
  const shouldReplace = !existing
    || (samples.length > existing.sampleCount * 2)   // much better tracking → always prefer
    || (existing.sampleCount <= samples.length * 2 && finalXp > existing.finalXp); // similar tracking → prefer higher XP
  if (shouldReplace) {
    combined[model][skill] = {
      jobName,
      finalXp,
      finalLevel,
      durationSeconds,
      sampleCount: samples.length,
      samples,
      ...(tokenUsage ? { tokenUsage } : {}),
    };
  }

  const tokenStr = tokenUsage ? `, tokens: ${(tokenUsage.inputTokens / 1000).toFixed(0)}k in / ${(tokenUsage.outputTokens / 1000).toFixed(0)}k out` : '';
  console.log(`  ${model}/${skill}: ${jobName} — xp=${finalXp}, level=${finalLevel}, ${samples.length} samples${tokenStr}`);
  extracted++;
}

if (extracted === 0) {
  console.log('\nNo skill-xp-30m data found in any job directories.');
  process.exit(1);
}

// Write _combined.json
const combinedPath = join(RESULTS_DIR, '_combined.json');
writeFileSync(combinedPath, JSON.stringify(combined, null, 2));
console.log(`\nWrote ${combinedPath}`);

// Write _data.js — lets the HTML viewer load data without fetch() (works from file://)
const dataJsPath = join(RESULTS_DIR, '_data.js');
writeFileSync(dataJsPath, `window.COMBINED_DATA = ${JSON.stringify(combined)};`);
console.log(`Wrote ${dataJsPath}`);

console.log(`\n${extracted} result(s) extracted. View: open benchmark/graph-skills.html`);
