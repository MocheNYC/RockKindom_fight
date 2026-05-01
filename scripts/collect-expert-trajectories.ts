import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { defaultDexData } from '../src/data/defaultData'
import { createBattleContext } from '../src/rocofight/engine'
import {
  chooseExpertScriptAction,
  createExpertScriptMemory,
} from '../src/rocofight/expertScript'
import {
  createPvpCombatantInput,
  createPvpTeamCombatantInputs,
  pvpPetEntries,
  type PvpTeamId,
} from '../src/rocofight/pvp'
import {
  adjudicateTeamBattleByAliveCount,
  advanceTeamBattleTurn,
  createTeamBattleState,
  encodeTeamBattleObservation,
  getActiveCombatant,
  getSwitchTargets,
  getTeamBattleActionMask,
  type TeamBattleAction,
  type TeamBattleObservationVersion,
  type TeamBattleState,
} from '../src/rocofight/team'
import type { BattleSide } from '../src/rocofight/types'

type MatchupMode = 'random-roster' | 'fixed'

type DatasetRow = {
  episode: number
  seed: number
  turn: number
  side: BattleSide
  active: string
  opponentActive: string
  observationVersion: TeamBattleObservationVersion
  observation: number[]
  actionMask: number[]
  action: number
  actionLabel: string
  playerTeam: string[]
  opponentTeam: string[]
}

const context = createBattleContext(defaultDexData)
const args = parseArgs()
const rows: DatasetRow[] = []
const actionHistogram = Array.from({ length: 10 }, () => 0)
const wins: Record<string, number> = {
  player: 0,
  opponent: 0,
  draw: 0,
}
let invalidActionLabels = 0
let totalTurns = 0

for (let episode = 0; episode < args.episodes; episode += 1) {
  const seed = args.seed + episode * 997
  const rng = createSeededRng(seed)
  let state = createInitialState(rng)
  const memories = {
    player: createExpertScriptMemory(),
    opponent: createExpertScriptMemory(),
  }
  const playerTeam = state.teams.player.combatants.map((combatant) => combatant.name)
  const opponentTeam = state.teams.opponent.combatants.map(
    (combatant) => combatant.name,
  )

  while (state.phase !== 'ended' && state.turn < args.maxTurns) {
    const playerAction = chooseExpertScriptAction(
      state,
      context,
      'player',
      memories.player,
    )
    const opponentAction = chooseExpertScriptAction(
      state,
      context,
      'opponent',
      memories.opponent,
    )

    collectRow(
      rows,
      state,
      'player',
      playerAction,
      episode,
      seed,
      playerTeam,
      opponentTeam,
    )
    collectRow(
      rows,
      state,
      'opponent',
      opponentAction,
      episode,
      seed,
      playerTeam,
      opponentTeam,
    )

    state = advanceTeamBattleTurn(state, context, [playerAction, opponentAction])
    if (state.phase !== 'ended' && state.turn >= args.maxTurns) {
      state = adjudicateTeamBattleByAliveCount(state)
    }
  }

  totalTurns += state.turn
  if (state.winner === 'player') wins.player += 1
  else if (state.winner === 'opponent') wins.opponent += 1
  else wins.draw += 1
}

mkdirSync(dirname(args.output), { recursive: true })
writeFileSync(
  args.output,
  rows.map((row) => JSON.stringify(row)).join('\n') + '\n',
  'utf-8',
)

const summary = {
  generatedAt: new Date().toISOString(),
  output: args.output,
  episodes: args.episodes,
  samples: rows.length,
  seed: args.seed,
  maxTurns: args.maxTurns,
  hpScale: args.hpScale,
  matchupMode: args.matchupMode,
  playerTeamId: args.playerTeamId,
  opponentTeamId: args.opponentTeamId,
  observationVersion: args.observationVersion,
  wins,
  meanTurns: totalTurns / Math.max(1, args.episodes),
  actionHistogram,
  invalidActionLabels,
}
writeFileSync(args.summaryOutput, JSON.stringify(summary, null, 2), 'utf-8')
console.log(JSON.stringify(summary, null, 2))

