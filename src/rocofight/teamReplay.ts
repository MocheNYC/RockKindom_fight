import type { DexDataBundle, Pet } from '../types'
import { createBattleContext } from './engine'
import {
  createPvpTeamCombatantInputs,
  type PvpTeamId,
} from './pvp'
import {
  advanceTeamBattleTurn,
  createTeamBattleState,
  decodeTeamBattleAction,
  getActiveCombatant,
  getTeamBattleActionMask,
  isTeamBattleActionLegal,
  type TeamBattleAction,
  type TeamBattleReplacementMode,
  type TeamBattleState,
} from './team'
import type {
  BattleCombatantInput,
  BattleLogEvent,
  BattleNature,
  BattleRuleOverrides,
  BattleSide,
} from './types'

export type TeamReplayCombatantSetup = {
  pet: string
  level?: number
  nature?: BattleNature | null
}

export type TeamReplaySlotSetup = {
  slot: number
  hp?: number
  energy?: number
}

export type TeamReplayTeamSetup = {
  pvpTeamId?: PvpTeamId
  combatants?: readonly TeamReplayCombatantSetup[]
  activeSlot?: number
  slots?: readonly TeamReplaySlotSetup[]
}

type TeamBattleActionWithoutSide<T> = T extends { side: BattleSide }
  ? Omit<T, 'side'>
  : never

export type TeamReplaySideAction =
  | {
      actionIndex: number
    }
  | TeamBattleActionWithoutSide<TeamBattleAction>

export type TeamReplayTurn = {
  player: TeamReplaySideAction
  opponent: TeamReplaySideAction
}

export type TeamReplayLogExpectation = Partial<BattleLogEvent>

export type TeamReplayExpectation = {
  winner?: BattleSide | null
  phase?: TeamBattleState['phase']
  turn?: number
  invalidActionCount?: number
  activeSlot?: Partial<Record<BattleSide, number>>
  pendingSwitch?: Partial<Record<BattleSide, boolean>>
  aliveCount?: Partial<Record<BattleSide, number>>
  faintedCount?: Partial<Record<BattleSide, number>>
  logIncludes?: TeamReplayLogExpectation[]
}

export type TeamReplayScenario = {
  name: string
  playerTeam: TeamReplayTeamSetup
  opponentTeam: TeamReplayTeamSetup
  rules?: BattleRuleOverrides
  replacementMode?: TeamBattleReplacementMode
  turns: readonly TeamReplayTurn[]
  expect?: TeamReplayExpectation
}

export type TeamReplayCombatantSnapshot = {
  slot: number
  name: string
  hp: number
  maxHp: number
  energy: number
  maxEnergy: number
  alive: boolean
  active: boolean
}

export type TeamReplaySideSnapshot = {
  activeSlot: number
  activeName: string
  aliveCount: number
  faintedCount: number
  pendingSwitch: boolean
  combatants: TeamReplayCombatantSnapshot[]
}

export type TeamReplaySnapshot = Record<BattleSide, TeamReplaySideSnapshot>

export type ResolvedTeamReplayAction = {
  side: BattleSide
  input: TeamReplaySideAction
  mask: boolean[]
  action: TeamBattleAction
  selectedActionValid: boolean
  actionIndex?: number
  invalidReason?: string
}

export type TeamReplayTraceTurn = {
  turn: number
  before: TeamReplaySnapshot
  player: ResolvedTeamReplayAction
  opponent: ResolvedTeamReplayAction
  events: BattleLogEvent[]
  after: TeamReplaySnapshot
}

export type TeamReplayRunResult = {
  replayName: string
  state: TeamBattleState
  trace: TeamReplayTraceTurn[]
  invalidActionCount: number
}

export type TeamReplayValidationResult = {
  replayName: string
  passed: boolean
  failures: string[]
  result: TeamReplayRunResult
}

export function runTeamReplay(
  data: DexDataBundle,
  replay: TeamReplayScenario,
): TeamReplayRunResult {
  const context = createBattleContext(data)
  let state = createTeamBattleState({
    player: createReplayTeamInputs(data, replay.playerTeam),
    opponent: createReplayTeamInputs(data, replay.opponentTeam),
    rules: replay.rules,
    replacementMode: replay.replacementMode,
  })
  state = applyReplayTeamSetup(state, 'player', replay.playerTeam)
  state = applyReplayTeamSetup(state, 'opponent', replay.opponentTeam)

  const trace: TeamReplayTraceTurn[] = []
  let invalidActionCount = 0

  for (const turn of replay.turns) {
    if (state.phase === 'ended') break

    const before = snapshotTeamBattle(state)
    const player = resolveReplayAction(state, context, 'player', turn.player)
    const opponent = resolveReplayAction(
      state,
      context,
      'opponent',
      turn.opponent,
    )
    invalidActionCount += Number(!player.selectedActionValid)
    invalidActionCount += Number(!opponent.selectedActionValid)

    const logStart = state.log.length
    state = advanceTeamBattleTurn(state, context, [player.action, opponent.action])
    trace.push({
      turn: state.turn,
      before,
      player,
      opponent,
      events: state.log.slice(logStart),
      after: snapshotTeamBattle(state),
    })
  }

  return {
    replayName: replay.name,
    state,
    trace,
    invalidActionCount,
  }
}

