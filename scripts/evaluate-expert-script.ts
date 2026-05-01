import { writeFileSync } from 'node:fs'
import { defaultDexData } from '../src/data/defaultData'
import { createBattleContext, getEffectiveStat } from '../src/rocofight/engine'
import {
  chooseExpertScriptAction,
  createExpertScriptMemory,
} from '../src/rocofight/expertScript'
import {
  createPvpCombatantInput,
  pvpPetEntries,
} from '../src/rocofight/pvp'
import {
  adjudicateTeamBattleByAliveCount,
  advanceTeamBattleTurn,
  chooseFirstLegalTeamAction,
  createTeamBattleState,
  getActiveCombatant,
  getSwitchTargets,
  isTeamBattleActionLegal,
  type TeamBattleAction,
  type TeamBattleState,
} from '../src/rocofight/team'
import type { BattleSide } from '../src/rocofight/types'

type ControlPolicy = 'greedy-best' | 'cycle-skills' | 'random-legal' | 'basic-pool'

type ControlMemory = {
  policy: Exclude<ControlPolicy, 'basic-pool'>
  skillCursorBySlot: number[]
}

type EpisodeResult = {
  winner: BattleSide | null
  turns: number
  playerAlive: number
  opponentAlive: number
}

const context = createBattleContext(defaultDexData)
const policies = [
  'greedy-best',
  'cycle-skills',
  'random-legal',
  'basic-pool',
] as const satisfies readonly ControlPolicy[]

const opponentPreferredSkills = [
  '吞噬',
  '地刺',
  '啮合传递',
  '齿轮扭矩',
  '钢铁洪流',
  '力量增效',
  '冰爪',
  '破绽',
  '乱打',
  '午夜噪音',
]

const args = parseArgs()
const allResults = {
  generatedAt: new Date().toISOString(),
  episodesPerPolicy: args.episodes,
  maxTurns: args.maxTurns,
  hpScale: args.hpScale,
  seed: args.seed,
  matchupMode: 'random-roster',
  playerPolicy: 'expert-script',
  policies: Object.fromEntries(
    policies.map((policy) => [policy, evaluatePolicy(policy)]),
  ),
}

if (args.output) {
  writeFileSync(args.output, JSON.stringify(allResults, null, 2), 'utf-8')
}

console.log(JSON.stringify(allResults, null, 2))

function evaluatePolicy(policy: ControlPolicy) {
  const results: EpisodeResult[] = []
  for (let episode = 0; episode < args.episodes; episode += 1) {
    results.push(runEpisode(policy, args.seed + episode * 997 + policy.length * 31))
  }

  const wins = results.filter((result) => result.winner === 'player').length
  const losses = results.filter((result) => result.winner === 'opponent').length
  const draws = results.filter((result) => result.winner === null).length
  return {
    episodes: results.length,
    wins,
    losses,
    draws,
    winRate: wins / results.length,
    lossRate: losses / results.length,
    drawRate: draws / results.length,
    meanTurns:
      results.reduce((total, result) => total + result.turns, 0) / results.length,
    meanPlayerAlive:
      results.reduce((total, result) => total + result.playerAlive, 0) /
      results.length,
    meanOpponentAlive:
      results.reduce((total, result) => total + result.opponentAlive, 0) /
      results.length,
  }
}

function runEpisode(policy: ControlPolicy, seed: number): EpisodeResult {
  const rng = createSeededRng(seed)
  let state = createRandomRosterState(rng)
  const expertMemory = createExpertScriptMemory()
  const controlMemory: ControlMemory = {
    policy: policy === 'basic-pool' ? resolveBasicPoolPolicy(rng) : policy,
    skillCursorBySlot: Array.from({ length: 6 }, () => 0),
  }

  while (state.phase !== 'ended' && state.turn < args.maxTurns) {
    const playerAction = chooseExpertScriptAction(
      state,
      context,
      'player',
      expertMemory,
    )
    const opponentAction = chooseControlAction(state, controlMemory, rng)
    state = advanceTeamBattleTurn(state, context, [playerAction, opponentAction])
    if (state.phase !== 'ended' && state.turn >= args.maxTurns) {
      state = adjudicateTeamBattleByAliveCount(state)
    }
  }

  return {
    winner: state.phase === 'ended' ? state.winner : null,
    turns: state.turn,
    playerAlive: countAlive(state, 'player'),
    opponentAlive: countAlive(state, 'opponent'),
  }
}

function createRandomRosterState(rng: () => number) {
  const entries = shuffle([...pvpPetEntries], rng)
  const state = createTeamBattleState({
    player: entries
      .slice(0, 6)
      .map((entry) => createPvpCombatantInput(entry, defaultDexData.pets)),
    opponent: entries
      .slice(6, 12)
      .map((entry) => createPvpCombatantInput(entry, defaultDexData.pets)),
    replacementMode: 'pending',
  })

  if (args.hpScale < 1) {
    for (const side of ['player', 'opponent'] as const) {
      for (const combatant of state.teams[side].combatants) {
        combatant.currentHp = Math.max(1, Math.ceil(combatant.maxHp * args.hpScale))
      }
    }
  }

  return state
}

