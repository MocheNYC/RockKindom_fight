export type PassiveSupportLevel = 'implemented' | 'active-battle-limited'

export type PassiveEffectDefinition = {
  support: PassiveSupportLevel
  notes?: string
}

export const passiveEffectRegistry: Record<string, PassiveEffectDefinition> = {
  捉迷藏: {
    support: 'implemented',
  },
  飓风: {
    support: 'implemented',
    notes:
      'Team battle grants swift only when another wing teammate carries the same skill; defeated-by-enemy extra energy loss is modeled.',
  },
  翼轴: {
    support: 'implemented',
    notes: 'Slot 1 gains swift on switch-in and transmission 1.',
  },
  顺风: {
    support: 'implemented',
  },
  正位宝剑: {
    support: 'implemented',
  },
  不朽: {
    support: 'implemented',
    notes: 'Team battle revives after 3 turns at 1 HP; official revive HP still needs fixture proof.',
  },
  壮胆: {
    support: 'implemented',
    notes: 'Team composition check grants dual attack +50% when the side has a bug pet.',
  },
  变形活画: {
    support: 'implemented',
  },
  地脉: {
    support: 'implemented',
    notes: 'Initial energy is 0; bench pets gain 3 energy when an ally uses a ground skill.',
  },
  特殊清洁场景: {
    support: 'implemented',
  },
  向心力: {
    support: 'implemented',
    notes: 'Slots 1 and 2 gain power and transmission 1.',
  },
  渗透: {
    support: 'implemented',
    notes: 'Team battle tracks allied fighting/ground skill history and applies attack/defense on entry.',
  },
  洁癖: {
    support: 'implemented',
    notes:
      'Switch-out inheritance copies transferable buffs and debuffs to the replacement.',
  },
  乘风连击: {
    support: 'implemented',
  },
  毒蘑菇: {
    support: 'implemented',
  },
  对流: {
    support: 'implemented',
  },
  灵魂灼伤: {
    support: 'implemented',
  },
  做噩梦: {
    support: 'implemented',
    notes: 'Enemy replacements lose 3 energy after the nightmare pet forces or observes a switch.',
  },
  囤积: {
    support: 'implemented',
  },
  陨落: {
    support: 'implemented',
  },
  不移: {
    support: 'implemented',
  },
  化茧: {
    support: 'implemented',
  },
  目空: {
    support: 'implemented',
  },
  嫁祸: {
    support: 'implemented',
  },
  预警: {
    support: 'implemented',
  },
}

export function getPassiveEffect(traitName: string | null | undefined) {
  return traitName ? passiveEffectRegistry[traitName] ?? null : null
}
