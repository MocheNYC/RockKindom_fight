import type { AttributeKey, AttributeMeta, SkillInfo } from '../types'
import {
  getSkillEffect,
  isBasicDamageOnlyText,
  shouldReportUnimplementedEffect,
  type SkillStatusEffect,
} from './effects'
import type {
  BattleAction,
  BattleActionKind,
  BattleCombatantInput,
  BattleContext,
  BattleDataInput,
  BattleMarkKind,
  BattleNature,
  BattleRuleOverrides,
  BattleRules,
  BattleEnergyCostModifier,
  BattleHitModifier,
  BattlePowerModifier,
  BattlePriorityModifier,
  BattleStatusEffect,
  BattleStatusKind,
  BattleStatKey,
  BattleSide,
  BattleState,
  Combatant,
  CreateBattleStateInput,
  CreateCombatantInput,
  DamageBreakdown,
  DamageCategory,
  ModifiableBattleStatKey,
  SkillActionLegality,
  StatConstructionRules,
} from './types'

type TurnContext = {
  actionsBySide: Record<BattleSide, ResolvedTurnAction>
  executedSides: Set<BattleSide>
  interruptedSides: Set<BattleSide>
}

type DamageOptions = {
  powerBonus?: number
  powerMultiplier?: number
  hitCount?: number
  damageMultiplier?: number
}

type ResolvedTurnAction = {
  action: BattleAction
  skill: SkillInfo | null
  actionKind: BattleActionKind
}

export const defaultBattleRules: BattleRules = {
  level: 60,
  maxEnergy: 10,
  startingEnergy: 10,
  sameAttributeBonus: 1.5,
  baseDamage: 2,
  randomFactor: 1,
  damageDivisor: 30,
  minDamage: 1,
  energyRecoveryPerTurn: 1,
  enforceLearnsets: true,
  statConstruction: {
    referenceLevel: 60,
    hpBaseMultiplier: 2.5,
    hpFlatBonus: 100,
    battleStatBaseMultiplier: 2.5,
    speedBaseMultiplier: 5 / 3,
    speedFlatBonus: 50 / 3,
    natureBoostMultiplier: 1.2,
    natureDropMultiplier: 0.9,
    defaultIndividualValue: 0,
    defaultEffortValue: 0,
    individualValues: {},
    effortValues: {},
    natureMultipliers: {},
  },
}

const sideOrder: Record<BattleSide, number> = {
  player: 0,
  opponent: 1,
}

const fixedPositionSkillNames = new Set(['主轴'])
const nativeTransmissionAmounts: Record<string, number> = {
  钢铁洪流: 2,
  啮合传递: 1,
  轴承支撑: 1,
}
const markKinds = new Set<BattleStatusKind>([
  'poison',
  'burn',
  'freeze',
  'spirit',
  'wet',
  'photosynthesis',
])

export function createBattleContext(data: BattleDataInput): BattleContext {
  return {
    skillMap: new Map(data.skills.map((skill) => [skill.name, skill])),
    attributeMap: new Map(
      data.attributes.map((attribute) => [attribute.key, attribute]),
    ),
  }
}

export function mergeBattleRules(
  overrides: BattleRuleOverrides = {},
): BattleRules {
  const statConstruction = {
    ...defaultBattleRules.statConstruction,
    ...overrides.statConstruction,
    individualValues: {
      ...defaultBattleRules.statConstruction.individualValues,
      ...overrides.statConstruction?.individualValues,
    },
    effortValues: {
      ...defaultBattleRules.statConstruction.effortValues,
      ...overrides.statConstruction?.effortValues,
    },
    natureMultipliers: {
      ...defaultBattleRules.statConstruction.natureMultipliers,
      ...overrides.statConstruction?.natureMultipliers,
    },
  }

  return {
    ...defaultBattleRules,
    ...overrides,
    statConstruction,
  }
}

export function createCombatant(
  input: CreateCombatantInput,
  rules: BattleRules = defaultBattleRules,
): Combatant {
  const level = input.level ?? rules.level
  const maxEnergy = input.maxEnergy ?? rules.maxEnergy
  const traitName = input.pet.traitName
  const startingEnergy =
    input.startingEnergy ?? (traitName === '地脉' ? 0 : rules.startingEnergy)
  const stats = constructBattleStats(
    input.pet.stats,
    level,
    rules.statConstruction,
    input.nature ?? null,
  )
  const knownSkills = uniqueSkillNames([
    ...input.pet.skills.map((skill) => skill.name),
    ...input.pet.bloodlineSkills,
    ...input.pet.learnableSkillStones,
    ...input.pet.taskSkillStones,
  ])
  const maxHp = Math.max(1, stats.health)

  return {
    id: `${input.side}:${input.pet.key}`,
    side: input.side,
    petKey: input.pet.key,
    petId: input.pet.id,
    name: input.pet.nameZh,
    level,
    attributes: [...input.pet.attributes],
    baseStats: { ...input.pet.stats },
    traitName,
    traitDescription: input.pet.traitDescription,
    bloodlineName: input.bloodlineName ?? null,
    skillSlots: input.pet.skills.map((skill) => skill.name),
    nature: input.nature ? { ...input.nature } : null,
    stats,
    maxHp,
    currentHp: maxHp,
    maxEnergy,
    energy: clamp(startingEnergy, 0, maxEnergy),
    knownSkills,
    effects: {
      statModifiers: [],
      powerModifiers: [],
      hitModifiers: [],
      priorityModifiers: [],
      energyCostModifiers: [],
      damageReductions: [],
      statuses: [],
      marks: [],
    },
  }
}

export function createBattleState(
  input: CreateBattleStateInput,
): BattleState {
  const rules = mergeBattleRules(input.rules)
  const state: BattleState = {
    turn: 0,
    phase: 'ready',
    rules,
    field: createEmptyBattleField(),
    skillTraits: createEmptySkillTraits(),
    winner: null,
    combatants: {
      player: createCombatant(
        normalizeCombatantInput('player', input.player),
        rules,
      ),
      opponent: createCombatant(
        normalizeCombatantInput('opponent', input.opponent),
        rules,
      ),
    },
    log: [{ type: 'battle_started', turn: 0 }],
  }

  applyBattleStartPassives(state)
  return state
}

function createEmptyBattleField() {
  return {
    weather: null,
  }
}

