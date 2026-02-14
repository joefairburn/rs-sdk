/**
 * Generates all benchmark task directories for Harbor.
 *
 * Standard tasks: 16 skills × max XP in 10 minutes
 * Variants: woodcutting-xp-5m (5min XP grind), woodcutting-10 (reach level 10)
 *
 * All generated output is gitignored — run this before `harbor run`.
 *
 * Usage: bun benchmark/generate-tasks.ts
 */
import { mkdirSync, writeFileSync, copyFileSync } from 'fs';
import { join } from 'path';

const BENCHMARK_DIR = join(import.meta.dir);
const SHARED_DIR = join(BENCHMARK_DIR, 'shared');

const DOCKER_IMAGE = 'ghcr.io/maxbittker/rs-agent-benchmark:v8';
const DEFAULT_AGENT_TIMEOUT = 600; // 10 minutes
const VERIFIER_TIMEOUT = 120;

// ── Standard skill definitions (XP-grind tasks) ─────────────────

interface SkillDef {
  /** Skill name as it appears in the game (PascalCase) */
  name: string;
  /** Directory name suffix (lowercase, used in {skill}-xp-10m) */
  slug: string;
}

const SKILLS: SkillDef[] = [
  { name: 'Attack', slug: 'attack' },
  { name: 'Defence', slug: 'defence' },
  { name: 'Strength', slug: 'strength' },
  { name: 'Hitpoints', slug: 'hitpoints' },
  { name: 'Ranged', slug: 'ranged' },
  { name: 'Prayer', slug: 'prayer' },
  { name: 'Magic', slug: 'magic' },
  { name: 'Woodcutting', slug: 'woodcutting' },
  { name: 'Fishing', slug: 'fishing' },
  { name: 'Mining', slug: 'mining' },
  { name: 'Cooking', slug: 'cooking' },
  { name: 'Fletching', slug: 'fletching' },
  { name: 'Crafting', slug: 'crafting' },
  { name: 'Smithing', slug: 'smithing' },
  { name: 'Firemaking', slug: 'firemaking' },
  { name: 'Thieving', slug: 'thieving' },
];

// ── Variant tasks (non-standard configurations) ──────────────────

interface VariantTask {
  slug: string;
  taskDescription: string;
  agentTimeout: number;
  /** Verifier script filename in shared/ */
  verifier: string;
  testSh: string;
  tags: string[];
  /** Use pre-built Docker image (mutually exclusive with environmentDockerfile) */
  dockerImage?: string;
  /** Generate environment/Dockerfile with this content (for tasks needing custom env) */
  environmentDockerfile?: string;
  /** Additional shared files to copy into tests/ (e.g. skill_tracker.ts) */
  extraSharedFiles?: string[];
}

const TOTAL_LEVEL_INSTRUCTION = (durationMinutes: number) => `Holistically improve this RuneScape account to achieve the highest possible total level within ${durationMinutes} minutes.

Your goal is to maximize the TOTAL LEVEL of the account — the sum of all individual skill levels. You should strategically choose which skills to train based on what's most efficient to level up. Consider:
- Which skills are fastest to level at low levels
- Resource availability near your current location
- Combining skills that complement each other (e.g. woodcutting + firemaking, fishing + cooking, mining + smithing)
- Moving between different training spots as needed

Think strategically about time allocation. Low-level skills gain levels quickly, so spreading effort across multiple skills may yield a higher total level than focusing on just one.

IMPORTANT: You have ${durationMinutes} minutes. Plan your time wisely and keep training continuously. Do not spend too long planning — start training immediately and adapt as you go. Write scripts that run for long durations and loop through training activities. Run your training script in the FOREGROUND (not as a background process) so it runs for the full duration.

The bot name is "agent". The rs-sdk codebase is at /app with full documentation in sdk/API.md and learnings/.`;

