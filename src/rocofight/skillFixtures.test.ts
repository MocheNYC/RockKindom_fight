import { describe, expect, it } from 'vitest'
import { defaultDexData } from '../data/defaultData'
import type { Pet, PetStats } from '../types'
import { createBattleContext } from './engine'
import { getSkillEffect } from './effects'
import {
  createPvpCombatantInput,
  pvpPetEntries,
  pvpSkillNames,
  type PvpPetEntry,
} from './pvp'
import {
  advanceTeamBattleTurn,
  createTeamBattleState,
  isTeamBattleActionLegal,
  type TeamBattleAction,
} from './team'

const context = createBattleContext(defaultDexData)
const genericAttackSkill = '猛烈撞击'
const genericStatusSkill = '力量增效'
const genericDefenseSkill = '防御'

function makePet(
  name: string,
  skills: string[],
  stats: Partial<PetStats> = {},
): Pet {
  return {
    key: `fixture:${name}`,
    title: name,
    href: '',
    id: `fixture:${name}`,
    nameZh: name,
    nameEn: name,
    image: '',
    attributes: ['normal'],
    formName: 'fixture',
    initialName: null,
    petType: null,
    hasShiny: false,
    introductionZh: '',
    introductionEn: '',
    traitName: null,
    traitDescription: null,
    height: null,
    weight: null,
    distributionZh: null,
    distributionEn: null,
    evolution: {
      previous: null,
      next: null,
      level: null,
      condition: null,
    },
    stage: '独立形态',
    stats: {
      health: 220,
      physicalAttack: 100,
      magicAttack: 100,
      physicalDefense: 120,
      magicDefense: 120,
      speed: 100,
      baseStats: 760,
      ...stats,
    },
    dexTasks: [],
    taskSkillStones: [],
    skills: skills.map((skillName) => ({ name: skillName, level: 1 })),
    bloodlineSkills: [],
    learnableSkillStones: [],
    updateVersion: null,
    pageUrl: null,
    sourceKey: 'bwiki-rocom',
  }
}

function pvpTeamWithCarrier(entry: PvpPetEntry) {
  const teamEntries = [
    entry,
    ...pvpPetEntries.filter((candidate) => candidate.id !== entry.id),
  ].slice(0, 6)

  return teamEntries.map((teamEntry) =>
    createPvpCombatantInput(teamEntry, defaultDexData.pets),
  )
}

function findCarrier(skillName: string) {
  const entry = pvpPetEntries.find((candidate) =>
    candidate.skills.includes(skillName),
  )
  if (!entry) throw new Error(`No PVP carrier found for ${skillName}`)
  return entry
}

function createFixtureTeam(active: Pet) {
  return [
    active,
    makePet(`${active.nameZh}-bench-1`, [genericAttackSkill]),
    makePet(`${active.nameZh}-bench-2`, [genericAttackSkill]),
    makePet(`${active.nameZh}-bench-3`, [genericAttackSkill]),
    makePet(`${active.nameZh}-bench-4`, [genericAttackSkill]),
    makePet(`${active.nameZh}-bench-5`, [genericAttackSkill]),
  ]
}

function matchingOpponentAction(skillName: string): TeamBattleAction {
  const targetKind = getSkillEffect(skillName)?.response?.targetActionKind
  if (targetKind === 'status') {
    return { side: 'opponent', type: 'skill', skillName: genericStatusSkill }
  }
  if (targetKind === 'defense') {
    return { side: 'opponent', type: 'skill', skillName: genericDefenseSkill }
  }
  return { side: 'opponent', type: 'skill', skillName: genericAttackSkill }
}

describe('PVP skill fixture coverage', () => {
  it.each(pvpSkillNames)(
    'executes carried PVP skill without unimplemented effects: %s',
    (skillName) => {
      const carrier = findCarrier(skillName)
      const state = createTeamBattleState({
        player: pvpTeamWithCarrier(carrier),
        opponent: pvpTeamWithCarrier(pvpPetEntries[0]),
        rules: {
          maxEnergy: 20,
          startingEnergy: 20,
          energyRecoveryPerTurn: 0,
        },
      })
      for (const side of ['player', 'opponent'] as const) {
        for (const combatant of state.teams[side].combatants) {
          combatant.energy = combatant.maxEnergy
        }
      }
      const skillSlot = carrier.skills.indexOf(skillName)
      const action = { side: 'player', type: 'skill', skillSlot } as const
      const legality = isTeamBattleActionLegal(state, context, action)

      if (!legality.legal) {
        expect(legality).toEqual({
          legal: false,
          reason: 'illegal_skill',
          skillLegality: {
            legal: false,
            reason: 'passive_restricted_skill',
          },
        })
        return
      }

      const next = advanceTeamBattleTurn(state, context, [
        action,
        { side: 'opponent', type: 'wait' },
      ])

      expect(next.log).toContainEqual(
        expect.objectContaining({
          type: 'skill_used',
          side: 'player',
          skillName,
        }),
      )
      expect(next.log).not.toContainEqual(
        expect.objectContaining({
          type: 'action_failed',
          side: 'player',
        }),
      )
      expect(next.log).not.toContainEqual(
        expect.objectContaining({
          type: 'effect_unimplemented',
          side: 'player',
          skillName,
        }),
      )
    },
  )

  it.each(
    pvpSkillNames.filter((skillName) => getSkillEffect(skillName)?.response),
  )('triggers response timing for PVP response skill: %s', (skillName) => {
    const player = makePet(`response:${skillName}`, [skillName], {
      health: 260,
      physicalDefense: 160,
      magicDefense: 160,
      speed: 1,
    })
    const opponent = makePet(
      `response-target:${skillName}`,
      [genericAttackSkill, genericStatusSkill, genericDefenseSkill],
      {
        health: 260,
        physicalAttack: 110,
        magicAttack: 110,
        speed: 200,
      },
    )
    const state = createTeamBattleState({
      player: createFixtureTeam(player),
      opponent: createFixtureTeam(opponent),
      rules: {
        maxEnergy: 20,
        startingEnergy: 20,
        energyRecoveryPerTurn: 0,
      },
    })

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName },
      matchingOpponentAction(skillName),
    ])

    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'response_triggered',
        side: 'player',
        skillName,
      }),
    )
    expect(next.log).not.toContainEqual(
      expect.objectContaining({
        type: 'effect_unimplemented',
        side: 'player',
        skillName,
      }),
    )
  })
})