function collectRow(
  target: DatasetRow[],
  state: TeamBattleState,
  side: BattleSide,
  action: TeamBattleAction,
  episode: number,
  seed: number,
  playerTeam: string[],
  opponentTeam: string[],
) {
  const actionMask = getDatasetActionMask(state, side)
  const actionIndex = getActionIndex(state, action)
  if (!actionMask[actionIndex]) invalidActionLabels += 1
  actionHistogram[actionIndex] += 1
  target.push({
    episode,
    seed,
    turn: state.turn,
    side,
    active: getActiveCombatant(state, side).name,
    opponentActive: getActiveCombatant(
      state,
      side === 'player' ? 'opponent' : 'player',
    ).name,
    observationVersion: args.observationVersion,
    observation: encodeTeamBattleObservation(state, context, side, {
      version: args.observationVersion,
    }),
    actionMask: actionMask.map((value) => Number(value)),
    action: actionIndex,
    actionLabel: formatAction(state, action),
    playerTeam,
    opponentTeam,
  })
}

function getActionIndex(state: TeamBattleState, action: TeamBattleAction) {
  if (action.type === 'skill') {
    const active = getActiveCombatant(state, action.side)
    const slot =
      action.skillSlot ??
      (action.skillName ? active.skillSlots.indexOf(action.skillName) : -1)
    return slot >= 0 && slot < 4 ? slot : 4
  }
  if (action.type === 'switch') {
    const switchIndex = getSwitchTargets(state, action.side).indexOf(
      action.targetSlot,
    )
    return switchIndex >= 0 ? 5 + switchIndex : 4
  }
  return 4
}

function getDatasetActionMask(state: TeamBattleState, side: BattleSide) {
  if (isSideWaitingForOpponentReplacement(state, side)) {
    return [false, false, false, false, true, false, false, false, false, false]
  }

  const mask = getTeamBattleActionMask(state, context, side).map(Boolean)
  if (!mask.some(Boolean)) mask[4] = true
  return mask
}

function isSideWaitingForOpponentReplacement(
  state: TeamBattleState,
  side: BattleSide,
) {
  const otherSide: BattleSide = side === 'player' ? 'opponent' : 'player'
  return state.pendingSwitch[otherSide] && !state.pendingSwitch[side]
}

function formatAction(state: TeamBattleState, action: TeamBattleAction) {
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

function createInitialState(rng: () => number) {
  const state =
    args.matchupMode === 'random-roster'
      ? createRandomRosterState(rng)
      : createTeamBattleState({
          player: createPvpTeamCombatantInputs(
            args.playerTeamId as PvpTeamId,
            defaultDexData.pets,
          ),
          opponent: createPvpTeamCombatantInputs(
            args.opponentTeamId as PvpTeamId,
            defaultDexData.pets,
          ),
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

function createRandomRosterState(rng: () => number) {
  const entries = shuffle([...pvpPetEntries], rng)
  return createTeamBattleState({
    player: entries
      .slice(0, 6)
      .map((entry) => createPvpCombatantInput(entry, defaultDexData.pets)),
    opponent: entries
      .slice(6, 12)
      .map((entry) => createPvpCombatantInput(entry, defaultDexData.pets)),
    replacementMode: 'pending',
  })
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
    episodes: 32,
    seed: 20260502,
    maxTurns: 160,
    hpScale: 0.7,
    matchupMode: 'random-roster' as MatchupMode,
    playerTeamId: 'wing-core',
    opponentTeamId: 'team-4',
    observationVersion: 'v2' as TeamBattleObservationVersion,
    output: 'outputs/expert-trajectories/stage1-random-v2.jsonl',
    summaryOutput: 'outputs/expert-trajectories/stage1-random-v2.summary.json',
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
    } else if (key === '--matchup-mode' && value) {
      parsed.matchupMode = value as MatchupMode
      index += 1
    } else if (key === '--player-team-id' && value) {
      parsed.playerTeamId = value
      index += 1
    } else if (key === '--opponent-team-id' && value) {
      parsed.opponentTeamId = value
      index += 1
    } else if (key === '--observation-version' && value) {
      parsed.observationVersion = value as TeamBattleObservationVersion
      index += 1
    } else if (key === '--output' && value) {
      parsed.output = value
      index += 1
    } else if (key === '--summary-output' && value) {
      parsed.summaryOutput = value
      index += 1
    }
  }

  return parsed
}
