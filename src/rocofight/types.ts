import type {
  AttributeKey,
  AttributeMeta,
  DexDataBundle,
  Pet,
  PetStats,
  SkillInfo,
} from '../types'

export type BattleSide = 'player' | 'opponent'

export type BattlePhase = 'ready' | 'ended'

export type BattleStatKey = Exclude<keyof PetStats, 'baseStats'>

export type ModifiableBattleStatKey = Exclude<BattleStatKey, 'health'>

export type BattleStatusKind =
  | 'poison'
  | 'burn'
  | 'freeze'
  | 'paralysis'
  | 'sleep'
  | 'cute'
  | 'spirit'
  | 'wet'
  | 'photosynthesis'
  | 'sandstorm'

export type BattleMarkKind = Extract<
  BattleStatusKind,
  'poison' | 'burn' | 'freeze' | 'spirit' | 'wet' | 'photosynthesis'
>

export type BattleNature = {
  name?: string
  increased?: BattleStatKey
  decreased?: BattleStatKey
}

export type StatConstructionRules = {
  referenceLevel: number
  hpBaseMultiplier: number
  hpFlatBonus: number
  battleStatBaseMultiplier: number
  speedBaseMultiplier: number
  speedFlatBonus: number
  natureBoostMultiplier: number
  natureDropMultiplier: number
  defaultIndividualValue: number
  defaultEffortValue: number
  individualValues: Partial<Record<BattleStatKey, number>>
  effortValues: Partial<Record<BattleStatKey, number>>
  natureMultipliers: Partial<Record<BattleStatKey, number>>
}

export type BattleRules = {
  level: number
  maxEnergy: number
  startingEnergy: number
  sameAttributeBonus: number
  baseDamage: number
  randomFactor: number
  damageDivisor: number
  minDamage: number
  energyRecoveryPerTurn: number
  enforceLearnsets: boolean
  statConstruction: StatConstructionRules
}

export type BattleRuleOverrides = Partial<
  Omit<BattleRules, 'statConstruction'>
> & {
  statConstruction?: Partial<StatConstructionRules>
}

export type BattleContext = {
  skillMap: Map<string, SkillInfo>
  attributeMap: Map<AttributeKey, AttributeMeta>
}

export type BattleStatModifier = {
  id: string
  sourceSkillName: string
  stat: ModifiableBattleStatKey
  percent: number
  flat: number
  remainingTurns: number | null
}

export type BattlePowerModifier = {
  id: string
  sourceSkillName: string
  skillName: string | null
  amount: number
  multiplier: number
  remainingTurns: number | null
}

export type BattleHitModifier = {
  id: string
  sourceSkillName: string
  amount: number
  remainingTurns: number | null
}

export type BattlePriorityModifier = {
  id: string
  sourceSkillName: string
  amount: number
  remainingTurns: number | null
}

export type BattleEnergyCostModifier = {
  id: string
  sourceSkillName: string
  amount: number
  skillName: string | null
  remainingTurns: number | null
}

export type BattleDamageReduction = {
  id: string
  sourceSkillName: string
  incomingDamageMultiplier: number
  remainingHits: number
  remainingTurns: number | null
}

export type BattleStatusEffect = {
  id: string
  sourceSkillName: string
  kind: BattleStatusKind
  remainingTurns: number | null
  stacks: number
  damagePercentPerTurn?: number
  statMultipliers?: Partial<Record<ModifiableBattleStatKey, number>>
}

export type BattleMarkEffect = {
  id: string
  sourceSkillName: string
  kind: BattleMarkKind
  remainingTurns: number | null
  stacks: number
  damagePercentPerTurn?: number
}

export type CombatantEffects = {
  statModifiers: BattleStatModifier[]
  powerModifiers: BattlePowerModifier[]
  hitModifiers: BattleHitModifier[]
  priorityModifiers: BattlePriorityModifier[]
  energyCostModifiers: BattleEnergyCostModifier[]
  damageReductions: BattleDamageReduction[]
  statuses: BattleStatusEffect[]
  marks: BattleMarkEffect[]
}

