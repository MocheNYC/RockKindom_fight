from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

import gymnasium as gym
import numpy as np
import torch as th
import torch.nn.functional as F
from gymnasium import spaces
from sb3_contrib import MaskablePPO

PYTHON_DIR = Path(__file__).resolve().parent
if str(PYTHON_DIR) not in sys.path:
    sys.path.insert(0, str(PYTHON_DIR))

from train_rocofight_maskable_ppo import (  # noqa: E402
    ACTION_DIM,
    ACTIVATION_FNS,
    RocoFightStructuredExtractor,
    constant_schedule,
    parse_net_arch,
)


class ExpertDatasetEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, observation_dim: int) -> None:
        super().__init__()
        self.action_space = spaces.Discrete(ACTION_DIM)
        self.observation_space = spaces.Box(
            low=0.0,
            high=1.0,
            shape=(observation_dim,),
            dtype=np.float32,
        )

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        return np.zeros(self.observation_space.shape, dtype=np.float32), {}

    def step(self, action: int):
        return (
            np.zeros(self.observation_space.shape, dtype=np.float32),
            0.0,
            False,
            False,
            {},
        )

    def action_masks(self) -> np.ndarray:
        return np.ones(ACTION_DIM, dtype=bool)


def batch_accuracy(
    model: MaskablePPO,
    observations: np.ndarray,
    masks: np.ndarray,
    actions: np.ndarray,
    *,
    batch_size: int,
) -> dict[str, Any]:
    device = model.policy.device
    correct = 0
    total = 0
    per_action_correct = np.zeros(ACTION_DIM, dtype=np.int64)
    per_action_total = np.zeros(ACTION_DIM, dtype=np.int64)

    model.policy.set_training_mode(False)
    with th.no_grad():
        for start in range(0, len(actions), batch_size):
            end = min(len(actions), start + batch_size)
            obs = th.as_tensor(observations[start:end], device=device)
            mask = th.as_tensor(masks[start:end], dtype=th.bool, device=device)
            target = th.as_tensor(actions[start:end], dtype=th.long, device=device)
            logits = policy_logits(model, obs)
            logits = logits.masked_fill(~mask, -1e9)
            pred = logits.argmax(dim=1)
            matches = pred.eq(target)
            correct += int(matches.sum().item())
            total += int(target.numel())
            for action in range(ACTION_DIM):
                action_mask = target.eq(action)
                per_action_total[action] += int(action_mask.sum().item())
                per_action_correct[action] += int((matches & action_mask).sum().item())

    recalls = [
        float(per_action_correct[action] / per_action_total[action])
        if per_action_total[action]
        else None
        for action in range(ACTION_DIM)
    ]
    return {
        "accuracy": correct / max(1, total),
        "correct": correct,
        "total": total,
        "per_action_recall": recalls,
        "per_action_total": per_action_total.tolist(),
    }