export function validateTeamReplay(
  data: DexDataBundle,
  replay: TeamReplayScenario,
): TeamReplayValidationResult {
  const result = runTeamReplay(data, replay)
  const failures = replay.expect
    ? collectTeamReplayFailures(result, replay.expect)
    : []

  return {
    replayName: replay.name,
    passed: failures.length === 0,
    failures,
    result,
  }
}

export function formatTeamReplayTrace(result: TeamReplayRunResult) {
  const lines = [
    `Replay: ${result.replayName}`,
    `Result: phase=${result.state.phase} winner=${result.state.winner ?? 'none'} turns=${result.state.turn} invalid=${result.invalidActionCount}`,
  ]

  for (const turn of result.trace) {
    lines.push(
      `Turn ${turn.turn}: player=${formatResolvedAction(turn.player)} opponent=${formatResolvedAction(turn.opponent)}`,
    )
    for (const event of turn.events) {
      lines.push(`  - ${formatLogEvent(event)}`)
    }
  }

  return lines.join('\n')
}

function createReplayTeamInputs(
  data: DexDataBundle,
  setup: TeamReplayTeamSetup,
): BattleCombatantInput[] {
  if (setup.pvpTeamId) {
    return createPvpTeamCombatantInputs(setup.pvpTeamId, data.pets)
  }

  if (!setup.combatants) {
    throw new Error('Team replay setup must provide pvpTeamId or combatants')
  }

  return setup.combatants.map((combatant) => ({
    pet: findReplayPet(data.pets, combatant.pet),
    level: combatant.level,
    nature: combatant.nature,
  }))
}

function applyReplayTeamSetup(
  state: TeamBattleState,
  side: BattleSide,
  setup: TeamReplayTeamSetup,
) {
  const team = state.teams[side]

  for (const slotSetup of setup.slots ?? []) {
    const combatant = team.combatants[slotSetup.slot]
    if (!combatant) {
      throw new Error(`${side} replay slot out of range: ${slotSetup.slot}`)
    }
    if (slotSetup.hp !== undefined) {
      combatant.currentHp = Math.min(
        combatant.maxHp,
        Math.max(0, slotSetup.hp),
      )
    }
    if (slotSetup.energy !== undefined) {
      combatant.energy = Math.min(
        combatant.maxEnergy,
        Math.max(0, slotSetup.energy),
      )
    }
  }

  if (setup.activeSlot !== undefined) {
    const active = team.combatants[setup.activeSlot]
    if (!active) {
      throw new Error(`${side} active slot out of range: ${setup.activeSlot}`)
    }
    if (active.currentHp <= 0) {
      throw new Error(`${side} active slot is fainted: ${setup.activeSlot}`)
    }
    team.activeSlot = setup.activeSlot
    return state
  }

  if (getActiveCombatant(state, side).currentHp <= 0) {
    const replacement = team.combatants.findIndex(
      (combatant) => combatant.currentHp > 0,
    )
    if (replacement >= 0) team.activeSlot = replacement
  }

  return state
}

function resolveReplayAction(
  state: TeamBattleState,
  context: ReturnType<typeof createBattleContext>,
  side: BattleSide,
  input: TeamReplaySideAction,
): ResolvedTeamReplayAction {
  const mask = getTeamBattleActionMask(state, context, side)

  if ('actionIndex' in input) {
    const decoded = decodeTeamBattleAction(state, side, input.actionIndex)
    const maskAllowsAction = Boolean(mask[input.actionIndex])
    if (decoded.type === 'invalid') {
      return {
        side,
        input,
        mask,
        actionIndex: input.actionIndex,
        action: { side, type: 'wait' },
        selectedActionValid: false,
        invalidReason: decoded.reason,
      }
    }

    const legality = isTeamBattleActionLegal(state, context, decoded)
    if (!maskAllowsAction) {
      return {
        side,
        input,
        mask,
        actionIndex: input.actionIndex,
        action: { side, type: 'wait' },
        selectedActionValid: false,
        invalidReason: 'masked_action',
      }
    }
    if (!legality.legal) {
      return {
        side,
        input,
        mask,
        actionIndex: input.actionIndex,
        action: { side, type: 'wait' },
        selectedActionValid: false,
        invalidReason: legality.reason,
      }
    }

    return {
      side,
      input,
      mask,
      actionIndex: input.actionIndex,
      action: decoded,
      selectedActionValid: true,
    }
  }

  const action = {
    ...input,
    side,
  } as TeamBattleAction
  const legality = isTeamBattleActionLegal(state, context, action)

  return {
    side,
    input,
    mask,
    action,
    selectedActionValid: legality.legal,
    invalidReason: legality.legal ? undefined : legality.reason,
  }
}