function createEmptySkillTraits() {
  return {
    swiftSkillNames: {
      player: [],
      opponent: [],
    },
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

export function constructBattleStats(
  baseStats: Combatant['baseStats'],
  level = defaultBattleRules.level,
  construction: StatConstructionRules = defaultBattleRules.statConstruction,
  nature: BattleNature | null = null,
) {
  const health = constructHpStat(baseStats.health, level, construction, nature)
  const physicalAttack = constructNonHpStat(
    'physicalAttack',
    baseStats.physicalAttack,
    level,
    construction,
    nature,
  )
  const magicAttack = constructNonHpStat(
    'magicAttack',
    baseStats.magicAttack,
    level,
    construction,
    nature,
  )
  const physicalDefense = constructNonHpStat(
    'physicalDefense',
    baseStats.physicalDefense,
    level,
    construction,
    nature,
  )
  const magicDefense = constructNonHpStat(
    'magicDefense',
    baseStats.magicDefense,
    level,
    construction,
    nature,
  )
  const speed = constructNonHpStat(
    'speed',
    baseStats.speed,
    level,
    construction,
    nature,
  )

  return {
    health,
    physicalAttack,
    magicAttack,
    physicalDefense,
    magicDefense,
    speed,
    baseStats:
      health +
      physicalAttack +
      magicAttack +
      physicalDefense +
      magicDefense +
      speed,
  }
}

export function advanceTurn(
  state: BattleState,
  context: BattleContext,
  actions: BattleAction[],
): BattleState {
  if (state.phase === 'ended') return state

  const nextState = cloneBattleState(state)
  const resolvedActions = resolveTurnActions(context, actions)
  const turnContext: TurnContext = {
    actionsBySide: {
      player: resolvedActions.find((action) => action.action.side === 'player')!,
      opponent: resolvedActions.find(
        (action) => action.action.side === 'opponent',
      )!,
    },
    executedSides: new Set(),
    interruptedSides: new Set(),
  }
  const turn = state.turn + 1
  nextState.turn = turn
  nextState.log.push({ type: 'turn_started', turn })
  applyStartOfTurnPassives(nextState, context, turnContext)

  for (const action of getOrderedActions(nextState, turnContext)) {
    if (nextState.phase === 'ended') break
    executeAction(nextState, context, turnContext, action)
    turnContext.executedSides.add(action.action.side)
  }

  if (nextState.phase !== 'ended') endTurn(nextState)

  return nextState
}

export function calculateDamage(
  attacker: Combatant,
  defender: Combatant,
  skill: SkillInfo,
  attributeMap: Map<AttributeKey, AttributeMeta>,
  rules: BattleRules,
  options: DamageOptions = {},
): DamageBreakdown {
  const category = getDamageCategory(skill)
  const basePower = Math.max(0, skill.power ?? 0)
  const powerBonus = options.powerBonus ?? 0
  const powerMultiplier = options.powerMultiplier ?? 1
  const hitCount = Math.max(1, Math.floor(options.hitCount ?? 1))
  const power = Math.max(0, basePower * powerMultiplier + powerBonus)
  const damageMultiplier = options.damageMultiplier ?? 1

  if (category === 'status' || power <= 0) {
    return {
      category,
      basePower,
      power,
      powerBonus,
      powerMultiplier,
      hitCount,
      attack: 0,
      defense: 0,
      sameAttributeBonus: 1,
      attributeMultiplier: 1,
      damageMultiplier,
      randomFactor: rules.randomFactor,
      rawDamage: 0,
      finalDamage: 0,
    }
  }

  const attack =
    category === 'magical'
      ? getEffectiveStat(attacker, 'magicAttack')
      : getEffectiveStat(attacker, 'physicalAttack')
  const defense = Math.max(
    1,
    category === 'magical'
      ? getEffectiveStat(defender, 'magicDefense')
      : getEffectiveStat(defender, 'physicalDefense'),
  )
  const sameAttributeBonus =
    skill.attribute && attacker.attributes.includes(skill.attribute)
      ? rules.sameAttributeBonus
      : 1
  const attributeMultiplier = calculateAttributeMultiplier(
    skill.attribute,
    defender.attributes,
    attributeMap,
  )
  const rawDamage =
    (((2 * attacker.level) / 5 + 2) * power * attack) /
      defense /
      getDamageDivisor(rules) +
    rules.baseDamage
  const perHitDamage = Math.max(
    rules.minDamage,
    Math.floor(
      rawDamage *
        sameAttributeBonus *
        attributeMultiplier *
        damageMultiplier *
        rules.randomFactor,
    ),
  )
  const finalDamage = perHitDamage * hitCount

  return {
    category,
    basePower,
    power,
    powerBonus,
    powerMultiplier,
    hitCount,
    attack,
    defense,
    sameAttributeBonus,
    attributeMultiplier,
    damageMultiplier,
    randomFactor: rules.randomFactor,
    rawDamage,
    finalDamage,
  }
}

export function calculateAttributeMultiplier(
  attackingAttribute: AttributeKey | null,
  defenderAttributes: AttributeKey[],
  attributeMap: Map<AttributeKey, AttributeMeta>,
) {
  if (!attackingAttribute) return 1

  return defenderAttributes.reduce((multiplier, defenderAttribute) => {
    const defenderMeta = attributeMap.get(defenderAttribute)
    if (defenderMeta?.defense['2.0'].includes(attackingAttribute)) {
      return multiplier * 2
    }
    if (defenderMeta?.defense['0.5'].includes(attackingAttribute)) {
      return multiplier * 0.5
    }
    return multiplier
  }, 1)
}

export function getDamageCategory(skill: SkillInfo): DamageCategory {
  const category = skill.category ?? ''
  if (category.includes('\u9b54')) return 'magical'
  if (category.includes('\u7269')) return 'physical'
  return skill.power && skill.power > 0 ? 'physical' : 'status'
}

export function getSkillActionKind(skill: SkillInfo | null): BattleActionKind {
  if (!skill) return 'wait'

  const category = skill.category ?? ''
  if (category.includes('\u9632')) return 'defense'
  if (category.includes('\u72b6')) return 'status'
  if (getDamageCategory(skill) !== 'status' && (skill.power ?? 0) > 0) {
    return 'attack'
  }
  return 'status'
}

export function oppositeSide(side: BattleSide): BattleSide {
  return side === 'player' ? 'opponent' : 'player'
}

export function getEffectiveStat(
  combatant: Combatant,
  stat: ModifiableBattleStatKey,
) {
  const percent = combatant.effects.statModifiers
    .filter((modifier) => modifier.stat === stat)
    .reduce((total, modifier) => total + modifier.percent, 0)
  const flat = combatant.effects.statModifiers
    .filter((modifier) => modifier.stat === stat)
    .reduce((total, modifier) => total + modifier.flat, 0)
  const statusMultiplier = combatant.effects.statuses.reduce(
    (current, status) => current * (status.statMultipliers?.[stat] ?? 1),
    1,
  )
  const passiveMultiplier =
    combatant.traitName === '囤积' &&
    (stat === 'physicalDefense' || stat === 'magicDefense')
      ? 1 + combatant.energy * 0.1
      : 1

  return Math.max(
    1,
    Math.floor(
      (combatant.stats[stat] + flat) *
        (1 + percent) *
        statusMultiplier *
        passiveMultiplier,
    ),
  )
}

export function isSkillActionLegal(
  state: BattleState,
  context: BattleContext,
  side: BattleSide,
  skillName: string,
): SkillActionLegality {
  const combatant = state.combatants[side]
  if (combatant.currentHp <= 0) {
    return {
      legal: false,
      reason: 'fainted',
    }
  }

  const skill = context.skillMap.get(skillName)
  if (!skill) {
    return {
      legal: false,
      reason: 'unknown_skill',
    }
  }

  if (!canUseSkillByPassive(combatant, skill.name)) {
    return {
      legal: false,
      reason: 'passive_restricted_skill',
    }
  }

  if (state.rules.enforceLearnsets && !combatant.knownSkills.includes(skill.name)) {
    return {
      legal: false,
      reason: 'unlearned_skill',
    }
  }

  const energyCost = getSkillEnergyCost(state, context, combatant, skill)
  if (combatant.energy < energyCost) {
    return {
      legal: false,
      reason: 'not_enough_energy',
      energyCost,
      energy: combatant.energy,
    }
  }

  return {
    legal: true,
    energyCost,
  }
}

export function getLegalSkillActions(
  state: BattleState,
  context: BattleContext,
  side: BattleSide,
) {
  return state.combatants[side].knownSkills
    .map((skillName) => {
      const legality = isSkillActionLegal(state, context, side, skillName)
      return {
        side,
        type: 'skill' as const,
        skillName,
        legality,
      }
    })
    .filter(
      (
        action,
      ): action is {
        side: BattleSide
        type: 'skill'
        skillName: string
        legality: Extract<SkillActionLegality, { legal: true }>
      } => action.legality.legal,
    )
}

export function chooseFirstLegalSkillAction(
  state: BattleState,
  context: BattleContext,
  side: BattleSide,
  preferredSkillNames: readonly string[],
): BattleAction {
  for (const skillName of preferredSkillNames) {
    if (isSkillActionLegal(state, context, side, skillName).legal) {
      return {
        side,
        skillName,
      }
    }
  }

  const fallback = getLegalSkillActions(state, context, side)[0]
  if (fallback) {
    return {
      side,
      skillName: fallback.skillName,
    }
  }

  return {
    side,
    type: 'wait',
  }
}

function executeAction(
  state: BattleState,
  context: BattleContext,
  turnContext: TurnContext,
  resolvedAction: ResolvedTurnAction,
  options: { suppressGaleChain?: boolean } = {},
) {
  const action = resolvedAction.action
  const actor = state.combatants[action.side]
  const turn = state.turn

  if (turnContext.interruptedSides.has(action.side)) {
    state.log.push({
      type: 'action_failed',
      turn,
      side: action.side,
      reason: 'interrupted',
    })
    return
  }

  if (actor.currentHp <= 0) {
    state.log.push({
      type: 'action_failed',
      turn,
      side: action.side,
      reason: 'fainted',
    })
    return
  }

  if (action.type === 'wait') {
    state.log.push({
      type: 'action_failed',
      turn,
      side: action.side,
      reason: 'wait',
    })
    return
  }

  const skill = context.skillMap.get(action.skillName)
  if (!skill) {
    state.log.push({
      type: 'action_failed',
      turn,
      side: action.side,
      skillName: action.skillName,
      reason: 'unknown_skill',
    })
    return
  }

  if (!canUseSkillByPassive(actor, skill.name)) {
    state.log.push({
      type: 'action_failed',
      turn,
      side: action.side,
      skillName: action.skillName,
      reason: 'passive_restricted_skill',
    })
    return
  }

  if (state.rules.enforceLearnsets && !actor.knownSkills.includes(skill.name)) {
    state.log.push({
      type: 'action_failed',
      turn,
      side: action.side,
      skillName: action.skillName,
      reason: 'unlearned_skill',
    })
    return
  }

  const energyCost = getSkillEnergyCost(state, context, actor, skill)
  if (actor.energy < energyCost) {
    state.log.push({
      type: 'action_failed',
      turn,
      side: action.side,
      skillName: skill.name,
      reason: 'not_enough_energy',
      energyCost,
      energy: actor.energy,
    })
    return
  }

  actor.energy -= energyCost
  const targetSide = oppositeSide(action.side)
  const target = state.combatants[targetSide]
  const effect = getSkillEffect(skill.name)
  const responseTriggered = isResponseTriggered(resolvedAction, turnContext)

  state.log.push({
    type: 'skill_used',
    turn,
    side: action.side,
    target: targetSide,
    skillName: skill.name,
    energyCost,
    energy: actor.energy,
  })

  if (responseTriggered) {
    state.log.push({
      type: 'response_triggered',
      turn,
      side: action.side,
      target: targetSide,
      skillName: skill.name,
      actionKind: resolvedAction.actionKind,
      targetActionKind: turnContext.actionsBySide[targetSide].actionKind,
    })
  }

  if (shouldReportUnimplementedEffect(skill)) {
    state.log.push({
      type: 'effect_unimplemented',
      turn,
      side: action.side,
      target: targetSide,
      skillName: skill.name,
      reason: 'effect_not_registered',
    })
  }

  if (effect) {
    applySkillUseEffects(
      state,
      context,
      actor,
      target,
      skill,
      effect,
      turnContext,
      responseTriggered,
    )
  }

  const isDamagingSkill =
    getDamageCategory(skill) !== 'status' && (skill.power ?? 0) > 0
  const damageOptions = getDamageOptions(
    state,
    context,
    resolvedAction,
    responseTriggered,
    turnContext,
  )
  const damageMultiplier = isDamagingSkill
    ? consumeDamageReductions(state, target)
    : 1
  const breakdown = calculateDamage(
    actor,
    target,
    skill,
    context.attributeMap,
    state.rules,
    {
      ...damageOptions,
      damageMultiplier,
    },
  )

  if (breakdown.finalDamage <= 0) {
    applySkillPositionTransmission(state, actor, skill)
    applyAfterSkillUsePassives(state, actor, skill)
    recordLastUsedSkillCostEffects(actor, skill)
    if (!options.suppressGaleChain && skill.name === '疾风连袭') {
      executeGaleChainSkills(state, context, turnContext, actor, skill)
    }
    return
  }

  const previousHp = target.currentHp
  target.currentHp = Math.max(0, target.currentHp - breakdown.finalDamage)
  applyLethalDamagePassives(state, actor, target, skill, previousHp)
  const actualDamage = previousHp - target.currentHp

  state.log.push({
    type: 'damage',
    turn,
    side: action.side,
    target: targetSide,
    skillName: skill.name,
    damage: actualDamage,
    hp: target.currentHp,
    breakdown,
  })

  if (effect?.drainRatio && actualDamage > 0) {
    healCombatant(
      state,
      actor,
      skill,
      Math.floor(actualDamage * effect.drainRatio),
      'drain',
    )
  }

  applySkillPositionTransmission(state, actor, skill)
  applyAfterSkillUsePassives(state, actor, skill)
  recordLastUsedSkillCostEffects(actor, skill)
  if (!options.suppressGaleChain && skill.name === '疾风连袭') {
    executeGaleChainSkills(state, context, turnContext, actor, skill)
  }

  if (target.currentHp <= 0) {
    if (effect?.knockoutEnergy) {
      applyEnergyDelta(state, actor, skill, effect.knockoutEnergy, 'knockout_energy')
    }
    state.log.push({
      type: 'fainted',
      turn,
      side: targetSide,
    })
    state.phase = 'ended'
    state.winner = action.side
    state.log.push({
      type: 'battle_ended',
      turn,
      winner: action.side,
    })
  }
}

function executeGaleChainSkills(
  state: BattleState,
  context: BattleContext,
  turnContext: TurnContext,
  actor: Combatant,
  sourceSkill: SkillInfo,
) {
  const skillNames = getGaleChainSkillNames(state, context, actor)
  for (const skillName of skillNames) {
    if (state.phase === 'ended' || actor.currentHp <= 0) return

    const chainedSkill = context.skillMap.get(skillName)
    if (!chainedSkill) continue

    const tempModifierId = `energy-cost:${sourceSkill.name}:chain:${skillName}`
    const chainCost = getSkillEnergyCost(
      state,
      context,
      actor,
      chainedSkill,
      { ignoreGaleChainExtra: true },
    )
    actor.effects.energyCostModifiers.push({
      id: tempModifierId,
      sourceSkillName: sourceSkill.name,
      skillName,
      amount: -chainCost,
      remainingTurns: null,
    })
    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: actor.side,
      skillName: sourceSkill.name,
      effectName: 'chain_skill',
      reason: skillName,
    })

    executeAction(
      state,
      context,
      turnContext,
      {
        action: {
          side: actor.side,
          skillName,
        },
        skill: chainedSkill,
        actionKind: getSkillActionKind(chainedSkill),
      },
      { suppressGaleChain: true },
    )

    actor.effects.energyCostModifiers =
      actor.effects.energyCostModifiers.filter(
        (modifier) => modifier.id !== tempModifierId,
      )
  }
}

