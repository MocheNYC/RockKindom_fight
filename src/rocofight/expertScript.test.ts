import { describe, expect, it } from 'vitest'
import {
  chooseExpertScriptAction,
  createExpertScriptMemory,
  expertSkillLoops,
} from './expertScript'
import {
  createPvpCombatantInput,
  createPvpPetSnapshot,
  pvpPetEntries,
} from './pvp'
import { defaultDexData } from '../data/defaultData'
import { createBattleContext } from './engine'
import { createTeamBattleState, getActiveCombatant } from './team'

describe('expert-script policy configuration', () => {
  it('covers every PVP pet with carried skills only', () => {
    const missing: string[] = []
    const invalid: string[] = []

    for (const entry of pvpPetEntries) {
      const pet = createPvpPetSnapshot(entry, defaultDexData.pets)
      const loop = expertSkillLoops[pet.nameZh]
      if (!loop) {
        missing.push(pet.nameZh)
        continue
      }

      const carried = new Set(pet.skills.map((skill) => skill.name))
      for (const skillName of loop) {
        if (!carried.has(skillName)) invalid.push(`${pet.nameZh}:${skillName}`)
      }
    }

    expect(missing).toEqual([])
    expect(invalid).toEqual([])
  })

  it('uses authored pet-specific expert rules where available', () => {
    const context = createBattleContext(defaultDexData)
    const snowState = createExpertDuel('snow-shadow-doll', 'memory-stone')
    const snowMemory = createExpertScriptMemory()
    snowMemory.usedSkillNamesBySideSlot.player[0].add('赤子之心')

    const snowAction = chooseExpertScriptAction(
      snowState,
      context,
      'player',
      snowMemory,
    )

    expect(actionSkillName(snowState, snowAction)).toBe('击鼓传花')

    const wingState = createExpertDuel('holy-wing-king', 'memory-stone')
    getActiveCombatant(wingState, 'opponent').energy = 1

    const wingAction = chooseExpertScriptAction(
      wingState,
      context,
      'player',
      createExpertScriptMemory(),
    )

    expect(actionSkillName(wingState, wingAction)).toBe('水刃')

    const wingFollowupState = createExpertDuel('holy-wing-king', 'memory-stone')
    getActiveCombatant(wingFollowupState, 'opponent').energy = 5
    const wingFollowupMemory = createExpertScriptMemory()
    wingFollowupMemory.usedSkillNamesBySideSlot.player[0].add('水刃')

    const prematureFollowup = chooseExpertScriptAction(
      wingFollowupState,
      context,
      'player',
      wingFollowupMemory,
    )

    expect(actionSkillName(wingFollowupState, prematureFollowup)).not.toBe(
      '疾风连袭',
    )

    wingFollowupMemory.usedSkillNamesBySideSlot.player[0].add('力量增效')

    const legalFollowup = chooseExpertScriptAction(
      wingFollowupState,
      context,
      'player',
      wingFollowupMemory,
    )

    expect(actionSkillName(wingFollowupState, legalFollowup)).toBe('疾风连袭')

    const boneState = createExpertDuel('annihilation-bone-dragon', 'emerald-lady')
    getActiveCombatant(boneState, 'opponent').effects.statModifiers.push({
      id: 'test-boost',
      sourceSkillName: '力量增效',
      stat: 'physicalAttack',
      percent: 100,
      flat: 0,
      remainingTurns: null,
    })

    const boneAction = chooseExpertScriptAction(
      boneState,
      context,
      'player',
      createExpertScriptMemory(),
    )

    expect(actionSkillName(boneState, boneAction)).toBe('吓退')
  })
})

function createExpertDuel(playerPetId: string, opponentPetId: string) {
  return createTeamBattleState({
    player: fillTeam(createPvpCombatantInput(playerPetId, defaultDexData.pets)),
    opponent: fillTeam(createPvpCombatantInput(opponentPetId, defaultDexData.pets)),
    replacementMode: 'pending',
  })
}

function fillTeam(first: ReturnType<typeof createPvpCombatantInput>) {
  return Array.from({ length: 6 }, () => first)
}

function actionSkillName(
  state: ReturnType<typeof createExpertDuel>,
  action: ReturnType<typeof chooseExpertScriptAction>,
) {
  if (action.type !== 'skill') return action.type
  return getActiveCombatant(state, action.side).skillSlots[action.skillSlot ?? -1]
}
