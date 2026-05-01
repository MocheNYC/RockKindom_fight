import { describe, expect, it } from 'vitest'
import {
  decodeMaskPpoAction,
  encodeMaskPpoObservation,
  getMaskPpoActionMask,
  getMaskPpoSwitchTargets,
} from './maskppo'
import type { MaskPpoTeamSlotState } from './maskppo'

const team: MaskPpoTeamSlotState[] = [
  { hp: 100, maxHp: 100, energy: 3, maxEnergy: 10, alive: true },
  { hp: 0, maxHp: 100, energy: 0, maxEnergy: 10, alive: false },
  { hp: 80, maxHp: 100, energy: 4, maxEnergy: 10, alive: true },
  { hp: 50, maxHp: 100, energy: 10, maxEnergy: 10, alive: true },
  { hp: 20, maxHp: 100, energy: 1, maxEnergy: 10, alive: true },
  { hp: 70, maxHp: 100, energy: 2, maxEnergy: 10, alive: true },
]

describe('MaskablePPO action adapter', () => {
  it('builds a fixed 10-action mask for 4 skills, focus, and 5 switches', () => {
    const mask = getMaskPpoActionMask({
      activeSlot: 0,
      team,
      skillLegalities: [
        { legal: true, energyCost: 1 },
        { legal: false, reason: 'not_enough_energy', energy: 3, energyCost: 4 },
        { legal: true, energyCost: 0 },
        { legal: false, reason: 'passive_restricted_skill' },
      ],
    })

    expect(mask).toEqual([
      true,
      false,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
      false,
    ])
  })

  it('maps switch actions to alive non-active team slots', () => {
    expect(getMaskPpoSwitchTargets(0, team)).toEqual([2, 3, 4, 5])
    expect(decodeMaskPpoAction(0, 0, team)).toEqual({
      kind: 'skill',
      actionIndex: 0,
      skillSlot: 0,
    })
    expect(decodeMaskPpoAction(4, 0, team)).toEqual({
      kind: 'focus',
      actionIndex: 4,
    })
    expect(decodeMaskPpoAction(5, 0, team)).toEqual({
      kind: 'switch',
      actionIndex: 5,
      teamSlot: 2,
    })
  })

  it('encodes compact numeric observations with the mask appended', () => {
    const observation = encodeMaskPpoObservation({
      activeSlot: 0,
      team,
      skillLegalities: [
        { legal: true, energyCost: 1 },
        { legal: true, energyCost: 2 },
        { legal: true, energyCost: 3 },
        { legal: true, energyCost: 4 },
      ],
    })

    expect(observation).toHaveLength(29)
    expect(observation.slice(-10)).toEqual([
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
    ])
  })
})
