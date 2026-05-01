export type PassiveSupportLevel = 'implemented' | 'active-battle-limited'

export type PassiveMechanic =
  | 'battle_start'
  | 'bench_energy'
  | 'damage_modifier'
  | 'delayed_revive'
  | 'end_turn'
  | 'energy_modifier'
  | 'field_suppression'
  | 'hit_modifier'
  | 'lethal_guard'
  | 'mark_status'
  | 'priority_modifier'
  | 'position_transmission'
  | 'skill_restriction'
  | 'stat_modifier'
  | 'switch_in'
  | 'switch_inheritance'
  | 'team_composition'
  | 'team_history'

export type PassiveEffectDefinition = {
  support: PassiveSupportLevel
  mechanics: PassiveMechanic[]
  notes?: string
}

export const passiveEffectRegistry: Record<string, PassiveEffectDefinition> = {
  捉迷藏: {
    support: 'implemented',
    mechanics: ['mark_status', 'energy_modifier'],
    notes: 'When this pet applies freeze, target skill energy costs increase.',
  },
  飓风: {
    support: 'implemented',
    mechanics: ['priority_modifier', 'energy_modifier'],
    notes:
      'Team battle grants swift only when another wing teammate carries the same skill; defeated-by-enemy extra energy loss is modeled.',
  },
  翼轴: {
    support: 'implemented',
    mechanics: ['priority_modifier', 'position_transmission'],
    notes: 'Slot 1 gains swift on switch-in and transmission 1.',
  },
  顺风: {
    support: 'implemented',
    mechanics: ['damage_modifier'],
  },
  正位宝剑: {
    support: 'implemented',
    mechanics: ['skill_restriction'],
  },
  不朽: {
    support: 'implemented',
    mechanics: ['delayed_revive'],
    notes: 'Team battle revives after 3 turns at 1 HP; official revive HP still needs fixture proof.',
  },
  壮胆: {
    support: 'implemented',
    mechanics: ['team_composition', 'stat_modifier'],
    notes: 'Team composition check grants dual attack +50% when the side has a bug pet.',
  },
  变形活画: {
    support: 'implemented',
    mechanics: ['damage_modifier'],
  },
  地脉: {
    support: 'implemented',
    mechanics: ['battle_start', 'bench_energy'],
    notes: 'Initial energy is 0; bench pets gain 3 energy when an ally uses a ground skill.',
  },
  特殊清洁场景: {
    support: 'implemented',
    mechanics: ['end_turn', 'mark_status'],
  },
  向心力: {
    support: 'implemented',
    mechanics: ['damage_modifier', 'position_transmission'],
    notes: 'Slots 1 and 2 gain power and transmission 1.',
  },
  渗透: {
    support: 'implemented',
    mechanics: ['team_history', 'switch_in', 'stat_modifier'],
    notes: 'Team battle tracks allied fighting/ground skill history and applies attack/defense on entry.',
  },
  洁癖: {
    support: 'implemented',
    mechanics: ['switch_inheritance'],
    notes:
      'Switch-out inheritance copies transferable buffs and debuffs to the replacement.',
  },
  乘风连击: {
    support: 'implemented',
    mechanics: ['hit_modifier'],
  },
  毒蘑菇: {
    support: 'implemented',
    mechanics: ['end_turn', 'energy_modifier'],
  },
  对流: {
    support: 'implemented',
    mechanics: ['energy_modifier'],
  },
  灵魂灼伤: {
    support: 'implemented',
    mechanics: ['mark_status'],
  },
  做噩梦: {
    support: 'implemented',
    mechanics: ['switch_in', 'energy_modifier'],
    notes: 'Enemy replacements lose 3 energy after the nightmare pet forces or observes a switch.',
  },
  囤积: {
    support: 'implemented',
    mechanics: ['stat_modifier'],
  },
  陨落: {
    support: 'implemented',
    mechanics: ['field_suppression'],
  },
  不移: {
    support: 'implemented',
    mechanics: ['damage_modifier'],
  },
  化茧: {
    support: 'implemented',
    mechanics: ['lethal_guard', 'mark_status'],
  },
  目空: {
    support: 'implemented',
    mechanics: ['damage_modifier'],
  },
  嫁祸: {
    support: 'implemented',
    mechanics: ['hit_modifier'],
  },
  预警: {
    support: 'implemented',
    mechanics: ['priority_modifier', 'stat_modifier'],
  },
}

export function getPassiveEffect(traitName: string | null | undefined) {
  return traitName ? passiveEffectRegistry[traitName] ?? null : null
}
