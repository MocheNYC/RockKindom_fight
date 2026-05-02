import readline from 'node:readline'
import { stdin as input, stdout as output } from 'node:process'
import { defaultDexData } from '../src/data/defaultData'
import { createBattleContext, getEffectiveStat } from '../src/rocofight/engine'
import {
  chooseExpertScriptAction,
  createExpertScriptMemory,
  type ExpertScriptMemory,
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
  chooseFirstLegalTeamAction,
  createTeamBattleState,
  decodeTeamBattleAction,
  encodeTeamBattleObservation,
  getActiveCombatant,
  getSwitchTargets,
  getTeamBattleActionMask,
  isTeamBattleActionLegal,
  type TeamBattleObservationVersion,
  type TeamBattleAction,
  type TeamBattleState,
} from '../src/rocofight/team'
import type { BattleLogEvent, BattleSide } from '../src/rocofight/types'

type BridgeRequest =
  | {
      id?: number | string
      cmd: 'reset'
      seed?: number
      maxTurns?: number
      hpScale?: number
      matchupMode?: 'fixed' | 'random-roster' | 'expert-preset-pool'
      opponentPolicy?: OpponentPolicyRequest
      playerTeamId?: PvpTeamId
      opponentTeamId?: PvpTeamId
      rewardProfile?: RewardProfile
      rewardGamma?: number
      drawPenalty?: number
      observationVersion?: TeamBattleObservationVersion
    }
  | {
      id?: number | string
      cmd: 'step'
      action: number
      opponentAction?: number
    }
  | {
      id?: number | string
      cmd: 'close'
    }

type BridgeState = {
  state: TeamBattleState
  maxTurns: number
  invalidSelected: number
  opponentPolicy: OpponentPolicy
  opponentPolicyLabel: OpponentPolicyRequest
  opponentSkillCursorBySlot: number[]
  expertScriptMemory: ExpertScriptMemory
  playerExpertScriptMemory: ExpertScriptMemory
  rewardProfile: RewardProfile
  rewardGamma: number
  drawPenalty: number
  observationVersion: TeamBattleObservationVersion
  rng: () => number
}

type StepMetrics = {
  playerHp: number
  opponentHp: number
  playerAlive: number
  opponentAlive: number
  playerEnergy: number
  opponentEnergy: number
}

type OpponentPolicy = 'greedy-best' | 'cycle-skills' | 'random-legal' | 'expert-script'
type OpponentPolicyRequest = OpponentPolicy | 'basic-pool'
type RewardProfile = 'dense' | 'potential' | 'terminal' | 'competitive'

type RewardBreakdown = {
  total: number
  dense: number
  potential: number
  terminal: number
  event: number
  invalid: number
  turn: number
  stall: number
  truncated: number
}

const context = createBattleContext(defaultDexData)
let bridge: BridgeState | null = null

const opponentPolicyPool = [
  'greedy-best',
  'cycle-skills',
  'random-legal',
] as const satisfies readonly Exclude<OpponentPolicy, 'expert-script'>[]

const expertPresetTeamIds = [
  'expert-wing-burst',
  'expert-sand-bulwark',
  'expert-phantom-drain',
  'expert-priority-offense',
  'expert-anti-sweep-balance',
] as const satisfies readonly PvpTeamId[]

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

const rl = readline.createInterface({
  input,
  crlfDelay: Number.POSITIVE_INFINITY,
})

