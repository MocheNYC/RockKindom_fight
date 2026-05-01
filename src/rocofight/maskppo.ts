import type { SkillActionLegality } from './types'

export const maskPpoActionCount = 10
export const maskPpoSkillActionCount = 4
export const maskPpoFocusAction = 4
export const maskPpoSwitchActionStart = 5

export type MaskPpoAction =
  | {
      kind: 'skill'
      actionIndex: number
      skillSlot: number
    }
  | {
      kind: 'focus'
      actionIndex: typeof maskPpoFocusAction
    }
  | {
      kind: 'switch'
      actionIndex: number
      teamSlot: number
    }
  | {
      kind: 'invalid'
      actionIndex: number
      reason: 'out_of_range' | 'no_switch_target'
    }

export type MaskPpoTeamSlotState = {
  hp: number
  maxHp: number
  energy: number
  maxEnergy: number
  alive: boolean
}

export type MaskPpoActionMaskInput = {
  activeSlot: number
  team: readonly MaskPpoTeamSlotState[]
  skillLegalities: readonly SkillActionLegality[]
  canFocus?: boolean
}

export function decodeMaskPpoAction(
  actionIndex: number,
  activeSlot: number,
  team: readonly Pick<MaskPpoTeamSlotState, 'alive'>[],
): MaskPpoAction {
  if (actionIndex < 0 || actionIndex >= maskPpoActionCount) {
    return {
      kind: 'invalid',
      actionIndex,
      reason: 'out_of_range',
    }
  }

  if (actionIndex < maskPpoSkillActionCount) {
    return {
      kind: 'skill',
      actionIndex,
      skillSlot: actionIndex,
    }
  }

  if (actionIndex === maskPpoFocusAction) {
    return {
      kind: 'focus',
      actionIndex,
    }
  }

  const switchTargets = getMaskPpoSwitchTargets(activeSlot, team)
  const target = switchTargets[actionIndex - maskPpoSwitchActionStart]
  if (target === undefined) {
    return {
      kind: 'invalid',
      actionIndex,
      reason: 'no_switch_target',
    }
  }

  return {
    kind: 'switch',
    actionIndex,
    teamSlot: target,
  }
}

export function getMaskPpoActionMask(input: MaskPpoActionMaskInput) {
  const mask = Array.from({ length: maskPpoActionCount }, () => false)
  const active = input.team[input.activeSlot]
  const activeAlive = Boolean(active?.alive)

  if (activeAlive) {
    for (let index = 0; index < maskPpoSkillActionCount; index += 1) {
      mask[index] = input.skillLegalities[index]?.legal ?? false
    }
    mask[maskPpoFocusAction] = input.canFocus ?? active.energy < active.maxEnergy
  }

  const switchTargets = getMaskPpoSwitchTargets(input.activeSlot, input.team)
  for (
    let index = 0;
    index < Math.min(5, switchTargets.length);
    index += 1
  ) {
    mask[maskPpoSwitchActionStart + index] = true
  }

  return mask
}

export function getMaskPpoSwitchTargets(
  activeSlot: number,
  team: readonly Pick<MaskPpoTeamSlotState, 'alive'>[],
) {
  return team
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot, index }) => index !== activeSlot && slot.alive)
    .map(({ index }) => index)
    .slice(0, 5)
}

export function encodeMaskPpoObservation(input: MaskPpoActionMaskInput) {
  const values: number[] = []

  for (const slot of input.team.slice(0, 6)) {
    values.push(slot.alive ? 1 : 0)
    values.push(slot.maxHp > 0 ? slot.hp / slot.maxHp : 0)
    values.push(slot.maxEnergy > 0 ? slot.energy / slot.maxEnergy : 0)
  }

  while (values.length < 18) values.push(0)
  values.push(input.activeSlot / 5)
  values.push(...getMaskPpoActionMask(input).map((item) => (item ? 1 : 0)))

  return values
}
