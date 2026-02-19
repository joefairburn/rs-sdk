#!/bin/bash
# Run 30-minute skill XP benchmarks across models.
#
# All models and skills launch in parallel.
# Wall clock: ~35 min for everything.
#
# Usage:
#   benchmark/run-skills-30m.sh                      # all models, all skills
#   benchmark/run-skills-30m.sh -m haiku             # single model
#   benchmark/run-skills-30m.sh -s woodcutting        # single skill
#   benchmark/run-skills-30m.sh -m haiku -s woodcutting  # single skill + model
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Model definitions (agent|model-id|label) ────────────────────
ALL_MODELS="
claude-code|anthropic/claude-opus-4-6|opus
claude-code|anthropic/claude-sonnet-4-6|sonnet46
claude-code|anthropic/claude-sonnet-4-5|sonnet45
claude-code|anthropic/claude-haiku-4-5|haiku
codex|openai/gpt-codex-5.3|codex
gemini-cli|google/gemini-3-pro-preview|gemini
claude-code|glm-5|glm
kimi-opencode|openrouter/moonshotai/kimi-k2.5|kimi
"

ALL_SKILLS="attack defence strength hitpoints ranged prayer magic woodcutting fishing mining cooking fletching crafting smithing firemaking thieving"

# ── Lookup helper (bash 3 compatible) ────────────────────────────
lookup_model() {
  local name="$1"
  echo "$ALL_MODELS" | while IFS='|' read -r agent model label; do
    if [ "$label" = "$name" ]; then
      echo "$agent|$model|$label"
      return 0
    fi
  done
}

# ── Defaults ──────────────────────────────────────────────────────
SELECTED_MODELS=""
SELECTED_SKILLS=""
EXTRA_ARGS=""

# ── Parse args ────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--model)   SELECTED_MODELS="$SELECTED_MODELS $2"; shift 2 ;;
    -s|--skill)   SELECTED_SKILLS="$SELECTED_SKILLS $2"; shift 2 ;;
    -h|--help)
      echo "Usage: benchmark/run-skills-30m.sh [-m model] [-s skill]"
      echo ""
      echo "Models: opus, sonnet46, sonnet45, haiku, codex, gemini, glm, kimi (default: all)"
      echo "Skills: attack, defence, strength, hitpoints, ranged, prayer, magic,"
      echo "        woodcutting, fishing, mining, cooking, fletching, crafting,"
      echo "        smithing, firemaking, thieving (default: all sixteen)"
      exit 0
      ;;
    *)
      EXTRA_ARGS="$EXTRA_ARGS $1"; shift ;;
  esac
done

# Default to all if none specified
if [ -z "$SELECTED_MODELS" ]; then
  SELECTED_MODELS="opus sonnet46 sonnet45 haiku codex gemini glm kimi"
fi
if [ -z "$SELECTED_SKILLS" ]; then
  SELECTED_SKILLS="$ALL_SKILLS"
fi

# Export API keys from .env
if [ -f "$SCRIPT_DIR/../.env" ]; then
  set -a
  source "$SCRIPT_DIR/../.env"
  set +a
fi
GLM_KEY="${GLM_API_KEY:-}"

# ── Regenerate tasks ──────────────────────────────────────────────
echo "Regenerating benchmark tasks..."
bun "$SCRIPT_DIR/generate-tasks.ts"
echo ""

# ── Launch all models × skills in parallel ──────────────────────────
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
ALL_PIDS=""
ALL_JOBS=""  # "pid|model_name|skill" entries

for model_name in $SELECTED_MODELS; do
  entry=$(lookup_model "$model_name")
  if [ -z "$entry" ]; then
    echo "Unknown model: $model_name (available: opus, sonnet46, sonnet45, haiku, codex, gemini, glm, kimi)"
    exit 1
  fi

  IFS='|' read -r agent model label <<< "$entry"

  # GLM needs custom env
  ENV_PREFIX=""
  AGENT_FLAG="-a '$agent'"
  HARBOR_ENV="modal"
  if [ "$model_name" = "glm" ]; then
    if [ -z "$GLM_KEY" ]; then
      echo "  WARNING: GLM_API_KEY not found in .env, skipping glm"
      continue
    fi
    ENV_PREFIX="ANTHROPIC_API_KEY=$GLM_KEY ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic API_TIMEOUT_MS=3000000"
  elif [ "$model_name" = "kimi" ]; then
    if [ -z "$OPENROUTER_API_KEY" ]; then
      echo "  WARNING: OPENROUTER_API_KEY not found in .env, skipping kimi"
      continue
    fi
    ENV_PREFIX="PYTHONPATH=$SCRIPT_DIR:\${PYTHONPATH:-}"
    AGENT_FLAG="--agent-import-path 'kimi_adapter:KimiOpenCode'"
    HARBOR_ENV="modal"
  fi

  for skill in $SELECTED_SKILLS; do
    TASK="${skill}-xp-30m"
    JOB_NAME="${TASK}-${label}-${TIMESTAMP}"
    LOG_FILE="/tmp/harbor-${JOB_NAME}.log"

    echo "  Launching: $model_name / $skill → $LOG_FILE"

    eval "$ENV_PREFIX harbor run \
      -p '$SCRIPT_DIR/tasks/$TASK' \
      $AGENT_FLAG \
      -m '$model' \
      --job-name '$JOB_NAME' \
      --env $HARBOR_ENV \
      -n 1 \
      -k 1 \
      $EXTRA_ARGS" > "$LOG_FILE" 2>&1 &

    PID=$!
    ALL_PIDS="$ALL_PIDS $PID"
    ALL_JOBS="$ALL_JOBS
$PID|$model_name|$skill|$label"
  done
done

TOTAL=$(echo $ALL_PIDS | wc -w | tr -d ' ')
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Waiting for $TOTAL runs to finish..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TOTAL_FAILED=0
for pid in $ALL_PIDS; do
  if ! wait "$pid"; then
    TOTAL_FAILED=$((TOTAL_FAILED + 1))
  fi
done

# ── Print summary per model ─────────────────────────────────────────
echo ""
for model_name in $SELECTED_MODELS; do
  entry=$(lookup_model "$model_name")
  [ -z "$entry" ] && continue
  IFS='|' read -r _agent _model label <<< "$entry"

  echo "  $model_name:"
  for skill in $SELECTED_SKILLS; do
    TASK="${skill}-xp-30m"
    LOG_FILE="/tmp/harbor-${TASK}-${label}-${TIMESTAMP}.log"
    if [ -f "$LOG_FILE" ]; then
      LAST_LINE=$(tail -1 "$LOG_FILE" 2>/dev/null || echo "")
      echo "    $skill: $LAST_LINE"
    fi
  done
  echo ""
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$TOTAL_FAILED" -eq 0 ]; then
  echo "All skill benchmarks complete. ($TOTAL runs)"
else
  echo "All runs finished. $TOTAL_FAILED of $TOTAL run(s) had errors."
fi
echo ""
echo "Next steps:"
echo "  bun benchmark/extract-skill-results.ts"
echo "  python3 -m http.server 8765 -d benchmark && open http://localhost:8765/graph-skills.html"