def policy_logits(model: MaskablePPO, obs: th.Tensor) -> th.Tensor:
    features = model.policy.extract_features(obs)
    if isinstance(features, tuple):
        pi_features = features[0]
    else:
        pi_features = features
    latent_pi, _latent_vf = model.policy.mlp_extractor(pi_features)
    return model.policy.action_net(latent_pi)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-5)
    parser.add_argument("--seed", type=int, default=20260502)
    parser.add_argument("--load-model", type=Path, default=None)
    parser.add_argument("--feature-extractor", choices=["mlp", "structured"], default="structured")
    parser.add_argument("--net-arch", default="256,256")
    parser.add_argument("--activation-fn", choices=sorted(ACTIVATION_FNS), default="silu")
    parser.add_argument("--structured-features-dim", type=int, default=384)
    parser.add_argument("--structured-slot-dim", type=int, default=96)
    args = parser.parse_args()

    th.manual_seed(args.seed)
    np.random.seed(args.seed)
    data = np.load(args.dataset)
    observations = data["observations"].astype(np.float32)
    masks = data["masks"].astype(bool)
    actions = data["actions"].astype(np.int64)
    train_indices = data["train_indices"]
    valid_indices = data["valid_indices"]
    test_indices = data["test_indices"]

    env = ExpertDatasetEnv(observations.shape[1])
    policy_kwargs: dict[str, Any] = {
        "net_arch": parse_net_arch(args.net_arch),
        "activation_fn": ACTIVATION_FNS[args.activation_fn],
        "ortho_init": True,
    }
    if args.feature_extractor == "structured":
        policy_kwargs.update(
            {
                "features_extractor_class": RocoFightStructuredExtractor,
                "features_extractor_kwargs": {
                    "features_dim": args.structured_features_dim,
                    "slot_dim": args.structured_slot_dim,
                },
            }
        )

    if args.load_model is not None:
        model = MaskablePPO.load(args.load_model, env=env, device="cpu")
    else:
        model = MaskablePPO(
            "MlpPolicy",
            env,
            gamma=0.95,
            learning_rate=constant_schedule(args.learning_rate),
            n_steps=256,
            batch_size=64,
            seed=args.seed,
            verbose=0,
            device="cpu",
            policy_kwargs=policy_kwargs,
        )
    optimizer = th.optim.AdamW(
        model.policy.parameters(),
        lr=args.learning_rate,
        weight_decay=args.weight_decay,
    )
    device = model.policy.device
    rng = np.random.default_rng(args.seed)
    history: list[dict[str, Any]] = []
    best_valid = -1.0
    args.output_dir.mkdir(parents=True, exist_ok=True)
    best_model = args.output_dir / "expert_bc_best_model.zip"

    for epoch in range(1, args.epochs + 1):
        model.policy.set_training_mode(True)
        shuffled = np.array(train_indices, copy=True)
        rng.shuffle(shuffled)
        losses: list[float] = []
        for start in range(0, len(shuffled), args.batch_size):
            batch = shuffled[start : start + args.batch_size]
            obs = th.as_tensor(observations[batch], device=device)
            mask = th.as_tensor(masks[batch], dtype=th.bool, device=device)
            target = th.as_tensor(actions[batch], dtype=th.long, device=device)
            logits = policy_logits(model, obs).masked_fill(~mask, -1e9)
            loss = F.cross_entropy(logits, target)
            optimizer.zero_grad()
            loss.backward()
            th.nn.utils.clip_grad_norm_(model.policy.parameters(), 1.0)
            optimizer.step()
            losses.append(float(loss.item()))

        valid = batch_accuracy(
            model,
            observations[valid_indices],
            masks[valid_indices],
            actions[valid_indices],
            batch_size=args.batch_size,
        )
        row = {
            "epoch": epoch,
            "loss": float(np.mean(losses)) if losses else 0.0,
            "valid_accuracy": valid["accuracy"],
        }
        history.append(row)
        print(
            f"epoch={epoch:03d} loss={row['loss']:.4f} "
            f"valid_accuracy={row['valid_accuracy']:.4f}",
            flush=True,
        )
        if valid["accuracy"] > best_valid:
            best_valid = float(valid["accuracy"])
            model.save(best_model)

    final_model = args.output_dir / "expert_bc_final_model.zip"
    model.save(final_model)
    best_loaded = MaskablePPO.load(best_model, device="cpu")
    final_loaded = MaskablePPO.load(final_model, device="cpu")
    summary = {
        "dataset": str(args.dataset),
        "samples": int(len(actions)),
        "train_samples": int(len(train_indices)),
        "valid_samples": int(len(valid_indices)),
        "test_samples": int(len(test_indices)),
        "feature_extractor": args.feature_extractor,
        "load_model": str(args.load_model) if args.load_model is not None else None,
        "best_model": str(best_model),
        "final_model": str(final_model),
        "history": history,
        "best_valid_accuracy": best_valid,
        "best_test": batch_accuracy(
            best_loaded,
            observations[test_indices],
            masks[test_indices],
            actions[test_indices],
            batch_size=args.batch_size,
        ),
        "final_test": batch_accuracy(
            final_loaded,
            observations[test_indices],
            masks[test_indices],
            actions[test_indices],
            batch_size=args.batch_size,
        ),
    }
    summary_path = args.output_dir / "expert_bc_summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
