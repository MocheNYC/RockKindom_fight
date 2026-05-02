from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
from sb3_contrib import MaskablePPO
from sb3_contrib.common.maskable.utils import get_action_masks

from train_rocofight_maskable_ppo import make_env


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary-output", type=Path, required=True)
    parser.add_argument("--episodes", type=int, default=64)
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

    args.output.parent.mkdir(parents=True, exist_ok=True)
    rows = 0
    invalid_labels = 0
    model_matches = 0
    action_histogram = [0 for _ in range(10)]
    wins = {"player": 0, "opponent": 0, "draw": 0}
    total_turns = 0

    try:
        with args.output.open("w", encoding="utf-8") as handle:
            for episode in range(args.episodes):
                obs, info = env.reset(seed=args.seed + episode)
                for _step in range(args.max_turns):
                    mask = np.asarray(get_action_masks(env), dtype=bool)
                    expert_action = info.get("playerExpertActionIndex")
                    if expert_action is not None:
                        expert_action = int(expert_action)
                        if 0 <= expert_action < len(mask) and mask[expert_action]:
                            model_action, _ = model.predict(
                                obs,
                                action_masks=mask,
                                deterministic=True,
                            )
                            model_action_int = int(model_action)
                            model_matches += int(model_action_int == expert_action)
                            action_histogram[expert_action] += 1
                            rows += 1
                            handle.write(
                                json.dumps(
                                    {
                                        "episode": episode,
                                        "seed": args.seed + episode,
                                        "turn": int(info.get("turn", 0)),
                                        "side": "player",
                                        "active": info.get("learner_active", ""),
                                        "opponentActive": info.get("opponent_active", ""),
                                        "observationVersion": args.observation_version,
                                        "observation": np.asarray(obs, dtype=np.float32).tolist(),
                                        "actionMask": mask.astype(np.int8).tolist(),
                                        "action": expert_action,
                                        "actionLabel": info.get("playerExpertAction"),
                                        "modelAction": model_action_int,
                                        "matchupMode": args.matchup_mode,
                                    },
                                    ensure_ascii=False,
                                )
                                + "\n"
                            )
                        else:
                            invalid_labels += 1
                            model_action, _ = model.predict(
                                obs,
                                action_masks=mask,
                                deterministic=True,
                            )
                            model_action_int = int(model_action)
                    else:
                        model_action, _ = model.predict(
                            obs,
                            action_masks=mask,
                            deterministic=True,
                        )
                        model_action_int = int(model_action)

                    obs, _reward, terminated, truncated, info = env.step(model_action_int)
                    if terminated or truncated:
                        winner = info.get("winner")
                        if winner == "player":
                            wins["player"] += 1
                        elif winner == "opponent":
                            wins["opponent"] += 1
                        else:
                            wins["draw"] += 1
                        total_turns += int(info.get("turn", args.max_turns))
                        break
    finally:
        env.close()

    summary = {
        "model": str(args.model),
        "output": str(args.output),
        "episodes": args.episodes,
        "samples": rows,
        "invalid_labels": invalid_labels,
        "model_expert_match_rate": model_matches / max(1, rows),
        "wins": wins,
        "mean_turns": total_turns / max(1, args.episodes),
        "action_histogram": action_histogram,
        "matchup_mode": args.matchup_mode,
        "observation_version": args.observation_version,
    }
    args.summary_output.parent.mkdir(parents=True, exist_ok=True)
    args.summary_output.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
