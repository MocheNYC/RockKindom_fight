from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any


POLICIES = (
    "expert-script",
)


@dataclass(frozen=True)
class Experiment:
    name: str
    matchup_mode: str
    opponent_policy: str
    total_timesteps: int
    eval_every: int
    eval_episodes: int
    eval_suite_episodes: int
    learning_rate: float
    ent_coef: float
    reward_profile: str = "potential"
    observation_version: str = "v1"
    feature_extractor: str = "mlp"
    structured_features_dim: int = 256
    structured_slot_dim: int = 64
    gamma: float = 0.95
    reward_gamma: float | None = None
    n_steps: int = 256
    batch_size: int = 64
    n_envs: int = 1
    n_epochs: int = 10
    net_arch: str = "256,256"
    activation_fn: str = "silu"
    load_from: str = "best"


def default_plan() -> list[Experiment]:
    return [
        Experiment(
            name="expert-v1-transfer-a",
            matchup_mode="random-roster",
            opponent_policy="expert-script",
            total_timesteps=65536,
            eval_every=8192,
            eval_episodes=16,
            eval_suite_episodes=96,
            learning_rate=1.0e-4,
            ent_coef=0.035,
            reward_profile="competitive",
            n_envs=4,
            load_from="base",
        ),
        Experiment(
            name="expert-v1-polish-a",
            matchup_mode="random-roster",
            opponent_policy="expert-script",
            total_timesteps=65536,
            eval_every=8192,
            eval_episodes=16,
            eval_suite_episodes=96,
            learning_rate=7e-5,
            ent_coef=0.02,
            reward_profile="competitive",
            n_envs=4,
        ),
        Experiment(
            name="expert-v1-long-a",
            matchup_mode="random-roster",
            opponent_policy="expert-script",
            total_timesteps=98304,
            eval_every=8192,
            eval_episodes=16,
            eval_suite_episodes=128,
            learning_rate=5e-5,
            ent_coef=0.015,
            reward_profile="competitive",
            n_envs=4,
        ),
        Experiment(
            name="expert-structured-v2-fresh-a",
            matchup_mode="random-roster",
            opponent_policy="expert-script",
            total_timesteps=131072,
            eval_every=16384,
            eval_episodes=24,
            eval_suite_episodes=128,
            learning_rate=2.0e-4,
            ent_coef=0.035,
            reward_profile="competitive",
            observation_version="v2",
            feature_extractor="structured",
            structured_features_dim=384,
            structured_slot_dim=96,
            n_envs=4,
            net_arch="256,256",
            load_from="none",
        ),
        Experiment(
            name="expert-structured-v2-refine-a",
            matchup_mode="random-roster",
            opponent_policy="expert-script",
            total_timesteps=98304,
            eval_every=16384,
            eval_episodes=24,
            eval_suite_episodes=128,
            learning_rate=1.0e-4,
            ent_coef=0.02,
            reward_profile="competitive",
            observation_version="v2",
            feature_extractor="structured",
            structured_features_dim=384,
            structured_slot_dim=96,
            n_envs=4,
            load_from="previous",
        ),
        Experiment(
            name="expert-structured-v2-final",
            matchup_mode="random-roster",
            opponent_policy="expert-script",
            total_timesteps=196608,
            eval_every=16384,
            eval_episodes=24,
            eval_suite_episodes=128,
            learning_rate=6e-5,
            ent_coef=0.012,
            reward_profile="competitive",
            observation_version="v2",
            feature_extractor="structured",
            structured_features_dim=384,
            structured_slot_dim=96,
            n_envs=4,
            load_from="previous",
        ),
    ]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--time-budget-min", type=float, default=360)
    parser.add_argument("--seed", type=int, default=20260502)
    parser.add_argument("--max-turns", type=int, default=160)
    parser.add_argument("--player-team-id", default="wing-core")
    parser.add_argument("--opponent-team-id", default="team-4")
    parser.add_argument("--base-model", type=Path, default=None)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("outputs") / "long-expert-turn160",
    )
    parser.add_argument("--smoke", action="store_true")
    return parser.parse_args()


