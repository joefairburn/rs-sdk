#!/usr/bin/env bun
/**
 * Extract skill tracking data from Harbor job results for the graph viewer.
 *
 * Reads the structured tracking data written by skill_tracker.ts (via
 * reward.json), NOT agent logs. This is the reliable data source.
 *
 * Usage:
 *   bun benchmark/extract-results.ts                          # Auto-discover all jobs/
 *   bun benchmark/extract-results.ts jobs/total-level-10m-*   # Specific job dirs
 *   bun benchmark/extract-results.ts --filter 10m-opus        # Filter by pattern
 *
 * Output:
 *   benchmark/results/_combined.json   — all models, grouped by time horizon
 *   benchmark/results/<model>.json     — per-model files
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';

const RESULTS_DIR = join(import.meta.dir, 'results');
const JOBS_DIR = join(import.meta.dir, '..', 'jobs');

const KNOWN_MODELS = ['opus', 'sonnet', 'haiku', 'codex', 'gemini', 'glm'];

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
    // Also check agent name for non-Claude agents
    const agentName = config?.agents?.[0]?.name || '';
    if (agentName.includes('codex')) return 'codex';
    if (agentName.includes('gemini')) return 'gemini';
  } catch {}
  return 'unknown';
}

/** Detect time horizon from task path in config.json or directory name */
function detectTimeHorizon(dirName: string, jobDir: string): string {
  // Try directory name first
  const lower = dirName.toLowerCase();
  const match = lower.match(/(\d+[mh])/);
  if (match) return match[1];

  // Fall back to task path in config.json
  const configPath = join(jobDir, 'config.json');
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const taskPath = config?.tasks?.[0]?.path || '';
      const taskMatch = taskPath.match(/(\d+[mh])/);
      if (taskMatch) return taskMatch[1];
    } catch {}
  }
  return 'unknown';
}

/** Walk a job directory and find tracking data from reward.json or skill_tracking.json */
function findTracking(jobDir: string): TrackingData | null {
  const entries = readdirSync(jobDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const trialDir = join(jobDir, entry.name);

    // Primary: reward.json with embedded tracking
    const rewardPath = join(trialDir, 'verifier', 'reward.json');
    if (existsSync(rewardPath)) {
      try {
        const reward = JSON.parse(readFileSync(rewardPath, 'utf-8'));
        if (reward.tracking?.samples?.length > 0) return reward.tracking;
      } catch {}
    }

    // Fallback: standalone skill_tracking.json
    const trackingPath = join(trialDir, 'verifier', 'skill_tracking.json');
    if (existsSync(trackingPath)) {
      try {
        const tracking = JSON.parse(readFileSync(trackingPath, 'utf-8'));
        if (tracking.samples?.length > 0) return tracking;
      } catch {}
    }
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
    .filter(d => !filter || d.name.includes(filter))
    .map(d => join(JOBS_DIR, d.name));
} else {
  console.log('No jobs/ directory found. Pass job directories as arguments.');
  process.exit(1);
}

if (jobDirs.length === 0) {
  console.log('No matching job directories found.');
  process.exit(1);
}

mkdirSync(RESULTS_DIR, { recursive: true });

// Extract and group by model + time horizon
const combined: Record<string, Record<string, {
  jobName: string;
  finalTotalLevel: number;
  durationSeconds: number;
  samples: Sample[];
}>> = {};

let extracted = 0;

for (const dir of jobDirs) {
  const jobName = basename(dir);
  let model = detectModel(jobName);
  if (model === 'unknown') model = detectModelFromConfig(dir);
  const horizon = detectTimeHorizon(jobName, dir);
  if (model === 'unknown') {
    console.log(`  skip: ${jobName} (can't detect model)`);
    continue;
  }

  const tracking = findTracking(dir);
  if (!tracking || tracking.samples.length === 0) {
    console.log(`  skip: ${jobName} (no tracking data)`);
    continue;
  }

  const samples = tracking.samples;
  const last = samples[samples.length - 1];
  const finalLevel = last.totalLevel;
  const durationSeconds = last.elapsedMs / 1000;

  if (!combined[model]) combined[model] = {};

  // Keep best run per model+horizon (highest final level)
  const existing = combined[model][horizon];
  if (!existing || finalLevel > existing.finalTotalLevel) {
    combined[model][horizon] = {
      jobName,
      finalTotalLevel: finalLevel,
      durationSeconds,
      samples,
    };
  }

  console.log(`  ${model}/${horizon}: ${jobName} — ${samples.length} samples, final level ${finalLevel}`);
  extracted++;
}

if (extracted === 0) {
  console.log('\nNo tracking data found in any job directories.');
  process.exit(1);
}

// Write _combined.json
const combinedPath = join(RESULTS_DIR, '_combined.json');
writeFileSync(combinedPath, JSON.stringify(combined, null, 2));
console.log(`\nWrote ${combinedPath}`);

// Write per-model files
for (const [model, horizons] of Object.entries(combined)) {
  const runs = Object.entries(horizons).map(([hz, data]) => ({
    jobName: data.jobName,
    timeHorizon: hz,
    finalTotalLevel: data.finalTotalLevel,
    durationSeconds: data.durationSeconds,
    sampleCount: data.samples.length,
  }));

  // Use longest run's samples for backward compat
  const longestRun = Object.values(horizons)
    .sort((a, b) => b.durationSeconds - a.durationSeconds)[0];

  const output = { model, runs, samples: longestRun?.samples || [] };
  const outPath = join(RESULTS_DIR, `${model}.json`);
  writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`Wrote ${outPath}`);
}

console.log(`\n${extracted} result(s) extracted. View: open benchmark/graph.html`);