function applySkillUseEffects(
  state: BattleState,
  context: BattleContext,
  actor: Combatant,
  target: Combatant,
  skill: SkillInfo,
  effect: NonNullable<ReturnType<typeof getSkillEffect>>,
  turnContext: TurnContext,
  responseTriggered: boolean,
) {
  applyStatModifiers(state, actor, skill, effect.statModifiers)
  applyStatModifiers(state, target, skill, effect.targetStatModifiers)
  applyPowerModifiers(state, actor, skill, effect.powerModifiers)
  applyHitModifiers(state, actor, skill, effect.hitModifiers)
  applyPriorityModifiers(state, actor, skill, effect.priorityModifiers)
  applyEnergyCostModifiers(state, actor, skill, effect.energyCostModifiers)
  applyEnergyCostModifiers(
    state,
    target,
    skill,
    effect.targetEnergyCostModifiers,
  )

  if (
    effect.damageReduction &&
    (!effect.damageReductionRequiresResponse || responseTriggered)
  ) {
    const id = `damage-reduction:${skill.name}`
    const nextReduction = {
      id,
      sourceSkillName: skill.name,
      incomingDamageMultiplier:
        effect.damageReduction.incomingDamageMultiplier,
      remainingHits: effect.damageReduction.remainingHits,
      remainingTurns: effect.damageReduction.remainingTurns ?? null,
    }
    const existingIndex = actor.effects.damageReductions.findIndex(
      (item) => item.id === id,
    )

    if (existingIndex >= 0) {
      actor.effects.damageReductions[existingIndex] = nextReduction
    } else {
      actor.effects.damageReductions.push(nextReduction)
    }

    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: actor.side,
      skillName: skill.name,
      effectName: 'damage_reduction',
      multiplier: effect.damageReduction.incomingDamageMultiplier,
      amount: effect.damageReduction.remainingHits,
    })
  }

  if (effect.heal) {
    applyHealEffect(state, actor, skill, effect.heal, 'direct')
  }

  if (effect.energy) {
    applyEnergyDelta(state, actor, skill, effect.energy.amount, 'energy_delta')
  }

  if (effect.targetEnergy) {
    applyEnergyDelta(
      state,
      target,
      skill,
      effect.targetEnergy.amount,
      'target_energy_delta',
    )
  }

  if (effect.stealEnergy) {
    stealEnergy(state, actor, target, skill, effect.stealEnergy)
  }

  if (effect.statusToSelf) {
    applyStatusEffect(state, actor, skill, effect.statusToSelf, actor)
  }

  if (effect.statusToTarget) {
    applyStatusEffect(state, target, skill, effect.statusToTarget, actor)
  }

  if (effect.clear) {
    applyClearEffect(state, actor, target, skill, effect.clear, turnContext)
  }

  if (effect.weather) {
    applyWeatherEffect(state, actor, skill, effect.weather)
  }

  if (responseTriggered) {
    applyStatModifiers(state, actor, skill, effect.responseStatModifiers)
    applyStatModifiers(state, target, skill, effect.responseTargetStatModifiers)
    applyPriorityModifiers(
      state,
      actor,
      skill,
      effect.responsePriorityModifiers,
    )
    applyEnergyCostModifiers(
      state,
      actor,
      skill,
      effect.responseEnergyCostModifiers,
    )
    applyEnergyCostModifiers(
      state,
      target,
      skill,
      effect.responseTargetEnergyCostModifiers,
    )

    if (effect.responseHeal) {
      applyHealEffect(state, actor, skill, effect.responseHeal, 'response_heal')
    }
    if (effect.responseEnergy) {
      applyEnergyDelta(
        state,
        actor,
        skill,
        effect.responseEnergy.amount,
        'response_energy_delta',
      )
    }
    if (effect.responseTargetEnergy) {
      applyEnergyDelta(
        state,
        target,
        skill,
        effect.responseTargetEnergy.amount,
        'response_target_energy_delta',
      )
    }
    if (effect.energyFromTargetSkillCostOnResponse) {
      const targetAction = turnContext.actionsBySide[target.side]
      const targetSkill = targetAction.skill
      const amount = targetSkill
        ? getSkillEnergyCost(state, context, target, targetSkill)
        : 0
      applyEnergyDelta(state, actor, skill, amount, 'response_energy_refund')
    }
    if (effect.responseStatusToSelf) {
      applyStatusEffect(
        state,
        actor,
        skill,
        effect.responseStatusToSelf,
        actor,
      )
    }
    if (effect.responseStatusToTarget) {
      applyStatusEffect(
        state,
        target,
        skill,
        effect.responseStatusToTarget,
        actor,
      )
    }
    if (effect.interruptOnResponse) {
      turnContext.interruptedSides.add(target.side)
      state.log.push({
        type: 'effect_applied',
        turn: state.turn,
        side: actor.side,
        target: target.side,
        skillName: skill.name,
        effectName: 'interrupt',
      })
    }
    if (effect.responseCounterDamage === 'targetSkillPower') {
      applyResponseCounterDamage(state, context, actor, target, skill, turnContext)
    }
    if (effect.responseSwitchOutTarget) {
      state.log.push({
        type: 'effect_applied',
        turn: state.turn,
        side: actor.side,
        target: target.side,
        skillName: skill.name,
        effectName: 'switch_out_target',
      })
    }
  }

  applySkillSlotConditionalEffects(state, actor, skill)
  applySkillUsePassiveHooks(state, actor, target, skill)

  if (effect.switchOut) {
    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: actor.side,
      skillName: skill.name,
      effectName: 'switch_out',
    })
  }
}

function getDamageOptions(
  state: BattleState,
  context: BattleContext,
  resolvedAction: ResolvedTurnAction,
  responseTriggered: boolean,
  turnContext: TurnContext,
): Pick<DamageOptions, 'powerBonus' | 'powerMultiplier' | 'hitCount'> {
  if (!resolvedAction.skill) {
    return {
      powerBonus: 0,
      powerMultiplier: 1,
      hitCount: 1,
    }
  }

  const effect = getSkillEffect(resolvedAction.skill.name)
  const actor = state.combatants[resolvedAction.action.side]
  const target = state.combatants[oppositeSide(resolvedAction.action.side)]
  const powerModifiers = actor.effects.powerModifiers.filter(
    (item) =>
      item.skillName === null || item.skillName === resolvedAction.skill?.name,
  )
  let powerBonus =
    (effect?.powerBonus ?? 0) +
    powerModifiers.reduce((total, item) => total + item.amount, 0)
  let powerMultiplier =
    (effect?.powerMultiplier ?? 1) *
    powerModifiers.reduce(
      (total, item) => total * item.multiplier,
      1,
    )
  let hitCount =
    (effect?.hitCount ?? 1) +
    actor.effects.hitModifiers.reduce((total, item) => total + item.amount, 0)

  if (responseTriggered) {
    powerBonus += effect?.response?.powerBonus ?? 0
    powerMultiplier *= effect?.response?.powerMultiplier ?? 1
    hitCount = effect?.response?.hitCount ?? hitCount

    if (effect?.response?.powerMultiplier) {
      state.log.push({
        type: 'effect_applied',
        turn: state.turn,
        side: resolvedAction.action.side,
        skillName: resolvedAction.skill.name,
        effectName: 'response_power_multiplier',
        multiplier: effect.response.powerMultiplier,
      })
    }
  }

  if (
    effect?.firstActionHitCount &&
    !turnContext.executedSides.has(target.side)
  ) {
    hitCount = Math.max(hitCount, effect.firstActionHitCount)
  }
  if (
    effect?.firstActionPowerMultiplier &&
    !turnContext.executedSides.has(target.side)
  ) {
    powerMultiplier *= effect.firstActionPowerMultiplier
  }
  if (
    effect?.lowHpHitCountBonus &&
    actor.currentHp / actor.maxHp < effect.lowHpHitCountBonus.threshold
  ) {
    hitCount += effect.lowHpHitCountBonus.amount
  }
  if (effect?.targetEnergyZeroPowerMultiplier && target.energy === 0) {
    powerMultiplier *= effect.targetEnergyZeroPowerMultiplier
  }

  const passiveAdjustment = getPassiveDamageAdjustment(
    actor,
    target,
    resolvedAction.skill,
    context,
    turnContext,
  )
  powerBonus += passiveAdjustment.powerBonus
  powerMultiplier *= passiveAdjustment.powerMultiplier
  hitCount += passiveAdjustment.hitBonus

  const skillSlot = getSkillSlot(actor, resolvedAction.skill.name)
  if (resolvedAction.skill.name === '钢铁洪流' && skillSlot === 1) {
    powerBonus += 90
  }
  if (resolvedAction.skill.name === '闪击') {
    const actorSpeed = getEffectiveStat(actor, 'speed')
    const targetSpeed = getEffectiveStat(target, 'speed')
    powerBonus += getConditionalComparisonPowerBonus(
      resolvedAction.skill.power ?? 0,
      actorSpeed,
      targetSpeed,
    )
  }
  if (resolvedAction.skill.name === '鸣沙陷阱') {
    const actorDefense = getEffectiveStat(actor, 'physicalDefense')
    const targetDefense = getEffectiveStat(target, 'physicalDefense')
    powerBonus += getConditionalComparisonPowerBonus(
      resolvedAction.skill.power ?? 0,
      actorDefense,
      targetDefense,
    )
  }
  if (resolvedAction.skill.name === '破罐破摔' && hasDebuff(actor)) {
    powerBonus += 60
  }

  return {
    powerBonus,
    powerMultiplier,
    hitCount: Math.max(1, hitCount),
  }
}