function snapshotTeamBattle(state: TeamBattleState): TeamReplaySnapshot {
  return {
    player: snapshotSide(state, 'player'),
    opponent: snapshotSide(state, 'opponent'),
  }
}

function snapshotSide(
  state: TeamBattleState,
  side: BattleSide,
): TeamReplaySideSnapshot {
  const team = state.teams[side]
  const combatants = team.combatants.map((combatant, slot) => ({
    slot,
    name: combatant.name,
    hp: combatant.currentHp,
    maxHp: combatant.maxHp,
    energy: combatant.energy,
    maxEnergy: combatant.maxEnergy,
    alive: combatant.currentHp > 0,
    active: slot === team.activeSlot,
  }))
  const aliveCount = combatants.filter((combatant) => combatant.alive).length

  return {
    activeSlot: team.activeSlot,
    activeName: team.combatants[team.activeSlot].name,
    aliveCount,
    faintedCount: combatants.length - aliveCount,
    pendingSwitch: state.pendingSwitch[side],
    combatants,
  }
}

function collectTeamReplayFailures(
  result: TeamReplayRunResult,
  expectation: TeamReplayExpectation,
) {
  const failures: string[] = []
  const state = result.state

  if (expectation.winner !== undefined && state.winner !== expectation.winner) {
    failures.push(`winner expected ${expectation.winner}, got ${state.winner}`)
  }
  if (expectation.phase !== undefined && state.phase !== expectation.phase) {
    failures.push(`phase expected ${expectation.phase}, got ${state.phase}`)
  }
  if (expectation.turn !== undefined && state.turn !== expectation.turn) {
    failures.push(`turn expected ${expectation.turn}, got ${state.turn}`)
  }
  if (
    expectation.invalidActionCount !== undefined &&
    result.invalidActionCount !== expectation.invalidActionCount
  ) {
    failures.push(
      `invalidActionCount expected ${expectation.invalidActionCount}, got ${result.invalidActionCount}`,
    )
  }

  collectSideSnapshotFailures(
    failures,
    result,
    expectation.activeSlot,
    'activeSlot',
  )
  collectSideSnapshotFailures(
    failures,
    result,
    expectation.aliveCount,
    'aliveCount',
  )
  collectSideSnapshotFailures(
    failures,
    result,
    expectation.faintedCount,
    'faintedCount',
  )
  collectSidePendingSwitchFailures(failures, result, expectation.pendingSwitch)

  for (const logExpectation of expectation.logIncludes ?? []) {
    if (!state.log.some((event) => matchesLogExpectation(event, logExpectation))) {
      failures.push(`missing log event ${JSON.stringify(logExpectation)}`)
    }
  }

  return failures
}

function collectSideSnapshotFailures(
  failures: string[],
  result: TeamReplayRunResult,
  expectedValues: Partial<Record<BattleSide, number>> | undefined,
  field: 'activeSlot' | 'aliveCount' | 'faintedCount',
) {
  if (!expectedValues) return
  const snapshot = snapshotTeamBattle(result.state)

  for (const [side, expectedValue] of Object.entries(expectedValues) as [
    BattleSide,
    number,
  ][]) {
    const actualValue = snapshot[side][field]
    if (actualValue !== expectedValue) {
      failures.push(
        `${side}.${field} expected ${expectedValue}, got ${actualValue}`,
      )
    }
  }
}

function collectSidePendingSwitchFailures(
  failures: string[],
  result: TeamReplayRunResult,
  expectedValues: Partial<Record<BattleSide, boolean>> | undefined,
) {
  if (!expectedValues) return
  const snapshot = snapshotTeamBattle(result.state)

  for (const [side, expectedValue] of Object.entries(expectedValues) as [
    BattleSide,
    boolean,
  ][]) {
    const actualValue = snapshot[side].pendingSwitch
    if (actualValue !== expectedValue) {
      failures.push(
        `${side}.pendingSwitch expected ${expectedValue}, got ${actualValue}`,
      )
    }
  }
}

function matchesLogExpectation(
  event: BattleLogEvent,
  expectation: TeamReplayLogExpectation,
) {
  return Object.entries(expectation).every(
    ([key, value]) => event[key as keyof BattleLogEvent] === value,
  )
}

function findReplayPet(pets: Pet[], value: string) {
  const pet = pets.find(
    (entry) =>
      entry.key === value ||
      entry.nameZh === value ||
      entry.nameEn === value ||
      entry.id === value,
  )

  if (!pet) throw new Error(`Replay pet not found: ${value}`)
  return pet
}

function formatResolvedAction(action: ResolvedTeamReplayAction) {
  const indexPart =
    action.actionIndex === undefined ? '' : `#${action.actionIndex} `
  const validity = action.selectedActionValid
    ? 'valid'
    : `invalid:${action.invalidReason}`

  return `${indexPart}${formatAction(action.action)} (${validity})`
}

function formatAction(action: TeamBattleAction) {
  if (action.type === 'skill') {
    return action.skillName ?? `skillSlot:${action.skillSlot ?? 'unknown'}`
  }
  if (action.type === 'switch') return `switch:${action.targetSlot}`
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