function chooseControlAction(
  state: TeamBattleState,
  memory: ControlMemory,
  rng: () => number,
): TeamBattleAction {
  const pendingTarget = state.pendingSwitch.opponent
    ? getSwitchTargets(state, 'opponent')[0]
    : undefined
  if (pendingTarget !== undefined) {
    return { side: 'opponent', type: 'switch', targetSlot: pendingTarget }
  }

  if (state.pendingSwitch.player) return { side: 'opponent', type: 'wait' }

  if (memory.policy === 'cycle-skills') return chooseCycleSkillAction(state, memory)
  if (memory.policy === 'random-legal') return chooseRandomLegalAction(state, rng)

  const active = getActiveCombatant(state, 'opponent')
  const hpRatio = active.maxHp > 0 ? active.currentHp / active.maxHp : 0
  const switchTarget = getSwitchTargets(state, 'opponent')[0]
  if (hpRatio > 0 && hpRatio < 0.18 && switchTarget !== undefined) {
    return { side: 'opponent', type: 'switch', targetSlot: switchTarget }
  }

  return (
    chooseBestSkillAction(state, 'opponent') ??
    chooseFirstLegalTeamAction(
      state,
      context,
      'opponent',
      opponentPreferredSkills,
    ) ??
    { side: 'opponent', type: 'wait' }
  )
}

function chooseCycleSkillAction(
  state: TeamBattleState,
  memory: ControlMemory,
): TeamBattleAction {
  const activeSlot = state.teams.opponent.activeSlot
  const skillSlot = memory.skillCursorBySlot[activeSlot] % 4
  const action = { side: 'opponent', type: 'skill', skillSlot } as const
  if (isTeamBattleActionLegal(state, context, action).legal) {
    memory.skillCursorBySlot[activeSlot] =
      (memory.skillCursorBySlot[activeSlot] + 1) % 4
    return action
  }

  const focus = { side: 'opponent', type: 'focus' } as const
  if (isTeamBattleActionLegal(state, context, focus).legal) return focus

  for (let slot = 0; slot < 4; slot += 1) {
    const fallback = { side: 'opponent', type: 'skill', skillSlot: slot } as const
    if (isTeamBattleActionLegal(state, context, fallback).legal) return fallback
  }

  const switchTarget = getSwitchTargets(state, 'opponent')[0]
  return switchTarget !== undefined
    ? { side: 'opponent', type: 'switch', targetSlot: switchTarget }
    : { side: 'opponent', type: 'wait' }
}

function chooseRandomLegalAction(
  state: TeamBattleState,
  rng: () => number,
): TeamBattleAction {
  const actions: TeamBattleAction[] = []
  for (let slot = 0; slot < 4; slot += 1) {
    const action = { side: 'opponent', type: 'skill', skillSlot: slot } as const
    if (isTeamBattleActionLegal(state, context, action).legal) actions.push(action)
  }

  const focus = { side: 'opponent', type: 'focus' } as const
  if (isTeamBattleActionLegal(state, context, focus).legal) actions.push(focus)

  for (const targetSlot of getSwitchTargets(state, 'opponent')) {
    actions.push({ side: 'opponent', type: 'switch', targetSlot })
  }

  return actions.length > 0
    ? (actions[Math.floor(rng() * actions.length)] ?? actions[0])
    : { side: 'opponent', type: 'wait' }
}

function chooseBestSkillAction(
  state: TeamBattleState,
  side: BattleSide,
): TeamBattleAction | null {
  const active = getActiveCombatant(state, side)
  const target = getActiveCombatant(state, side === 'player' ? 'opponent' : 'player')
  let best: TeamBattleAction | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const [slot, skillName] of active.skillSlots.entries()) {
    const action = { side, type: 'skill', skillSlot: slot } as const
    if (!isTeamBattleActionLegal(state, context, action).legal) continue

    const skill = context.skillMap.get(skillName)
    const power = skill?.power ?? 0
    const speedBonus =
      getEffectiveStat(active, 'speed') > getEffectiveStat(target, 'speed') ? 8 : 0
    const setupPenalty = power <= 0 ? -30 : 0
    const costPenalty = skill?.energy ?? 0
    const score = power + speedBonus + setupPenalty - costPenalty
    if (score > bestScore) {
      bestScore = score
      best = action
    }
  }

  return best
}

function resolveBasicPoolPolicy(rng: () => number): Exclude<ControlPolicy, 'basic-pool'> {
  const pool = ['cycle-skills', 'greedy-best', 'random-legal'] as const
  const roll = rng()
  if (roll < 0.25) return 'cycle-skills'
  if (roll < 0.5) return 'greedy-best'
  return pool[2]
}

function countAlive(state: TeamBattleState, side: BattleSide) {
  return state.teams[side].combatants.filter((combatant) => combatant.currentHp > 0)
    .length
}

function shuffle<T>(values: T[], rng: () => number) {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    const current = values[index]
    values[index] = values[swapIndex] as T
    values[swapIndex] = current as T
  }
  return values
}

function createSeededRng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function parseArgs() {
  const parsed = {
    episodes: 96,
    seed: 20260502,
    maxTurns: 160,
    hpScale: 0.7,
    output: 'outputs/expert-script-vs-controls.json',
  }

  for (let index = 2; index < process.argv.length; index += 1) {
    const key = process.argv[index]
    const value = process.argv[index + 1]
    if (key === '--episodes' && value) {
      parsed.episodes = Number(value)
      index += 1
    } else if (key === '--seed' && value) {
      parsed.seed = Number(value)
      index += 1
    } else if (key === '--max-turns' && value) {
      parsed.maxTurns = Number(value)
      index += 1
    } else if (key === '--hp-scale' && value) {
      parsed.hpScale = Number(value)
      index += 1
    } else if (key === '--output' && value) {
      parsed.output = value
      index += 1
    }
  }

  return parsed
}