function applySkillSlotConditionalEffects(
  state: BattleState,
  actor: Combatant,
  skill: SkillInfo,
) {
  const skillSlot = getSkillSlot(actor, skill.name)
  if (skill.name === '啮合传递' && (skillSlot === 1 || skillSlot === 3)) {
    applyStatModifiers(state, actor, skill, [
      {
        stat: 'physicalAttack',
        percent: 0.6,
      },
    ])
  }
}

function getConditionalComparisonPowerBonus(
  basePower: number,
  actorStat: number,
  targetStat: number,
) {
  if (actorStat <= targetStat) return 0

  const power = Math.min(170, 120 + actorStat - targetStat)
  return power - basePower
}

function applySkillPositionTransmission(
  state: BattleState,
  actor: Combatant,
  skill: SkillInfo,
) {
  const amount = getTransmissionAmount(actor, skill)
  if (amount <= 0) return

  const beforeSlots = [...actor.skillSlots]
  const fromIndex = beforeSlots.indexOf(skill.name)
  if (fromIndex < 0) return

  const nextSlots = transmitSkillSlot(beforeSlots, fromIndex, amount)
  if (slotsEqual(beforeSlots, nextSlots)) return

  actor.skillSlots = nextSlots
  const toIndex = nextSlots.indexOf(skill.name)
  state.log.push({
    type: 'skill_position_changed',
    turn: state.turn,
    side: actor.side,
    skillName: skill.name,
    fromSlot: fromIndex + 1,
    toSlot: toIndex + 1,
    amount,
    reason: 'transmission',
  })

  applyGearTorquePositionBonus(state, actor, beforeSlots, nextSlots)
}

function getTransmissionAmount(actor: Combatant, skill: SkillInfo) {
  if (fixedPositionSkillNames.has(skill.name)) return 0

  const skillSlot = getSkillSlot(actor, skill.name)
  let amount = nativeTransmissionAmounts[skill.name] ?? 0

  if (actor.traitName === '翼轴' && skillSlot === 1) {
    amount = Math.max(amount, 1)
  }
  if (actor.traitName === '向心力' && (skillSlot === 1 || skillSlot === 2)) {
    amount = Math.max(amount, 1)
  }

  return amount
}

function transmitSkillSlot(
  slots: readonly string[],
  fromIndex: number,
  amount: number,
) {
  const movingSkill = slots[fromIndex]
  if (!movingSkill || fixedPositionSkillNames.has(movingSkill)) return [...slots]

  const movableIndices = slots
    .map((skillName, index) => ({ skillName, index }))
    .filter(({ skillName }) => !fixedPositionSkillNames.has(skillName))
    .map(({ index }) => index)
  const fromMovableIndex = movableIndices.indexOf(fromIndex)
  if (fromMovableIndex < 0 || movableIndices.length <= 1) return [...slots]

  const targetMovableIndex =
    (fromMovableIndex + amount) % movableIndices.length
  const movableSkills = movableIndices.map((index) => slots[index])
  const [movedSkill] = movableSkills.splice(fromMovableIndex, 1)
  movableSkills.splice(targetMovableIndex, 0, movedSkill)

  const nextSlots = [...slots]
  for (const [index, slot] of movableIndices.entries()) {
    nextSlots[slot] = movableSkills[index]
  }
  return nextSlots
}

function applyGearTorquePositionBonus(
  state: BattleState,
  actor: Combatant,
  beforeSlots: readonly string[],
  nextSlots: readonly string[],
) {
  const beforeIndex = beforeSlots.indexOf('齿轮扭矩')
  const nextIndex = nextSlots.indexOf('齿轮扭矩')
  if (beforeIndex < 0 || nextIndex < 0 || beforeIndex === nextIndex) return

  const id = 'power:齿轮扭矩:position'
  const existing = actor.effects.powerModifiers.find((item) => item.id === id)
  const item: BattlePowerModifier = {
    id,
    sourceSkillName: '齿轮扭矩',
    skillName: '齿轮扭矩',
    amount: (existing?.amount ?? 0) + 20,
    multiplier: 1,
    remainingTurns: null,
  }
  upsertEffect(actor.effects.powerModifiers, item)
  state.log.push({
    type: 'effect_applied',
    turn: state.turn,
    side: actor.side,
    skillName: '齿轮扭矩',
    effectName: 'skill_power_bonus',
    amount: item.amount,
    reason: 'position_changed',
  })
}

function slotsEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  )
}

function applyAfterSkillUsePassives(
  state: BattleState,
  actor: Combatant,
  skill: SkillInfo,
) {
  applyAfterSkillUseEffects(state, actor, skill)

  if (actor.traitName !== '乘风连击' || skill.attribute !== 'wing') return

  const id = 'hit:passive:乘风连击'
  const previous = actor.effects.hitModifiers.find((item) => item.id === id)
  const nextAmount = (previous?.amount ?? 0) + 1
  upsertEffect(actor.effects.hitModifiers, {
    id,
    sourceSkillName: '乘风连击',
    amount: nextAmount,
    remainingTurns: null,
  })
  state.log.push({
    type: 'effect_applied',
    turn: state.turn,
    side: actor.side,
    skillName: skill.name,
    effectName: 'hit_modifier',
    amount: nextAmount,
    reason: '乘风连击',
  })
}

function applyAfterSkillUseEffects(
  state: BattleState,
  actor: Combatant,
  skill: SkillInfo,
) {
  if (skill.name !== '折射') return

  const energyId = 'energy-cost:折射:all'
  const previousEnergy = actor.effects.energyCostModifiers.find(
    (modifier) => modifier.id === energyId,
  )
  upsertEffect(actor.effects.energyCostModifiers, {
    id: energyId,
    sourceSkillName: '折射',
    skillName: null,
    amount: (previousEnergy?.amount ?? 0) - 1,
    remainingTurns: null,
  })

  const statId = 'stat:magicAttack:折射'
  const previousStat = actor.effects.statModifiers.find(
    (modifier) => modifier.id === statId,
  )
  upsertEffect(actor.effects.statModifiers, {
    id: statId,
    sourceSkillName: '折射',
    stat: 'magicAttack',
    percent: (previousStat?.percent ?? 0) + 0.4,
    flat: 0,
    remainingTurns: null,
  })

  const powerId = 'power:折射:self'
  const previousPower = actor.effects.powerModifiers.find(
    (modifier) => modifier.id === powerId,
  )
  upsertEffect(actor.effects.powerModifiers, {
    id: powerId,
    sourceSkillName: '折射',
    skillName: '折射',
    amount: (previousPower?.amount ?? 0) + 20,
    multiplier: 1,
    remainingTurns: null,
  })

  state.log.push(
    {
      type: 'effect_applied',
      turn: state.turn,
      side: actor.side,
      skillName: '折射',
      effectName: 'energy_cost_modifier',
      amount: (previousEnergy?.amount ?? 0) - 1,
      reason: 'refraction_after_use',
    },
    {
      type: 'effect_applied',
      turn: state.turn,
      side: actor.side,
      skillName: '折射',
      effectName: 'stat_modifier',
      stat: 'magicAttack',
      percent: (previousStat?.percent ?? 0) + 0.4,
      amount: 0,
      reason: 'refraction_after_use',
    },
    {
      type: 'effect_applied',
      turn: state.turn,
      side: actor.side,
      skillName: '折射',
      effectName: 'skill_power_bonus',
      amount: (previousPower?.amount ?? 0) + 20,
      reason: 'refraction_after_use',
    },
  )
}

function recordLastUsedSkillCostEffects(actor: Combatant, skill: SkillInfo) {
  const id = 'energy-cost:硬化:last-attack'
  actor.effects.energyCostModifiers = actor.effects.energyCostModifiers.filter(
    (modifier) => modifier.id !== id,
  )

  if (
    !actor.skillSlots.includes('硬化') ||
    getDamageCategory(skill) === 'status' ||
    (skill.power ?? 0) <= 0
  ) {
    return
  }

  actor.effects.energyCostModifiers.push({
    id,
    sourceSkillName: skill.name,
    skillName: '硬化',
    amount: -2,
    remainingTurns: null,
  })
}