const TOTAL_LEVEL_DOCKERFILE = () => `FROM ${DOCKER_IMAGE}
ENV SAMPLE_INTERVAL_MS=15000

# Copy skill tracker script (placed in build context by extraSharedFiles)
COPY skill_tracker.ts /app/benchmark/shared/skill_tracker.ts

# Ensure bot.env has SERVER=localhost so scripts connect to the local gateway
RUN echo 'SERVER=localhost' >> /app/bots/agent/bot.env
`;

const VARIANTS: VariantTask[] = [
  {
    slug: 'woodcutting-xp-5m',
    taskDescription: `Gain as much Woodcutting XP as possible within the time limit.

The bot name is "agent". The rs-sdk codebase is at /app with full documentation in sdk/API.md and learnings/.`,
    agentTimeout: 300,
    verifier: 'check_xp.ts',
    testSh: `#!/bin/bash
export SKILL_NAME="Woodcutting"
cd /app && bun run /tests/check_xp.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark'],
    dockerImage: DOCKER_IMAGE,
  },
  {
    slug: 'woodcutting-10',
    taskDescription: `Get level 10 in Woodcutting.

The bot name is "agent". The rs-sdk codebase is at /app with full documentation in sdk/API.md and learnings/.
`,
    agentTimeout: 600,
    verifier: 'check_level.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
cd /app
bun run /tests/check_level.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp'],
    // Normal game speed — override the 8x speedup baked into the base image
    environmentDockerfile: `FROM ${DOCKER_IMAGE}
# Normal game speed (420ms ticks instead of base image's 50ms)
ENV NODE_TICKRATE=420
`,
  },
  // ── Total Level tasks ──────────────────────────────────────────
  {
    slug: 'total-level-8m',
    taskDescription: TOTAL_LEVEL_INSTRUCTION(8),
    agentTimeout: 480 + 60, // 8 min + 1 min buffer for agent to wrap up
    verifier: 'check_total_level.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
cd /app && bun run /tests/check_total_level.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark', 'total-level'],
    extraSharedFiles: ['skill_tracker.ts'],
    environmentDockerfile: TOTAL_LEVEL_DOCKERFILE(),
  },
  {
    slug: 'total-level-1h',
    taskDescription: TOTAL_LEVEL_INSTRUCTION(60),
    agentTimeout: 3600 + 120, // 60 min + 2 min buffer
    verifier: 'check_total_level.ts',
    testSh: `#!/bin/bash
set -e
mkdir -p /logs/verifier
cd /app && bun run /tests/check_total_level.ts
`,
    tags: ['game', 'runescape', 'automation', 'mcp', 'benchmark', 'total-level'],
    extraSharedFiles: ['skill_tracker.ts'],
    environmentDockerfile: TOTAL_LEVEL_DOCKERFILE(),
  },
];

// ── Template generators ──────────────────────────────────────────

function generateSkillTaskToml(): string {
  return `version = "1.0"

[metadata]
author_name = "Sean Lee"
difficulty = "medium"
category = "agent"
tags = ["game", "runescape", "automation", "mcp", "benchmark", "xp-grind"]

[verifier]
timeout_sec = ${VERIFIER_TIMEOUT}.0

[agent]
timeout_sec = ${DEFAULT_AGENT_TIMEOUT}.0

[environment]
cpus = 2
memory_mb = 4096
storage_mb = 10240
allow_internet = true

[[environment.mcp_servers]]
name = "rs-agent"
transport = "stdio"
command = "bash"
args = ["-c", "/start-services.sh && cd /app && bun run mcp/server.ts"]
`;
}

function generateVariantTaskToml(v: VariantTask): string {
  const tagsStr = v.tags.map(t => `"${t}"`).join(', ');

  // For total-level tasks, launch the skill tracker as a background process
  // with stdout/stderr redirected to a log file (to avoid corrupting MCP stdio)
  const hasTracker = v.extraSharedFiles?.includes('skill_tracker.ts');
  const mcpCommand = hasTracker
    ? '/start-services.sh && cd /app && bun run benchmark/shared/skill_tracker.ts > /logs/verifier/skill_tracker.log 2>&1 & bun run mcp/server.ts'
    : '/start-services.sh && cd /app && bun run mcp/server.ts';

  return `version = "1.0"

[metadata]
author_name = "Sean Lee"
difficulty = "medium"
category = "agent"
tags = [${tagsStr}]

[verifier]
timeout_sec = ${VERIFIER_TIMEOUT}.0

[agent]
timeout_sec = ${v.agentTimeout}.0

[environment]
cpus = 2
memory_mb = 4096
storage_mb = 10240
allow_internet = true

[[environment.mcp_servers]]
name = "rs-agent"
transport = "stdio"
command = "bash"
args = ["-c", "${mcpCommand}"]
`;
}

function generateTaskDescription(skill: SkillDef): string {
  return `Gain as much ${skill.name} XP as possible within the time limit.

The bot name is "agent". The rs-sdk codebase is at /app with full documentation in sdk/API.md and learnings/.`;
}

function generateTestSh(skill: SkillDef): string {
  return `#!/bin/bash
export SKILL_NAME="${skill.name}"
cd /app && bun run /tests/check_xp.ts
`;
}

// ── Main ─────────────────────────────────────────────────────────

console.log(`Generating ${SKILLS.length} standard + ${VARIANTS.length} variant benchmark tasks...`);

// Standard XP-grind tasks (all share identical task.toml)
const skillToml = generateSkillTaskToml();

for (const skill of SKILLS) {
  const taskDir = join(BENCHMARK_DIR, `${skill.slug}-xp-10m`);
  const testsDir = join(taskDir, 'tests');

  console.log(`  ${skill.slug}-xp-10m/ (${skill.name})`);

  mkdirSync(testsDir, { recursive: true });

  // Dockerfile for cloud providers (Daytona) that don't support docker_image.
  // Just pulls the pre-built image — no additional build steps needed.
  const envDir = join(taskDir, 'environment');
  mkdirSync(envDir, { recursive: true });
  writeFileSync(join(envDir, 'Dockerfile'), `FROM ${DOCKER_IMAGE}\n`);

  writeFileSync(join(taskDir, 'task.toml'), skillToml);
  writeFileSync(join(taskDir, 'instruction.md'), generateTaskDescription(skill));
  writeFileSync(join(testsDir, 'test.sh'), generateTestSh(skill));
  copyFileSync(join(SHARED_DIR, 'check_xp.ts'), join(testsDir, 'check_xp.ts'));
}

// Variant tasks
for (const variant of VARIANTS) {
  const taskDir = join(BENCHMARK_DIR, variant.slug);
  const testsDir = join(taskDir, 'tests');

  console.log(`  ${variant.slug}/`);

  mkdirSync(testsDir, { recursive: true });
  writeFileSync(join(taskDir, 'task.toml'), generateVariantTaskToml(variant));
  writeFileSync(join(taskDir, 'instruction.md'), variant.taskDescription);
  writeFileSync(join(testsDir, 'test.sh'), variant.testSh);
  copyFileSync(
    join(SHARED_DIR, variant.verifier),
    join(testsDir, variant.verifier),
  );

  // Dockerfile for cloud providers (Daytona) — either custom env or
  // a thin FROM layer on the pre-built image.
  const envDir = join(taskDir, 'environment');
  mkdirSync(envDir, { recursive: true });
  writeFileSync(
    join(envDir, 'Dockerfile'),
    variant.environmentDockerfile ?? `FROM ${DOCKER_IMAGE}\n`,
  );

  // Copy extra shared files (e.g. skill_tracker.ts) into environment/ for Dockerfile COPY
  if (variant.extraSharedFiles) {
    for (const file of variant.extraSharedFiles) {
      copyFileSync(join(SHARED_DIR, file), join(envDir, file));
    }
  }
}

console.log(`\nDone! Generated ${SKILLS.length + VARIANTS.length} task directories.`);
console.log(`\nTo build the shared Docker image:`);
console.log(`  cd benchmark/docker && ./build.sh`);
