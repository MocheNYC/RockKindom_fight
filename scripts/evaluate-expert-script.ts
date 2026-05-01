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
import type { BattleLogEvent, BattleSide } from '../src/rocofight/types'

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

type EpisodeTraceTurn = {
  turn: number
  playerActive: string
  opponentActive: string
  playerAction: string
  opponentAction: string
  events: string[]
  after: {
    playerActive: string
    opponentActive: string
    playerAlive: number
    opponentAlive: number
  }
}

type EpisodeTraceExample = EpisodeResult & {
  policy: ControlPolicy
  actualOpponentPolicy: Exclude<ControlPolicy, 'basic-pool'>
  seed: number
  playerTeam: string[]
  opponentTeam: string[]
  finalPlayer: CombatantSummary[]
  finalOpponent: CombatantSummary[]
  trace: EpisodeTraceTurn[]
}

type CombatantSummary = {
  slot: number
  name: string
  hp: number
  maxHp: number
  energy: number
  active: boolean
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
const evaluations = Object.fromEntries(
  policies.map((policy) => [policy, evaluatePolicy(policy)]),
)
const allResults = {
  generatedAt: new Date().toISOString(),
  episodesPerPolicy: args.episodes,
  maxTurns: args.maxTurns,
  hpScale: args.hpScale,
  seed: args.seed,
  matchupMode: 'random-roster',
  playerPolicy: 'expert-script',
  policies: Object.fromEntries(
    policies.map((policy) => [policy, evaluations[policy].summary]),
  ),
}
const traceResults = {
  generatedAt: allResults.generatedAt,
  traceLimit: args.traceLimit,
  policies: Object.fromEntries(
    policies.map((policy) => [
      policy,
      {
        lossExamples: evaluations[policy].lossExamples,
        drawExamples: evaluations[policy].drawExamples,
      },
    ]),
  ),
}

if (args.output) {
  writeFileSync(args.output, JSON.stringify(allResults, null, 2), 'utf-8')
}
if (args.traceOutput && args.traceLimit > 0) {
  writeFileSync(args.traceOutput, JSON.stringify(traceResults, null, 2), 'utf-8')
}

console.log(JSON.stringify(allResults, null, 2))

function evaluatePolicy(policy: ControlPolicy) {
  const results: EpisodeResult[] = []
  const lossExamples: EpisodeTraceExample[] = []
  const drawExamples: EpisodeTraceExample[] = []

  for (let episode = 0; episode < args.episodes; episode += 1) {
    const seed = args.seed + episode * 997 + policy.length * 31
    const result = runEpisode(policy, seed)
    results.push({
      winner: result.winner,
      turns: result.turns,
      playerAlive: result.playerAlive,
      opponentAlive: result.opponentAlive,
    })
    if (
      result.winner === 'opponent' &&
      lossExamples.length < args.traceLimit
    ) {
      lossExamples.push(result)
    } else if (
      result.winner === null &&
      drawExamples.length < args.traceLimit
    ) {
      drawExamples.push(result)
    }
  }

  const wins = results.filter((result) => result.winner === 'player').length
  const losses = results.filter((result) => result.winner === 'opponent').length
  const draws = results.filter((result) => result.winner === null).length
  return {
    summary: {
      episodes: results.length,
      wins,
      losses,
      draws,
      winRate: wins / results.length,
      lossRate: losses / results.length,
      drawRate: draws / results.length,
      meanTurns:
        results.reduce((total, result) => total + result.turns, 0) /
        results.length,
      meanPlayerAlive:
        results.reduce((total, result) => total + result.playerAlive, 0) /
        results.length,
      meanOpponentAlive:
        results.reduce((total, result) => total + result.opponentAlive, 0) /
        results.length,
    },
    lossExamples,
    drawExamples,
  }
}

function runEpisode(policy: ControlPolicy, seed: number): EpisodeTraceExample {
  const rng = createSeededRng(seed)
  let state = createRandomRosterState(rng)
  const playerTeam = state.teams.player.combatants.map((combatant) => combatant.name)
  const opponentTeam = state.teams.opponent.combatants.map(
    (combatant) => combatant.name,
  )
  const trace: EpisodeTraceTurn[] = []
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
    const logStart = state.log.length
    const playerActive = getActiveCombatant(state, 'player').name
    const opponentActive = getActiveCombatant(state, 'opponent').name
    const playerActionLabel = formatActionForState(state, playerAction)
    const opponentActionLabel = formatActionForState(state, opponentAction)
    state = advanceTeamBattleTurn(state, context, [playerAction, opponentAction])
    if (state.phase !== 'ended' && state.turn >= args.maxTurns) {
      state = adjudicateTeamBattleByAliveCount(state)
    }
    trace.push({
      turn: state.turn,
      playerActive,
      opponentActive,
      playerAction: playerActionLabel,
      opponentAction: opponentActionLabel,
      events: state.log.slice(logStart).map(formatLogEvent),
      after: {
        playerActive: getActiveCombatant(state, 'player').name,
        opponentActive: getActiveCombatant(state, 'opponent').name,
        playerAlive: countAlive(state, 'player'),
        opponentAlive: countAlive(state, 'opponent'),
      },
    })
  }

  return {
    policy,
    actualOpponentPolicy: controlMemory.policy,
    seed,
    winner: state.phase === 'ended' ? state.winner : null,
    turns: state.turn,
    playerAlive: countAlive(state, 'player'),
    opponentAlive: countAlive(state, 'opponent'),
    playerTeam,
    opponentTeam,
    finalPlayer: summarizeCombatants(state, 'player'),
    finalOpponent: summarizeCombatants(state, 'opponent'),
    trace,
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

function summarizeCombatants(
  state: TeamBattleState,
  side: BattleSide,
): CombatantSummary[] {
  const activeSlot = state.teams[side].activeSlot
  return state.teams[side].combatants.map((combatant, slot) => ({
    slot,
    name: combatant.name,
    hp: combatant.currentHp,
    maxHp: combatant.maxHp,
    energy: combatant.energy,
    active: slot === activeSlot,
  }))
}

function formatActionForState(state: TeamBattleState, action: TeamBattleAction) {
  if (action.type === 'skill') {
    const active = getActiveCombatant(state, action.side)
    return (
      action.skillName ??
      active.skillSlots[action.skillSlot ?? -1] ??
      `skillSlot:${action.skillSlot ?? 'unknown'}`
    )
  }
  if (action.type === 'switch') {
    const target = state.teams[action.side].combatants[action.targetSlot]
    return target
      ? `switch:${action.targetSlot}:${target.name}`
      : `switch:${action.targetSlot}`
  }
  return action.type
}

function formatLogEvent(event: BattleLogEvent) {
  const details = [
    event.side ? `side=${event.side}` : null,
    event.target ? `target=${event.target}` : null,
    event.skillName ? `skill=${event.skillName}` : null,
    event.damage !== undefined ? `damage=${event.damage}` : null,
    event.hp !== undefined ? `hp=${event.hp}` : null,
    event.energy !== undefined ? `energy=${event.energy}` : null,
    event.fromSlot !== undefined ? `from=${event.fromSlot}` : null,
    event.toSlot !== undefined ? `to=${event.toSlot}` : null,
    event.winner ? `winner=${event.winner}` : null,
    event.reason ? `reason=${event.reason}` : null,
  ].filter(Boolean)

  return `${event.type}${details.length ? ` (${details.join(', ')})` : ''}`
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
    traceLimit: 3,
    traceOutput: 'outputs/expert-script-loss-traces.json',
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
    } else if (key === '--trace-limit' && value) {
      parsed.traceLimit = Number(value)
      index += 1
    } else if (key === '--trace-output' && value) {
      parsed.traceOutput = value
      index += 1
    }
  }

  return parsed
}
