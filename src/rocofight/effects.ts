import type { SkillInfo } from '../types'
import type {
  BattleActionKind,
  BattleWeatherKind,
  BattleStatusKind,
  ModifiableBattleStatKey,
} from './types'

export type SkillStatModifierEffect = {
  stat: ModifiableBattleStatKey
  percent?: number
  flat?: number
  remainingTurns?: number | null
}

export type SkillPowerModifierEffect = {
  amount?: number
  multiplier?: number
  skillName?: string | null
  remainingTurns?: number | null
}

export type SkillHitModifierEffect = {
  amount: number
  remainingTurns?: number | null
}

export type SkillPriorityModifierEffect = {
  amount: number
  remainingTurns?: number | null
}

export type SkillEnergyCostModifierEffect = {
  amount: number
  skillName?: string | null
  remainingTurns?: number | null
}

export type SkillDamageReductionEffect = {
  incomingDamageMultiplier: number
  remainingHits: number
  remainingTurns?: number | null
}

export type SkillResponseEffect = {
  targetActionKind: BattleActionKind
  priority: number
  powerMultiplier?: number
  powerBonus?: number
  hitCount?: number
}

export type SkillHealEffect = {
  percentOfMaxHp?: number
  fixedAmount?: number
}

export type SkillEnergyEffect = {
  amount: number
}

export type SkillStatusEffect = {
  kind: BattleStatusKind
  remainingTurns?: number | null
  stacks?: number
  maxStacks?: number
  damagePercentPerTurn?: number
  statMultipliers?: Partial<Record<ModifiableBattleStatKey, number>>
}

export type SkillClearEffect = {
  targetStatuses?: boolean
  selfStatuses?: boolean
  allStatuses?: boolean
  targetMarks?: boolean
  selfMarks?: boolean
  allMarks?: boolean
  targetPositiveStatModifiers?: boolean
  targetPositiveEffects?: boolean
  targetPositiveEffectCount?: number
  targetNegativeStatModifiers?: boolean
  healPercentOfMaxHpPerTargetStatus?: number
  healPercentOfMaxHpPerClearedStack?: number
  statusToTargetPerClearedMarkStack?: SkillStatusEffect
  blockedByTargetActionKind?: BattleActionKind
}

export type SkillEffectDefinition = {
  basePriority?: number
  response?: SkillResponseEffect
  statModifiers?: SkillStatModifierEffect[]
  targetStatModifiers?: SkillStatModifierEffect[]
  responseStatModifiers?: SkillStatModifierEffect[]
  responseTargetStatModifiers?: SkillStatModifierEffect[]
  powerModifiers?: SkillPowerModifierEffect[]
  hitModifiers?: SkillHitModifierEffect[]
  priorityModifiers?: SkillPriorityModifierEffect[]
  responsePriorityModifiers?: SkillPriorityModifierEffect[]
  energyCostModifiers?: SkillEnergyCostModifierEffect[]
  targetEnergyCostModifiers?: SkillEnergyCostModifierEffect[]
  responseEnergyCostModifiers?: SkillEnergyCostModifierEffect[]
  responseTargetEnergyCostModifiers?: SkillEnergyCostModifierEffect[]
  damageReduction?: SkillDamageReductionEffect
  damageReductionRequiresResponse?: boolean
  heal?: SkillHealEffect
  responseHeal?: SkillHealEffect
  energy?: SkillEnergyEffect
  targetEnergy?: SkillEnergyEffect
  responseEnergy?: SkillEnergyEffect
  responseTargetEnergy?: SkillEnergyEffect
  energyFromTargetSkillCostOnResponse?: boolean
  stealEnergy?: number
  statusToTarget?: SkillStatusEffect
  statusToSelf?: SkillStatusEffect
  responseStatusToTarget?: SkillStatusEffect
  responseStatusToSelf?: SkillStatusEffect
  clear?: SkillClearEffect
  weather?: {
    kind: BattleWeatherKind
    remainingTurns: number
  }
  drainRatio?: number
  powerBonus?: number
  powerMultiplier?: number
  hitCount?: number
  firstActionHitCount?: number
  firstActionPowerMultiplier?: number
  lowHpHitCountBonus?: {
    threshold: number
    amount: number
  }
  targetEnergyZeroPowerMultiplier?: number
  knockoutEnergy?: number
  switchOut?: boolean
  responseSwitchOutTarget?: boolean
  switchOutTargetEnergy?: number
  interruptOnResponse?: boolean
  responseCounterDamage?: 'targetSkillPower'
  unimplementedNotes?: string[]
}

const quickStatus: SkillEffectDefinition = {}

const basicDamage: SkillEffectDefinition = {}