function applyStatModifiers(
  state: BattleState,
  target: Combatant,
  skill: SkillInfo,
  modifiers: NonNullable<ReturnType<typeof getSkillEffect>>['statModifiers'],
) {
  for (const modifier of modifiers ?? []) {
    const id = `stat:${modifier.stat}:${skill.name}`
    const nextModifier = {
      id,
      sourceSkillName: skill.name,
      stat: modifier.stat,
      percent: modifier.percent ?? 0,
      flat: modifier.flat ?? 0,
      remainingTurns: modifier.remainingTurns ?? null,
    }
    const existingIndex = target.effects.statModifiers.findIndex(
      (item) => item.id === id,
    )

    if (existingIndex >= 0) {
      target.effects.statModifiers[existingIndex] = nextModifier
    } else {
      target.effects.statModifiers.push(nextModifier)
    }

    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: target.side,
      skillName: skill.name,
      effectName: 'stat_modifier',
      stat: modifier.stat,
      percent: nextModifier.percent,
      amount: nextModifier.flat,
    })
  }
}

function applyPowerModifiers(
  state: BattleState,
  target: Combatant,
  skill: SkillInfo,
  modifiers: NonNullable<ReturnType<typeof getSkillEffect>>['powerModifiers'],
) {
  for (const modifier of modifiers ?? []) {
    const item: BattlePowerModifier = {
      id: `power:${skill.name}`,
      sourceSkillName: skill.name,
      skillName: modifier.skillName ?? null,
      amount: modifier.amount ?? 0,
      multiplier: modifier.multiplier ?? 1,
      remainingTurns: modifier.remainingTurns ?? null,
    }
    upsertEffect(target.effects.powerModifiers, item)
    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: target.side,
      skillName: skill.name,
      effectName: 'power_modifier',
      amount: item.amount,
      multiplier: item.multiplier,
    })
  }
}

function applyHitModifiers(
  state: BattleState,
  target: Combatant,
  skill: SkillInfo,
  modifiers: NonNullable<ReturnType<typeof getSkillEffect>>['hitModifiers'],
) {
  for (const modifier of modifiers ?? []) {
    const item: BattleHitModifier = {
      id: `hit:${skill.name}`,
      sourceSkillName: skill.name,
      amount: modifier.amount,
      remainingTurns: modifier.remainingTurns ?? null,
    }
    upsertEffect(target.effects.hitModifiers, item)
    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: target.side,
      skillName: skill.name,
      effectName: 'hit_modifier',
      amount: item.amount,
    })
  }
}

function applyPriorityModifiers(
  state: BattleState,
  target: Combatant,
  skill: SkillInfo,
  modifiers: NonNullable<ReturnType<typeof getSkillEffect>>['priorityModifiers'],
) {
  for (const modifier of modifiers ?? []) {
    const item: BattlePriorityModifier = {
      id: `priority:${skill.name}`,
      sourceSkillName: skill.name,
      amount: modifier.amount,
      remainingTurns: modifier.remainingTurns ?? null,
    }
    upsertEffect(target.effects.priorityModifiers, item)
    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: target.side,
      skillName: skill.name,
      effectName: 'priority_modifier',
      amount: item.amount,
    })
  }
}

function applyEnergyCostModifiers(
  state: BattleState,
  target: Combatant,
  skill: SkillInfo,
  modifiers: NonNullable<
    ReturnType<typeof getSkillEffect>
  >['energyCostModifiers'],
) {
  for (const modifier of modifiers ?? []) {
    const amount =
      target.traitName === '对流' ? modifier.amount * -1 : modifier.amount
    const item: BattleEnergyCostModifier = {
      id: `energy-cost:${modifier.skillName ?? 'all'}:${skill.name}`,
      sourceSkillName: skill.name,
      amount,
      skillName: modifier.skillName ?? null,
      remainingTurns: modifier.remainingTurns ?? null,
    }
    upsertEffect(target.effects.energyCostModifiers, item)
    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: target.side,
      skillName: skill.name,
      effectName: 'energy_cost_modifier',
      amount,
    })
  }
}

function applyHealEffect(
  state: BattleState,
  target: Combatant,
  skill: SkillInfo,
  heal: NonNullable<ReturnType<typeof getSkillEffect>>['heal'],
  effectName: string,
) {
  if (!heal) return
  const fixedAmount = heal.fixedAmount ?? 0
  const percentAmount = heal.percentOfMaxHp
    ? Math.floor(target.maxHp * heal.percentOfMaxHp)
    : 0
  healCombatant(state, target, skill, fixedAmount + percentAmount, effectName)
}

function applyEnergyDelta(
  state: BattleState,
  target: Combatant,
  skill: SkillInfo,
  amount: number,
  effectName: string,
) {
  const before = target.energy
  target.energy = clamp(target.energy + amount, 0, target.maxEnergy)
  const delta = target.energy - before
  if (delta === 0) return

  state.log.push({
    type: 'effect_applied',
    turn: state.turn,
    side: target.side,
    skillName: skill.name,
    effectName,
    amount: delta,
    energy: target.energy,
  })
}

function stealEnergy(
  state: BattleState,
  actor: Combatant,
  target: Combatant,
  skill: SkillInfo,
  amount: number,
) {
  const stolen = Math.min(amount, target.energy, actor.maxEnergy - actor.energy)
  if (stolen <= 0) return
  applyEnergyDelta(state, target, skill, -stolen, 'stolen_energy_lost')
  applyEnergyDelta(state, actor, skill, stolen, 'stolen_energy_gained')
}

function applyClearEffect(
  state: BattleState,
  actor: Combatant,
  target: Combatant,
  skill: SkillInfo,
  clear: NonNullable<ReturnType<typeof getSkillEffect>>['clear'],
  turnContext?: TurnContext,
) {
  if (!clear) return
  if (
    clear.blockedByTargetActionKind &&
    turnContext?.actionsBySide[target.side]?.actionKind ===
      clear.blockedByTargetActionKind
  ) {
    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: actor.side,
      target: target.side,
      skillName: skill.name,
      effectName: 'clear_effects_blocked',
      reason: clear.blockedByTargetActionKind,
    })
    return
  }

  let removedTargetStatuses = 0
  let removedMarkStacks = 0

  if (clear.targetStatuses || clear.allStatuses) {
    removedTargetStatuses = countStatusStacks(target)
    target.effects.statuses = []
    target.effects.marks = []
  }
  if (clear.selfStatuses || clear.allStatuses) {
    actor.effects.statuses = []
    actor.effects.marks = []
  }
  if (clear.targetMarks || clear.allMarks) {
    removedMarkStacks += countMarkStacks(target)
    target.effects.marks = []
  }
  if (clear.selfMarks || clear.allMarks) {
    removedMarkStacks += countMarkStacks(actor)
    actor.effects.marks = []
  }
  if (clear.targetPositiveStatModifiers) {
    target.effects.statModifiers = target.effects.statModifiers.filter(
      (modifier) => modifier.percent <= 0 && modifier.flat <= 0,
    )
  }
  if (clear.targetPositiveEffects) {
    clearPositiveEffects(target)
  }
  if (clear.targetPositiveEffectCount) {
    clearPositiveEffects(target, clear.targetPositiveEffectCount)
  }
  if (clear.targetNegativeStatModifiers) {
    target.effects.statModifiers = target.effects.statModifiers.filter(
      (modifier) => modifier.percent >= 0 && modifier.flat >= 0,
    )
  }

  if (clear.healPercentOfMaxHpPerTargetStatus && removedTargetStatuses > 0) {
    healCombatant(
      state,
      actor,
      skill,
      Math.floor(
        actor.maxHp *
          clear.healPercentOfMaxHpPerTargetStatus *
          removedTargetStatuses,
      ),
      'clear_status_heal',
    )
  }
  if (clear.healPercentOfMaxHpPerClearedStack && removedMarkStacks > 0) {
    healCombatant(
      state,
      actor,
      skill,
      Math.floor(
        actor.maxHp *
          clear.healPercentOfMaxHpPerClearedStack *
          removedMarkStacks,
      ),
      'clear_mark_heal',
    )
  }
  if (clear.statusToTargetPerClearedMarkStack && removedMarkStacks > 0) {
    applyStatusEffect(
      state,
      target,
      skill,
      {
        ...clear.statusToTargetPerClearedMarkStack,
        stacks:
          (clear.statusToTargetPerClearedMarkStack.stacks ?? 1) *
          removedMarkStacks,
      },
      actor,
    )
  }

  state.log.push({
    type: 'effect_applied',
    turn: state.turn,
    side: actor.side,
    target: target.side,
    skillName: skill.name,
    effectName: 'clear_effects',
    amount: removedTargetStatuses + removedMarkStacks,
  })
}

function applyWeatherEffect(
  state: BattleState,
  actor: Combatant,
  skill: SkillInfo,
  weather: NonNullable<ReturnType<typeof getSkillEffect>>['weather'],
) {
  if (!weather) return

  state.field.weather = { ...weather }
  state.log.push({
    type: 'effect_applied',
    turn: state.turn,
    side: actor.side,
    skillName: skill.name,
    effectName: 'weather',
    status: weather.kind,
    amount: weather.remainingTurns,
  })
}

function applyResponseCounterDamage(
  state: BattleState,
  context: BattleContext,
  actor: Combatant,
  target: Combatant,
  skill: SkillInfo,
  turnContext: TurnContext,
) {
  const targetSkill = turnContext.actionsBySide[target.side].skill
  const power = targetSkill?.power ?? 0
  if (power <= 0) return

  const counterSkill: SkillInfo = {
    ...skill,
    category: '物攻',
    power,
    effect: null,
    description: null,
  }
  const breakdown = calculateDamage(
    actor,
    target,
    counterSkill,
    context.attributeMap,
    state.rules,
  )
  const previousHp = target.currentHp
  target.currentHp = Math.max(0, target.currentHp - breakdown.finalDamage)
  applyLethalDamagePassives(state, actor, target, counterSkill, previousHp)
  const actualDamage = previousHp - target.currentHp

  state.log.push({
    type: 'damage',
    turn: state.turn,
    side: actor.side,
    target: target.side,
    skillName: skill.name,
    damage: actualDamage,
    hp: target.currentHp,
    effectName: 'response_counter_damage',
    breakdown,
  })

  if (target.currentHp <= 0) {
    state.log.push({
      type: 'fainted',
      turn: state.turn,
      side: target.side,
    })
    state.phase = 'ended'
    state.winner = actor.side
    state.log.push({
      type: 'battle_ended',
      turn: state.turn,
      winner: actor.side,
    })
  }
}