def resolve_base_model(args: argparse.Namespace) -> Path | None:
    if args.base_model is not None:
        return args.base_model

    candidates = [
        Path("outputs")
        / "engine-wing-core-turn160-32768"
        / "checkpoints"
        / "best_mean_model.zip",
        Path("outputs")
        / "engine-wing-core-turn80-32768"
        / "checkpoints"
        / "best_mean_model.zip",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def score_summary(summary: dict[str, Any]) -> float:
    suite = summary["eval_suite"]
    aggregate = suite["aggregate"]
    policies = suite["policies"]
    episodes = max(1, aggregate["episodes"])
    loss_rate = aggregate["losses"] / episodes
    draw_rate = aggregate["draws"] / episodes
    expert_win = policies.get("expert-script", {}).get("win_rate", 0.0)
    mean_reward = aggregate.get("mean_reward", 0.0)
    return (
        expert_win * 150
        + aggregate["win_rate"] * 50
        - loss_rate * 60
        - draw_rate * 30
        + mean_reward * 0.05
    )


def flatten_summary(
    name: str,
    seed: int,
    output_dir: Path,
    summary: dict[str, Any],
) -> dict[str, Any]:
    aggregate = summary["eval_suite"]["aggregate"]
    row: dict[str, Any] = {
        "name": name,
        "seed": seed,
        "output_dir": str(output_dir),
        "score": score_summary(summary),
        "win_rate": aggregate["win_rate"],
        "wins": aggregate["wins"],
        "losses": aggregate["losses"],
        "draws": aggregate["draws"],
        "invalid_selected": aggregate["invalid_selected"],
        "mean_reward": aggregate["mean_reward"],
        "total_timesteps": summary["total_timesteps"],
        "matchup_mode": summary["matchup_mode"],
        "opponent_policy": summary["opponent_policy"],
        "reward_profile": summary["reward_profile"],
        "observation_version": summary["observation_version"],
        "feature_extractor": summary["feature_extractor"],
        "n_envs": summary["n_envs"],
        "learning_rate": summary["learning_rate"],
        "ent_coef": summary["ent_coef"],
        "best_mean_model": summary.get("best_mean_model"),
        "model": str(output_dir / "rocofight_maskppo_model.zip"),
    }
    for policy in POLICIES:
        result = summary["eval_suite"]["policies"].get(policy, {})
        row[f"{policy}_win_rate"] = result.get("win_rate")
        row[f"{policy}_wins"] = result.get("wins")
        row[f"{policy}_losses"] = result.get("losses")
        row[f"{policy}_draws"] = result.get("draws")
        row[f"{policy}_mean_steps"] = result.get("mean_steps")
    return row


def write_leaderboard(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        return
    ordered = sorted(rows, key=lambda row: row["score"], reverse=True)
    fieldnames = list(ordered[0].keys())
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(ordered)
    json_path = path.with_suffix(".json")
    json_path.write_text(
        json.dumps(ordered, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def build_command(
    experiment: Experiment,
    args: argparse.Namespace,
    output_dir: Path,
    seed: int,
    load_model: Path | None,
) -> list[str]:
    command = [
        sys.executable,
        "python/train_rocofight_maskable_ppo.py",
        "--backend",
        "engine",
        "--matchup-mode",
        experiment.matchup_mode,
        "--opponent-policy",
        experiment.opponent_policy,
        "--reward-profile",
        experiment.reward_profile,
        "--observation-version",
        experiment.observation_version,
        "--feature-extractor",
        experiment.feature_extractor,
        "--structured-features-dim",
        str(experiment.structured_features_dim),
        "--structured-slot-dim",
        str(experiment.structured_slot_dim),
        "--draw-penalty",
        "8",
        "--total-timesteps",
        str(experiment.total_timesteps),
        "--eval-every",
        str(experiment.eval_every),
        "--eval-episodes",
        str(experiment.eval_episodes),
        "--eval-suite-episodes",
        str(experiment.eval_suite_episodes),
        "--eval-suite-policies",
        "expert-script",
        "--n-steps",
        str(experiment.n_steps),
        "--batch-size",
        str(experiment.batch_size),
        "--n-envs",
        str(experiment.n_envs),
        "--n-epochs",
        str(experiment.n_epochs),
        "--max-turns",
        str(args.max_turns),
        "--hp-scale",
        "0.7",
        "--ent-coef",
        str(experiment.ent_coef),
        "--learning-rate",
        str(experiment.learning_rate),
        "--net-arch",
        experiment.net_arch,
        "--activation-fn",
        experiment.activation_fn,
        "--learning-rate-schedule",
        "linear",
        "--seed",
        str(seed),
        "--save-eval-checkpoints",
        "--output-dir",
        str(output_dir),
    ]
    if experiment.matchup_mode == "fixed":
        command.extend(
            [
                "--player-team-id",
                args.player_team_id,
                "--opponent-team-id",
                args.opponent_team_id,
            ]
        )
    if experiment.reward_gamma is not None:
        command.extend(["--reward-gamma", str(experiment.reward_gamma)])
    if load_model is not None:
        command.extend(["--load-model", str(load_model)])
    return command


def run_experiment(
    experiment: Experiment,
    args: argparse.Namespace,
    run_index: int,
    load_model: Path | None,
) -> tuple[dict[str, Any], Path]:
    seed = args.seed + run_index * 17
    output_dir = args.output_root / f"{run_index:02d}-{experiment.name}"
    command = build_command(experiment, args, output_dir, seed, load_model)
    print(f"\n=== {experiment.name} ===", flush=True)
    print("load_model:", load_model or "<fresh>", flush=True)
    print("output_dir:", output_dir, flush=True)
    print("command:", " ".join(command), flush=True)
    subprocess.run(command, check=True)

    summary_path = output_dir / "rocofight_maskppo_summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    row = flatten_summary(experiment.name, seed, output_dir, summary)
    best_model = summary.get("best_mean_model")
    candidate_model = Path(best_model) if best_model else output_dir / "rocofight_maskppo_model.zip"
    return row, candidate_model


def main() -> None:
    args = parse_args()
    plan = default_plan()
    if args.smoke:
        plan = [
            Experiment(
                name="runner-smoke",
                matchup_mode="random-roster",
                opponent_policy="expert-script",
                total_timesteps=512,
                eval_every=512,
                eval_episodes=2,
                eval_suite_episodes=2,
                learning_rate=2e-4,
                ent_coef=0.03,
                reward_profile="competitive",
                load_from="base",
            )
        ]
        args.time_budget_min = 10

    args.output_root.mkdir(parents=True, exist_ok=True)
    leaderboard_path = args.output_root / "leaderboard.csv"
    base_model = resolve_base_model(args)
    best_model = base_model
    previous_model = base_model
    best_score = float("-inf")
    rows: list[dict[str, Any]] = []
    start = time.monotonic()
    deadline = start + args.time_budget_min * 60

    print("base_model:", base_model or "<fresh>", flush=True)
    print("time_budget_min:", args.time_budget_min, flush=True)

    for run_index, experiment in enumerate(plan, start=1):
        if time.monotonic() >= deadline:
            print("Time budget reached before next experiment.", flush=True)
            break

        if experiment.load_from == "base":
            load_model = base_model
        elif experiment.load_from == "previous":
            load_model = previous_model
        elif experiment.load_from == "none":
            load_model = None
        else:
            load_model = best_model
        row, candidate_model = run_experiment(
            experiment,
            args,
            run_index,
            load_model,
        )
        previous_model = candidate_model
        rows.append(row)
        if row["score"] > best_score:
            best_score = row["score"]
            best_model = candidate_model
        write_leaderboard(leaderboard_path, rows)
        print(
            "result:",
            json.dumps(
                {
                    "name": row["name"],
                    "score": row["score"],
                    "win_rate": row["win_rate"],
                    "wins": row["wins"],
                    "losses": row["losses"],
                    "draws": row["draws"],
                    "expert_win_rate": row["expert-script_win_rate"],
                    "best_model": str(best_model) if best_model else None,
                },
                ensure_ascii=False,
            ),
            flush=True,
        )

    write_leaderboard(leaderboard_path, rows)
    print("\nDone.", flush=True)
    print("leaderboard:", leaderboard_path, flush=True)
    print("best_model:", best_model, flush=True)


if __name__ == "__main__":
    main()
