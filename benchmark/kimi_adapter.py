"""
Custom Harbor adapter for Kimi K2.5 via OpenCode + OpenRouter.

Usage with Harbor:
    PYTHONPATH=benchmark harbor run \
        --agent-import-path 'kimi_adapter:KimiOpenCode' \
        -m 'openrouter/moonshotai/kimi-k2.5' \
        -p benchmark/total-level-8m
"""

import json
import os
import shlex
from pathlib import Path

from harbor.agents.installed.base import BaseInstalledAgent, ExecInput
from harbor.models.agent.context import AgentContext


class KimiOpenCode(BaseInstalledAgent):
    """
    Runs Kimi K2.5 via OpenCode CLI with OpenRouter as the provider.
    """

    @staticmethod
    def name() -> str:
        return "kimi-opencode"

    @property
    def _install_agent_template_path(self) -> Path:
        return Path(__file__).parent / "install-kimi-opencode.sh.j2"

    def populate_context_post_run(self, context: AgentContext) -> None:
        pass

    def _build_opencode_config(self) -> dict:
        """Build opencode.json config with OpenRouter provider and MCP servers."""
        # Extract model ID from full model name (e.g. openrouter/moonshotai/kimi-k2.5)
        model_id = self.model_name or "openrouter/moonshotai/kimi-k2.5"
        if "/" in model_id:
            parts = model_id.split("/", 1)
            provider_name = parts[0]
            model_suffix = parts[1]  # e.g. moonshotai/kimi-k2.5
        else:
            provider_name = "openrouter"
            model_suffix = model_id

        config: dict = {
            "$schema": "https://opencode.ai/config.json",
            "provider": {
                provider_name: {
                    "models": {
                        model_suffix: {}
                    }
                }
            },
            "model": model_id,
            "permission": {
                "*": "allow",
            },
        }

        # Add MCP servers from task config
        if self.mcp_servers:
            mcp = {}
            for server in self.mcp_servers:
                if server.transport == "stdio":
                    cmd_parts = [server.command] + (server.args or [])
                    mcp[server.name] = {
                        "type": "local",
                        "command": cmd_parts,
                        "enabled": True,
                    }
                else:
                    mcp[server.name] = {
                        "type": "remote",
                        "url": server.url,
                        "enabled": True,
                    }
            config["mcp"] = mcp

        return config

    # Snapshot env vars at class-load time (same pattern as Claude Code adapter)
    _original_env = {
        k: os.environ.get(k, "")
        for k in ["OPENROUTER_API_KEY"]
    }

    def create_run_agent_commands(self, instruction: str) -> list[ExecInput]:
        escaped_instruction = shlex.quote(instruction)

        _e = self._original_env
        openrouter_key = _e.get("OPENROUTER_API_KEY") or os.environ.get("OPENROUTER_API_KEY", "")

        env = {
            "OPENROUTER_API_KEY": openrouter_key,
            "OPENCODE_YOLO": "true",
            "OPENCODE_DANGEROUSLY_SKIP_PERMISSIONS": "true",
        }
        env = {k: v for k, v in env.items() if v}

        # Build and serialize the opencode config
        opencode_config = self._build_opencode_config()
        config_json = json.dumps(opencode_config, indent=2)
        escaped_config = shlex.quote(config_json)

        model_name = self.model_name or "openrouter/moonshotai/kimi-k2.5"

        # Setup: write opencode.json to project root and ensure services are running
        setup_command = (
            f"echo {escaped_config} > /app/opencode.json && "
            "echo '[kimi-setup] Wrote /app/opencode.json'"
        )

        # Run: start services then run opencode (no restart loop — let it exit
        # naturally so the verifier phase can run on Modal environments)
        run_command = (
            "echo '[kimi-setup] Starting game services...'; "
            "/ensure-services.sh; "
            "echo '[kimi-setup] Services ready, starting opencode'; "
            "cd /app && "
            f"opencode --model {shlex.quote(model_name)} run --format=json {escaped_instruction} "
            f"2>&1 </dev/null | tee -a /logs/agent/opencode-kimi.txt; "
            "echo '[kimi] opencode exited' | tee -a /logs/agent/opencode-kimi.txt"
        )

        return [
            ExecInput(command=setup_command, env=env),
            ExecInput(command=run_command, env=env),
        ]
