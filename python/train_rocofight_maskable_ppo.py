"""Train MaskablePPO on a compact RocoFight-style 6v6 battle environment.

This script is the first deployable bridge between the existing SB3-Contrib
MaskablePPO demo and the RocoFight engine design:

- fixed Discrete(10) action space
- action mask for 4 skills, focus, and 5 switch actions
- one learner team against a deterministic scripted opponent
- CSV, PNG, model, rollout, and summary outputs matching the existing demos

The battle rules here are intentionally compact. They are not a replacement for
the TypeScript RocoFight engine; they are a trainable Python smoke environment
that proves the MaskablePPO workflow before the full 6v6 engine wrapper lands.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import gymnasium as gym
import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import torch as th
import torch.nn as nn
from gymnasium import spaces
from sb3_contrib import MaskablePPO
from sb3_contrib.common.maskable.evaluation import evaluate_policy
from sb3_contrib.common.maskable.utils import get_action_masks
from stable_baselines3.common.torch_layers import BaseFeaturesExtractor
from stable_baselines3.common.vec_env import DummyVecEnv


TEAM_SIZE = 6
ACTION_DIM = 10
SKILL_ACTIONS = range(4)
FOCUS_ACTION = 4
SWITCH_START = 5
MAX_ENERGY = 10
SLOT_FEATURES = 5
OBS_DIM = TEAM_SIZE * SLOT_FEATURES * 2 + 3
ENGINE_OBS_DIM = 693
ENGINE_COMBATANT_FEATURES = 10
ENGINE_SKILL_SUMMARY_FEATURES = 8
ENGINE_ACTIVE_SKILL_FEATURES = 13
ENGINE_SWITCH_ACTION_FEATURES = 12
ENGINE_RECENT_ACTION_FEATURES = ACTION_DIM
ENGINE_MISC_FEATURES = 5
ENGINE_SLOT_COUNT = TEAM_SIZE * 2
ENGINE_SWITCH_ACTION_COUNT = TEAM_SIZE - 1
ENGINE_OPPONENT_POLICIES = (
    "greedy-best",
    "cycle-skills",
    "random-legal",
    "basic-pool",
)
REWARD_PROFILES = ("dense", "potential", "terminal")
ACTIVATION_FNS = {
    "tanh": nn.Tanh,
    "relu": nn.ReLU,
    "silu": nn.SiLU,
}


@dataclass(frozen=True)
class Skill:
    name: str
    power: int
    cost: int
    priority: int = 0
    heal_ratio: float = 0.0
    attack_boost: float = 0.0


@dataclass(frozen=True)
class Pet:
    name: str
    max_hp: int
    attack: int
    defense: int
    speed: int
    skills: tuple[Skill, Skill, Skill, Skill]


@dataclass
class RuntimePet:
    spec: Pet
    hp: int
    energy: int = MAX_ENERGY
    attack_stage: float = 1.0

    @property
    def alive(self) -> bool:
        return self.hp > 0


class RocoFightStructuredExtractor(BaseFeaturesExtractor):
    """Slot-aware feature extractor for the engine observation."""

    def __init__(
        self,
        observation_space: spaces.Box,
        features_dim: int = 256,
        slot_dim: int = 64,
    ) -> None:
        super().__init__(observation_space, features_dim)
        slot_input_dim = ENGINE_COMBATANT_FEATURES + 4 * ENGINE_SKILL_SUMMARY_FEATURES
        active_input_dim = (
            2 * 4 * ENGINE_ACTIVE_SKILL_FEATURES
            + ENGINE_SWITCH_ACTION_COUNT * ENGINE_SWITCH_ACTION_FEATURES
            + 2 * ENGINE_RECENT_ACTION_FEATURES
            + ENGINE_MISC_FEATURES
        )
        self.slot_count = ENGINE_SLOT_COUNT
        self.combatant_end = self.slot_count * ENGINE_COMBATANT_FEATURES
        self.skill_end = self.combatant_end + (
            self.slot_count * 4 * ENGINE_SKILL_SUMMARY_FEATURES
        )
        self.active_end = self.skill_end + (
            2 * 4 * ENGINE_ACTIVE_SKILL_FEATURES
            + ENGINE_SWITCH_ACTION_COUNT * ENGINE_SWITCH_ACTION_FEATURES
            + 2 * ENGINE_RECENT_ACTION_FEATURES
        )
        self.slot_encoder = nn.Sequential(
            nn.Linear(slot_input_dim, slot_dim),
            nn.SiLU(),
            nn.LayerNorm(slot_dim),
            nn.Linear(slot_dim, slot_dim),
            nn.SiLU(),
        )
        self.head = nn.Sequential(
            nn.Linear(self.slot_count * slot_dim + active_input_dim, features_dim),
            nn.SiLU(),
            nn.LayerNorm(features_dim),
        )

    def forward(self, observations: th.Tensor) -> th.Tensor:
        combatants = observations[:, : self.combatant_end].reshape(
            -1,
            self.slot_count,
            ENGINE_COMBATANT_FEATURES,
        )
        skill_summaries = observations[:, self.combatant_end : self.skill_end].reshape(
            -1,
            self.slot_count,
            4 * ENGINE_SKILL_SUMMARY_FEATURES,
        )
        active_and_misc = observations[:, self.skill_end : self.active_end + ENGINE_MISC_FEATURES]
        slot_features = th.cat([combatants, skill_summaries], dim=-1)
        slot_embeddings = self.slot_encoder(slot_features).flatten(start_dim=1)
        return self.head(th.cat([slot_embeddings, active_and_misc], dim=1))


def make_default_teams() -> tuple[list[Pet], list[Pet]]:
    """Return a fixed 6v6 matchup based on the current PvP roster.

    Names are ASCII aliases on purpose so the training script remains stable
    across Windows console encodings. The TypeScript database keeps the Chinese
    display names and richer move/passive data.
    """

    learner = [
        Pet(
            "papasika",
            362,
            360,
            260,
            235,
            (
                Skill("steel_flood", 160, 3),
                Skill("pour", 70, 3),
                Skill("super_candy", 160, 3),
                Skill("gear_torque", 80, 3),
            ),
        ),
        Pet(
            "shengyuyiwang",
            430,
            330,
            245,
            260,
            (
                Skill("water_blade", 115, 4),
                Skill("power_boost", 0, 1, attack_boost=1.0),
                Skill("flash_strike", 90, 4),
                Skill("wind_combo", 40, 0, priority=1),
            ),
        ),
        Pet(
            "xueyingwawa",
            403,
            250,
            260,
            180,
            (
                Skill("pure_heart", 0, 2, attack_boost=0.4),
                Skill("pass_the_drum", 0, 3, attack_boost=0.5),
                Skill("ice_wall", 0, 2, priority=1),
                Skill("blizzard", 85, 3),
            ),
        ),
        Pet(
            "cuidingfuren",
            390,
            310,
            235,
            220,
            (
                Skill("water_blade", 115, 4),
                Skill("power_boost", 0, 1, attack_boost=1.0),
                Skill("water_ring", 0, 2, priority=1, heal_ratio=0.15),
                Skill("flying_feather", 40, 0, priority=1),
            ),
        ),
        Pet(
            "huangjiushijiu",
            360,
            300,
            220,
            255,
            (
                Skill("feather_speed", 0, 2, priority=1, attack_boost=0.2),
                Skill("gale_sting", 75, 2),
                Skill("prevention", 0, 1, priority=1),
                Skill("light_spear", 90, 3),
            ),
        ),
        Pet(
            "baijindujiaoshou",
            380,
            285,
            250,
            210,
            (
                Skill("refraction", 70, 4),
                Skill("bubble", 100, 3),
                Skill("pursuit", 90, 3),
                Skill("whirlwind_storm", 100, 3),
            ),
        ),
    ]

    opponent = [
        Pet(
            "qiqihou",
            399,
            300,
            330,
            185,
            (
                Skill("sand_trap", 80, 4),
                Skill("shadow_combo", 100, 3),
                Skill("listening_bridge", 0, 4, priority=1),
                Skill("flaw", 0, 1, attack_boost=0.7),
            ),
        ),
        Pet(
            "jushizhennie",
            495,
            360,
            230,
            170,
            (
                Skill("power_boost", 0, 1, attack_boost=1.0),
                Skill("ice_crack", 80, 2),
                Skill("devour", 150, 6, heal_ratio=0.2),
                Skill("ground_spike", 95, 3),
            ),
        ),
        Pet(
            "huajianchentishou",
            315,
            330,
            245,
            260,
            (
                Skill("preemptive", 55, 2, priority=1),
                Skill("power_boost", 0, 1, attack_boost=1.0),
                Skill("intercept_fist", 90, 3),
                Skill("roundhouse_kick", 80, 3),
            ),
        ),
        Pet(
            "jimiegulong",
            370,
            320,
            250,
            185,
            (
                Skill("falcon_scale", 140, 5),
                Skill("sneak_attack", 85, 3),
                Skill("scare_away", 0, 2, priority=1),
                Skill("spirit_drop", 0, 2, attack_boost=0.3),
            ),
        ),
        Pet(
            "mengyouyou",
            340,
            280,
            225,
            225,
            (
                Skill("soul_hook", 0, 1, attack_boost=0.2),
                Skill("medium", 100, 3),
                Skill("control", 0, 1, priority=1),
                Skill("backstab", 120, 2),
            ),
        ),
        Pet(
            "heimaowushi",
            335,
            295,
            215,
            240,
            (
                Skill("pain_crave", 0, 2, priority=1, attack_boost=0.4),
                Skill("feather_speed", 0, 2, priority=1, attack_boost=0.2),
                Skill("flurry", 125, 4),
                Skill("midnight_noise", 100, 4),
            ),
        ),
    ]
    return learner, opponent


class RocoFightMaskablePPOEnv(gym.Env):
    metadata = {"render_modes": []}

    def __init__(self, *, max_turns: int = 160, seed: int | None = None) -> None:
        super().__init__()
        self.action_space = spaces.Discrete(ACTION_DIM)
        self.observation_space = spaces.Box(
            low=0.0,
            high=1.0,
            shape=(OBS_DIM,),
            dtype=np.float32,
        )
        self.max_turns = max_turns
        self.rng = np.random.default_rng(seed)
        self.learner_specs, self.opponent_specs = make_default_teams()
        self.learner: list[RuntimePet] = []
        self.opponent: list[RuntimePet] = []
        self.learner_active = 0
        self.opponent_active = 0
        self.turn = 0
        self.invalid_selected = 0
        self.last_events: list[str] = []

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        super().reset(seed=seed)
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        self.learner = [RuntimePet(spec, spec.max_hp) for spec in self.learner_specs]
        self.opponent = [RuntimePet(spec, spec.max_hp) for spec in self.opponent_specs]
        self.learner_active = 0
        self.opponent_active = 0
        self.turn = 0
        self.invalid_selected = 0
        self.last_events = ["battle_started"]
        return self._obs(), self._info()

    def action_masks(self) -> np.ndarray:
        return self._action_mask(self.learner, self.learner_active)

    def step(self, action: int) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        self.turn += 1
        self.last_events = []
        reward = 0.0
        terminated = False
        truncated = False

        learner_mask = self.action_masks()
        if action < 0 or action >= ACTION_DIM or not bool(learner_mask[action]):
            self.invalid_selected += 1
            reward -= 2.0
            action = self._first_valid_action(learner_mask)

        opponent_action = self._choose_scripted_action()
        reward += self._resolve_actions(action, opponent_action)

        if self._all_fainted(self.opponent):
            reward += 10.0
            terminated = True
            self.last_events.append("learner_win")
        elif self._all_fainted(self.learner):
            reward -= 10.0
            terminated = True
            self.last_events.append("learner_loss")
        elif self.turn >= self.max_turns:
            truncated = True
            reward += self._hp_score_delta()
            self.last_events.append("turn_limit")

        return self._obs(), float(reward), terminated, truncated, self._info()

    def _resolve_actions(self, learner_action: int, opponent_action: int) -> float:
        learner_actor = self.learner_active
        opponent_actor = self.opponent_active
        learner_pet = self.learner[learner_actor]
        opponent_pet = self.opponent[opponent_actor]
        learner_priority = self._action_priority(learner_action, learner_pet)
        opponent_priority = self._action_priority(opponent_action, opponent_pet)

        learner_first = (
            learner_priority > opponent_priority
            or (
                learner_priority == opponent_priority
                and learner_pet.spec.speed >= opponent_pet.spec.speed
            )
        )

        reward = 0.0
        order = [
            ("learner", learner_action, learner_actor),
            ("opponent", opponent_action, opponent_actor),
        ]
        if not learner_first:
            order.reverse()

        for side, action, actor_index in order:
            if self._all_fainted(self.learner) or self._all_fainted(self.opponent):
                break
            if side == "learner":
                reward += self._apply_action(
                    self.learner,
                    self.opponent,
                    "learner",
                    action,
                    actor_index,
                )
            else:
                reward -= self._apply_action(
                    self.opponent,
                    self.learner,
                    "opponent",
                    action,
                    actor_index,
                )

        return reward

    def _apply_action(
        self,
        actor_team: list[RuntimePet],
        target_team: list[RuntimePet],
        side: str,
        action: int,
        actor_index: int,
    ) -> float:
        actor = actor_team[actor_index]
        if not actor.alive:
            self.last_events.append(f"{side}:skip:fainted")
            return 0.0

        target_index = self.opponent_active if side == "learner" else self.learner_active
        target = target_team[target_index]

        if action == FOCUS_ACTION:
            actor.energy = min(MAX_ENERGY, actor.energy + 3)
            self.last_events.append(f"{side}:focus")
            return 0.05

        if action >= SWITCH_START:
            switch_targets = self._switch_targets(actor_team, actor_index)
            switch_index = action - SWITCH_START
            if switch_index < len(switch_targets):
                if side == "learner":
                    self.learner_active = switch_targets[switch_index]
                else:
                    self.opponent_active = switch_targets[switch_index]
                self.last_events.append(f"{side}:switch:{switch_targets[switch_index]}")
            return -0.02

        skill = actor.spec.skills[action]
        actor.energy -= skill.cost
        if skill.attack_boost:
            actor.attack_stage = min(3.0, actor.attack_stage + skill.attack_boost)
            self.last_events.append(f"{side}:{skill.name}:buff")
            return 0.08

        damage = self._damage(actor, target, skill)
        before = target.hp
        target.hp = max(0, target.hp - damage)
        actual_damage = before - target.hp
        actor.energy = min(MAX_ENERGY, actor.energy + 1)
        if skill.heal_ratio and actual_damage > 0:
            actor.hp = min(
                actor.spec.max_hp,
                actor.hp + int(actual_damage * skill.heal_ratio),
            )
        self.last_events.append(f"{side}:{skill.name}:damage={actual_damage}")

        reward = actual_damage / max(1, target.spec.max_hp)
        if target.hp <= 0:
            reward += 2.0
            target_side = "opponent" if side == "learner" else "learner"
            self.last_events.append(f"{side}:ko:{target.spec.name}")
            self._auto_replace(target_team, target_side)
        return reward

    def _damage(self, actor: RuntimePet, target: RuntimePet, skill: Skill) -> int:
        if skill.power <= 0:
            return 0
        attack = actor.spec.attack * actor.attack_stage
        raw = skill.power * attack / max(1, target.spec.defense)
        return max(1, int(raw))

    def _choose_scripted_action(self) -> int:
        active = self.opponent[self.opponent_active]
        mask = self._action_mask(self.opponent, self.opponent_active)

        if active.hp / active.spec.max_hp < 0.22:
            switch_actions = np.flatnonzero(mask[SWITCH_START:]).astype(int)
            if len(switch_actions) > 0:
                return int(SWITCH_START + switch_actions[0])

        best_action = FOCUS_ACTION
        best_score = -1
        for action in SKILL_ACTIONS:
            if not mask[action]:
                continue
            skill = active.spec.skills[action]
            score = skill.power + int(skill.attack_boost * 100)
            if score > best_score:
                best_action = action
                best_score = score
        if mask[best_action]:
            return int(best_action)
        return self._first_valid_action(mask)

    def _action_mask(self, team: list[RuntimePet], active_index: int) -> np.ndarray:
        mask = np.zeros(ACTION_DIM, dtype=bool)
        if self._all_fainted(team):
            return mask

        active = team[active_index]
        if active.alive:
            for action, skill in enumerate(active.spec.skills):
                mask[action] = active.energy >= skill.cost
            mask[FOCUS_ACTION] = active.energy < MAX_ENERGY

        switch_targets = self._switch_targets(team, active_index)
        for offset, _target in enumerate(switch_targets[:5]):
            mask[SWITCH_START + offset] = True

        if not mask.any() and active.alive:
            mask[FOCUS_ACTION] = True
        return mask

    def _switch_targets(self, team: list[RuntimePet], active_index: int) -> list[int]:
        return [
            index
            for index, pet in enumerate(team)
            if index != active_index and pet.alive
        ][:5]

    def _action_priority(self, action: int, active: RuntimePet) -> int:
        if action in SKILL_ACTIONS:
            return active.spec.skills[action].priority
        if action >= SWITCH_START:
            return 2
        return 0

    def _auto_replace(self, team: list[RuntimePet], target_side: str) -> None:
        active_index = (
            self.learner_active if target_side == "learner" else self.opponent_active
        )
        targets = self._switch_targets(team, active_index)
        if not targets:
            return
        if target_side == "learner":
            self.learner_active = targets[0]
        else:
            self.opponent_active = targets[0]

    def _first_valid_action(self, mask: np.ndarray) -> int:
        valid = np.flatnonzero(mask)
        return int(valid[0]) if len(valid) else FOCUS_ACTION

    def _all_fainted(self, team: list[RuntimePet]) -> bool:
        return not any(pet.alive for pet in team)

    def _hp_score_delta(self) -> float:
        learner_hp = sum(pet.hp / pet.spec.max_hp for pet in self.learner)
        opponent_hp = sum(pet.hp / pet.spec.max_hp for pet in self.opponent)
        return float(learner_hp - opponent_hp)

    def _obs(self) -> np.ndarray:
        values: list[float] = []
        for team, active in (
            (self.learner, self.learner_active),
            (self.opponent, self.opponent_active),
        ):
            for index, pet in enumerate(team):
                values.extend(
                    [
                        1.0 if pet.alive else 0.0,
                        pet.hp / pet.spec.max_hp,
                        pet.energy / MAX_ENERGY,
                        min(1.0, pet.attack_stage / 3.0),
                        1.0 if index == active else 0.0,
                    ]
                )
        values.extend(
            [
                self.learner_active / 5.0,
                self.opponent_active / 5.0,
                min(1.0, self.turn / self.max_turns),
            ]
        )
        return np.asarray(values, dtype=np.float32)

    def _info(self) -> dict[str, Any]:
        return {
            "action_mask": self.action_masks().astype(np.int8),
            "turn": self.turn,
            "learner_active": self.learner[self.learner_active].spec.name,
            "opponent_active": self.opponent[self.opponent_active].spec.name,
            "invalid_selected": self.invalid_selected,
            "events": list(self.last_events),
        }


class RocoFightEngineBridgeEnv(gym.Env):
    """Gymnasium wrapper around the TypeScript TeamBattleState engine."""

    metadata = {"render_modes": []}

    def __init__(
        self,
        *,
        max_turns: int,
        seed: int,
        bridge_path: Path,
        rock_world_root: Path,
        hp_scale: float,
        matchup_mode: str,
        opponent_policy: str,
        player_team_id: str | None,
        opponent_team_id: str | None,
        reward_profile: str,
        reward_gamma: float,
        draw_penalty: float,
        observation_version: str,
        opponent_model_path: Path | None = None,
        opponent_deterministic: bool = True,
    ) -> None:
        super().__init__()
        if not bridge_path.exists():
            raise FileNotFoundError(
                f"RocoFight bridge not found: {bridge_path}. "
                "Run `npm.cmd run bridge:build` in the rock-fight project root first."
            )

        self.action_space = spaces.Discrete(ACTION_DIM)
        self.max_turns = max_turns
        self.seed_value = seed
        self.hp_scale = hp_scale
        self.matchup_mode = matchup_mode
        self.opponent_policy = opponent_policy
        self.player_team_id = player_team_id
        self.opponent_team_id = opponent_team_id
        self.reward_profile = reward_profile
        self.reward_gamma = reward_gamma
        self.draw_penalty = draw_penalty
        self.observation_version = observation_version
        self.opponent_model_path = opponent_model_path
        self.opponent_deterministic = opponent_deterministic
        self.opponent_model = (
            MaskablePPO.load(opponent_model_path, device="cpu")
            if opponent_model_path is not None
            else None
        )
        self.reset_count = 0
        self.request_id = 0
        self.proc = subprocess.Popen(
            ["node", str(bridge_path)],
            cwd=str(rock_world_root),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        self._last_mask = np.ones(ACTION_DIM, dtype=bool)
        self._last_opponent_observation: np.ndarray | None = None
        self._last_opponent_mask = np.ones(ACTION_DIM, dtype=bool)
        self._last_info: dict[str, Any] = {}
        self._bootstrap_reset = self._reset_bridge(seed=None)
        self.observation_space = spaces.Box(
            low=0.0,
            high=1.0,
            shape=self._bootstrap_reset[0].shape,
            dtype=np.float32,
        )

    def reset(
        self,
        *,
        seed: int | None = None,
        options: dict[str, Any] | None = None,
    ) -> tuple[np.ndarray, dict[str, Any]]:
        super().reset(seed=seed)
        if seed is None and self._bootstrap_reset is not None:
            result = self._bootstrap_reset
            self._bootstrap_reset = None
            return result
        self._bootstrap_reset = None
        return self._reset_bridge(seed=seed)

    def _reset_bridge(self, *, seed: int | None) -> tuple[np.ndarray, dict[str, Any]]:
        if seed is not None:
            self.seed_value = seed
            self.reset_count = 0
        episode_seed = self.seed_value + self.reset_count
        self.reset_count += 1
        response = self._request(
            {
                "cmd": "reset",
                "seed": episode_seed,
                "maxTurns": self.max_turns,
                "hpScale": self.hp_scale,
                "matchupMode": self.matchup_mode,
                "opponentPolicy": self.opponent_policy,
                "playerTeamId": self.player_team_id,
                "opponentTeamId": self.opponent_team_id,
                "rewardProfile": self.reward_profile,
                "rewardGamma": self.reward_gamma,
                "drawPenalty": self.draw_penalty,
                "observationVersion": self.observation_version,
            }
        )
        return self._decode_response(response)

    def action_masks(self) -> np.ndarray:
        return self._last_mask.astype(bool)

    def step(self, action: int) -> tuple[np.ndarray, float, bool, bool, dict[str, Any]]:
        payload: dict[str, Any] = {"cmd": "step", "action": int(action)}
        opponent_action = self._predict_opponent_action()
        if opponent_action is not None:
            payload["opponentAction"] = opponent_action
        response = self._request(payload)
        obs, info = self._decode_response(response)
        return (
            obs,
            float(response["reward"]),
            bool(response["terminated"]),
            bool(response["truncated"]),
            info,
        )

    def _predict_opponent_action(self) -> int | None:
        if self.opponent_model is None or self._last_opponent_observation is None:
            return None
        action, _states = self.opponent_model.predict(
            self._last_opponent_observation,
            action_masks=self._last_opponent_mask,
            deterministic=self.opponent_deterministic,
        )
        return int(action)

    def close(self) -> None:
        if getattr(self, "proc", None) is None:
            return
        if self.proc.poll() is None:
            try:
                if self.proc.stdin:
                    self.request_id += 1
                    self.proc.stdin.write(
                        json.dumps(
                            {"id": self.request_id, "cmd": "close"},
                            ensure_ascii=False,
                        )
                        + "\n"
                    )
                    self.proc.stdin.flush()
                self.proc.wait(timeout=2)
            except Exception:
                if self.proc.poll() is None:
                    self.proc.terminate()
        self.proc = None

    def _request(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self.proc.poll() is not None:
            stderr = self.proc.stderr.read() if self.proc.stderr else ""
            raise RuntimeError(f"RocoFight bridge exited early: {stderr}")
        if not self.proc.stdin or not self.proc.stdout:
            raise RuntimeError("RocoFight bridge pipes are unavailable")

        self.request_id += 1
        payload = {"id": self.request_id, **payload}
        self.proc.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        self.proc.stdin.flush()
        line = self.proc.stdout.readline()
        if not line:
            stderr = self.proc.stderr.read() if self.proc.stderr else ""
            raise RuntimeError(f"RocoFight bridge returned no data: {stderr}")
        response = json.loads(line)
        if not response.get("ok"):
            raise RuntimeError(f"RocoFight bridge error: {response.get('error')}")
        return response

    def _decode_response(self, response: dict[str, Any]) -> tuple[np.ndarray, dict[str, Any]]:
        obs = np.asarray(response["observation"], dtype=np.float32)
        mask = np.asarray(response["actionMask"], dtype=bool)
        opponent_obs = np.asarray(response["opponentObservation"], dtype=np.float32)
        opponent_mask = np.asarray(response["opponentActionMask"], dtype=bool)
        info = dict(response["info"])
        player = info.get("player", {})
        opponent = info.get("opponent", {})
        info["action_mask"] = mask.astype(np.int8)
        info["learner_active"] = player.get("activeName", "")
        info["opponent_active"] = opponent.get("activeName", "")
        info["invalid_selected"] = int(info.get("invalidSelected", 0))
        info["events"] = list(info.get("events", []))
        self._last_mask = mask
        self._last_opponent_observation = opponent_obs
        self._last_opponent_mask = opponent_mask
        self._last_info = info
        return obs, info


def make_env(
    max_turns: int,
    seed: int,
    *,
    backend: str,
    bridge_path: Path,
    rock_world_root: Path,
    hp_scale: float,
    matchup_mode: str,
    opponent_policy: str,
    player_team_id: str | None,
    opponent_team_id: str | None,
    reward_profile: str,
    reward_gamma: float,
    draw_penalty: float,
    observation_version: str,
    opponent_model_path: Path | None,
    opponent_deterministic: bool,
) -> gym.Env:
    if backend == "engine":
        return RocoFightEngineBridgeEnv(
            max_turns=max_turns,
            seed=seed,
            bridge_path=bridge_path,
            rock_world_root=rock_world_root,
            hp_scale=hp_scale,
            matchup_mode=matchup_mode,
            opponent_policy=opponent_policy,
            player_team_id=player_team_id,
            opponent_team_id=opponent_team_id,
            reward_profile=reward_profile,
            reward_gamma=reward_gamma,
            draw_penalty=draw_penalty,
            observation_version=observation_version,
            opponent_model_path=opponent_model_path,
            opponent_deterministic=opponent_deterministic,
        )
    return RocoFightMaskablePPOEnv(max_turns=max_turns, seed=seed)


def make_training_env(
    max_turns: int,
    seed: int,
    *,
    backend: str,
    bridge_path: Path,
    rock_world_root: Path,
    hp_scale: float,
    matchup_mode: str,
    opponent_policy: str,
    player_team_id: str | None,
    opponent_team_id: str | None,
    reward_profile: str,
    reward_gamma: float,
    draw_penalty: float,
    observation_version: str,
    opponent_model_path: Path | None,
    opponent_deterministic: bool,
    n_envs: int,
):
    if n_envs <= 1:
        return make_env(
            max_turns,
            seed,
            backend=backend,
            bridge_path=bridge_path,
            rock_world_root=rock_world_root,
            hp_scale=hp_scale,
            matchup_mode=matchup_mode,
            opponent_policy=opponent_policy,
            player_team_id=player_team_id,
            opponent_team_id=opponent_team_id,
            reward_profile=reward_profile,
            reward_gamma=reward_gamma,
            draw_penalty=draw_penalty,
            observation_version=observation_version,
            opponent_model_path=opponent_model_path,
            opponent_deterministic=opponent_deterministic,
        )

    def make_one(rank: int):
        return lambda: make_env(
            max_turns,
            seed + rank * 10_000,
            backend=backend,
            bridge_path=bridge_path,
            rock_world_root=rock_world_root,
            hp_scale=hp_scale,
            matchup_mode=matchup_mode,
            opponent_policy=opponent_policy,
            player_team_id=player_team_id,
            opponent_team_id=opponent_team_id,
            reward_profile=reward_profile,
            reward_gamma=reward_gamma,
            draw_penalty=draw_penalty,
            observation_version=observation_version,
            opponent_model_path=opponent_model_path,
            opponent_deterministic=opponent_deterministic,
        )

    return DummyVecEnv([make_one(rank) for rank in range(n_envs)])


def run_rollout(
    model: MaskablePPO,
    env: gym.Env,
    *,
    seed: int,
    max_steps: int,
) -> dict[str, Any]:
    obs, info = env.reset(seed=seed)
    steps = []
    total_reward = 0.0
    invalid_selected = 0
    action_histogram = [0 for _ in range(ACTION_DIM)]
    event_counts: dict[str, int] = {}
    final_info = info
    valid_action_counts: list[int] = []
    reward_components: dict[str, float] = {}

    for step_idx in range(max_steps):
        mask = np.asarray(get_action_masks(env), dtype=bool)
        valid_action_counts.append(int(mask.sum()))
        action, _states = model.predict(
            obs,
            action_masks=mask,
            deterministic=True,
        )
        action_int = int(action)
        selected_valid = bool(mask[action_int])
        invalid_selected += int(not selected_valid)
        action_histogram[action_int] += 1
        obs, reward, terminated, truncated, info = env.step(action_int)
        final_info = info
        total_reward += float(reward)
        raw_events = info.get("rawEvents", [])
        components = info.get("rewardComponents") or {}
        for name, value in components.items():
            if isinstance(value, (int, float)):
                reward_components[name] = reward_components.get(name, 0.0) + float(value)
        for event in raw_events:
            event_type = str(event.get("type", "unknown"))
            event_counts[event_type] = event_counts.get(event_type, 0) + 1

        steps.append(
            {
                "step": step_idx,
                "action": action_int,
                "valid_action_count": int(mask.sum()),
                "selected_action_valid": selected_valid,
                "reward": float(reward),
                "player_action": info.get("playerAction"),
                "opponent_action": info.get("opponentAction"),
                "opponent_policy": info.get("opponentPolicy"),
                "learner_active": info["learner_active"],
                "opponent_active": info["opponent_active"],
                "winner": info.get("winner"),
                "events": info["events"],
            }
        )
        if terminated or truncated:
            break

    return {
        "total_reward": total_reward,
        "steps": len(steps),
        "invalid_selected": invalid_selected,
        "action_histogram": action_histogram,
        "event_counts": event_counts,
        "reward_components": reward_components,
        "mean_valid_actions": float(np.mean(valid_action_counts))
        if valid_action_counts
        else 0.0,
        "min_valid_actions": int(min(valid_action_counts)) if valid_action_counts else 0,
        "winner": final_info.get("winner"),
        "opponent_policy": final_info.get("opponentPolicy"),
        "opponent_policy_label": final_info.get("opponentPolicyLabel"),
        "trace": steps,
    }


def parse_policy_list(value: str) -> list[str]:
    policies = [item.strip() for item in value.split(",") if item.strip()]
    unknown = [item for item in policies if item not in ENGINE_OPPONENT_POLICIES]
    if unknown:
        raise ValueError(f"Unknown opponent policies: {', '.join(unknown)}")
    return policies


def parse_net_arch(value: str) -> list[int]:
    layers = [int(item.strip()) for item in value.split(",") if item.strip()]
    if not layers or any(layer <= 0 for layer in layers):
        raise ValueError("--net-arch must contain positive layer sizes")
    return layers


def constant_schedule(value: float):
    return lambda _progress_remaining: value


def linear_schedule(initial_value: float):
    return lambda progress_remaining: progress_remaining * initial_value


def evaluate_opponent_suite(
    model: MaskablePPO,
    *,
    policies: list[str],
    episodes: int,
    max_turns: int,
    seed: int,
    backend: str,
    bridge_path: Path,
    rock_world_root: Path,
    hp_scale: float,
    matchup_mode: str,
    player_team_id: str | None,
    opponent_team_id: str | None,
    reward_profile: str,
    reward_gamma: float,
    draw_penalty: float,
    observation_version: str,
    opponent_model_path: Path | None = None,
    opponent_deterministic: bool = True,
) -> dict[str, Any]:
    suite: dict[str, Any] = {
        "episodes_per_policy": episodes,
        "policies": {},
        "aggregate": {
            "episodes": 0,
            "wins": 0,
            "losses": 0,
            "draws": 0,
            "invalid_selected": 0,
            "mean_reward": 0.0,
            "win_rate": 0.0,
        },
    }
    aggregate_rewards: list[float] = []

    for policy_index, policy in enumerate(policies):
        env = make_env(
            max_turns,
            seed + policy_index * 10_000,
            backend=backend,
            bridge_path=bridge_path,
            rock_world_root=rock_world_root,
            hp_scale=hp_scale,
            matchup_mode=matchup_mode,
            opponent_policy=policy,
            player_team_id=player_team_id,
            opponent_team_id=opponent_team_id,
            reward_profile=reward_profile,
            reward_gamma=reward_gamma,
            draw_penalty=draw_penalty,
            observation_version=observation_version,
            opponent_model_path=opponent_model_path,
            opponent_deterministic=opponent_deterministic,
        )
        rewards: list[float] = []
        action_histogram = [0 for _ in range(ACTION_DIM)]
        actual_policy_counts: dict[str, int] = {}
        wins = 0
        losses = 0
        draws = 0
        invalid_selected = 0
        total_steps = 0

        try:
            for episode in range(episodes):
                rollout = run_rollout(
                    model,
                    env,
                    seed=seed + policy_index * 10_000 + episode,
                    max_steps=max_turns,
                )
                rewards.append(float(rollout["total_reward"]))
                aggregate_rewards.append(float(rollout["total_reward"]))
                invalid_selected += int(rollout["invalid_selected"])
                total_steps += int(rollout["steps"])
                winner = rollout["winner"]
                if winner == "player":
                    wins += 1
                elif winner == "opponent":
                    losses += 1
                else:
                    draws += 1

                actual_policy = str(rollout.get("opponent_policy") or policy)
                actual_policy_counts[actual_policy] = (
                    actual_policy_counts.get(actual_policy, 0) + 1
                )
                for action, count in enumerate(rollout["action_histogram"]):
                    action_histogram[action] += int(count)
        finally:
            env.close()

        suite["policies"][policy] = {
            "episodes": episodes,
            "wins": wins,
            "losses": losses,
            "draws": draws,
            "win_rate": wins / max(1, episodes),
            "loss_rate": losses / max(1, episodes),
            "mean_reward": float(np.mean(rewards)) if rewards else 0.0,
            "std_reward": float(np.std(rewards)) if rewards else 0.0,
            "invalid_selected": invalid_selected,
            "mean_steps": total_steps / max(1, episodes),
            "actual_policy_counts": actual_policy_counts,
            "action_histogram": action_histogram,
        }

    aggregate = suite["aggregate"]
    for policy_result in suite["policies"].values():
        aggregate["episodes"] += int(policy_result["episodes"])
        aggregate["wins"] += int(policy_result["wins"])
        aggregate["losses"] += int(policy_result["losses"])
        aggregate["draws"] += int(policy_result["draws"])
        aggregate["invalid_selected"] += int(policy_result["invalid_selected"])

    aggregate["mean_reward"] = (
        float(np.mean(aggregate_rewards)) if aggregate_rewards else 0.0
    )
    aggregate["win_rate"] = aggregate["wins"] / max(1, aggregate["episodes"])
    return suite


def write_history(path: Path, rows: list[dict[str, float]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "timesteps",
                "mean_reward",
                "std_reward",
                "invalid_selected",
                "rollout_reward",
                "rollout_steps",
                "rollout_mean_valid_actions",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)


def plot_history(path: Path, rows: list[dict[str, float]]) -> None:
    plt.figure(figsize=(8, 4.5))
    plt.plot(
        [row["timesteps"] for row in rows],
        [row["mean_reward"] for row in rows],
        label="masked eval",
    )
    plt.xlabel("Training timesteps")
    plt.ylabel("Mean reward per episode")
    plt.title("RocoFight 6v6 MaskablePPO")
    plt.grid(alpha=0.25)
    plt.legend()
    plt.tight_layout()
    plt.savefig(path, dpi=160)
    plt.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--backend",
        choices=["engine", "smoke"],
        default="engine",
        help="engine uses the TypeScript RocoFight bridge; smoke uses the old Python-only toy rules.",
    )
    parser.add_argument("--total-timesteps", type=int, default=5000)
    parser.add_argument("--eval-every", type=int, default=1000)
    parser.add_argument("--eval-episodes", type=int, default=10)
    parser.add_argument("--seed", type=int, default=32)
    parser.add_argument("--max-turns", type=int, default=160)
    parser.add_argument("--hp-scale", type=float, default=0.7)
    parser.add_argument(
        "--matchup-mode",
        choices=["fixed", "random-roster"],
        default="fixed",
        help="engine backend only: fixed uses configured teams; random-roster samples 6v6 teams from the PvP database.",
    )
    parser.add_argument(
        "--opponent-policy",
        choices=["greedy-best", "cycle-skills", "random-legal", "basic-pool"],
        default="greedy-best",
        help="engine backend only: opponent policy or policy group sampled per episode.",
    )
    parser.add_argument(
        "--player-team-id",
        type=str,
        default=None,
        help="engine fixed matchup only: PVP team id for the learner side, e.g. wing-core.",
    )
    parser.add_argument(
        "--opponent-team-id",
        type=str,
        default=None,
        help="engine fixed matchup only: PVP team id for the scripted opponent side.",
    )
    parser.add_argument(
        "--opponent-model",
        type=Path,
        default=None,
        help="Optional frozen MaskablePPO .zip used as the engine opponent via opponent-side observations.",
    )
    parser.add_argument(
        "--opponent-stochastic",
        action="store_true",
        help="Sample actions from --opponent-model instead of using deterministic actions.",
    )
    parser.add_argument(
        "--reward-profile",
        choices=REWARD_PROFILES,
        default="potential",
        help="engine backend only: dense legacy reward, terminal sparse reward, or potential-based shaping.",
    )
    parser.add_argument(
        "--reward-gamma",
        type=float,
        default=None,
        help="Discount used by engine potential-based reward shaping. Defaults to --gamma.",
    )
    parser.add_argument(
        "--draw-penalty",
        type=float,
        default=6.0,
        help="Penalty applied when max-turn truncation ends near even HP. Use 0 to disable.",
    )
    parser.add_argument(
        "--observation-version",
        choices=["v1", "v2"],
        default="v1",
        help="engine backend only: v1 is the 613-dim stable layout; v2 adds action-aligned switch target features.",
    )
    parser.add_argument("--gamma", type=float, default=0.95)
    parser.add_argument("--learning-rate", type=float, default=3e-4)
    parser.add_argument(
        "--learning-rate-schedule",
        choices=["constant", "linear"],
        default="linear",
    )
    parser.add_argument("--ent-coef", type=float, default=0.01)
    parser.add_argument("--clip-range", type=float, default=0.2)
    parser.add_argument("--gae-lambda", type=float, default=0.95)
    parser.add_argument("--vf-coef", type=float, default=0.5)
    parser.add_argument("--max-grad-norm", type=float, default=0.5)
    parser.add_argument("--n-epochs", type=int, default=10)
    parser.add_argument("--target-kl", type=float, default=None)
    parser.add_argument(
        "--net-arch",
        type=str,
        default="256,256",
        help="Comma-separated MLP hidden sizes for new models, e.g. 256,256.",
    )
    parser.add_argument(
        "--activation-fn",
        choices=sorted(ACTIVATION_FNS),
        default="silu",
    )
    parser.add_argument(
        "--feature-extractor",
        choices=["mlp", "structured"],
        default="mlp",
        help="structured uses slot-aware v2 engine observation encoding; use only with new engine models.",
    )
    parser.add_argument("--structured-features-dim", type=int, default=256)
    parser.add_argument("--structured-slot-dim", type=int, default=64)
    parser.add_argument(
        "--no-ortho-init",
        action="store_true",
        help="Disable SB3 orthogonal initialization for newly created policies.",
    )
    parser.add_argument("--n-steps", type=int, default=256)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument(
        "--n-envs",
        type=int,
        default=1,
        help="Number of parallel training envs. Evaluation still uses single envs.",
    )
    parser.add_argument(
        "--load-model",
        type=Path,
        default=None,
        help="Optional existing MaskablePPO .zip to continue training.",
    )
    parser.add_argument(
        "--save-eval-checkpoints",
        action="store_true",
        help="Save model checkpoints after every eval point under output-dir/checkpoints.",
    )
    parser.add_argument(
        "--disable-best-models",
        action="store_true",
        help="Do not save best-mean and best-rollout checkpoint copies during training.",
    )
    parser.add_argument(
        "--eval-suite-policies",
        type=str,
        default="greedy-best,cycle-skills,random-legal,basic-pool",
        help="Comma-separated opponent policies for final deterministic suite evaluation.",
    )
    parser.add_argument(
        "--eval-suite-episodes",
        type=int,
        default=8,
        help="Episodes per policy for final suite evaluation.",
    )
    parser.add_argument(
        "--rock-world-root",
        type=Path,
        default=Path(
            os.environ.get(
                "ROCOFIGHT_ROOT",
                str(Path(__file__).resolve().parents[1]),
            )
        ),
    )
    parser.add_argument(
        "--engine-bridge",
        type=Path,
        default=None,
        help="Path to dist-node/rocofight-engine-bridge.mjs. Defaults under --rock-world-root.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "outputs",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    engine_bridge = (
        args.engine_bridge
        if args.engine_bridge is not None
        else args.rock_world_root / "dist-node" / "rocofight-engine-bridge.mjs"
    )
    reward_gamma = float(args.gamma if args.reward_gamma is None else args.reward_gamma)
    opponent_deterministic = not args.opponent_stochastic
    if args.feature_extractor == "structured" and args.observation_version != "v2":
        raise ValueError("--feature-extractor structured requires --observation-version v2")
    learning_rate = (
        constant_schedule(args.learning_rate)
        if args.learning_rate_schedule == "constant"
        else linear_schedule(args.learning_rate)
    )

    env = make_training_env(
        args.max_turns,
        args.seed,
        backend=args.backend,
        bridge_path=engine_bridge,
        rock_world_root=args.rock_world_root,
        hp_scale=args.hp_scale,
        matchup_mode=args.matchup_mode,
        opponent_policy=args.opponent_policy,
        player_team_id=args.player_team_id,
        opponent_team_id=args.opponent_team_id,
        reward_profile=args.reward_profile,
        reward_gamma=reward_gamma,
        draw_penalty=args.draw_penalty,
        observation_version=args.observation_version,
        opponent_model_path=args.opponent_model,
        opponent_deterministic=opponent_deterministic,
        n_envs=args.n_envs,
    )
    eval_env = make_env(
        args.max_turns,
        args.seed + 1,
        backend=args.backend,
        bridge_path=engine_bridge,
        rock_world_root=args.rock_world_root,
        hp_scale=args.hp_scale,
        matchup_mode=args.matchup_mode,
        opponent_policy=args.opponent_policy,
        player_team_id=args.player_team_id,
        opponent_team_id=args.opponent_team_id,
        reward_profile=args.reward_profile,
        reward_gamma=reward_gamma,
        draw_penalty=args.draw_penalty,
        observation_version=args.observation_version,
        opponent_model_path=args.opponent_model,
        opponent_deterministic=opponent_deterministic,
    )

    if args.load_model is not None:
        model = MaskablePPO.load(args.load_model, env=env, device="cpu")
        model.learning_rate = args.learning_rate
        model.lr_schedule = learning_rate
        model.ent_coef = args.ent_coef
        model.clip_range = constant_schedule(args.clip_range)
        model.gae_lambda = args.gae_lambda
        model.vf_coef = args.vf_coef
        model.max_grad_norm = args.max_grad_norm
        model.n_epochs = args.n_epochs
        model.target_kl = args.target_kl
    else:
        net_arch = parse_net_arch(args.net_arch)
        policy_kwargs = {
            "net_arch": net_arch,
            "activation_fn": ACTIVATION_FNS[args.activation_fn],
            "ortho_init": not args.no_ortho_init,
        }
        if args.feature_extractor == "structured":
            if args.backend != "engine":
                raise ValueError("--feature-extractor structured requires --backend engine")
            policy_kwargs.update(
                {
                    "features_extractor_class": RocoFightStructuredExtractor,
                    "features_extractor_kwargs": {
                        "features_dim": args.structured_features_dim,
                        "slot_dim": args.structured_slot_dim,
                    },
                }
            )
        model = MaskablePPO(
            "MlpPolicy",
            env,
            gamma=args.gamma,
            learning_rate=learning_rate,
            ent_coef=args.ent_coef,
            clip_range=args.clip_range,
            gae_lambda=args.gae_lambda,
            vf_coef=args.vf_coef,
            max_grad_norm=args.max_grad_norm,
            n_epochs=args.n_epochs,
            target_kl=args.target_kl,
            n_steps=args.n_steps,
            batch_size=args.batch_size,
            seed=args.seed,
            verbose=0,
            device="cpu",
            policy_kwargs=policy_kwargs,
        )

    history: list[dict[str, float]] = []
    checkpoint_dir = args.output_dir / "checkpoints"
    save_best_models = not args.disable_best_models
    if args.save_eval_checkpoints or save_best_models:
        checkpoint_dir.mkdir(parents=True, exist_ok=True)
    best_mean_reward = float("-inf")
    best_mean_model_path: Path | None = None
    best_rollout_reward = float("-inf")
    best_rollout_model_path: Path | None = None

    def record(timesteps: int) -> None:
        nonlocal best_mean_reward, best_mean_model_path
        nonlocal best_rollout_reward, best_rollout_model_path
        mean_reward, std_reward = evaluate_policy(
            model,
            eval_env,
            n_eval_episodes=args.eval_episodes,
            deterministic=True,
            warn=False,
        )
        rollout = run_rollout(
            model,
            eval_env,
            seed=args.seed + 100_000 + timesteps,
            max_steps=args.max_turns,
        )
        row = {
            "timesteps": float(timesteps),
            "mean_reward": float(mean_reward),
            "std_reward": float(std_reward),
            "invalid_selected": float(rollout["invalid_selected"]),
            "rollout_reward": float(rollout["total_reward"]),
            "rollout_steps": float(rollout["steps"]),
            "rollout_mean_valid_actions": float(rollout["mean_valid_actions"]),
        }
        history.append(row)
        print(
            f"timesteps={timesteps:5d} "
            f"mean_reward={row['mean_reward']:.2f} std={row['std_reward']:.2f} "
            f"rollout_reward={row['rollout_reward']:.2f} "
            f"steps={int(row['rollout_steps'])} "
            f"invalid_selected={int(row['invalid_selected'])}"
        )
        if args.save_eval_checkpoints:
            model.save(checkpoint_dir / f"step_{timesteps:08d}.zip")
        if save_best_models and mean_reward > best_mean_reward:
            best_mean_reward = float(mean_reward)
            best_mean_model_path = checkpoint_dir / "best_mean_model.zip"
            model.save(best_mean_model_path)
        if save_best_models and rollout["total_reward"] > best_rollout_reward:
            best_rollout_reward = float(rollout["total_reward"])
            best_rollout_model_path = checkpoint_dir / "best_rollout_model.zip"
            model.save(best_rollout_model_path)

    record(0)
    trained = 0
    while trained < args.total_timesteps:
        step_count = min(args.eval_every, args.total_timesteps - trained)
        model.learn(
            total_timesteps=step_count,
            reset_num_timesteps=False,
            progress_bar=False,
        )
        trained += step_count
        record(trained)

    history_path = args.output_dir / "rocofight_maskppo_history.csv"
    curve_path = args.output_dir / "rocofight_maskppo_curve.png"
    model_path = args.output_dir / "rocofight_maskppo_model.zip"
    rollout_path = args.output_dir / "rocofight_maskppo_rollout.json"
    summary_path = args.output_dir / "rocofight_maskppo_summary.json"

    final_rollout = run_rollout(
        model,
        eval_env,
        seed=args.seed + 200_000,
        max_steps=args.max_turns,
    )
    model.save(model_path)
    loaded_model = MaskablePPO.load(model_path, env=eval_env, device="cpu")
    loaded_mean_reward, loaded_std_reward = evaluate_policy(
        loaded_model,
        eval_env,
        n_eval_episodes=args.eval_episodes,
        deterministic=True,
        warn=False,
    )
    eval_suite_policies = parse_policy_list(args.eval_suite_policies)
    eval_suite = evaluate_opponent_suite(
        loaded_model,
        policies=eval_suite_policies,
        episodes=args.eval_suite_episodes,
        max_turns=args.max_turns,
        seed=args.seed + 300_000,
        backend=args.backend,
        bridge_path=engine_bridge,
        rock_world_root=args.rock_world_root,
        hp_scale=args.hp_scale,
        matchup_mode=args.matchup_mode,
        player_team_id=args.player_team_id,
        opponent_team_id=args.opponent_team_id,
        reward_profile=args.reward_profile,
        reward_gamma=reward_gamma,
        draw_penalty=args.draw_penalty,
        observation_version=args.observation_version,
        opponent_model_path=args.opponent_model,
        opponent_deterministic=opponent_deterministic,
    )

    summary = {
        "algorithm": "MaskablePPO",
        "environment": (
            "RocoFightEngineBridgeEnv"
            if args.backend == "engine"
            else "RocoFightMaskablePPOEnv"
        ),
        "backend": args.backend,
        "engine_bridge": str(engine_bridge) if args.backend == "engine" else None,
        "rock_world_root": str(args.rock_world_root)
        if args.backend == "engine"
        else None,
        "action_space": "Discrete(10)",
        "action_mapping": {
            "0-3": "active pet skills",
            "4": "focus / gain energy, or wait while opponent must replace",
            "5-9": "switch to alive non-active teammate by sorted slot order",
        },
        "observation_dim": int(env.observation_space.shape[0]),
        "hp_scale": args.hp_scale,
        "matchup_mode": args.matchup_mode,
        "opponent_policy": args.opponent_policy,
        "player_team_id": args.player_team_id,
        "opponent_team_id": args.opponent_team_id,
        "opponent_model": str(args.opponent_model)
        if args.opponent_model is not None
        else None,
        "opponent_deterministic": opponent_deterministic,
        "reward_profile": args.reward_profile,
        "reward_gamma": reward_gamma,
        "draw_penalty": args.draw_penalty,
        "observation_version": args.observation_version,
        "max_turns": args.max_turns,
        "gamma": args.gamma,
        "learning_rate": args.learning_rate,
        "learning_rate_schedule": args.learning_rate_schedule,
        "ent_coef": args.ent_coef,
        "clip_range": args.clip_range,
        "gae_lambda": args.gae_lambda,
        "vf_coef": args.vf_coef,
        "max_grad_norm": args.max_grad_norm,
        "n_epochs": args.n_epochs,
        "target_kl": args.target_kl,
        "net_arch": args.net_arch,
        "activation_fn": args.activation_fn,
        "feature_extractor": args.feature_extractor,
        "structured_features_dim": args.structured_features_dim,
        "structured_slot_dim": args.structured_slot_dim,
        "ortho_init": not args.no_ortho_init,
        "n_envs": args.n_envs,
        "load_model": str(args.load_model) if args.load_model is not None else None,
        "save_eval_checkpoints": args.save_eval_checkpoints,
        "best_mean_reward": best_mean_reward if best_mean_model_path else None,
        "best_mean_model": str(best_mean_model_path) if best_mean_model_path else None,
        "best_rollout_reward": best_rollout_reward
        if best_rollout_model_path
        else None,
        "best_rollout_model": str(best_rollout_model_path)
        if best_rollout_model_path
        else None,
        "total_timesteps": args.total_timesteps,
        "eval_episodes": args.eval_episodes,
        "eval_suite_policies": eval_suite_policies,
        "eval_suite_episodes": args.eval_suite_episodes,
        "final_mean_reward": history[-1]["mean_reward"],
        "final_std_reward": history[-1]["std_reward"],
        "loaded_mean_reward": float(loaded_mean_reward),
        "loaded_std_reward": float(loaded_std_reward),
        "final_rollout_reward": final_rollout["total_reward"],
        "final_rollout_invalid_selected": final_rollout["invalid_selected"],
        "final_rollout_winner": final_rollout["winner"],
        "final_rollout_opponent_policy": final_rollout["opponent_policy"],
        "final_rollout_opponent_policy_label": final_rollout[
            "opponent_policy_label"
        ],
        "final_rollout_action_histogram": final_rollout["action_histogram"],
        "final_rollout_event_counts": final_rollout["event_counts"],
        "final_rollout_reward_components": final_rollout["reward_components"],
        "final_rollout_mean_valid_actions": final_rollout["mean_valid_actions"],
        "final_rollout_min_valid_actions": final_rollout["min_valid_actions"],
        "eval_suite": eval_suite,
    }

    write_history(history_path, history)
    plot_history(curve_path, history)
    rollout_path.write_text(
        json.dumps(final_rollout, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    summary_path.write_text(
        json.dumps(summary, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    env.close()
    eval_env.close()

    print("")
    print("Done.")
    print(f"history: {history_path}")
    print(f"curve:   {curve_path}")
    print(f"model:   {model_path}")
    print(f"rollout: {rollout_path}")
    print(f"summary: {summary_path}")
    print(
        "suite:   "
        f"win_rate={eval_suite['aggregate']['win_rate']:.2f} "
        f"wins={eval_suite['aggregate']['wins']}/"
        f"{eval_suite['aggregate']['episodes']} "
        f"invalid={eval_suite['aggregate']['invalid_selected']}"
    )


if __name__ == "__main__":
    main()
