import {
  advanceTurn,
  calculateAttributeMultiplier,
  createBattleState,
  createCombatant,
  getDamageCategory,
  getEffectiveStat,
  getSkillActionKind,
  isSkillActionLegal,
  oppositeSide,
} from './engine'
import { getSkillEffect } from './effects'
import {
  decodeMaskPpoAction,
  getMaskPpoActionMask,
  type MaskPpoTeamSlotState,
} from './maskppo'
import type { SkillInfo } from '../types'
import type {
  BattleAction,
  BattleCombatantInput,
  BattleContext,
  BattleFieldState,
  BattleLogEvent,
  BattlePowerModifier,
  BattleRuleOverrides,
  BattleRules,
  BattleSide,
  BattleState,
  BattleStatModifier,
  BattleSkillTraitState,
  Combatant,
  CreateCombatantInput,
  ModifiableBattleStatKey,
  SkillActionLegality,
} from './types'

const teamSides = ['player', 'opponent'] as const satisfies readonly BattleSide[]
const teamBattleSize = 6
const combatantObservationFeatureCount = 10
const combatantSkillSummaryFeatureCount = 8
const activeSkillObservationFeatureCount = 13
const switchActionObservationFeatureCount = 12
const recentActionObservationFeatureCount = 10
const miscObservationFeatureCount = 5
export const teamBattleFocusEnergyGain = 3
export type TeamBattleObservationVersion = 'v1' | 'v2'
export const teamBattleObservationV1Length =
  teamBattleSize * combatantObservationFeatureCount * 2 +
  teamBattleSize * 4 * combatantSkillSummaryFeatureCount * 2 +
  4 * activeSkillObservationFeatureCount * 2 +
  miscObservationFeatureCount
export const teamBattleObservationV2Length =
  teamBattleObservationV1Length +
  (teamBattleSize - 1) * switchActionObservationFeatureCount +
  recentActionObservationFeatureCount * 2
export const teamBattleObservationLength = teamBattleObservationV1Length

export type TeamBattleReplacementMode = 'auto' | 'pending'

export type TeamBattleAction =
  | {
      side: BattleSide
      type: 'skill'
      skillName?: string
      skillSlot?: number
    }
  | {
      side: BattleSide
      type: 'focus'
    }
  | {
      side: BattleSide
      type: 'switch'
      targetSlot: number
    }
  | {
      side: BattleSide
      type: 'wait'
    }

type TriggeredSwiftAction = Extract<TeamBattleAction, { type: 'skill' }> & {
  skillName: string
}

export type DecodedTeamBattleAction =
  | TeamBattleAction
  | {
      side: BattleSide
      type: 'invalid'
      actionIndex: number
      reason: 'out_of_range' | 'no_switch_target'
    }

export type TeamBattleActionLegality =
  | {
      legal: true
    }
  | {
      legal: false
      reason:
        | 'battle_ended'
        | 'fainted'
        | 'invalid_skill_slot'
        | 'missing_skill_name'
        | 'illegal_skill'
        | 'energy_full'
        | 'invalid_switch_slot'
        | 'switch_to_self'
        | 'switch_to_fainted'
        | 'pending_switch'
      skillLegality?: SkillActionLegality
    }

export type TeamBattleSideState = {
  activeSlot: number
  combatants: Combatant[]
}

export type TeamBattleMemory = {
  firstUsedSkillBySlot: Record<BattleSide, Array<string | null>>
  fightingOrGroundSkillUseCount: Record<BattleSide, number>
  lastActionIndexBySide: Record<BattleSide, number | null>
  immortalReviveCountdownBySlot: Record<BattleSide, Array<number | null>>
  immortalRevivedBySlot: Record<BattleSide, boolean[]>
}

export type TeamBattleState = {
  turn: number
  phase: BattleState['phase']
  rules: BattleRules
  field: BattleFieldState
  replacementMode: TeamBattleReplacementMode
  pendingSwitch: Record<BattleSide, boolean>
  memory: TeamBattleMemory
  teams: Record<BattleSide, TeamBattleSideState>
  winner: BattleSide | null
  log: BattleLogEvent[]
}

export type CreateTeamBattleStateInput = {
  player: readonly BattleCombatantInput[]
  opponent: readonly BattleCombatantInput[]
  rules?: BattleRuleOverrides
  replacementMode?: TeamBattleReplacementMode
}

export function createTeamBattleState(
  input: CreateTeamBattleStateInput,
): TeamBattleState {
  assertTeamInputSize('player', input.player)
  assertTeamInputSize('opponent', input.opponent)

  const openingState = createBattleState({
    player: input.player[0],
    opponent: input.opponent[0],
    rules: input.rules,
  })
  const rules = openingState.rules
  const state: TeamBattleState = {
    turn: 0,
    phase: 'ready',
    rules,
    field: cloneBattleField(openingState.field),
    replacementMode: input.replacementMode ?? 'auto',
    pendingSwitch: {
      player: false,
      opponent: false,
    },
    memory: createTeamBattleMemory(),
    winner: null,
    teams: {
      player: {
        activeSlot: 0,
        combatants: createTeamCombatants('player', input.player, rules),
      },
      opponent: {
        activeSlot: 0,
        combatants: createTeamCombatants('opponent', input.opponent, rules),
      },
    },
    log: [...openingState.log],
  }

  state.teams.player.combatants[0] = cloneCombatant(
    openingState.combatants.player,
  )
  state.teams.opponent.combatants[0] = cloneCombatant(
    openingState.combatants.opponent,
  )
  state.teams.player.activeSlot = getFirstAliveSlot(state, 'player') ?? 0
  state.teams.opponent.activeSlot = getFirstAliveSlot(state, 'opponent') ?? 0
  applyTeamCompositionPassives(state)
  for (const side of teamSides) {
    applyTeamEntryEffects(state, side, 'battle_start')
  }
  return state
}