rl.on('line', (line) => {
  if (!line.trim()) return

  try {
    const request = JSON.parse(line) as BridgeRequest
    const response = handleRequest(request)
    output.write(`${JSON.stringify({ id: request.id, ok: true, ...response })}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    output.write(`${JSON.stringify({ ok: false, error: message })}\n`)
  }
})

function handleRequest(request: BridgeRequest) {
  if (request.cmd === 'close') {
    process.exit(0)
  }

  if (request.cmd === 'reset') {
    bridge = createBridgeState(request)
    return snapshotResponse(bridge, {
      reward: 0,
      terminated: false,
      truncated: false,
      events: bridge.state.log,
      selectedActionValid: true,
    })
  }

  if (!bridge) {
    bridge = createBridgeState({ cmd: 'reset' })
  }

  return stepBridge(bridge, request.action, request.opponentAction)
}

function createBridgeState(
  request: Extract<BridgeRequest, { cmd: 'reset' }>,
): BridgeState {
  const rng = createSeededRng(request.seed ?? 1)
  const opponentPolicyLabel = request.opponentPolicy ?? 'greedy-best'
  const opponentPolicy = resolveOpponentPolicy(opponentPolicyLabel, rng)
  const teams = createBridgeTeams(request)
  const state = createTeamBattleState({
    player: teams.player,
    opponent: teams.opponent,
    replacementMode: 'pending',
  })

  const hpScale = clamp(request.hpScale ?? 0.7, 0.05, 1)
  if (hpScale < 1) {
    for (const side of ['player', 'opponent'] as const) {
      for (const combatant of state.teams[side].combatants) {
        combatant.currentHp = Math.max(1, Math.ceil(combatant.maxHp * hpScale))
      }
    }
  }

  return {
    state,
    maxTurns: Math.max(1, Math.floor(request.maxTurns ?? 160)),
    invalidSelected: 0,
    opponentPolicy,
    opponentPolicyLabel,
    opponentSkillCursorBySlot: Array.from({ length: 6 }, () => 0),
    expertScriptMemory: createExpertScriptMemory(),
    playerExpertScriptMemory: createExpertScriptMemory(),
    rewardProfile: request.rewardProfile ?? 'potential',
    rewardGamma: clamp(request.rewardGamma ?? 0.95, 0, 1),
    drawPenalty: Math.max(0, request.drawPenalty ?? 6),
    observationVersion: request.observationVersion ?? 'v1',
    rng,
  }
}

function createBridgeTeams(request: Extract<BridgeRequest, { cmd: 'reset' }>) {
  const rng = createSeededRng(request.seed ?? 1)
  if (request.matchupMode === 'random-roster') {
    const entries = shuffle([...pvpPetEntries], rng)
    return {
      player: entries
        .slice(0, 6)
        .map((entry) => createPvpCombatantInput(entry, defaultDexData.pets)),
      opponent: entries
        .slice(6, 12)
        .map((entry) => createPvpCombatantInput(entry, defaultDexData.pets)),
    }
  }

  if (request.matchupMode === 'expert-preset-pool') {
    const playerTeamId =
      request.playerTeamId ?? sampleFrom(expertPresetTeamIds, rng)
    const opponentCandidates = expertPresetTeamIds.filter(
      (teamId) => teamId !== playerTeamId,
    )
    const opponentTeamId =
      request.opponentTeamId ?? sampleFrom(opponentCandidates, rng)
    return {
      player: createPvpTeamCombatantInputs(playerTeamId, defaultDexData.pets),
      opponent: createPvpTeamCombatantInputs(opponentTeamId, defaultDexData.pets),
    }
  }

  return {
    player: createPvpTeamCombatantInputs(
      request.playerTeamId ?? 'snow-shadow-sword',
      defaultDexData.pets,
    ),
    opponent: createPvpTeamCombatantInputs(
      request.opponentTeamId ?? 'team-4',
      defaultDexData.pets,
    ),
  }
}

function sampleFrom<T>(values: readonly T[], rng: () => number) {
  return values[Math.floor(rng() * values.length)] as T
}

function stepBridge(
  bridgeState: BridgeState,
  actionIndex: number,
  opponentActionIndex?: number,
) {
  const state = bridgeState.state
  const before = getMetrics(state)
  const logStart = state.log.length
  const playerSelection = selectBridgeAction(state, 'player', actionIndex)
  if (!playerSelection.selectedActionValid) {
    bridgeState.invalidSelected += 1
  }
  const playerAction = playerSelection.action

  const opponentSelection =
    opponentActionIndex === undefined
      ? null
      : selectBridgeAction(state, 'opponent', opponentActionIndex)
  const opponentAction = opponentSelection
    ? opponentSelection.action
    : chooseOpponentAction(bridgeState)
  let nextState = advanceTeamBattleTurn(state, context, [
    playerAction,
    opponentAction,
  ])
  if (nextState.phase !== 'ended' && nextState.turn >= bridgeState.maxTurns) {
    nextState = adjudicateTeamBattleByAliveCount(nextState)
  }
  bridgeState.state = nextState

  const after = getMetrics(nextState)
  const events = nextState.log.slice(logStart)
  const terminated = nextState.phase === 'ended'
  const truncated = !terminated && nextState.turn >= bridgeState.maxTurns
  const rewardBreakdown = calculateReward(
    before,
    after,
    nextState,
    events,
    playerSelection.selectedActionValid,
    truncated,
    bridgeState.rewardProfile,
    bridgeState.rewardGamma,
    bridgeState.drawPenalty,
  )

  return snapshotResponse(bridgeState, {
    reward: rewardBreakdown.total,
    rewardBreakdown,
    terminated,
    truncated,
    events,
    selectedActionValid: playerSelection.selectedActionValid,
    playerAction,
    opponentAction,
    opponentSelectedActionValid: opponentSelection?.selectedActionValid,
  })
}

function selectBridgeAction(
  state: TeamBattleState,
  side: BattleSide,
  actionIndex: number,
): { action: TeamBattleAction; selectedActionValid: boolean } {
  const mask = getBridgeActionMask(state, side)
  const selectedActionValid = Boolean(mask[actionIndex])
  const mustWait = isSideWaitingForOpponentReplacement(state, side)
  let action: TeamBattleAction | null = null

  if (mustWait) {
    action = { side, type: 'wait' }
  } else if (selectedActionValid) {
    action = decodeActionIndex(state, side, actionIndex)
  }

  if (!action) {
    action = decodeActionIndex(state, side, firstValidAction(mask)) ?? {
      side,
      type: 'wait',
    }
  }

  return { action, selectedActionValid }
}

function decodeActionIndex(
  state: TeamBattleState,
  side: BattleSide,
  actionIndex: number,
): TeamBattleAction | null {
  const decoded = decodeTeamBattleAction(state, side, actionIndex)
  if (decoded.type === 'invalid') return null

  const legality = isTeamBattleActionLegal(state, context, decoded)
  return legality.legal ? decoded : null
}

function chooseOpponentAction(bridgeState: BridgeState): TeamBattleAction {
  const state = bridgeState.state
  const pendingTarget = state.pendingSwitch.opponent
    ? getSwitchTargets(state, 'opponent')[0]
    : undefined
  if (pendingTarget !== undefined) {
    return {
      side: 'opponent',
      type: 'switch',
      targetSlot: pendingTarget,
    }
  }

  if (state.pendingSwitch.player) {
    return {
      side: 'opponent',
      type: 'wait',
    }
  }

  if (bridgeState.opponentPolicy === 'cycle-skills') {
    return chooseCycleSkillAction(bridgeState)
  }

  if (bridgeState.opponentPolicy === 'random-legal') {
    return chooseRandomLegalAction(bridgeState)
  }

  if (bridgeState.opponentPolicy === 'expert-script') {
    return chooseExpertScriptAction(
      state,
      context,
      'opponent',
      bridgeState.expertScriptMemory,
    )
  }

  const active = getActiveCombatant(state, 'opponent')
  const hpRatio = active.maxHp > 0 ? active.currentHp / active.maxHp : 0
  const switchTarget = getSwitchTargets(state, 'opponent')[0]
  if (hpRatio > 0 && hpRatio < 0.18 && switchTarget !== undefined) {
    return {
      side: 'opponent',
      type: 'switch',
      targetSlot: switchTarget,
    }
  }

  return chooseBestSkillAction(state, 'opponent') ??
    chooseFirstLegalTeamAction(
      state,
      context,
      'opponent',
      opponentPreferredSkills,
    )
}

function chooseCycleSkillAction(bridgeState: BridgeState): TeamBattleAction {
  const state = bridgeState.state
  const activeSlot = state.teams.opponent.activeSlot
  const skillSlot = bridgeState.opponentSkillCursorBySlot[activeSlot] % 4
  const action = { side: 'opponent', type: 'skill', skillSlot } as const
  const legality = isTeamBattleActionLegal(state, context, action)

  if (legality.legal) {
    bridgeState.opponentSkillCursorBySlot[activeSlot] =
      (bridgeState.opponentSkillCursorBySlot[activeSlot] + 1) % 4
    return action
  }

  const focus = { side: 'opponent', type: 'focus' } as const
  if (isTeamBattleActionLegal(state, context, focus).legal) return focus

  const fallbackSkill = chooseFirstLegalSkillBySlot(state, 'opponent')
  if (fallbackSkill) return fallbackSkill

  const switchTarget = getSwitchTargets(state, 'opponent')[0]
  if (switchTarget !== undefined) {
    return {
      side: 'opponent',
      type: 'switch',
      targetSlot: switchTarget,
    }
  }

  return { side: 'opponent', type: 'wait' }
}

function chooseRandomLegalAction(bridgeState: BridgeState): TeamBattleAction {
  const state = bridgeState.state
  const actions: TeamBattleAction[] = []

  for (let slot = 0; slot < 4; slot += 1) {
    const action = { side: 'opponent', type: 'skill', skillSlot: slot } as const
    if (isTeamBattleActionLegal(state, context, action).legal) actions.push(action)
  }

  const focus = { side: 'opponent', type: 'focus' } as const
  if (isTeamBattleActionLegal(state, context, focus).legal) actions.push(focus)

  for (const targetSlot of getSwitchTargets(state, 'opponent')) {
    actions.push({
      side: 'opponent',
      type: 'switch',
      targetSlot,
    })
  }

  if (actions.length === 0) return { side: 'opponent', type: 'wait' }
  return actions[Math.floor(bridgeState.rng() * actions.length)] ?? actions[0]
}

function chooseFirstLegalSkillBySlot(
  state: TeamBattleState,
  side: BattleSide,
): TeamBattleAction | null {
  for (let slot = 0; slot < 4; slot += 1) {
    const action = { side, type: 'skill', skillSlot: slot } as const
    if (isTeamBattleActionLegal(state, context, action).legal) return action
  }

  return null
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

function snapshotResponse(
  bridgeState: BridgeState,
  extra: {
    reward: number
    rewardBreakdown?: RewardBreakdown
    terminated: boolean
    truncated: boolean
    events: readonly BattleLogEvent[]
    selectedActionValid: boolean
    playerAction?: TeamBattleAction
    opponentAction?: TeamBattleAction
    opponentSelectedActionValid?: boolean
  },
) {
  const state = bridgeState.state
  const playerExpertAction =
    state.phase === 'ended'
      ? null
      : chooseExpertScriptAction(
          state,
          context,
          'player',
          bridgeState.playerExpertScriptMemory,
        )
  return {
    observation: encodeTeamBattleObservation(state, context, 'player', {
      version: bridgeState.observationVersion,
    }),
    actionMask: getPlayerBridgeActionMask(state),
    opponentObservation: encodeTeamBattleObservation(state, context, 'opponent', {
      version: bridgeState.observationVersion,
    }),
    opponentActionMask: getBridgeActionMask(state, 'opponent'),
    reward: extra.reward,
    terminated: extra.terminated,
    truncated: extra.truncated,
    info: {
      turn: state.turn,
      phase: state.phase,
      winner: state.winner,
      opponentPolicy: bridgeState.opponentPolicy,
      opponentPolicyLabel: bridgeState.opponentPolicyLabel,
      rewardProfile: bridgeState.rewardProfile,
      rewardGamma: bridgeState.rewardGamma,
      drawPenalty: bridgeState.drawPenalty,
      observationVersion: bridgeState.observationVersion,
      rewardComponents: extra.rewardBreakdown ?? null,
      invalidSelected: bridgeState.invalidSelected,
      selectedActionValid: extra.selectedActionValid,
      opponentSelectedActionValid: extra.opponentSelectedActionValid ?? null,
      playerAction: extra.playerAction ? formatAction(extra.playerAction) : null,
      opponentAction: extra.opponentAction
        ? formatAction(extra.opponentAction)
        : null,
      playerExpertAction: playerExpertAction
        ? formatAction(playerExpertAction)
        : null,
      playerExpertActionIndex: playerExpertAction
        ? getActionIndex(state, playerExpertAction)
        : null,
      player: sideSnapshot(state, 'player'),
      opponent: sideSnapshot(state, 'opponent'),
      matchup: {
        player: state.teams.player.combatants.map((combatant) => combatant.name),
        opponent: state.teams.opponent.combatants.map(
          (combatant) => combatant.name,
        ),
      },
      events: extra.events.map(formatEvent),
      rawEvents: extra.events,
    },
  }
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

function getMetrics(state: TeamBattleState): StepMetrics {
  return {
    playerHp: sumHpRatio(state, 'player'),
    opponentHp: sumHpRatio(state, 'opponent'),
    playerAlive: countAlive(state, 'player'),
    opponentAlive: countAlive(state, 'opponent'),
    playerEnergy: sumEnergyRatio(state, 'player'),
    opponentEnergy: sumEnergyRatio(state, 'opponent'),
  }
}

function calculateReward(
  before: StepMetrics,
  after: StepMetrics,
  state: TeamBattleState,
  events: readonly BattleLogEvent[],
  selectedActionValid: boolean,
  truncated: boolean,
  profile: RewardProfile,
  gamma: number,
  drawPenalty: number,
) {
  const dense =
    (before.opponentHp - after.opponentHp) * 1.4 -
    (before.playerHp - after.playerHp) * 1.4
  const knockout =
    (before.opponentAlive - after.opponentAlive) * 5 -
    (before.playerAlive - after.playerAlive) * 5
  const turn = -0.01

  const invalid = selectedActionValid ? 0 : -2
  let eventReward = 0
  eventReward -=
    events.filter((event) => event.type === 'action_failed' && event.side === 'player')
      .length * 0.45
  eventReward +=
    events.filter(
      (event) => event.type === 'action_failed' && event.side === 'opponent',
    ).length * 0.2
  if (events.some((event) => event.type === 'focus_used' && event.side === 'player')) {
    eventReward -= 0.03
  }
  eventReward -=
    events.filter((event) => event.type === 'switched' && event.side === 'player')
      .length * 0.03

  const hpDamageDealt = before.opponentHp - after.opponentHp
  const hpDamageTaken = before.playerHp - after.playerHp
  const hpLead = after.playerHp - after.opponentHp
  const aliveLead = after.playerAlive - after.opponentAlive
  const faintCount = events.filter((event) => event.type === 'fainted').length
  const noHpProgress = Math.abs(hpDamageDealt) + Math.abs(hpDamageTaken) < 0.002
  const stall = noHpProgress && faintCount === 0 && state.phase !== 'ended' ? -0.04 : 0

  let terminal = 0
  let truncatedReward = 0
  if (state.phase === 'ended') {
    const terminalScale = profile === 'competitive' ? 80 : 35
    if (state.winner === 'player') terminal += terminalScale
    else if (state.winner === 'opponent') terminal -= terminalScale
    else if (profile === 'competitive') terminal -= drawPenalty
  } else if (truncated) {
    if (profile === 'competitive') {
      truncatedReward += aliveLead * 16 + hpLead * 4
      if (aliveLead > 0) truncatedReward += 24
      else if (aliveLead < 0) truncatedReward -= 24
      else if (hpLead > 0.2) truncatedReward += 8
      else if (hpLead < -0.2) truncatedReward -= 8
      else truncatedReward -= drawPenalty * 2
    } else {
      truncatedReward += hpLead * 2
      if (hpLead > 0.2) truncatedReward += 8
      else if (hpLead < -0.2) truncatedReward -= 8
      else truncatedReward -= drawPenalty
    }
  }

  const potential =
    gamma * calculateStatePotential(after) - calculateStatePotential(before)
  const shaped = potential * 3
  const denseTotal = dense + knockout
  const shared = invalid + eventReward + turn + terminal + truncatedReward + stall
  const total =
    profile === 'terminal'
      ? shared
      : profile === 'competitive'
        ? shared + shaped * 3.5 + denseTotal * 0.7
      : profile === 'potential'
        ? shared + shaped
        : shared + denseTotal

  return {
    total,
    dense: denseTotal,
    potential: shaped,
    terminal,
    event: eventReward,
    invalid,
    turn,
    stall,
    truncated: truncatedReward,
  }
}

function calculateStatePotential(metrics: StepMetrics) {
  const hpLead = metrics.playerHp - metrics.opponentHp
  const aliveLead = metrics.playerAlive - metrics.opponentAlive
  const energyLead = metrics.playerEnergy - metrics.opponentEnergy
  return hpLead + aliveLead * 0.8 + energyLead * 0.12
}

function sideSnapshot(state: TeamBattleState, side: BattleSide) {
  const active = getActiveCombatant(state, side)
  return {
    activeSlot: state.teams[side].activeSlot,
    activeName: active.name,
    hp: active.currentHp,
    maxHp: active.maxHp,
    energy: active.energy,
    maxEnergy: active.maxEnergy,
    alive: countAlive(state, side),
    pendingSwitch: state.pendingSwitch[side],
  }
}

function sumHpRatio(state: TeamBattleState, side: BattleSide) {
  return state.teams[side].combatants.reduce(
    (total, combatant) =>
      total + combatant.currentHp / Math.max(1, combatant.maxHp),
    0,
  )
}

function sumEnergyRatio(state: TeamBattleState, side: BattleSide) {
  return state.teams[side].combatants.reduce(
    (total, combatant) =>
      total + combatant.energy / Math.max(1, combatant.maxEnergy),
    0,
  )
}

function countAlive(state: TeamBattleState, side: BattleSide) {
  return state.teams[side].combatants.filter((combatant) => combatant.currentHp > 0)
    .length
}

function firstValidAction(mask: readonly boolean[]) {
  const index = mask.findIndex(Boolean)
  return index >= 0 ? index : 4
}

function getPlayerBridgeActionMask(state: TeamBattleState) {
  return getBridgeActionMask(state, 'player')
}

function getBridgeActionMask(state: TeamBattleState, side: BattleSide) {
  if (isSideWaitingForOpponentReplacement(state, side)) {
    return [false, false, false, false, true, false, false, false, false, false]
  }

  const mask = getTeamBattleActionMask(state, context, side).map(Boolean)
  if (!mask.some(Boolean)) {
    mask[4] = true
  }
  return mask
}

function isSideWaitingForOpponentReplacement(
  state: TeamBattleState,
  side: BattleSide,
) {
  const otherSide: BattleSide = side === 'player' ? 'opponent' : 'player'
  return state.pendingSwitch[otherSide] && !state.pendingSwitch[side]
}

function formatAction(action: TeamBattleAction) {
  if (action.type === 'skill') {
    return action.skillName ?? `slot${(action.skillSlot ?? 0) + 1}`
  }
  if (action.type === 'switch') return `switch:${action.targetSlot}`
  return action.type
}

function formatEvent(event: BattleLogEvent) {
  const details = [
    event.side ? `side=${event.side}` : null,
    event.target ? `target=${event.target}` : null,
    event.skillName ? `skill=${event.skillName}` : null,
    event.damage !== undefined ? `damage=${event.damage}` : null,
    event.hp !== undefined ? `hp=${event.hp}` : null,
    event.energy !== undefined ? `energy=${event.energy}` : null,
    event.amount !== undefined ? `amount=${event.amount}` : null,
    event.mark ? `mark=${event.mark}` : null,
    event.status ? `status=${event.status}` : null,
    event.fromSlot !== undefined ? `from=${event.fromSlot}` : null,
    event.toSlot !== undefined ? `to=${event.toSlot}` : null,
    event.winner ? `winner=${event.winner}` : null,
    event.reason ? `reason=${event.reason}` : null,
    event.effectName ? `effect=${event.effectName}` : null,
  ].filter(Boolean)

  return `${event.type}${details.length ? ` (${details.join(', ')})` : ''}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function resolveOpponentPolicy(
  policy: OpponentPolicyRequest,
  rng: () => number,
): OpponentPolicy {
  if (policy !== 'basic-pool') return policy
  return opponentPolicyPool[Math.floor(rng() * opponentPolicyPool.length)] ??
    opponentPolicyPool[0]
}

function createSeededRng(seed: number) {
  let value = Math.floor(seed) >>> 0
  if (value === 0) value = 0x6d2b79f5
  return () => {
    value += 0x6d2b79f5
    let result = value
    result = Math.imul(result ^ (result >>> 15), result | 1)
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61)
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], rng: () => number) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1))
    const current = items[index]
    items[index] = items[swapIndex]
    items[swapIndex] = current
  }
  return items
}