export const skillEffectRegistry: Record<string, SkillEffectDefinition> = {
  赤子之心: {
    statusToSelf: {
      kind: 'cute',
      stacks: 1,
      remainingTurns: null,
    },
    energyCostModifiers: [
      {
        amount: -3,
        remainingTurns: null,
      },
    ],
  },
  击鼓传花: {
    switchOut: true,
  },
  冰墙: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.2,
      remainingHits: 1,
    },
    responseStatusToTarget: {
      kind: 'freeze',
      stacks: 2,
      remainingTurns: null,
    },
  },
  暴风雪: {
    statusToTarget: {
      kind: 'freeze',
      stacks: 1,
      remainingTurns: null,
    },
  },
  水刃: {
    response: {
      targetActionKind: 'status',
      priority: 6,
    },
    responseEnergyCostModifiers: [
      {
        amount: -4,
        skillName: '水刃',
        remainingTurns: null,
      },
    ],
  },
  力量增效: {
    statModifiers: [
      {
        stat: 'physicalAttack',
        percent: 1,
      },
    ],
  },
  闪击: basicDamage,
  疾风连袭: {
    energyCostModifiers: [
      {
        amount: 1,
        skillName: '疾风连袭',
        remainingTurns: null,
      },
    ],
  },
  钢铁洪流: basicDamage,
  倾泻: {
    clear: {
      allMarks: true,
      blockedByTargetActionKind: 'defense',
    },
  },
  超级糖果: {
    powerBonus: 60,
    statusToSelf: {
      kind: 'cute',
      stacks: 1,
      remainingTurns: null,
    },
  },
  齿轮扭矩: basicDamage,
  先发制人: {
    basePriority: 1,
  },
  龙卷风: {
    response: {
      targetActionKind: 'status',
      priority: 6,
      powerMultiplier: 1.5,
    },
  },
  鸣沙陷阱: basicDamage,
  啮合传递: {
    statModifiers: [
      {
        stat: 'speed',
        flat: 80,
      },
    ],
  },
  主轴: basicDamage,
  隼鳞: basicDamage,
  偷袭: {
    response: {
      targetActionKind: 'status',
      priority: 6,
      powerMultiplier: 3,
    },
  },
  吓退: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.4,
      remainingHits: 1,
    },
    responseSwitchOutTarget: true,
  },
  降灵: {
    statusToTarget: {
      kind: 'spirit',
      stacks: 1,
      remainingTurns: null,
    },
  },
  冰爪: basicDamage,
  吞噬: {
    knockoutEnergy: 6,
  },
  地刺: {
    response: {
      targetActionKind: 'status',
      priority: 6,
    },
    interruptOnResponse: true,
  },
  截拳: {
    response: {
      targetActionKind: 'status',
      priority: 6,
    },
    interruptOnResponse: true,
    energyFromTargetSkillCostOnResponse: true,
  },
  回旋踢: basicDamage,
  硬化: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.1,
      remainingHits: 1,
    },
  },
  沙涌: {
    weather: {
      kind: 'sandstorm',
      remainingTurns: 8,
    },
  },
  遁地: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.5,
      remainingHits: 1,
    },
    switchOut: true,
  },
  尾后针: basicDamage,
  轴承支撑: {
    energyCostModifiers: [
      {
        amount: -1,
        skillName: '轴承支撑',
        remainingTurns: null,
      },
    ],
  },
  影袭: basicDamage,
  听桥: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.4,
      remainingHits: 1,
    },
    responseCounterDamage: 'targetSkillPower',
  },
  破绽: {
    targetStatModifiers: [
      {
        stat: 'physicalDefense',
        percent: -0.7,
      },
      {
        stat: 'magicDefense',
        percent: -0.7,
      },
    ],
    response: {
      targetActionKind: 'defense',
      priority: 6,
    },
    responseStatModifiers: [
      {
        stat: 'physicalAttack',
        percent: 0.7,
      },
    ],
  },
  水环: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.4,
      remainingHits: 1,
    },
    responseEnergyCostModifiers: [
      {
        amount: -2,
        remainingTurns: null,
      },
    ],
  },
  飞羽: {
    ...quickStatus,
    clear: {
      targetPositiveEffectCount: 1,
    },
  },
  羽化加速: {
    ...quickStatus,
    powerModifiers: [
      {
        amount: 20,
        remainingTurns: null,
      },
    ],
  },
  疾风刺: {
    hitCount: 1,
    firstActionHitCount: 3,
  },
  有效预防: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.5,
      remainingHits: 1,
    },
    responsePriorityModifiers: [
      {
        amount: 1,
        remainingTurns: 2,
      },
    ],
  },
  光之矛: {
    hitCount: 3,
  },
  抽枝: {
    response: {
      targetActionKind: 'status',
      priority: 6,
    },
    responseHeal: {
      percentOfMaxHp: 0.5,
    },
    responseEnergy: {
      amount: 5,
    },
  },
  惊吓盒子: {
    response: {
      targetActionKind: 'status',
      priority: 6,
    },
    responseTargetEnergy: {
      amount: -6,
    },
  },
  藤绞: {
    energy: {
      amount: 5,
    },
  },
  报复: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.3,
      remainingHits: 1,
    },
    responseTargetEnergy: {
      amount: -3,
    },
  },
  水光冲击: basicDamage,
  落雷: basicDamage,
  加大功率: {
    switchOut: true,
    switchOutTargetEnergy: 8,
  },
  打湿: {
    statusToSelf: {
      kind: 'wet',
      stacks: 1,
      remainingTurns: null,
    },
  },
  火焰护盾: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.3,
      remainingHits: 1,
    },
    responseStatusToTarget: {
      kind: 'burn',
      stacks: 6,
      remainingTurns: null,
      damagePercentPerTurn: 0.03,
    },
  },
  焚烧烙印: {
    clear: {
      allMarks: true,
      statusToTargetPerClearedMarkStack: {
        kind: 'burn',
        stacks: 5,
        remainingTurns: null,
        damagePercentPerTurn: 0.03,
      },
    },
  },
  高温回火: {
    switchOut: true,
  },
  勾魂: {
    stealEnergy: 3,
  },
  灵媒: basicDamage,
  操控: {
    targetEnergyCostModifiers: [
      {
        amount: 7,
        remainingTurns: 3,
      },
    ],
  },
  背袭: {
    targetEnergyZeroPowerMultiplier: 20,
  },
  音波弹: {
    hitCount: 1,
  },
  热身运动: {
    hitModifiers: [
      {
        amount: 3,
        remainingTurns: null,
      },
    ],
  },
  休息回复: {
    heal: {
      percentOfMaxHp: 0.3,
    },
  },
  嗜痛: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.2,
      remainingHits: 1,
    },
    responseStatModifiers: [
      {
        stat: 'physicalAttack',
        percent: 0.4,
      },
      {
        stat: 'magicAttack',
        percent: 0.4,
      },
    ],
  },
  嘲弄: {
    statModifiers: [
      {
        stat: 'magicAttack',
        percent: 0.9,
      },
    ],
  },
  大爆炸: basicDamage,
  恐吓: basicDamage,
  光合作用: {
    statusToSelf: {
      kind: 'photosynthesis',
      stacks: 1,
      remainingTurns: null,
    },
  },
  顶端优势: basicDamage,
  防御: {
    response: {
      targetActionKind: 'attack',
      priority: 6,
    },
    damageReduction: {
      incomingDamageMultiplier: 0.3,
      remainingHits: 1,
    },
    damageReductionRequiresResponse: true,
  },
  跺地: basicDamage,
  食腐: {
    clear: {
      targetMarks: true,
      healPercentOfMaxHpPerClearedStack: 0.1,
    },
  },
  晒太阳: {
    clear: {
      targetPositiveEffects: true,
    },
  },
  破罐破摔: basicDamage,
  毒孢子: {
    statusToTarget: {
      kind: 'poison',
      stacks: 5,
      maxStacks: 8,
      damagePercentPerTurn: 0.05,
      remainingTurns: null,
    },
  },
  折射: basicDamage,
  气泡: basicDamage,
  追打: {
    hitCount: 1,
    response: {
      targetActionKind: 'status',
      priority: 6,
      hitCount: 3,
    },
  },
  回旋风暴: basicDamage,
  撕咬: {
    hitCount: 3,
    lowHpHitCountBonus: {
      threshold: 0.5,
      amount: 2,
    },
  },
  缠丝劲: {
    hitCount: 2,
  },
  乱打: {
    hitCount: 5,
  },
  午夜噪音: {
    hitCount: 5,
  },
  暗突袭: {
    drainRatio: 0.5,
    response: {
      targetActionKind: 'status',
      priority: 6,
      powerMultiplier: 2,
    },
  },
  魔法增效: {
    statModifiers: [
      {
        stat: 'magicAttack',
        percent: 0.7,
      },
    ],
  },
  根吸收: {
    heal: {
      percentOfMaxHp: 0.15,
    },
    energy: {
      amount: 4,
    },
  },
  寸拳: {
    energy: {
      amount: 1,
    },
  },
  毒针: {
    statusToTarget: {
      kind: 'poison',
      stacks: 1,
      maxStacks: 8,
      damagePercentPerTurn: 0.05,
      remainingTurns: null,
    },
  },
}

export function getSkillEffect(skillName: string) {
  return skillEffectRegistry[skillName] ?? null
}

export function shouldReportUnimplementedEffect(skill: SkillInfo) {
  if (getSkillEffect(skill.name)) return false

  const text = `${skill.effect ?? ''}${skill.description ?? ''}`.trim()
  if (!text) return false

  return !isBasicDamageOnlyText(text)
}

export function isBasicDamageOnlyText(text: string) {
  return [
    '对敌方精灵造成物理伤害。',
    '对敌方精灵造成魔法伤害。',
    '造成物伤。',
    '造成魔伤。',
  ].includes(text.trim())
}
