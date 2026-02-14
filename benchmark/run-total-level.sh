#!/bin/bash
# Run total-level benchmark across Claude models + Codex + Gemini on Daytona.
#
# Usage:
#   benchmark/run-total-level.sh                    # all 5 models, 8m test
#   benchmark/run-total-level.sh --duration 1h      # 1-hour production run
#   benchmark/run-total-level.sh -m opus            # single model
#   benchmark/run-total-level.sh -m codex           # codex only
#   benchmark/run-total-level.sh -m gemini          # gemini only
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Load API keys from .env ───────────────────────────────────────
if [ -f "$ROOT_DIR/.env" ]; then
    echo "Loading API keys from .env..."
    # Export each KEY=VALUE line (skip comments and empty lines)
    while IFS= read -r line; do
        # Skip comments and empty lines
        [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
        export "$line"
    done < "$ROOT_DIR/.env"
fi

# Verify required keys
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "ERROR: ANTHROPIC_API_KEY not set (check .env)"
    exit 1
fi
if [ -z "$DAYTONA_API_KEY" ]; then
    echo "ERROR: DAYTONA_API_KEY not set (check .env)"
    exit 1
fi

# For Codex: use OPENAI_API_KEY if set, or fall back to OPENROUTER_API_KEY
CODEX_AVAILABLE=false
if [ -n "$OPENAI_API_KEY" ]; then
    CODEX_AVAILABLE=true
elif [ -n "$OPENROUTER_API_KEY" ]; then
    echo "Using OpenRouter as Codex backend..."
    export OPENAI_API_KEY="$OPENROUTER_API_KEY"
    export OPENAI_BASE_URL="https://openrouter.ai/api/v1"
    CODEX_AVAILABLE=true
fi

# For Gemini: check GEMINI_API_KEY
GEMINI_AVAILABLE=false
if [ -n "$GEMINI_API_KEY" ]; then
    GEMINI_AVAILABLE=true
fi

# ── Model definitions ─────────────────────────────────────────────
declare -A CLAUDE_MODELS=(
    [opus]="anthropic/claude-opus-4-6"
    [sonnet]="anthropic/claude-sonnet-4-5"
    [haiku]="anthropic/claude-haiku-4-5"
)

CODEX_MODEL="openai/gpt-5.2-codex"  # Default codex model (5.3 requires ChatGPT auth)
GEMINI_MODEL="google/gemini-3-pro-preview"  # Default gemini model

# ── Defaults ──────────────────────────────────────────────────────
DURATION="8m"
TASK="total-level-8m"
SELECTED_MODELS=""
CONCURRENCY=1
EXTRA_ARGS=""

# ── Parse args ────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --duration|-d)
            DURATION="$2"
            shift 2
            ;;
        -m|--model)
            SELECTED_MODELS="$SELECTED_MODELS $2"
            shift 2
            ;;
        -n|--concurrency)
            CONCURRENCY="$2"
            shift 2
            ;;
        --codex-model)
            CODEX_MODEL="$2"
            shift 2
            ;;
        --gemini-model)
            GEMINI_MODEL="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: benchmark/run-total-level.sh [options]"
            echo ""
            echo "Options:"
            echo "  --duration, -d   8m (default) or 1h"
            echo "  --model, -m      opus, sonnet, haiku, codex, gemini (default: all)"
            echo "  --concurrency    Number of concurrent trials (default: 1)"
            echo "  --codex-model    Model for codex agent (default: openai/gpt-5.3-codex)"
            echo "  --gemini-model   Model for gemini agent (default: google/gemini-3-pro-preview)"
            exit 0
            ;;
        *)
            EXTRA_ARGS="$EXTRA_ARGS $1"
            shift
            ;;
    esac
done

# Map duration to task
case "$DURATION" in
    8m|8min|test)
        TASK="total-level-8m"
        ;;
    1h|60m|hour|prod)
        TASK="total-level-1h"
        ;;
    *)
        echo "Unknown duration: $DURATION (use 8m or 1h)"
        exit 1
        ;;
esac

# Default to all models if none specified
if [ -z "$SELECTED_MODELS" ]; then
    SELECTED_MODELS="opus sonnet haiku codex gemini"
fi

# ── Regenerate tasks ──────────────────────────────────────────────
echo "Regenerating benchmark tasks..."
bun "$SCRIPT_DIR/generate-tasks.ts"
echo ""

# ── Run each model ────────────────────────────────────────────────
JOB_PREFIX="total-level-$(date +%Y%m%d-%H%M%S)"

for name in $SELECTED_MODELS; do
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ "$name" = "codex" ]; then
        if [ "$CODEX_AVAILABLE" != "true" ]; then
            echo "  SKIP: codex (OPENAI_API_KEY not set)"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            continue
        fi

        echo "  Running: codex ($CODEX_MODEL)"
        echo "  Task:    $TASK"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

        harbor run \
            -p "$SCRIPT_DIR/$TASK" \
            -a codex \
            -m "$CODEX_MODEL" \
            --env daytona \
            -n "$CONCURRENCY" \
            --job-name "${JOB_PREFIX}-codex" \
            $EXTRA_ARGS
    elif [ "$name" = "gemini" ]; then
        if [ "$GEMINI_AVAILABLE" != "true" ]; then
            echo "  SKIP: gemini (GEMINI_API_KEY not set)"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            continue
        fi

        echo "  Running: gemini ($GEMINI_MODEL)"
        echo "  Task:    $TASK"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

        harbor run \
            -p "$SCRIPT_DIR/$TASK" \
            -a gemini-cli \
            -m "$GEMINI_MODEL" \
            --env daytona \
            -n "$CONCURRENCY" \
            --job-name "${JOB_PREFIX}-gemini" \
            $EXTRA_ARGS
    else
        model="${CLAUDE_MODELS[$name]}"
        if [ -z "$model" ]; then
            echo "  Unknown model: $name (available: opus, sonnet, haiku, codex, gemini)"
            exit 1
        fi

        echo "  Running: $name ($model)"
        echo "  Task:    $TASK"
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

        harbor run \
            -p "$SCRIPT_DIR/$TASK" \
            -a claude-code \
            -m "$model" \
            --env daytona \
            -n "$CONCURRENCY" \
            --job-name "${JOB_PREFIX}-${name}" \
            $EXTRA_ARGS
    fi

    echo ""
done

echo "All runs complete!"
echo ""
echo "To extract results: bun benchmark/extract-results.ts jobs/${JOB_PREFIX}-*"
echo "To view graphs: open benchmark/graph.html"
