#!/bin/bash
# Run the benchmark suite across models on Daytona.
#
# Usage:
#   benchmark/run.sh                    # all 3 models, woodcutting-xp-10m
#   benchmark/run.sh -t woodcutting-xp-5m
#   benchmark/run.sh -m sonnet          # single model
#   benchmark/run.sh -n 2               # 2 trials per model
#   benchmark/run.sh -c 4               # 4 concurrent trials
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Model definitions ─────────────────────────────────────────────
declare -A MODELS=(
  [opus]="anthropic/claude-opus-4-6"
  [sonnet]="anthropic/claude-sonnet-4-5"
  [haiku]="anthropic/claude-haiku-4-5"
  [gemini]="google/gemini-3-pro-preview"
)

# ── Agent mapping (model name -> harbor agent) ───────────────────
declare -A AGENTS=(
  [opus]="claude-code"
  [sonnet]="claude-code"
  [haiku]="claude-code"
  [gemini]="gemini-cli"
)

# ── Defaults ──────────────────────────────────────────────────────
TASK="woodcutting-xp-10m"
SELECTED_MODELS=""
N_TRIALS=1
CONCURRENCY=2
EXTRA_ARGS=""

# ── Parse args ────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -t|--task)    TASK="$2"; shift 2 ;;
    -m|--model)   SELECTED_MODELS="$SELECTED_MODELS $2"; shift 2 ;;
    -n|--trials)  N_TRIALS="$2"; shift 2 ;;
    -c|--concurrency) CONCURRENCY="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: benchmark/run.sh [-t task] [-m model] [-n trials] [-c concurrency]"
      echo ""
      echo "Models: opus, sonnet, haiku, gemini (default: all four)"
      echo "Task:   any task dir name (default: woodcutting-xp-10m)"
      exit 0
      ;;
    *)
      EXTRA_ARGS="$EXTRA_ARGS $1"; shift ;;
  esac
done

# Default to all models if none specified
if [ -z "$SELECTED_MODELS" ]; then
  SELECTED_MODELS="sonnet opus haiku gemini"
fi

# ── Regenerate tasks ──────────────────────────────────────────────
echo "Regenerating benchmark tasks..."
bun "$SCRIPT_DIR/generate-tasks.ts"
echo ""

# ── Run each model ────────────────────────────────────────────────
for name in $SELECTED_MODELS; do
  model="${MODELS[$name]}"
  agent="${AGENTS[$name]}"
  if [ -z "$model" ]; then
    echo "Unknown model: $name (available: opus, sonnet, haiku, gemini)"
    exit 1
  fi

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Running: $name ($model)"
  echo "  Task:    $TASK"
  echo "  Trials:  $N_TRIALS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  harbor run \
    -p "$SCRIPT_DIR/$TASK" \
    -a "$agent" \
    -m "$model" \
    --env daytona \
    -n "$CONCURRENCY" \
    -k "$N_TRIALS" \
    $EXTRA_ARGS

  echo ""
done

echo "All runs complete."
