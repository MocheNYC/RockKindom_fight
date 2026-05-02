from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

import numpy as np


ACTION_DIM = 10


def load_rows(paths: list[Path]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for path in paths:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    rows.append(json.loads(line))
    return rows


def split_indices(
    actions: np.ndarray,
    *,
    seed: int,
    valid_fraction: float,
    test_fraction: float,
) -> dict[str, np.ndarray]:
    rng = np.random.default_rng(seed)
    train_parts: list[np.ndarray] = []
    valid_parts: list[np.ndarray] = []
    test_parts: list[np.ndarray] = []

    for action in range(ACTION_DIM):
        indices = np.flatnonzero(actions == action)
        rng.shuffle(indices)
        test_count = int(round(len(indices) * test_fraction))
        valid_count = int(round(len(indices) * valid_fraction))
        test_parts.append(indices[:test_count])
        valid_parts.append(indices[test_count : test_count + valid_count])
        train_parts.append(indices[test_count + valid_count :])

    splits = {
        "train": np.concatenate(train_parts),
        "valid": np.concatenate(valid_parts),
        "test": np.concatenate(test_parts),
    }
    for values in splits.values():
        rng.shuffle(values)
    return splits


def action_histogram(actions: np.ndarray) -> list[int]:
    return [int((actions == action).sum()) for action in range(ACTION_DIM)]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", nargs="+", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260502)
    parser.add_argument("--valid-fraction", type=float, default=0.1)
    parser.add_argument("--test-fraction", type=float, default=0.1)
    args = parser.parse_args()

    rows = load_rows(args.input)
    if not rows:
        raise ValueError("No expert rows loaded")

    observations = np.asarray([row["observation"] for row in rows], dtype=np.float32)
    masks = np.asarray([row["actionMask"] for row in rows], dtype=bool)
    actions = np.asarray([row["action"] for row in rows], dtype=np.int64)

    if observations.ndim != 2:
        raise ValueError(f"observations must be 2D, got shape {observations.shape}")
    if masks.shape != (len(rows), ACTION_DIM):
        raise ValueError(f"action masks must be N x {ACTION_DIM}, got {masks.shape}")
    if actions.shape != (len(rows),):
        raise ValueError(f"actions must be N, got {actions.shape}")

    invalid_labels = int((~masks[np.arange(len(actions)), actions]).sum())
    zero_mask_rows = int((masks.sum(axis=1) == 0).sum())
    if invalid_labels:
        raise ValueError(f"Dataset contains {invalid_labels} invalid action labels")
    if zero_mask_rows:
        raise ValueError(f"Dataset contains {zero_mask_rows} zero-mask rows")

    splits = split_indices(
        actions,
        seed=args.seed,
        valid_fraction=args.valid_fraction,
        test_fraction=args.test_fraction,
    )

    args.output_dir.mkdir(parents=True, exist_ok=True)
    npz_path = args.output_dir / "expert_dataset.npz"
    np.savez_compressed(
        npz_path,
        observations=observations,
        masks=masks,
        actions=actions,
        train_indices=splits["train"],
        valid_indices=splits["valid"],
        test_indices=splits["test"],
    )

    side_counts = Counter(str(row["side"]) for row in rows)
    active_counts = Counter(str(row["active"]) for row in rows)
    source_counts = Counter(str(row.get("matchupMode", "unknown")) for row in rows)
    split_summary = {
        name: {
            "samples": int(len(indices)),
            "action_histogram": action_histogram(actions[indices]),
        }
        for name, indices in splits.items()
    }
    summary = {
        "dataset": str(npz_path),
        "inputs": [str(path) for path in args.input],
        "samples": int(len(rows)),
        "observation_dim": int(observations.shape[1]),
        "action_dim": ACTION_DIM,
        "invalid_labels": invalid_labels,
        "zero_mask_rows": zero_mask_rows,
        "action_histogram": action_histogram(actions),
        "mask_valid_action_mean": float(masks.sum(axis=1).mean()),
        "mask_valid_action_min": int(masks.sum(axis=1).min()),
        "side_counts": dict(side_counts),
        "source_counts": dict(source_counts),
        "top_active": active_counts.most_common(20),
        "splits": split_summary,
    }
    summary_path = args.output_dir / "expert_dataset_summary.json"
    summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