export function advanceTeamBattleTurn(
  state: TeamBattleState,
  context: BattleContext,
  actions: readonly TeamBattleAction[],
): TeamBattleState {
  if (state.phase === 'ended') return state

  const nextState = cloneTeamBattleState(state)
  const turn = state.turn + 1
  nextState.turn = turn
  nextState.log.push({ type: 'turn_started', turn })
  tickImmortalRevives(nextState)

  const resolvedActions: Record<BattleSide, TeamBattleAction> = {
    player: actions.find((action) => action.side === 'player') ?? {
      side: 'player',
      type: 'wait',
    },
    opponent: actions.find((action) => action.side === 'opponent') ?? {
      side: 'opponent',
      type: 'wait',
    },
  }

  const pendingSides = teamSides.filter((side) => nextState.pendingSwitch[side])
  if (pendingSides.length > 0) {
    for (const side of pendingSides) {
      const legality = isTeamBattleActionLegal(
        nextState,
        context,
        resolvedActions[side],
      )
      if (!legality.legal) {
        nextState.log.push({
          type: 'action_failed',
          turn,
          side,
          reason: legality.reason,
        })
        resolvedActions[side] = { side, type: 'wait' }
      }
    }

    for (const side of pendingSides) {
      const action = resolvedActions[side]
      if (action.type !== 'switch') continue
      switchActiveSlot(
        nextState,
        side,
        action.targetSlot,
        'forced_switch',
        'pending_switch',
      )
    }

    recordChosenActionIndexes(nextState, resolvedActions)
    settleTeamBattleOutcome(nextState)
    tickTeamField(nextState)
    return nextState
  }

  for (const side of teamSides) {
    const legality = isTeamBattleActionLegal(nextState, context, resolvedActions[side])
    if (!legality.legal) {
      nextState.log.push({
        type: 'action_failed',
        turn,
        side,
        reason: legality.reason,
      })
      resolvedActions[side] = { side, type: 'wait' }
    }
  }
  recordChosenActionIndexes(nextState, resolvedActions)

  for (const side of teamSides) {
    const action = resolvedActions[side]
    if (action.type !== 'switch') continue
    switchActiveSlot(nextState, side, action.targetSlot, 'switched')
  }

  for (const side of teamSides) {
    const action = resolvedActions[side]
    if (action.type !== 'focus') continue
    applyFocus(nextState, side)
  }

  const activeActions = getPostSwitchActiveActions(
    nextState,
    context,
    resolvedActions,
  )
  const activeState = createActiveBattleState(nextState, state.turn)
  applyTeamActiveSkillTraits(nextState, activeState, context)
  applyTeamActionPriorityPassives(nextState, activeState, activeActions, context)
  applyTeamSwitchConditionalDamageModifiers(
    activeState,
    activeActions,
    resolvedActions,
  )
  const activeResult = advanceTurn(activeState, context, [
    toSingleBattleAction(nextState, activeActions.player),
    toSingleBattleAction(nextState, activeActions.opponent),
  ])
  clearTemporaryTeamPriorityModifiers(activeResult)
  clearTemporaryTeamPowerModifiers(activeResult)

  mergeActiveResult(nextState, activeResult)
  applyTeamSwitchFollowupSkillEffects(
    nextState,
    activeResult.log,
    resolvedActions,
  )
  recordTeamSkillUsage(nextState, activeResult.log)
  recordTeamSkillUsePassives(nextState, context, activeResult.log)
  applyDefeatedByEnemyPassives(nextState, activeResult.log)
  scheduleImmortalRevives(nextState, activeResult.log)
  applySkillSwitchOutEffects(nextState, activeResult.log)
  settleTeamBattleOutcome(nextState)

  return nextState
}

export function adjudicateTeamBattleByAliveCount(
  state: TeamBattleState,
  reason = 'turn_limit_alive_count',
): TeamBattleState {
  if (state.phase === 'ended') return state

  const playerAlive = countAliveTeamCombatants(state, 'player')
  const opponentAlive = countAliveTeamCombatants(state, 'opponent')
  if (playerAlive === opponentAlive) return state

  const nextState = cloneTeamBattleState(state)
  const winner: BattleSide = playerAlive > opponentAlive ? 'player' : 'opponent'
  nextState.phase = 'ended'
  nextState.winner = winner
  nextState.pendingSwitch.player = false
  nextState.pendingSwitch.opponent = false
  nextState.log.push({
    type: 'battle_ended',
    turn: nextState.turn,
    winner,
    reason,
  })
  return nextState
}

export function getTeamBattleActionMask(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
) {
  const pendingSwitch = state.pendingSwitch[side]
  return getMaskPpoActionMask({
    activeSlot: state.teams[side].activeSlot,
    team: getMaskPpoTeamSlots(state, side),
    skillLegalities: pendingSwitch
      ? getPendingSwitchSkillLegalities()
      : getActiveSkillLegalities(state, context, side),
    canFocus: !pendingSwitch && canFocus(state, side),
  })
}

export function decodeTeamBattleAction(
  state: TeamBattleState,
  side: BattleSide,
  actionIndex: number,
): DecodedTeamBattleAction {
  const decoded = decodeMaskPpoAction(
    actionIndex,
    state.teams[side].activeSlot,
    getMaskPpoTeamSlots(state, side),
  )

  if (decoded.kind === 'invalid') {
    return {
      side,
      type: 'invalid',
      actionIndex,
      reason: decoded.reason,
    }
  }
  if (decoded.kind === 'skill') {
    return {
      side,
      type: 'skill',
      skillSlot: decoded.skillSlot,
    }
  }
  if (decoded.kind === 'focus') {
    return {
      side,
      type: 'focus',
    }
  }
  return {
    side,
    type: 'switch',
    targetSlot: decoded.teamSlot,
  }
}

export function isTeamBattleActionLegal(
  state: TeamBattleState,
  context: BattleContext,
  action: TeamBattleAction,
): TeamBattleActionLegality {
  if (state.phase === 'ended') {
    return {
      legal: false,
      reason: 'battle_ended',
    }
  }

  if (state.pendingSwitch[action.side] && action.type !== 'switch') {
    return {
      legal: false,
      reason: 'pending_switch',
    }
  }

  if (action.type === 'wait') return { legal: true }

  const active = getActiveCombatant(state, action.side)
  if (active.currentHp <= 0 && action.type !== 'switch') {
    return {
      legal: false,
      reason: 'fainted',
    }
  }

  if (action.type === 'focus') {
    return active.energy < active.maxEnergy
      ? { legal: true }
      : { legal: false, reason: 'energy_full' }
  }

  if (action.type === 'switch') {
    const team = state.teams[action.side]
    const target = team.combatants[action.targetSlot]
    if (!target) return { legal: false, reason: 'invalid_switch_slot' }
    if (team.activeSlot === action.targetSlot) {
      return { legal: false, reason: 'switch_to_self' }
    }
    if (target.currentHp <= 0) {
      return { legal: false, reason: 'switch_to_fainted' }
    }
    return { legal: true }
  }

  const skillName = resolveTeamSkillName(active, action)
  if (!skillName) {
    return {
      legal: false,
      reason:
        action.skillSlot === undefined ? 'missing_skill_name' : 'invalid_skill_slot',
    }
  }

  const activeBattleState = createActiveBattleState(state, state.turn)
  applyTeamActiveSkillTraits(state, activeBattleState, context)
  const skillLegality = isSkillActionLegal(
    activeBattleState,
    context,
    action.side,
    skillName,
  )
  if (!skillLegality.legal) {
    return {
      legal: false,
      reason: 'illegal_skill',
      skillLegality,
    }
  }

  return { legal: true }
}

export function chooseFirstLegalTeamAction(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
  preferredSkillNames: readonly string[] = [],
): TeamBattleAction {
  const active = getActiveCombatant(state, side)

  for (const skillName of preferredSkillNames) {
    const action = { side, type: 'skill', skillName } as const
    if (isTeamBattleActionLegal(state, context, action).legal) return action
  }

  for (const skillName of active.skillSlots) {
    const action = { side, type: 'skill', skillName } as const
    if (isTeamBattleActionLegal(state, context, action).legal) return action
  }

  const focus = { side, type: 'focus' } as const
  if (isTeamBattleActionLegal(state, context, focus).legal) return focus

  const switchTarget = getSwitchTargets(state, side)[0]
  if (switchTarget !== undefined) {
    return {
      side,
      type: 'switch',
      targetSlot: switchTarget,
    }
  }

  return { side, type: 'wait' }
}

export function getSwitchTargets(state: TeamBattleState, side: BattleSide) {
  const team = state.teams[side]
  return team.combatants
    .map((combatant, slot) => ({ combatant, slot }))
    .filter(
      ({ combatant, slot }) =>
        slot !== team.activeSlot && combatant.currentHp > 0,
    )
    .map(({ slot }) => slot)
    .slice(0, teamBattleSize - 1)
}