function upsertEffect<T extends { id: string }>(effects: T[], effect: T) {
  const existingIndex = effects.findIndex((item) => item.id === effect.id)
  if (existingIndex >= 0) {
    effects[existingIndex] = effect
  } else {
    effects.push(effect)
  }
}

function consumeDamageReductions(state: BattleState, target: Combatant) {
  let multiplier = 1

  for (const reduction of target.effects.damageReductions) {
    if (reduction.remainingHits <= 0) continue

    multiplier *= reduction.incomingDamageMultiplier
    reduction.remainingHits -= 1

    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: target.side,
      skillName: reduction.sourceSkillName,
      effectName: 'incoming_damage_reduction',
      multiplier: reduction.incomingDamageMultiplier,
      amount: reduction.remainingHits,
    })
  }

  target.effects.damageReductions = target.effects.damageReductions.filter(
    (reduction) => reduction.remainingHits > 0,
  )

  return multiplier
}

function healCombatant(
  state: BattleState,
  combatant: Combatant,
  skill: SkillInfo,
  amount: number,
  effectName: string,
) {
  if (amount <= 0 || combatant.currentHp <= 0) return

  const before = combatant.currentHp
  combatant.currentHp = clamp(combatant.currentHp + amount, 0, combatant.maxHp)
  const healed = combatant.currentHp - before

  if (healed <= 0) return

  state.log.push({
    type: 'healed',
    turn: state.turn,
    side: combatant.side,
    skillName: skill.name,
    effectName,
    amount: healed,
    hp: combatant.currentHp,
  })
}

function applyStatusEffect(
  state: BattleState,
  target: Combatant,
  skill: SkillInfo,
  status: SkillStatusEffect,
  source: Combatant,
) {
  if (isMarkKind(status.kind)) {
    applyMarkEffect(
      state,
      target,
      skill,
      status as SkillStatusEffect & { kind: BattleMarkKind },
      source,
    )
    return
  }

  const id = `status:${status.kind}`
  const existing = target.effects.statuses.find((item) => item.id === id)
  const stacks = Math.min(
    status.maxStacks ?? Number.POSITIVE_INFINITY,
    (existing?.stacks ?? 0) + (status.stacks ?? 1),
  )
  const nextStatus: BattleStatusEffect = {
    id,
    sourceSkillName: skill.name,
    kind: status.kind,
    remainingTurns: resolveStatusRemainingTurns(existing, status),
    stacks,
    damagePercentPerTurn: status.damagePercentPerTurn,
    statMultipliers: status.statMultipliers,
  }
  const existingIndex = target.effects.statuses.findIndex(
    (item) => item.id === id,
  )

  if (existingIndex >= 0) {
    target.effects.statuses[existingIndex] = nextStatus
  } else {
    target.effects.statuses.push(nextStatus)
  }

  state.log.push({
    type: 'status_applied',
    turn: state.turn,
    side: target.side,
    skillName: skill.name,
    status: status.kind,
    amount: stacks,
  })

  applyStatusPassiveHooks(state, source, target, skill, status)
}

function applyMarkEffect(
  state: BattleState,
  target: Combatant,
  skill: SkillInfo,
  status: SkillStatusEffect & { kind: BattleMarkKind },
  source: Combatant,
) {
  const id = `mark:${status.kind}`
  const existing = target.effects.marks.find((item) => item.id === id)
  const stacks = Math.min(
    status.maxStacks ?? Number.POSITIVE_INFINITY,
    (existing?.stacks ?? 0) + (status.stacks ?? 1),
  )
  const nextMark = {
    id,
    sourceSkillName: skill.name,
    kind: status.kind,
    remainingTurns: resolveStatusRemainingTurns(existing, status),
    stacks,
    damagePercentPerTurn: status.damagePercentPerTurn,
  }
  const existingIndex = target.effects.marks.findIndex((item) => item.id === id)

  if (existingIndex >= 0) {
    target.effects.marks[existingIndex] = nextMark
  } else {
    target.effects.marks.push(nextMark)
  }

  state.log.push({
    type: 'mark_applied',
    turn: state.turn,
    side: target.side,
    skillName: skill.name,
    mark: status.kind,
    amount: stacks,
  })

  applyStatusPassiveHooks(state, source, target, skill, status)
}

function resolveStatusRemainingTurns(
  existing: BattleStatusEffect | undefined,
  status: SkillStatusEffect,
) {
  if (status.remainingTurns === undefined) return existing?.remainingTurns ?? null
  if (status.remainingTurns === null || existing?.remainingTurns === null)
    return null
  return Math.max(existing?.remainingTurns ?? 0, status.remainingTurns)
}

function endTurn(state: BattleState) {
  recoverEnergy(state, 'player')
  recoverEnergy(state, 'opponent')
  const suppressEndTurnEffects =
    state.combatants.player.traitName === '陨落' ||
    state.combatants.opponent.traitName === '陨落'
  if (!suppressEndTurnEffects) {
    applyEndTurnPassiveEffects(state, 'player')
    if (state.phase !== 'ended') applyEndTurnPassiveEffects(state, 'opponent')
    if (state.phase !== 'ended') applyEndTurnEffects(state, 'player')
    if (state.phase !== 'ended') applyEndTurnEffects(state, 'opponent')
  }
  tickWeatherDuration(state)
  state.log.push({ type: 'turn_ended', turn: state.turn })
}

function tickWeatherDuration(state: BattleState) {
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

function recoverEnergy(state: BattleState, side: BattleSide) {
  const combatant = state.combatants[side]
  const amount = state.rules.energyRecoveryPerTurn

  if (amount <= 0 || combatant.currentHp <= 0) return

  const before = combatant.energy
  combatant.energy = clamp(combatant.energy + amount, 0, combatant.maxEnergy)
  const recovered = combatant.energy - before

  if (recovered > 0) {
    state.log.push({
      type: 'energy_recovered',
      turn: state.turn,
      side,
      amount: recovered,
      energy: combatant.energy,
    })
  }
}

function applyEndTurnEffects(state: BattleState, side: BattleSide) {
  const combatant = state.combatants[side]
  if (combatant.currentHp <= 0) return

  for (const status of combatant.effects.statuses) {
    if (!status.damagePercentPerTurn) continue

    const damage = Math.max(
      1,
      Math.floor(
        combatant.maxHp * status.damagePercentPerTurn * status.stacks,
      ),
    )
    combatant.currentHp = Math.max(0, combatant.currentHp - damage)
    state.log.push({
      type: 'status_damage',
      turn: state.turn,
      side,
      skillName: status.sourceSkillName,
      status: status.kind,
      damage,
      hp: combatant.currentHp,
    })

    if (combatant.currentHp <= 0) {
      const winner = oppositeSide(side)
      state.log.push({
        type: 'fainted',
        turn: state.turn,
        side,
      })
      state.phase = 'ended'
      state.winner = winner
      state.log.push({
        type: 'battle_ended',
        turn: state.turn,
        winner,
      })
      return
    }
  }

  for (const mark of combatant.effects.marks) {
    if (!mark.damagePercentPerTurn) continue

    const damage = Math.max(
      1,
      Math.floor(combatant.maxHp * mark.damagePercentPerTurn * mark.stacks),
    )
    combatant.currentHp = Math.max(0, combatant.currentHp - damage)
    state.log.push({
      type: 'mark_damage',
      turn: state.turn,
      side,
      skillName: mark.sourceSkillName,
      mark: mark.kind,
      damage,
      hp: combatant.currentHp,
    })

    if (combatant.currentHp <= 0) {
      const winner = oppositeSide(side)
      state.log.push({
        type: 'fainted',
        turn: state.turn,
        side,
      })
      state.phase = 'ended'
      state.winner = winner
      state.log.push({
        type: 'battle_ended',
        turn: state.turn,
        winner,
      })
      return
    }
  }

  tickEffectDurations(state, combatant)
}

function tickEffectDurations(state: BattleState, combatant: Combatant) {
  combatant.effects.statModifiers = tickRemainingTurns(
    state,
    combatant.side,
    'stat_modifier',
    combatant.effects.statModifiers,
  )
  combatant.effects.powerModifiers = tickRemainingTurns(
    state,
    combatant.side,
    'power_modifier',
    combatant.effects.powerModifiers,
  )
  combatant.effects.hitModifiers = tickRemainingTurns(
    state,
    combatant.side,
    'hit_modifier',
    combatant.effects.hitModifiers,
  )
  combatant.effects.priorityModifiers = tickRemainingTurns(
    state,
    combatant.side,
    'priority_modifier',
    combatant.effects.priorityModifiers,
  )
  combatant.effects.energyCostModifiers = tickRemainingTurns(
    state,
    combatant.side,
    'energy_cost_modifier',
    combatant.effects.energyCostModifiers,
  )
  combatant.effects.damageReductions = tickRemainingTurns(
    state,
    combatant.side,
    'damage_reduction',
    combatant.effects.damageReductions,
  )
  combatant.effects.statuses = tickRemainingTurns(
    state,
    combatant.side,
    'status',
    combatant.effects.statuses,
  )
  combatant.effects.marks = tickRemainingTurns(
    state,
    combatant.side,
    'mark',
    combatant.effects.marks,
  )
}

function tickRemainingTurns<T extends { remainingTurns: number | null; id: string }>(
  state: BattleState,
  side: BattleSide,
  effectName: string,
  effects: T[],
) {
  const nextEffects: T[] = []

  for (const effect of effects) {
    if (effect.remainingTurns === null) {
      nextEffects.push(effect)
      continue
    }

    const remainingTurns = effect.remainingTurns - 1
    if (remainingTurns <= 0) {
      state.log.push({
        type: 'effect_expired',
        turn: state.turn,
        side,
        effectName,
        reason: effect.id,
      })
      continue
    }

    nextEffects.push({
      ...effect,
      remainingTurns,
    })
  }

  return nextEffects
}

function resolveTurnActions(context: BattleContext, actions: BattleAction[]) {
  const normalizedActions: BattleAction[] = [
    actions.find((action) => action.side === 'player') ?? {
      side: 'player',
      type: 'wait',
    },
    actions.find((action) => action.side === 'opponent') ?? {
      side: 'opponent',
      type: 'wait',
    },
  ]

  return normalizedActions.map((action): ResolvedTurnAction => {
    const skill =
      action.type === 'wait' ? null : context.skillMap.get(action.skillName) ?? null

    return {
      action,
      skill,
      actionKind: action.type === 'wait' ? 'wait' : getSkillActionKind(skill),
    }
  })
}

function getOrderedActions(state: BattleState, turnContext: TurnContext) {
  const resolvedActions = [
    turnContext.actionsBySide.player,
    turnContext.actionsBySide.opponent,
  ]

  return resolvedActions.sort((left, right) => {
    const priorityDiff =
      getActionPriority(state, right, turnContext) -
      getActionPriority(state, left, turnContext)
    if (priorityDiff !== 0) return priorityDiff

    const leftSpeed = getEffectiveStat(
      state.combatants[left.action.side],
      'speed',
    )
    const rightSpeed = getEffectiveStat(
      state.combatants[right.action.side],
      'speed',
    )
    if (leftSpeed !== rightSpeed) return rightSpeed - leftSpeed
    return sideOrder[left.action.side] - sideOrder[right.action.side]
  })
}

function getActionPriority(
  state: BattleState,
  resolvedAction: ResolvedTurnAction,
  turnContext: TurnContext,
) {
  const responsePriority = getResponsePriority(resolvedAction, turnContext)
  if (responsePriority > 0) return responsePriority

  if (!resolvedAction.skill) return 0
  const actor = state.combatants[resolvedAction.action.side]
  const basePriority = getSkillEffect(resolvedAction.skill.name)?.basePriority ?? 0
  const combatantPriority = getPassivePriority(actor, resolvedAction.skill)
  const modifierPriority = actor.effects.priorityModifiers.reduce(
    (total, modifier) => total + modifier.amount,
    0,
  )
  return basePriority + combatantPriority + modifierPriority
}

function getResponsePriority(
  resolvedAction: ResolvedTurnAction,
  turnContext: TurnContext,
) {
  if (!isResponseTriggered(resolvedAction, turnContext)) return 0

  return getSkillEffect(resolvedAction.skill?.name ?? '')?.response?.priority ?? 0
}

function isResponseTriggered(
  resolvedAction: ResolvedTurnAction,
  turnContext: TurnContext,
) {
  if (!resolvedAction.skill) return false
  const response = getSkillEffect(resolvedAction.skill.name)?.response
  if (!response) return false

  const targetAction =
    turnContext.actionsBySide[oppositeSide(resolvedAction.action.side)]
  return response.targetActionKind === targetAction.actionKind
}

function cloneBattleState(state: BattleState): BattleState {
  return {
    ...state,
    rules: { ...state.rules },
    field: {
      weather: state.field.weather ? { ...state.field.weather } : null,
    },
    skillTraits: {
      swiftSkillNames: {
        player: [...state.skillTraits.swiftSkillNames.player],
        opponent: [...state.skillTraits.swiftSkillNames.opponent],
      },
    },
    combatants: {
      player: cloneCombatant(state.combatants.player),
      opponent: cloneCombatant(state.combatants.opponent),
    },
    log: [...state.log],
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
      damageReductions: combatant.effects.damageReductions.map(
        (reduction) => ({
          ...reduction,
        }),
      ),
      statuses: combatant.effects.statuses.map((status) => ({
        ...status,
        statMultipliers: { ...status.statMultipliers },
      })),
      marks: combatant.effects.marks.map((mark) => ({ ...mark })),
    },
  }
}

