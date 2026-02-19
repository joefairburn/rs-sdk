#!/bin/bash
# Start game services if not already running (idempotent).
# Called by verifier and optionally by agents that don't use MCP.
if curl -sf http://localhost:7780 > /dev/null 2>&1; then
    # Services running. Ensure skill tracker is also running.
    if ! pgrep -f skill_tracker > /dev/null 2>&1; then
        echo "[ensure-services] Starting skill tracker..."
        cd /app && TRACKING_FILE=/app/skill_tracking.json nohup bun run benchmark/shared/skill_tracker.ts > /app/skill_tracker.log 2>&1 &
    fi
    exit 0
fi
echo "[ensure-services] Services not running, starting..."
/start-services.sh
echo "[ensure-services] Starting skill tracker..."
cd /app && TRACKING_FILE=/app/skill_tracking.json nohup bun run benchmark/shared/skill_tracker.ts > /app/skill_tracker.log 2>&1 &
echo "[ensure-services] Services ready"