export function getActiveCombatant(state: TeamBattleState, side: BattleSide) {
  return state.teams[side].combatants[state.teams[side].activeSlot]
}

export function encodeTeamBattleObservation(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
  options: { version?: TeamBattleObservationVersion } = {},
) {
  const values: number[] = []
  const opponentSide = oppositeSide(side)
  const version = options.version ?? 'v1'
  const targetLength =
    version === 'v2' ? teamBattleObservationV2Length : teamBattleObservationV1Length

  for (const observedSide of [side, opponentSide]) {
    const team = state.teams[observedSide]
    for (const [slot, combatant] of team.combatants
      .slice(0, teamBattleSize)
      .entries()) {
      pushCombatantObservation(values, combatant, slot === team.activeSlot)
    }
  }

  for (const observedSide of [side, opponentSide]) {
    const team = state.teams[observedSide]
    for (const combatant of team.combatants.slice(0, teamBattleSize)) {
      pushCombatantSkillSummaries(values, context, combatant)
    }
  }

  for (const observedSide of [side, opponentSide]) {
    pushActiveSkillObservations(values, state, context, observedSide)
  }
  if (version === 'v2') pushSwitchActionObservations(values, state, side)
  if (version === 'v2') pushRecentActionObservations(values, state, side)

  values.push(state.teams[side].activeSlot / (teamBattleSize - 1))
  values.push(state.teams[opponentSide].activeSlot / (teamBattleSize - 1))
  values.push(state.pendingSwitch[side] ? 1 : 0)
  values.push(state.pendingSwitch[opponentSide] ? 1 : 0)
  values.push(Math.min(1, state.turn / 100))

  while (values.length < targetLength) values.push(0)
  if (values.length > targetLength) {
    values.length = targetLength
  }

  return values
}

function pushCombatantObservation(
  values: number[],
  combatant: Combatant,
  isActive: boolean,
) {
  values.push(combatant.currentHp > 0 ? 1 : 0)
  values.push(clamp01(combatant.maxHp > 0 ? combatant.currentHp / combatant.maxHp : 0))
  values.push(
    clamp01(combatant.maxEnergy > 0 ? combatant.energy / combatant.maxEnergy : 0),
  )
  values.push(isActive ? 1 : 0)
  values.push(clamp01(combatant.maxHp / 700))
  values.push(clamp01(getEffectiveStat(combatant, 'physicalAttack') / 500))
  values.push(clamp01(getEffectiveStat(combatant, 'physicalDefense') / 500))
  values.push(clamp01(getEffectiveStat(combatant, 'magicAttack') / 500))
  values.push(clamp01(getEffectiveStat(combatant, 'magicDefense') / 500))
  values.push(clamp01(getEffectiveStat(combatant, 'speed') / 500))
}

function pushCombatantSkillSummaries(
  values: number[],
  context: BattleContext,
  combatant: Combatant,
) {
  for (let slot = 0; slot < 4; slot += 1) {
    const skillName = combatant.skillSlots[slot]
    const skill = skillName ? context.skillMap.get(skillName) : null
    if (!skill) {
      pushEmptySkillSummary(values)
      continue
    }

    const actionKind = getSkillActionKind(skill)
    const effect = getSkillEffect(skill.name)
    values.push(1)
    values.push(clamp01((skill.power ?? 0) / 500))
    values.push(clamp01((skill.energy ?? 0) / 10))
    values.push(combatant.energy >= (skill.energy ?? 0) ? 1 : 0)
    values.push(actionKind === 'attack' ? 1 : 0)
    values.push(actionKind === 'defense' ? 1 : 0)
    values.push(actionKind === 'status' ? 1 : 0)
    values.push(effect?.response ? 1 : 0)
  }
}

function pushEmptySkillSummary(values: number[]) {
  for (let index = 0; index < combatantSkillSummaryFeatureCount; index += 1) {
    values.push(0)
  }
}

function pushActiveSkillObservations(
  values: number[],
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
) {
  const active = getActiveCombatant(state, side)
  const target = getActiveCombatant(state, oppositeSide(side))

  for (let slot = 0; slot < 4; slot += 1) {
    const skillName = active.skillSlots[slot]
    const skill = skillName ? context.skillMap.get(skillName) : null
    if (!skill) {
      pushEmptySkillObservation(values)
      continue
    }

    const legality = isTeamBattleActionLegal(state, context, {
      side,
      type: 'skill',
      skillSlot: slot,
    })
    const actionKind = getSkillActionKind(skill)
    const damageCategory = getDamageCategory(skill)
    const effect = getSkillEffect(skill.name)
    const attributeMultiplier = skill.attribute
      ? calculateAttributeMultiplier(skill.attribute, target.attributes, context.attributeMap)
      : 1

    values.push(legality.legal ? 1 : 0)
    values.push(clamp01((skill.power ?? 0) / 500))
    values.push(clamp01((skill.energy ?? 0) / 10))
    values.push(actionKind === 'attack' ? 1 : 0)
    values.push(actionKind === 'defense' ? 1 : 0)
    values.push(actionKind === 'status' ? 1 : 0)
    values.push(damageCategory === 'physical' ? 1 : 0)
    values.push(damageCategory === 'magical' ? 1 : 0)
    values.push(damageCategory === 'status' ? 1 : 0)
    values.push(skill.attribute && active.attributes.includes(skill.attribute) ? 1 : 0)
    values.push(clamp01(attributeMultiplier / 2))
    values.push(effect?.response ? 1 : 0)
    values.push(hasSwiftOnSwitchIn(state, side, active, skill, slot) ? 1 : 0)
  }
}

function pushEmptySkillObservation(values: number[]) {
  for (let index = 0; index < activeSkillObservationFeatureCount; index += 1) {
    values.push(0)
  }
}

function pushSwitchActionObservations(
  values: number[],
  state: TeamBattleState,
  side: BattleSide,
) {
  const active = getActiveCombatant(state, side)
  const opponent = getActiveCombatant(state, oppositeSide(side))
  const switchTargets = getSwitchTargets(state, side)

  for (let actionOffset = 0; actionOffset < teamBattleSize - 1; actionOffset += 1) {
    const targetSlot = switchTargets[actionOffset]
    const target =
      targetSlot === undefined ? null : state.teams[side].combatants[targetSlot]
    if (!target) {
      pushEmptySwitchActionObservation(values)
      continue
    }

    values.push(1)
    values.push(targetSlot / (teamBattleSize - 1))
    values.push(clamp01(target.maxHp > 0 ? target.currentHp / target.maxHp : 0))
    values.push(clamp01(target.maxEnergy > 0 ? target.energy / target.maxEnergy : 0))
    values.push(clamp01(target.maxHp / 700))
    values.push(clamp01(getEffectiveStat(target, 'physicalAttack') / 500))
    values.push(clamp01(getEffectiveStat(target, 'physicalDefense') / 500))
    values.push(clamp01(getEffectiveStat(target, 'magicAttack') / 500))
    values.push(clamp01(getEffectiveStat(target, 'magicDefense') / 500))
    values.push(clamp01(getEffectiveStat(target, 'speed') / 500))
    values.push(getEffectiveStat(target, 'speed') >= getEffectiveStat(opponent, 'speed') ? 1 : 0)
    values.push(target.currentHp > active.currentHp ? 1 : 0)
  }
}

function pushEmptySwitchActionObservation(values: number[]) {
  for (let index = 0; index < switchActionObservationFeatureCount; index += 1) {
    values.push(0)
  }
}