function applyBattleStartPassives(state: BattleState) {
  for (const side of ['player', 'opponent'] as const) {
    const combatant = state.combatants[side]
    if (combatant.traitName === '图书守卫者' && combatant.energy === 1) {
      applyPassiveStatModifier(state, combatant, 'physicalAttack', 0.5)
      applyPassiveStatModifier(state, combatant, 'magicAttack', 0.5)
    }
    if (combatant.traitName === '构装契约者') {
      const target = state.combatants[oppositeSide(side)]
      if (target.energy === 1) {
        applyPassiveStatModifier(state, combatant, 'physicalDefense', 0.5)
        applyPassiveStatModifier(state, combatant, 'magicDefense', 0.5)
      }
    }
  }
}

function applyStartOfTurnPassives(
  state: BattleState,
  context: BattleContext,
  turnContext: TurnContext,
) {
  for (const side of ['player', 'opponent'] as const) {
    const combatant = state.combatants[side]
    const targetSide = oppositeSide(side)
    const targetAction = turnContext.actionsBySide[targetSide]

    if (combatant.traitName !== '预警' || !targetAction.skill) continue
    if (getDamageCategory(targetAction.skill) === 'status') continue

    const incoming = calculateDamage(
      state.combatants[targetSide],
      combatant,
      targetAction.skill,
      context.attributeMap,
      state.rules,
    )
    if (incoming.finalDamage < combatant.currentHp) continue

    applyPassiveFlatStatModifier(state, combatant, 'speed', 50, 1)
  }
}

function applyEndTurnPassiveEffects(state: BattleState, side: BattleSide) {
  const combatant = state.combatants[side]
  const target = state.combatants[oppositeSide(side)]
  if (combatant.currentHp <= 0) return

  if (combatant.traitName === '毒蘑菇') {
    const skill = createPassiveSkill('毒蘑菇')
    stealEnergy(state, combatant, target, skill, 1)
  }

  if (combatant.traitName === '特殊清洁场景') {
    const stolen = stealOneStatusStack(target, combatant)
    if (stolen) {
      state.log.push({
        type: 'effect_applied',
        turn: state.turn,
        side,
        target: target.side,
        skillName: '特殊清洁场景',
        effectName: 'steal_status',
        status: stolen,
      })
    }
  }
}

function applyStatusPassiveHooks(
  state: BattleState,
  source: Combatant,
  target: Combatant,
  skill: SkillInfo,
  status: SkillStatusEffect,
) {
  if (source.traitName === '捉迷藏' && status.kind === 'freeze') {
    applyEnergyCostModifiers(state, target, skill, [
      {
        amount: 1,
        remainingTurns: null,
      },
    ])
  }

}

function applySkillUsePassiveHooks(
  state: BattleState,
  actor: Combatant,
  target: Combatant,
  skill: SkillInfo,
) {
  if (actor.traitName === '灵魂灼伤') {
    if (skill.attribute === 'ice') {
      applyStatusEffect(
        state,
        target,
        createPassiveSkill('灵魂灼伤'),
        {
          kind: 'burn',
          stacks: 4,
          remainingTurns: null,
          damagePercentPerTurn: 0.03,
        },
        actor,
      )
    }
    if (skill.attribute === 'fire') {
      applyStatusEffect(
        state,
        target,
        createPassiveSkill('灵魂灼伤'),
        {
          kind: 'freeze',
          stacks: 2,
          remainingTurns: null,
        },
        actor,
      )
    }
  }

  if (
    actor.traitName === '渗透' &&
    (skill.attribute === 'fighting' || skill.attribute === 'ground')
  ) {
    for (const stat of [
      'physicalAttack',
      'magicAttack',
      'physicalDefense',
      'magicDefense',
    ] as const) {
      applyPassiveStatModifier(state, actor, stat, 0.05)
    }
  }
}

function applyLethalDamagePassives(
  state: BattleState,
  attacker: Combatant,
  target: Combatant,
  skill: SkillInfo,
  previousHp: number,
) {
  if (target.currentHp > 0 || previousHp <= 0) return

  if (target.traitName === '化茧' && !hasStatus(target, 'cute')) {
    target.currentHp = previousHp
    applyStatusEffect(
      state,
      target,
      createPassiveSkill('化茧'),
      {
        kind: 'cute',
        stacks: 1,
        remainingTurns: null,
      },
      target,
    )
    state.log.push({
      type: 'effect_applied',
      turn: state.turn,
      side: target.side,
      target: attacker.side,
      skillName: skill.name,
      effectName: 'lethal_damage_prevented',
    })
  }

}

function getPassiveDamageAdjustment(
  actor: Combatant,
  target: Combatant,
  skill: SkillInfo,
  context: BattleContext,
  turnContext: TurnContext,
) {
  let powerBonus = 0
  let powerMultiplier = 1
  let hitBonus = 0

  if (
    actor.traitName === '顺风' &&
    !turnContext.executedSides.has(target.side) &&
    getDamageCategory(skill) !== 'status'
  ) {
    powerMultiplier *= 1.5
  }
  if (actor.traitName === '变形活画') {
    powerMultiplier *= 1 + countPositiveEffects(target) * 0.1
  }
  if (actor.traitName === '向心力') {
    const slot = getSkillSlot(actor, skill.name)
    if (slot === 1 || slot === 2) powerBonus += 30
  }
  if (actor.traitName === '不移' && isBasicDamageOnlyText(skill.effect ?? '')) {
    powerMultiplier *= 1.3
  }
  if (actor.traitName === '目空' && skill.attribute !== 'light') {
    powerMultiplier *= 1.25
  }
  if (actor.traitName === '嫁祸') {
    const lostRatio = 1 - actor.currentHp / actor.maxHp
    hitBonus += Math.floor(lostRatio / 0.25) * 2
  }
  if (actor.traitName === '血型吸引') {
    powerBonus += countTargetCarriedAttributes(target, context) * 10
  }

  return {
    powerBonus,
    powerMultiplier,
    hitBonus,
  }
}

function canUseSkillByPassive(combatant: Combatant, skillName: string) {
  if (combatant.traitName !== '正位宝剑') return true
  return getSkillSlot(combatant, skillName) === 1
}

function getPassivePriority(combatant: Combatant, skill: SkillInfo) {
  let priority = 0

  if (combatant.traitName === '翼轴' && getSkillSlot(combatant, skill.name) === 1) {
    priority += 1
  }

  return priority
}