export type Combatant = {
  id: string
  side: BattleSide
  petKey: string
  petId: string
  name: string
  level: number
  attributes: AttributeKey[]
  baseStats: PetStats
  traitName: string | null
  traitDescription: string | null
  bloodlineName: string | null
  skillSlots: string[]
  nature: BattleNature | null
  stats: PetStats
  maxHp: number
  currentHp: number
  maxEnergy: number
  energy: number
  knownSkills: string[]
  effects: CombatantEffects
}

export type DamageCategory = 'physical' | 'magical' | 'status'

export type BattleActionKind = 'attack' | 'defense' | 'status' | 'wait'

export type DamageBreakdown = {
  category: DamageCategory
  basePower: number
  power: number
  powerBonus: number
  powerMultiplier: number
  hitCount: number
  attack: number
  defense: number
  sameAttributeBonus: number
  attributeMultiplier: number
  damageMultiplier: number
  randomFactor: number
  rawDamage: number
  finalDamage: number
}

export type BattleAction =
  | {
      side: BattleSide
      type?: 'skill'
      skillName: string
    }
  | {
      side: BattleSide
      type: 'wait'
    }

export type SkillActionLegality =
  | {
      legal: true
      energyCost: number
    }
  | {
      legal: false
      reason:
        | 'fainted'
        | 'unknown_skill'
        | 'unlearned_skill'
        | 'passive_restricted_skill'
        | 'not_enough_energy'
      energyCost?: number
      energy?: number
    }

export type BattleLogEvent = {
  type:
    | 'battle_started'
    | 'turn_started'
    | 'skill_used'
    | 'damage'
    | 'action_failed'
    | 'effect_applied'
    | 'effect_unimplemented'
    | 'response_triggered'
    | 'energy_recovered'
    | 'healed'
    | 'status_applied'
    | 'status_damage'
    | 'mark_applied'
    | 'mark_damage'
    | 'effect_expired'
    | 'focus_used'
    | 'switched'
    | 'forced_switch'
    | 'switch_pending'
    | 'skill_position_changed'
    | 'swift_triggered'
    | 'turn_ended'
    | 'fainted'
    | 'battle_ended'
  turn: number
  side?: BattleSide
  target?: BattleSide
  skillName?: string
  reason?: string
  effectName?: string
  status?: BattleStatusKind
  mark?: BattleMarkKind
  actionKind?: BattleActionKind
  targetActionKind?: BattleActionKind
  stat?: ModifiableBattleStatKey
  percent?: number
  multiplier?: number
  energyCost?: number
  energy?: number
  amount?: number
  damage?: number
  hp?: number
  fromSlot?: number
  toSlot?: number
  petName?: string
  winner?: BattleSide
  breakdown?: DamageBreakdown
}

export type BattleWeatherKind = 'sandstorm'

export type BattleFieldState = {
  weather: {
    kind: BattleWeatherKind
    remainingTurns: number
  } | null
}

export type BattleSkillTraitState = {
  swiftSkillNames: Record<BattleSide, string[]>
}

export type BattleState = {
  turn: number
  phase: BattlePhase
  rules: BattleRules
  field: BattleFieldState
  skillTraits: BattleSkillTraitState
  combatants: Record<BattleSide, Combatant>
  winner: BattleSide | null
  log: BattleLogEvent[]
}

export type CreateBattleStateInput = {
  player: BattleCombatantInput
  opponent: BattleCombatantInput
  rules?: BattleRuleOverrides
}

export type CreateCombatantInput = {
  side: BattleSide
  pet: Pet
  bloodlineName?: string | null
  nature?: BattleNature | null
  level?: number
  maxEnergy?: number
  startingEnergy?: number
}

export type BattleCombatantInput =
  | Pet
  | Omit<CreateCombatantInput, 'side'>

export type BattleDataInput = Pick<DexDataBundle, 'skills' | 'attributes'>