function pushRecentActionObservations(
  values: number[],
  state: TeamBattleState,
  side: BattleSide,
) {
  for (const observedSide of [side, oppositeSide(side)]) {
    const actionIndex = state.memory.lastActionIndexBySide[observedSide]
    for (let index = 0; index < recentActionObservationFeatureCount; index += 1) {
      values.push(actionIndex === index ? 1 : 0)
    }
  }
}

function recordChosenActionIndexes(
  state: TeamBattleState,
  actions: Record<BattleSide, TeamBattleAction>,
) {
  for (const side of teamSides) {
    state.memory.lastActionIndexBySide[side] = getActionObservationIndex(
      state,
      actions[side],
    )
  }
}

function getActionObservationIndex(
  state: TeamBattleState,
  action: TeamBattleAction,
) {
  if (action.type === 'skill') {
    const active = getActiveCombatant(state, action.side)
    const slot =
      action.skillSlot ??
      (action.skillName ? active.skillSlots.indexOf(action.skillName) : -1)
    return slot >= 0 && slot < 4 ? slot : 4
  }
  if (action.type === 'switch') {
    const switchIndex = getSwitchTargets(state, action.side).indexOf(action.targetSlot)
    return switchIndex >= 0 ? 5 + switchIndex : 4
  }
  return 4
}

function createTeamCombatants(
  side: BattleSide,
  inputs: readonly BattleCombatantInput[],
  rules: BattleRules,
) {
  assertTeamInputSize(side, inputs)

  return inputs.map((input) =>
    createCombatant(normalizeCombatantInput(side, input), rules),
  )
}

function createTeamBattleMemory(): TeamBattleMemory {
  return {
    firstUsedSkillBySlot: {
      player: Array.from({ length: teamBattleSize }, () => null),
      opponent: Array.from({ length: teamBattleSize }, () => null),
    },
    fightingOrGroundSkillUseCount: {
      player: 0,
      opponent: 0,
    },
    lastActionIndexBySide: {
      player: null,
      opponent: null,
    },
    immortalReviveCountdownBySlot: {
      player: Array.from({ length: teamBattleSize }, () => null),
      opponent: Array.from({ length: teamBattleSize }, () => null),
    },
    immortalRevivedBySlot: {
      player: Array.from({ length: teamBattleSize }, () => false),
      opponent: Array.from({ length: teamBattleSize }, () => false),
    },
  }
}

function assertTeamInputSize(
  side: BattleSide,
  inputs: readonly BattleCombatantInput[],
) {
  if (inputs.length !== teamBattleSize) {
    throw new Error(`${side} team must contain exactly ${teamBattleSize} combatants`)
  }
}

function normalizeCombatantInput(
  side: BattleSide,
  input: BattleCombatantInput,
): CreateCombatantInput {
  if ('pet' in input) {
    return {
      ...input,
      side,
    }
  }

  return {
    side,
    pet: input,
  }
}

function getFirstAliveSlot(state: TeamBattleState, side: BattleSide) {
  const slot = state.teams[side].combatants.findIndex(
    (combatant) => combatant.currentHp > 0,
  )
  return slot < 0 ? null : slot
}

export function countAliveTeamCombatants(
  state: TeamBattleState,
  side: BattleSide,
) {
  return state.teams[side].combatants.filter((combatant) => combatant.currentHp > 0)
    .length
}

function tickImmortalRevives(state: TeamBattleState) {
  for (const side of teamSides) {
    const countdowns = state.memory.immortalReviveCountdownBySlot[side]
    for (const [slotText, countdown] of countdowns.entries()) {
      if (countdown === null) continue

      const slot = Number(slotText)
      const nextCountdown = countdown - 1
      if (nextCountdown > 0) {
        countdowns[slot] = nextCountdown
        continue
      }

      countdowns[slot] = null
      const combatant = state.teams[side].combatants[slot]
      if (!combatant || combatant.currentHp > 0) continue

      combatant.currentHp = 1
      if (state.teams[side].activeSlot === slot) {
        state.pendingSwitch[side] = false
      }
      state.log.push({
        type: 'effect_applied',
        turn: state.turn,
        side,
        skillName: '不朽',
        effectName: 'immortal_revived',
        hp: combatant.currentHp,
      })
    }
  }
}

function switchActiveSlot(
  state: TeamBattleState,
  side: BattleSide,
  targetSlot: number,
  type: 'switched' | 'forced_switch',
  reason?: string,
) {
  const team = state.teams[side]
  const fromSlot = team.activeSlot
  applyCleanlinessInheritance(state, side, fromSlot, targetSlot)
  team.activeSlot = targetSlot
  state.pendingSwitch[side] = false
  const active = team.combatants[targetSlot]
  state.log.push({
    type,
    turn: state.turn,
    side,
    fromSlot,
    toSlot: targetSlot,
    petName: active.name,
    reason,
  })
  applyTeamEntryEffects(state, side, reason ?? type)
  applyNightmareReplacementPenalty(state, side)
}

function applyCleanlinessInheritance(
  state: TeamBattleState,
  side: BattleSide,
  fromSlot: number,
  targetSlot: number,
) {
  if (fromSlot === targetSlot) return

  const outgoing = state.teams[side].combatants[fromSlot]
  const incoming = state.teams[side].combatants[targetSlot]
  if (
    !outgoing ||
    !incoming ||
    outgoing.currentHp <= 0 ||
    outgoing.traitName !== '洁癖'
  ) {
    return
  }

  inheritCombatantEffects(
    state,
    side,
    outgoing,
    incoming,
    '洁癖',
    'cleanliness_inheritance',
    false,
    `cleanliness:${fromSlot}`,
  )
}

function inheritCombatantEffects(
  state: TeamBattleState,
  side: BattleSide,
  source: Combatant,
  target: Combatant,
  sourceSkillName: string,
  reason: string,
  positiveOnly: boolean,
  idPrefix: string,
) {
  let inherited = 0

  for (const modifier of source.effects.statModifiers) {
    if (!isTransferableStatModifier(modifier, positiveOnly)) continue
    inherited += 1
    upsertTeamStatModifier(target, {
      ...modifier,
      id: `${idPrefix}:stat:${modifier.id}`,
      sourceSkillName,
    })
    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side,
      target: side,
      skillName: sourceSkillName,
      effectName: 'stat_modifier',
      stat: modifier.stat,
      percent: modifier.percent,
      amount: modifier.flat,
      reason,
    })
  }

  for (const modifier of source.effects.powerModifiers) {
    if (!isTransferablePowerModifier(modifier, positiveOnly)) continue
    inherited += 1
    upsertById(target.effects.powerModifiers, {
      ...modifier,
      id: `${idPrefix}:power:${modifier.id}`,
      sourceSkillName,
    })
  }
  for (const modifier of source.effects.hitModifiers) {
    if (!isTransferableAmountModifier(modifier.amount, positiveOnly)) continue
    inherited += 1
    upsertById(target.effects.hitModifiers, {
      ...modifier,
      id: `${idPrefix}:hit:${modifier.id}`,
      sourceSkillName,
    })
  }
  for (const modifier of source.effects.priorityModifiers) {
    if (!isTransferableAmountModifier(modifier.amount, positiveOnly)) continue
    inherited += 1
    upsertById(target.effects.priorityModifiers, {
      ...modifier,
      id: `${idPrefix}:priority:${modifier.id}`,
      sourceSkillName,
    })
  }
  for (const modifier of source.effects.energyCostModifiers) {
    if (!isTransferableEnergyCostModifier(modifier.amount, positiveOnly)) continue
    inherited += 1
    upsertById(target.effects.energyCostModifiers, {
      ...modifier,
      id: `${idPrefix}:energy:${modifier.id}`,
      sourceSkillName,
    })
  }
  for (const status of source.effects.statuses) {
    if (!isTransferableStatus(status, positiveOnly)) continue
    inherited += 1
    upsertById(target.effects.statuses, {
      ...status,
      id: `${idPrefix}:status:${status.id}`,
      sourceSkillName,
    })
  }
  for (const mark of source.effects.marks) {
    if (!isTransferableStatus(mark, positiveOnly)) continue
    inherited += 1
    upsertById(target.effects.marks, {
      ...mark,
      id: `${idPrefix}:mark:${mark.id}`,
      sourceSkillName,
    })
  }

  if (inherited <= 0) return
  state.log.push({
    type: 'effect_applied',
    turn: state.turn,
    side,
    target: side,
    skillName: sourceSkillName,
    effectName: 'effect_inheritance',
    amount: inherited,
    reason,
  })
}

