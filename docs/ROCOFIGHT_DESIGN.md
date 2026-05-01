# RocoFight Design

## Design Goals

RocoFight should reproduce battles through a deterministic, inspectable engine.
The engine must be independent from the RocoDex UI so that it can power tests,
batch simulations, replay tools, and future interfaces.

## Boundaries

RocoDex owns:

- Pet, skill, and attribute data import.
- Offline data packaging.
- Search and browsing UI.

RocoFight owns:

- Battle state.
- Turn order.
- Damage calculation.
- Energy cost and recovery.
- Battle logs.
- Future skill effect execution.

## Core Model

The first version uses one active combatant per side.

- `BattleState`: current turn, phase, combatants, winner, rules, and log.
- `Combatant`: active pet snapshot with HP, energy, level, base stats,
  constructed battle stats, and attributes.
- `BattleAction`: player intent for a turn.
- `BattleContext`: lookup maps for skills and attributes.
- `BattleLogEvent`: structured event stream for UI and replay validation.

The state should be treated as immutable by callers. Engine functions return a
new state instead of mutating the input object.

## Effect Model

Combatants carry an `effects` object:

- `statModifiers`: percent-based stat changes with optional turn duration.
- `damageReductions`: incoming damage multipliers with hit and optional turn
  duration.
- `statuses`: persistent status effects with stacks, optional turn duration,
  optional end-turn damage, and optional stat multipliers.

The engine resolves end-turn processing after both actions:

- energy recovery;
- status damage;
- duration ticking;
- `turn_ended` log emission.

## Stat Construction

RocoDex pet stats are treated as base stats. RocoFight constructs battle stats
when a combatant enters battle.

The current provisional formula uses level 60 as the reference level. The
calibration targets are post-nature battle panels, because Roco battle builds
usually discuss the stat that the nature is boosting.

```text
trainedBase = baseStat + individual + floor(effort / 4)
levelScale = level / 60

neutralHp = (trainedBase * 2.5 + 100) * levelScale
neutralBattleStat = trainedBase * 2.5 * levelScale
neutralSpeed = (trainedBase * 5/3 + 50/3) * levelScale

finalStat = floor(neutralStat * natureMultiplier)
```

Defaults:

- `level`: 60
- `individual`: 0
- `effort`: 0
- `natureMultiplier`: 1.2 for the increased stat, 0.9 for the decreased stat,
  otherwise 1.0

The individual and effort fields exist as rule inputs. Nature exists as a
per-combatant input so each side can use a different build. The default engine
does not add hidden training values until those mechanics are verified.

Calibration anchor:

- A 120 physical-attack base stat becomes 300 attack when neutral, and 360
  attack with a physical-attack-increasing nature.
- A 120 speed base stat becomes 216 speed when neutral, and 260 speed with a
  speed-increasing nature.
- A 140 HP base stat becomes 450 HP when neutral, and 540 HP with an
  HP-increasing nature.
- An 80 HP base stat becomes 300 HP when neutral.
- A 110 physical-defense base stat becomes 275 defense when neutral, and 330
  defense with a physical-defense-increasing nature.
- A 400-power physical skill from a 120 physical-attack attacker with a
  physical-attack-increasing nature defeats an 80 HP / 110 physical-defense
  defender with a physical-defense-increasing nature in one hit under the
  baseline damage formula.

## Baseline Damage Formula

The current baseline formula is intentionally provisional:

```text
raw = (((2 * level / 5 + 2) * power * attack / defense) / damageDivisor) + baseDamage
damage = floor(raw * sameAttributeBonus * attributeMultiplier * randomFactor)
```

Defaults:

- `level`: 60
- `baseDamage`: 2
- `sameAttributeBonus`: 1.5
- `damageDivisor`: 30
- `randomFactor`: 1.0
- `minDamage`: 1 for damaging skills
- `energyRecoveryPerTurn`: 1

This gives the simulator a stable starting point while leaving room to replace
the formula when verified game rules are available.

## Attribute Multiplier

The first version reads RocoDex attribute metadata and checks each defender
attribute:

- If the defender metadata marks the attacking attribute as `2.0`, multiply by 2.
- If it marks the attacking attribute as `0.5`, multiply by 0.5.
- Otherwise multiply by 1.

Dual-attribute defenders stack multipliers.

## Skill Effects

Skill effects are registered in `src/rocofight/effects.ts`. The registry is
declarative: it describes stat modifiers, damage reduction, drain, response
rules, and action priority. The engine executes those generic directives
instead of putting skill-specific branches in the turn loop.

Skills are classified into three battle action kinds:

- `attack`: physical or magical damaging skills.
- `defense`: defensive skills.
- `status`: non-damaging status skills.

`response` is resolved before turn order. A response succeeds only when the
skill's configured target action kind matches the opponent's selected action
kind for the same turn. A successful response grants response priority and can
enable extra benefits. A failed response falls back to normal priority and does
not grant the response-only benefit.

The current implemented set is:

- `暗突袭`: responds to status actions. On successful response, it acts with
  response priority and doubles power. It also drains 50% of dealt damage.
- `力量增效`: adds a persistent physical attack +100% modifier.
- `魔法增效`: adds a persistent magical attack +70% modifier.
- `防御`: responds to attack actions. On successful response, it acts with
  response priority and reduces the next incoming damaging hit to 30%.

The first engine uses the following base skill fields:

- Skill name.
- Attribute.
- Category.
- Energy.
- Power.

Future work should add a rule registry:

```text
effect id -> trigger -> condition -> operation
```

Unknown effects must stay visible, not silently treated as fully implemented.
Unregistered non-basic effect text is logged as `effect_unimplemented`.

## Replay Strategy

A replay should contain:

- Initial combatants.
- Rule set.
- Ordered turn actions.
- Expected structured log or final state.

This allows real battle evidence to become regression tests.

Implemented replay tooling lives in `src/rocofight/replay.ts`.

Replay validation supports:

- pet lookup by key, Chinese name, English name, or id;
- initial HP and energy overrides;
- rule overrides;
- ordered turn actions;
- winner, phase, turn, HP, energy, and log expectations.

## Skill Audit

Skill audit tooling lives in `scripts/audit-skill-effects.mjs`.

It reads `public/data/dex-bundle.json`, classifies all skill effect text by
mechanic keywords, compares them against the current effect registry, and writes:

- `docs/rocofight-skill-audit.json`
- `docs/ROCOFIGHT_SKILL_AUDIT.md`

This report is the queue for future grouped mechanic work.
