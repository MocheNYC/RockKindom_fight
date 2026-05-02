from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from sb3_contrib import MaskablePPO

from train_rocofight_maskable_ppo import make_env, run_rollout


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--episodes", type=int, default=64)
    parser.add_argument("--trace-limit", type=int, default=8)
    parser.add_argument("--seed", type=int, default=20260502)
    parser.add_argument("--max-turns", type=int, default=160)
    parser.add_argument("--hp-scale", type=float, default=0.7)
    parser.add_argument("--matchup-mode", choices=["random-roster", "fixed"], default="random-roster")
    parser.add_argument("--player-team-id", default=None)
    parser.add_argument("--opponent-team-id", default=None)
    parser.add_argument("--opponent-policy", default="expert-script")
    parser.add_argument("--reward-profile", default="competitive")
    parser.add_argument("--reward-gamma", type=float, default=0.95)
    parser.add_argument("--draw-penalty", type=float, default=6.0)
    parser.add_argument("--observation-version", choices=["v1", "v2"], default="v2")
    parser.add_argument("--engine-bridge", type=Path, default=Path("dist-node") / "rocofight-engine-bridge.mjs")
    parser.add_argument("--rock-world-root", type=Path, default=Path("."))
    args = parser.parse_args()

    model = MaskablePPO.load(args.model, device="cpu")
    env = make_env(
        args.max_turns,
        args.seed,
        backend="engine",
        bridge_path=args.engine_bridge,
        rock_world_root=args.rock_world_root,
        hp_scale=args.hp_scale,
        matchup_mode=args.matchup_mode,
        opponent_policy=args.opponent_policy,
        player_team_id=args.player_team_id,
        opponent_team_id=args.opponent_team_id,
        reward_profile=args.reward_profile,
        reward_gamma=args.reward_gamma,
        draw_penalty=args.draw_penalty,
        observation_version=args.observation_version,
        opponent_model_path=None,
        opponent_deterministic=True,
    )

    wins = losses = draws = 0
    action_histogram = [0 for _ in range(10)]
    event_counts: dict[str, int] = {}
    loss_examples: list[dict[str, Any]] = []
    draw_examples: list[dict[str, Any]] = []

    try:
        for episode in range(args.episodes):
            rollout = run_rollout(
                model,
                env,
                seed=args.seed + episode,
                max_steps=args.max_turns,
            )
            winner = rollout["winner"]
            if winner == "player":
                wins += 1
            elif winner == "opponent":
                losses += 1
                if len(loss_examples) < args.trace_limit:
                    loss_examples.append({"episode": episode, **rollout})
            else:
                draws += 1
                if len(draw_examples) < args.trace_limit:
                    draw_examples.append({"episode": episode, **rollout})

            for index, count in enumerate(rollout["action_histogram"]):
                action_histogram[index] += int(count)
            for event, count in rollout["event_counts"].items():
                event_counts[event] = event_counts.get(event, 0) + int(count)
    finally:
        env.close()

    summary = {
        "model": str(args.model),
        "episodes": args.episodes,
        "wins": wins,
        "losses": losses,
        "draws": draws,
        "win_rate": wins / max(1, args.episodes),
        "matchup_mode": args.matchup_mode,
        "player_team_id": args.player_team_id,
        "opponent_team_id": args.opponent_team_id,
        "action_histogram": action_histogram,
        "event_counts": event_counts,
        "loss_examples": loss_examples,
        "draw_examples": draw_examples,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in summary.items() if k not in {"loss_examples", "draw_examples"}}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