function isTransferableStatModifier(
  modifier: BattleStatModifier,
  positiveOnly: boolean,
) {
  const changed = modifier.percent !== 0 || modifier.flat !== 0
  if (!changed) return false
  if (!positiveOnly) return true
  return modifier.percent > 0 || modifier.flat > 0
}

function isTransferablePowerModifier(
  modifier: BattlePowerModifier,
  positiveOnly: boolean,
) {
  const changed = modifier.amount !== 0 || modifier.multiplier !== 1
  if (!changed) return false
  if (!positiveOnly) return true
  return modifier.amount > 0 || modifier.multiplier > 1
}

function isTransferableAmountModifier(amount: number, positiveOnly: boolean) {
  if (amount === 0) return false
  return positiveOnly ? amount > 0 : true
}

function isTransferableEnergyCostModifier(
  amount: number,
  positiveOnly: boolean,
) {
  if (amount === 0) return false
  return positiveOnly ? amount < 0 : true
}

function isTransferableStatus(
  effect: { kind: string; stacks: number },
  positiveOnly: boolean,
) {
  if (effect.stacks <= 0) return false
  return positiveOnly ? isPositiveStatusKind(effect.kind) : true
}

function isPositiveStatusKind(kind: string) {
  return ['cute', 'wet', 'photosynthesis', 'sandstorm'].includes(kind)
}

function upsertById<T extends { id: string }>(items: T[], item: T) {
  const existingIndex = items.findIndex((candidate) => candidate.id === item.id)
  if (existingIndex >= 0) {
    items[existingIndex] = item
  } else {
    items.push(item)
  }
}

function applyNightmareReplacementPenalty(
  state: TeamBattleState,
  switchedSide: BattleSide,
) {
  const nightmareSide = oppositeSide(switchedSide)
  const nightmare = getActiveCombatant(state, nightmareSide)
  const incoming = getActiveCombatant(state, switchedSide)
  if (
    nightmare.currentHp <= 0 ||
    incoming.currentHp <= 0 ||
    nightmare.traitName !== '做噩梦'
  ) {
    return
  }

  const before = incoming.energy
  incoming.energy = Math.max(0, incoming.energy - 3)
  const amount = incoming.energy - before
  if (amount === 0) return

  state.log.push({
    type: 'effect_applied',
    turn: state.turn,
    side: switchedSide,
    target: nightmareSide,
    skillName: '做噩梦',
    effectName: 'energy_delta',
    amount,
    energy: incoming.energy,
    reason: 'replacement_nightmare',
  })
}

function applyFocus(state: TeamBattleState, side: BattleSide) {
  const active = getActiveCombatant(state, side)
  const before = active.energy
  active.energy = Math.min(
    active.maxEnergy,
    active.energy + teamBattleFocusEnergyGain,
  )
  state.log.push({
    type: 'focus_used',
    turn: state.turn,
    side,
    amount: active.energy - before,
    energy: active.energy,
  })
}

function tickTeamField(state: TeamBattleState) {
  const weather = state.field.weather
  if (!weather) return

  const remainingTurns = weather.remainingTurns - 1
  if (remainingTurns <= 0) {
    state.field.weather = null
    state.log.push({
      type: 'effect_expired',
      turn: state.turn,
      side: 'player',
      effectName: 'weather',
      reason: weather.kind,
    })
    return
  }

  state.field.weather = {
    ...weather,
    remainingTurns,
  }
}

function applyTeamEntryEffects(
  state: TeamBattleState,
  side: BattleSide,
  reason: string,
) {
  const active = getActiveCombatant(state, side)
  if (active.currentHp <= 0) return

  if (active.skillSlots.includes('落雷')) {
    applySkillSpecificPowerBonus(state, active, '落雷', 20, reason)
  }
  if (active.traitName === '渗透') {
    applyInfiltrationEntryBonus(state, side, reason)
  }
}

function applyTeamCompositionPassives(state: TeamBattleState) {
  for (const side of teamSides) {
    const hasBugTeammate = state.teams[side].combatants.some((combatant) =>
      combatant.attributes.includes('bug'),
    )
    if (!hasBugTeammate) continue

    for (const combatant of state.teams[side].combatants) {
      if (combatant.traitName !== '壮胆') continue
      for (const stat of ['physicalAttack', 'magicAttack'] as const) {
        applyTeamStatPercentModifier(
          state,
          combatant,
          '壮胆',
          stat,
          0.5,
          'bug_teammate',
        )
      }
    }
  }
}

function applyInfiltrationEntryBonus(
  state: TeamBattleState,
  side: BattleSide,
  reason: string,
) {
  const count = state.memory.fightingOrGroundSkillUseCount[side]
  if (count <= 0) return

  const active = getActiveCombatant(state, side)
  const percent = count * 0.05
  for (const stat of [
    'physicalAttack',
    'magicAttack',
    'physicalDefense',
    'magicDefense',
  ] as const) {
    applyTeamStatPercentModifier(
      state,
      active,
      '渗透',
      stat,
      percent,
      reason,
      `stat:渗透:${stat}:team-history`,
    )
  }
}

function applySkillSpecificPowerBonus(
  state: TeamBattleState,
  combatant: Combatant,
  skillName: string,
  amount: number,
  reason: string,
) {
  const id = `power:${skillName}:team-entry`
  const existing = combatant.effects.powerModifiers.find((item) => item.id === id)
  const item: BattlePowerModifier = {
    id,
    sourceSkillName: skillName,
    skillName,
    amount: (existing?.amount ?? 0) + amount,
    multiplier: 1,
    remainingTurns: null,
  }
  const existingIndex = combatant.effects.powerModifiers.findIndex(
    (modifier) => modifier.id === id,
  )
  if (existingIndex >= 0) {
    combatant.effects.powerModifiers[existingIndex] = item
  } else {
    combatant.effects.powerModifiers.push(item)
  }
  state.log.push({
    type: 'effect_applied',
    turn: state.turn,
    side: combatant.side,
    skillName,
    effectName: 'skill_power_bonus',
    amount: item.amount,
    reason,
  })
}