function getSkillEnergyCost(
  state: BattleState,
  context: BattleContext,
  combatant: Combatant,
  skill: SkillInfo,
  options: { ignoreGaleChainExtra?: boolean } = {},
) {
  const baseEnergy = Math.max(0, skill.energy ?? 0)
  const modifier = combatant.effects.energyCostModifiers
    .filter((item) => item.skillName === null || item.skillName === skill.name)
    .reduce((total, item) => total + item.amount, 0)
  const axisSupportModifier = getAxisSupportEnergyCostModifier(
    combatant,
    skill.name,
  )
  const galeChainExtra =
    skill.name === '疾风连袭' && !options.ignoreGaleChainExtra
      ? Math.floor(
          getGaleChainSkillNames(state, context, combatant).reduce(
            (total, skillName) => {
              const chainedSkill = context.skillMap.get(skillName)
              return chainedSkill
                ? total +
                    getSkillEnergyCost(
                      state,
                      context,
                      combatant,
                      chainedSkill,
                      { ignoreGaleChainExtra: true },
                    )
                : total
            },
            0,
          ) / 2,
        )
      : 0

  let cost = Math.max(
    0,
    baseEnergy + modifier + axisSupportModifier + galeChainExtra,
  )
  if (state.field.weather?.kind === 'sandstorm' && skill.attribute === 'ground') {
    cost = Math.floor(cost / 2)
  }

  return cost
}

function getSkillSlot(combatant: Combatant, skillName: string) {
  const index = combatant.skillSlots.indexOf(skillName)
  return index < 0 ? null : index + 1
}

function getGaleChainSkillNames(
  state: BattleState,
  context: BattleContext,
  combatant: Combatant,
) {
  const override = state.skillTraits.swiftSkillNames[combatant.side]
  const skillNames =
    override.length > 0
      ? override
      : combatant.skillSlots.filter((skillName, index) => {
          const skill = context.skillMap.get(skillName)
          return skill ? isSwiftSkillForCombatant(combatant, skill, index) : false
        })

  return skillNames.filter((skillName) => skillName !== '疾风连袭')
}

function isSwiftSkillForCombatant(
  combatant: Combatant,
  skill: SkillInfo,
  zeroBasedSkillSlot: number,
) {
  if (hasNativeSwiftText(skill)) return true
  if (combatant.traitName === '翼轴' && zeroBasedSkillSlot === 0) return true
  return false
}

function hasNativeSwiftText(skill: SkillInfo) {
  const text = `${skill.effect ?? ''}${skill.description ?? ''}`
  if (!text.includes('迅捷')) return false
  return !text.includes('释放自己释放过的迅捷技能')
}

function getAxisSupportEnergyCostModifier(
  combatant: Combatant,
  skillName: string,
) {
  const skillIndex = combatant.skillSlots.indexOf(skillName)
  if (skillIndex < 0) return 0

  return combatant.skillSlots.some(
    (candidate, index) =>
      candidate === '轴承支撑' && Math.abs(index - skillIndex) === 1,
  )
    ? -1
    : 0
}

function hasDebuff(combatant: Combatant) {
  return combatant.effects.statModifiers.some(
    (modifier) => modifier.percent < 0 || modifier.flat < 0,
  )
}

function isMarkKind(kind: BattleStatusKind): kind is BattleMarkKind {
  return markKinds.has(kind)
}

function hasStatus(combatant: Combatant, kind: BattleStatusEffect['kind']) {
  return (
    combatant.effects.statuses.some((status) => status.kind === kind) ||
    combatant.effects.marks.some((mark) => mark.kind === kind)
  )
}

function countStatusStacks(combatant: Combatant) {
  const statusStacks = combatant.effects.statuses.reduce(
    (total, status) => total + status.stacks,
    0,
  )
  const markStacks = combatant.effects.marks.reduce(
    (total, mark) => total + mark.stacks,
    0,
  )
  return statusStacks + markStacks
}

function countMarkStacks(combatant: Combatant) {
  return combatant.effects.marks.reduce(
    (total, mark) => total + mark.stacks,
    0,
  )
}

function countPositiveEffects(combatant: Combatant) {
  const positiveStats = combatant.effects.statModifiers.filter(
    (modifier) => modifier.percent > 0 || modifier.flat > 0,
  ).length
  const positiveStatuses = combatant.effects.statuses
    .filter((status) =>
      ['cute', 'wet', 'photosynthesis', 'sandstorm'].includes(status.kind),
    )
    .reduce((total, status) => total + status.stacks, 0)
  const positiveMarks = combatant.effects.marks
    .filter((mark) => ['wet', 'photosynthesis'].includes(mark.kind))
    .reduce((total, mark) => total + mark.stacks, 0)

  return positiveStats + positiveStatuses + positiveMarks
}

function clearPositiveEffects(
  combatant: Combatant,
  maxStacks = Number.POSITIVE_INFINITY,
) {
  let remaining = maxStacks
  combatant.effects.statModifiers = combatant.effects.statModifiers.filter(
    (modifier) => {
      const positive = modifier.percent > 0 || modifier.flat > 0
      if (!positive || remaining <= 0) return true

      remaining -= 1
      return false
    },
  )

  const statusResult = clearPositiveStackEffects(
    combatant.effects.statuses,
    remaining,
  )
  combatant.effects.statuses = statusResult.effects
  remaining = statusResult.remaining

  const markResult = clearPositiveStackEffects(
    combatant.effects.marks,
    remaining,
  )
  combatant.effects.marks = markResult.effects
}

function clearPositiveStackEffects<
  T extends { kind: BattleStatusKind; stacks: number },
>(effects: T[], maxStacks: number) {
  let remaining = maxStacks
  const nextEffects: T[] = []

  for (const effect of effects) {
    const positive = ['cute', 'wet', 'photosynthesis', 'sandstorm'].includes(
      effect.kind,
    )
    if (!positive || remaining <= 0) {
      nextEffects.push(effect)
      continue
    }

    const removed = Math.min(effect.stacks, remaining)
    remaining -= removed
    const stacks = effect.stacks - removed
    if (stacks > 0) {
      nextEffects.push({
        ...effect,
        stacks,
      })
    }
  }

  return {
    effects: nextEffects,
    remaining,
  }
}

function countTargetCarriedAttributes(
  combatant: Combatant,
  context: BattleContext,
) {
  return new Set(
    combatant.knownSkills
      .map((skillName) => context.skillMap.get(skillName)?.attribute ?? null)
      .filter(Boolean),
  ).size
}

function applyPassiveStatModifier(
  state: BattleState,
  combatant: Combatant,
  stat: ModifiableBattleStatKey,
  percent: number,
  remainingTurns: number | null = null,
) {
  const skill = createPassiveSkill(combatant.traitName ?? 'passive')
  applyStatModifiers(state, combatant, skill, [
    {
      stat,
      percent,
      remainingTurns,
    },
  ])
}

function applyPassiveFlatStatModifier(
  state: BattleState,
  combatant: Combatant,
  stat: ModifiableBattleStatKey,
  flat: number,
  remainingTurns: number | null = null,
) {
  const skill = createPassiveSkill(combatant.traitName ?? 'passive')
  applyStatModifiers(state, combatant, skill, [
    {
      stat,
      flat,
      remainingTurns,
    },
  ])
}

function stealOneStatusStack(from: Combatant, to: Combatant) {
  const mark = from.effects.marks.find((item) => item.stacks > 0)
  if (mark) {
    mark.stacks -= 1
    if (mark.stacks <= 0) {
      from.effects.marks = from.effects.marks.filter(
        (item) => item.id !== mark.id,
      )
    }

    const existingMark = to.effects.marks.find((item) => item.kind === mark.kind)
    if (existingMark) {
      existingMark.stacks += 1
    } else {
      to.effects.marks.push({
        ...mark,
        id: `mark:${mark.kind}`,
        stacks: 1,
      })
    }

    return mark.kind
  }

  return null
}

function createPassiveSkill(name: string): SkillInfo {
  return {
    name,
    attribute: null,
    category: '状态',
    energy: 0,
    power: 0,
    effect: null,
    description: null,
    version: null,
    pageUrl: null,
  }
}

function constructHpStat(
  baseValue: number,
  level: number,
  construction: StatConstructionRules,
  nature: BattleNature | null,
) {
  const trainedBase = constructTrainedBaseStat(
    'health',
    baseValue,
    construction,
  )
  const scaledValue =
    ((trainedBase * construction.hpBaseMultiplier + construction.hpFlatBonus) *
      level) /
    construction.referenceLevel

  return Math.max(
    1,
    Math.floor(scaledValue * getNatureMultiplier('health', construction, nature)),
  )
}

function constructNonHpStat(
  key: BattleStatKey,
  baseValue: number,
  level: number,
  construction: StatConstructionRules,
  nature: BattleNature | null,
) {
  const trainedBase = constructTrainedBaseStat(key, baseValue, construction)
  const baseMultiplier =
    key === 'speed'
      ? construction.speedBaseMultiplier
      : construction.battleStatBaseMultiplier
  const flatBonus = key === 'speed' ? construction.speedFlatBonus : 0
  const scaledValue =
    ((trainedBase * baseMultiplier + flatBonus) * level) /
    construction.referenceLevel
  const natureMultiplier = getNatureMultiplier(key, construction, nature)
  return Math.max(1, Math.floor(scaledValue * natureMultiplier))
}

function getNatureMultiplier(
  key: BattleStatKey,
  construction: StatConstructionRules,
  nature: BattleNature | null,
) {
  let multiplier = construction.natureMultipliers[key] ?? 1

  if (!nature || nature.increased === nature.decreased) return multiplier
  if (nature.increased === key) multiplier *= construction.natureBoostMultiplier
  if (nature.decreased === key) multiplier *= construction.natureDropMultiplier

  return multiplier
}

function constructTrainedBaseStat(
  key: BattleStatKey,
  baseValue: number,
  construction: StatConstructionRules,
) {
  const individualValue =
    construction.individualValues[key] ?? construction.defaultIndividualValue
  const effortValue =
    construction.effortValues[key] ?? construction.defaultEffortValue
  const trainedValue = Math.floor(effortValue / 4)

  return Math.max(0, baseValue) + individualValue + trainedValue
}

function getDamageDivisor(rules: BattleRules) {
  return Math.max(1, rules.damageDivisor)
}

function uniqueSkillNames(skillNames: string[]) {
  return [...new Set(skillNames.filter(Boolean))]
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