function applyTeamStatPercentModifier(
  state: TeamBattleState,
  combatant: Combatant,
  sourceSkillName: string,
  stat: ModifiableBattleStatKey,
  percent: number,
  reason: string,
  id = `stat:${sourceSkillName}:${stat}`,
) {
  const item: BattleStatModifier = {
    id,
    sourceSkillName,
    stat,
    percent,
    flat: 0,
    remainingTurns: null,
  }
  upsertTeamStatModifier(combatant, item)
  state.log.push({
    type: 'effect_applied',
    turn: state.turn,
    side: combatant.side,
    skillName: sourceSkillName,
    effectName: 'stat_modifier',
    stat,
    percent,
    amount: 0,
    reason,
  })
}

function applyTeamStatFlatModifier(
  state: TeamBattleState,
  combatant: Combatant,
  sourceSkillName: string,
  stat: ModifiableBattleStatKey,
  flat: number,
  reason: string,
  id = `stat:${sourceSkillName}:${stat}:flat`,
) {
  const item: BattleStatModifier = {
    id,
    sourceSkillName,
    stat,
    percent: 0,
    flat,
    remainingTurns: null,
  }
  upsertTeamStatModifier(combatant, item)
  state.log.push({
    type: 'effect_applied',
    turn: state.turn,
    side: combatant.side,
    skillName: sourceSkillName,
    effectName: 'stat_modifier',
    stat,
    percent: 0,
    amount: flat,
    reason,
  })
}

function upsertTeamStatModifier(
  combatant: Combatant,
  item: BattleStatModifier,
) {
  const existingIndex = combatant.effects.statModifiers.findIndex(
    (modifier) => modifier.id === item.id,
  )
  if (existingIndex >= 0) {
    combatant.effects.statModifiers[existingIndex] = item
  } else {
    combatant.effects.statModifiers.push(item)
  }
}

function getPostSwitchActiveActions(
  state: TeamBattleState,
  context: BattleContext,
  actions: Record<BattleSide, TeamBattleAction>,
): Record<BattleSide, TeamBattleAction> {
  return {
    player: getPostSwitchActiveAction(state, context, actions.player),
    opponent: getPostSwitchActiveAction(state, context, actions.opponent),
  }
}

function applyTeamActionPriorityPassives(
  teamState: TeamBattleState,
  activeState: BattleState,
  actions: Record<BattleSide, TeamBattleAction>,
  context: BattleContext,
) {
  for (const side of teamSides) {
    const action = actions[side]
    if (action.type !== 'skill') continue

    const skillName = resolveTeamSkillName(getActiveCombatant(teamState, side), action)
    const skill = skillName ? context.skillMap.get(skillName) : null
    if (!skill || !hasHurricaneTeamSwift(teamState, side, skill)) continue

    activeState.combatants[side].effects.priorityModifiers.push({
      id: 'priority:team:飓风',
      sourceSkillName: '飓风',
      amount: 1,
      remainingTurns: null,
    })
    teamState.log.push({
      type: 'effect_applied',
      turn: teamState.turn,
      side,
      skillName: skill.name,
      effectName: 'priority_modifier',
      amount: 1,
      reason: 'hurricane_same_skill_teammate',
    })
  }
}

function clearTemporaryTeamPriorityModifiers(state: BattleState) {
  for (const side of teamSides) {
    state.combatants[side].effects.priorityModifiers = state.combatants[
      side
    ].effects.priorityModifiers.filter(
      (modifier) => modifier.id !== 'priority:team:飓风',
    )
  }
}

function applyTeamSwitchConditionalDamageModifiers(
  activeState: BattleState,
  actions: Record<BattleSide, TeamBattleAction>,
  originalActions: Record<BattleSide, TeamBattleAction>,
) {
  for (const side of teamSides) {
    const action = actions[side]
    if (action.type !== 'skill' || action.skillName !== '回旋踢') continue
    if (originalActions[oppositeSide(side)].type !== 'switch') continue

    activeState.combatants[side].effects.powerModifiers.push({
      id: 'power:team-switch:回旋踢',
      sourceSkillName: '回旋踢',
      skillName: '回旋踢',
      amount: 0,
      multiplier: 2,
      remainingTurns: null,
    })
  }
}

function clearTemporaryTeamPowerModifiers(state: BattleState) {
  for (const side of teamSides) {
    state.combatants[side].effects.powerModifiers = state.combatants[
      side
    ].effects.powerModifiers.filter(
      (modifier) => !modifier.id.startsWith('power:team-switch:'),
    )
  }
}

function applyTeamSwitchFollowupSkillEffects(
  state: TeamBattleState,
  log: BattleLogEvent[],
  originalActions: Record<BattleSide, TeamBattleAction>,
) {
  for (const side of teamSides) {
    if (originalActions[oppositeSide(side)].type !== 'switch') continue
    const tauntUsed = log.some(
      (event) =>
        event.type === 'skill_used' &&
        event.side === side &&
        event.skillName === '嘲弄',
    )
    if (!tauntUsed) continue

    applyTeamStatFlatModifier(
      state,
      getActiveCombatant(state, side),
      '嘲弄',
      'speed',
      70,
      'target_switched',
    )
  }
}

function getPostSwitchActiveAction(
  state: TeamBattleState,
  context: BattleContext,
  action: TeamBattleAction,
): TeamBattleAction {
  if (action.type !== 'switch') return action

  const swiftAction = chooseSwitchInSwiftAction(state, context, action.side)
  if (!swiftAction) {
    return {
      side: action.side,
      type: 'wait',
    }
  }

  state.log.push({
    type: 'swift_triggered',
    turn: state.turn,
    side: action.side,
    skillName: swiftAction.skillName,
    reason: 'active_switch',
  })
  return swiftAction
}

function chooseSwitchInSwiftAction(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
): TriggeredSwiftAction | null {
  const active = getActiveCombatant(state, side)
  const activeBattleState = createActiveBattleState(state, state.turn)

  for (const [slot, skillName] of active.skillSlots.entries()) {
    const skill = context.skillMap.get(skillName)
    if (!skill || !hasSwiftOnSwitchIn(state, side, active, skill, slot)) {
      continue
    }
    if (!isSkillActionLegal(activeBattleState, context, side, skill.name).legal) {
      continue
    }

    return {
      side,
      type: 'skill',
      skillName: skill.name,
    }
  }

  return null
}

function hasHurricaneTeamSwift(
  state: TeamBattleState,
  side: BattleSide,
  skill: SkillInfo,
) {
  const team = state.teams[side]
  const active = getActiveCombatant(state, side)
  if (active.traitName !== '飓风') return false

  return team.combatants.some(
    (teammate, index) =>
      index !== team.activeSlot &&
      teammate.attributes.includes('wing') &&
      teammate.skillSlots.includes(skill.name),
  )
}

function hasSwiftOnSwitchIn(
  state: TeamBattleState,
  side: BattleSide,
  combatant: Combatant,
  skill: SkillInfo,
  zeroBasedSkillSlot: number,
) {
  if (hasNativeSwift(skill)) return true

  if (combatant.traitName === '快锤' && (skill.energy ?? 0) < 3) return true
  if (combatant.traitName === '暴食' && skill.attribute === 'dragon') return true
  if (combatant.traitName === '翼轴' && zeroBasedSkillSlot === 0) return true
  if (
    combatant.traitName === '起飞加速' &&
    state.memory.firstUsedSkillBySlot[side][state.teams[side].activeSlot] ===
      skill.name
  ) {
    return true
  }
  if (combatant.traitName === '飓风') return hasHurricaneTeamSwift(state, side, skill)

  return false
}

function hasNativeSwift(skill: SkillInfo) {
  const text = `${skill.effect ?? ''}${skill.description ?? ''}`
  if (!text.includes('迅捷')) return false
  return !text.includes('释放自己释放过的迅捷技能')
}

function toSingleBattleAction(
  state: TeamBattleState,
  action: TeamBattleAction,
): BattleAction {
  if (action.type !== 'skill') {
    return {
      side: action.side,
      type: 'wait',
    }
  }

  const skillName = resolveTeamSkillName(getActiveCombatant(state, action.side), action)
  if (!skillName) {
    return {
      side: action.side,
      type: 'wait',
    }
  }

  return {
    side: action.side,
    skillName,
  }
}

function resolveTeamSkillName(combatant: Combatant, action: TeamBattleAction) {
  if (action.type !== 'skill') return null
  if (action.skillName) return action.skillName
  if (action.skillSlot === undefined) return null
  return combatant.skillSlots[action.skillSlot] ?? null
}

function getMaskPpoTeamSlots(
  state: TeamBattleState,
  side: BattleSide,
): MaskPpoTeamSlotState[] {
  return state.teams[side].combatants.map((combatant) => ({
    hp: combatant.currentHp,
    maxHp: combatant.maxHp,
    energy: combatant.energy,
    maxEnergy: combatant.maxEnergy,
    alive: combatant.currentHp > 0,
  }))
}

function getActiveSkillLegalities(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
): SkillActionLegality[] {
  const active = getActiveCombatant(state, side)
  const activeState = createActiveBattleState(state, state.turn)
  applyTeamActiveSkillTraits(state, activeState, context)

  return Array.from({ length: 4 }, (_, slot): SkillActionLegality => {
    const skillName = active.skillSlots[slot]
    if (!skillName) return { legal: false, reason: 'unknown_skill' }
    return isSkillActionLegal(activeState, context, side, skillName)
  })
}

function getPendingSwitchSkillLegalities(): SkillActionLegality[] {
  return Array.from({ length: 4 }, (): SkillActionLegality => ({
    legal: false,
    reason: 'fainted',
  }))
}

function canFocus(state: TeamBattleState, side: BattleSide) {
  const active = getActiveCombatant(state, side)
  return active.currentHp > 0 && active.energy < active.maxEnergy
}

function createActiveBattleState(
  state: TeamBattleState,
  turn: number,
): BattleState {
  return {
    turn,
    phase: 'ready',
    rules: cloneBattleRules(state.rules),
    field: cloneBattleField(state.field),
    skillTraits: createTeamActiveSkillTraits(state),
    winner: null,
    combatants: {
      player: cloneCombatant(getActiveCombatant(state, 'player')),
      opponent: cloneCombatant(getActiveCombatant(state, 'opponent')),
    },
    log: [],
  }
}

function cloneBattleField(field: BattleFieldState): BattleFieldState {
  return {
    weather: field.weather ? { ...field.weather } : null,
  }
}

function createTeamActiveSkillTraits(
  _state: TeamBattleState,
): BattleSkillTraitState {
  return {
    swiftSkillNames: {
      player: [],
      opponent: [],
    },
  }
}

function applyTeamActiveSkillTraits(
  teamState: TeamBattleState,
  activeState: BattleState,
  context: BattleContext,
) {
  for (const side of teamSides) {
    const active = getActiveCombatant(teamState, side)
    activeState.skillTraits.swiftSkillNames[side] = active.skillSlots.filter(
      (skillName, slot) => {
        const skill = context.skillMap.get(skillName)
        return skill
          ? skillName !== '疾风连袭' &&
              hasSwiftOnSwitchIn(teamState, side, active, skill, slot)
          : false
      },
    )
  }
}

function mergeActiveResult(
  state: TeamBattleState,
  activeResult: BattleState,
) {
  state.field = cloneBattleField(activeResult.field)

  for (const side of teamSides) {
    const activeSlot = state.teams[side].activeSlot
    state.teams[side].combatants[activeSlot] = cloneCombatant(
      activeResult.combatants[side],
    )
  }

  for (const event of activeResult.log) {
    if (event.type === 'turn_started' || event.type === 'battle_started') continue
    if (event.type === 'battle_ended') continue
    if (event.type === 'action_failed' && event.reason === 'wait') continue
    state.log.push(event)
  }
}

function recordTeamSkillUsage(
  state: TeamBattleState,
  events: readonly BattleLogEvent[],
) {
  for (const event of events) {
    if (event.type !== 'skill_used' || !event.side || !event.skillName) continue

    const activeSlot = state.teams[event.side].activeSlot
    const firstUsedSkills = state.memory.firstUsedSkillBySlot[event.side]
    if (firstUsedSkills[activeSlot]) continue
    firstUsedSkills[activeSlot] = event.skillName
  }
}

function recordTeamSkillUsePassives(
  state: TeamBattleState,
  context: BattleContext,
  events: readonly BattleLogEvent[],
) {
  for (const event of events) {
    if (event.type !== 'skill_used' || !event.side || !event.skillName) continue

    const skill = context.skillMap.get(event.skillName)
    if (!skill) continue

    if (skill.attribute === 'fighting' || skill.attribute === 'ground') {
      state.memory.fightingOrGroundSkillUseCount[event.side] += 1
    }

    if (skill.attribute === 'ground') {
      applyGeoPulseBenchEnergy(state, event.side, skill.name)
    }
  }
}

function applyGeoPulseBenchEnergy(
  state: TeamBattleState,
  side: BattleSide,
  skillName: string,
) {
  const activeSlot = state.teams[side].activeSlot
  for (const [slot, combatant] of state.teams[side].combatants.entries()) {
    if (
      slot === activeSlot ||
      combatant.currentHp <= 0 ||
      combatant.traitName !== '地脉'
    ) {
      continue
    }

    const before = combatant.energy
    combatant.energy = Math.min(combatant.maxEnergy, combatant.energy + 3)
    const amount = combatant.energy - before
    if (amount <= 0) continue

    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side,
      skillName,
      effectName: 'energy_delta',
      amount,
      energy: combatant.energy,
      reason: 'geo_pulse_bench_charge',
    })
  }
}

function applyDefeatedByEnemyPassives(
  state: TeamBattleState,
  events: readonly BattleLogEvent[],
) {
  for (const event of events) {
    if (event.type !== 'fainted' || !event.side) continue
    const side = event.side

    const damageEvent = [...events]
      .reverse()
      .find(
        (item) =>
          item.type === 'damage' &&
          item.target === side &&
          item.side === oppositeSide(side) &&
          item.hp === 0,
      )
    if (!damageEvent) continue

    const combatant = getActiveCombatant(state, side)
    if (combatant.traitName !== '飓风') continue

    const before = combatant.energy
    combatant.energy = Math.max(0, combatant.energy - 1)
    const amount = combatant.energy - before
    if (amount === 0) continue

    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side,
      target: oppositeSide(side),
      skillName: '飓风',
      effectName: 'energy_delta',
      amount,
      energy: combatant.energy,
      reason: 'defeated_by_enemy',
    })
  }
}

function scheduleImmortalRevives(
  state: TeamBattleState,
  events: readonly BattleLogEvent[],
) {
  for (const event of events) {
    if (event.type !== 'fainted' || !event.side) continue

    const side = event.side
    const slot = state.teams[side].activeSlot
    const combatant = state.teams[side].combatants[slot]
    if (
      combatant.traitName !== '不朽' ||
      state.memory.immortalRevivedBySlot[side][slot] ||
      state.memory.immortalReviveCountdownBySlot[side][slot] !== null
    ) {
      continue
    }

    state.memory.immortalRevivedBySlot[side][slot] = true
    state.memory.immortalReviveCountdownBySlot[side][slot] = 3
    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side,
      skillName: '不朽',
      effectName: 'immortal_revive_scheduled',
      amount: 3,
    })
  }
}

function applySkillSwitchOutEffects(
  state: TeamBattleState,
  events: readonly BattleLogEvent[],
) {
  for (const event of events) {
    if (
      event.type !== 'effect_applied' ||
      (event.effectName !== 'switch_out' &&
        event.effectName !== 'switch_out_target') ||
      !event.side ||
      !event.skillName
    ) {
      continue
    }

    const switchingSide =
      event.effectName === 'switch_out_target'
        ? event.target
        : event.side
    if (!switchingSide) continue

    const active = getActiveCombatant(state, switchingSide)
    if (active.currentHp <= 0) continue

    const inheritanceSource =
      event.effectName === 'switch_out' && event.skillName === '击鼓传花'
        ? active
        : null

    const targetSlot = getSwitchTargets(state, switchingSide)[0]
    if (targetSlot === undefined) continue

    const effect = getSkillEffect(event.skillName)
    switchActiveSlot(
      state,
      switchingSide,
      targetSlot,
      'forced_switch',
      'skill_switch_out',
    )

    const replacement = getActiveCombatant(state, switchingSide)
    if (inheritanceSource) {
      applySkillSwitchInheritance(
        state,
        switchingSide,
        inheritanceSource,
        replacement,
        event.skillName,
      )
    }
    if (event.effectName === 'switch_out' && effect?.switchOutTargetEnergy) {
      const before = replacement.energy
      replacement.energy = Math.min(
        replacement.maxEnergy,
        replacement.energy + effect.switchOutTargetEnergy,
      )
      const amount = replacement.energy - before
      if (amount > 0) {
        state.log.push({
          type: 'energy_recovered',
          turn: state.turn,
          side: switchingSide,
          skillName: event.skillName,
          amount,
          energy: replacement.energy,
          reason: 'switch_out_target_energy',
        })
      }
    }
  }
}

function applySkillSwitchInheritance(
  state: TeamBattleState,
  side: BattleSide,
  source: Combatant,
  replacement: Combatant,
  skillName: string,
) {
  inheritCombatantEffects(
    state,
    side,
    source,
    replacement,
    skillName,
    'skill_switch_inheritance',
    true,
    `skill:${skillName}`,
  )
}

function settleTeamBattleOutcome(state: TeamBattleState) {
  for (const side of teamSides) {
    const active = getActiveCombatant(state, side)
    if (active.currentHp > 0) {
      state.pendingSwitch[side] = false
      continue
    }
    const replacement = getSwitchTargets(state, side)[0]
    if (replacement !== undefined) {
      if (state.replacementMode === 'auto') {
        switchActiveSlot(state, side, replacement, 'forced_switch')
      } else if (!state.pendingSwitch[side]) {
        state.pendingSwitch[side] = true
        state.log.push({
          type: 'switch_pending',
          turn: state.turn,
          side,
          reason: 'active_fainted',
        })
      }
    }
  }

  const playerDefeated = isTeamDefeated(state, 'player')
  const opponentDefeated = isTeamDefeated(state, 'opponent')
  if (!playerDefeated && !opponentDefeated) return

  state.phase = 'ended'
  state.pendingSwitch.player = false
  state.pendingSwitch.opponent = false
  state.winner = playerDefeated
    ? opponentDefeated
      ? null
      : 'opponent'
    : 'player'
  state.log.push({
    type: 'battle_ended',
    turn: state.turn,
    winner: state.winner ?? undefined,
  })
}

function isTeamDefeated(state: TeamBattleState, side: BattleSide) {
  return (
    state.teams[side].combatants.every((combatant) => combatant.currentHp <= 0) &&
    state.memory.immortalReviveCountdownBySlot[side].every(
      (countdown) => countdown === null,
    )
  )
}

function cloneTeamBattleState(state: TeamBattleState): TeamBattleState {
  return {
    turn: state.turn,
    phase: state.phase,
    rules: cloneBattleRules(state.rules),
    field: cloneBattleField(state.field),
    replacementMode: state.replacementMode,
    pendingSwitch: { ...state.pendingSwitch },
    memory: cloneTeamBattleMemory(state.memory),
    winner: state.winner,
    teams: {
      player: {
        activeSlot: state.teams.player.activeSlot,
        combatants: state.teams.player.combatants.map(cloneCombatant),
      },
      opponent: {
        activeSlot: state.teams.opponent.activeSlot,
        combatants: state.teams.opponent.combatants.map(cloneCombatant),
      },
    },
    log: [...state.log],
  }
}

function cloneBattleRules(rules: BattleRules): BattleRules {
  return {
    ...rules,
    statConstruction: {
      ...rules.statConstruction,
      individualValues: { ...rules.statConstruction.individualValues },
      effortValues: { ...rules.statConstruction.effortValues },
      natureMultipliers: { ...rules.statConstruction.natureMultipliers },
    },
  }
}

function cloneTeamBattleMemory(memory: TeamBattleMemory): TeamBattleMemory {
  return {
    firstUsedSkillBySlot: {
      player: [...memory.firstUsedSkillBySlot.player],
      opponent: [...memory.firstUsedSkillBySlot.opponent],
    },
    fightingOrGroundSkillUseCount: {
      ...memory.fightingOrGroundSkillUseCount,
    },
    lastActionIndexBySide: {
      ...memory.lastActionIndexBySide,
    },
    immortalReviveCountdownBySlot: {
      player: [...memory.immortalReviveCountdownBySlot.player],
      opponent: [...memory.immortalReviveCountdownBySlot.opponent],
    },
    immortalRevivedBySlot: {
      player: [...memory.immortalRevivedBySlot.player],
      opponent: [...memory.immortalRevivedBySlot.opponent],
    },
  }
}

function cloneCombatant(combatant: Combatant): Combatant {
  return {
    ...combatant,
    attributes: [...combatant.attributes],
    baseStats: { ...combatant.baseStats },
    nature: combatant.nature ? { ...combatant.nature } : null,
    stats: { ...combatant.stats },
    skillSlots: [...combatant.skillSlots],
    knownSkills: [...combatant.knownSkills],
    effects: {
      statModifiers: combatant.effects.statModifiers.map((modifier) => ({
        ...modifier,
      })),
      powerModifiers: combatant.effects.powerModifiers.map((modifier) => ({
        ...modifier,
      })),
      hitModifiers: combatant.effects.hitModifiers.map((modifier) => ({
        ...modifier,
      })),
      priorityModifiers: combatant.effects.priorityModifiers.map((modifier) => ({
        ...modifier,
      })),
      energyCostModifiers: combatant.effects.energyCostModifiers.map(
        (modifier) => ({
          ...modifier,
        }),
      ),
      damageReductions: combatant.effects.damageReductions.map((reduction) => ({
        ...reduction,
      })),
      statuses: combatant.effects.statuses.map((status) => ({
        ...status,
        statMultipliers: { ...status.statMultipliers },
      })),
      marks: combatant.effects.marks.map((mark) => ({ ...mark })),
    },
  }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}
