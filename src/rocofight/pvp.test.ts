import { describe, expect, it } from 'vitest'
import { defaultDexData } from '../data/defaultData'
import { createBattleState } from './engine'
import { getSkillEffect } from './effects'
import { getPassiveEffect } from './passives'
import {
  createPvpCombatantInput,
  createPvpDexData,
  createPvpPetSnapshot,
  createPvpTeamCombatantInputs,
  findPvpPetEntry,
  pvpPetEntries,
  pvpSkillNames,
  validatePvpDatabase,
} from './pvp'

describe('RocoFight PVP pet database', () => {
  it('contains the 26 unique PVP builds and validates against RocoDex data', () => {
    expect(pvpPetEntries).toHaveLength(26)
    expect(new Set(pvpPetEntries.map((entry) => entry.petName)).size).toBe(
      pvpPetEntries.length,
    )
    expect(validatePvpDatabase(defaultDexData)).toEqual({
      duplicateIds: [],
      missingPetKeys: [],
      missingSkills: [],
    })
  })

  it('uses corrected skill names from the observed screenshots', () => {
    expect(pvpSkillNames).toEqual(
      expect.arrayContaining(['吞噬', '截拳', '啮合传递', '隼鳞', '破绽']),
    )
    expect(pvpSkillNames).not.toEqual(
      expect.arrayContaining(['奇蹴', '群拳', '融合传递', '串鳞', '破空']),
    )

    expect(findPvpPetEntry('giant-devourer-echidna')?.skills).toEqual([
      '力量增效',
      '冰爪',
      '吞噬',
      '地刺',
    ])
    expect(findPvpPetEntry('chess-queen')?.skills).toEqual([
      '鸣沙陷阱',
      '影袭',
      '听桥',
      '破绽',
    ])
  })

  it('has executable skill entries for every PVP carried skill', () => {
    const missingEffects = pvpSkillNames.filter(
      (skillName) => !getSkillEffect(skillName),
    )

    expect(missingEffects).toEqual([])
    expect(pvpSkillNames).toHaveLength(80)
  })

  it('has passive entries for every PVP pet trait', () => {
    const missingPassives = pvpPetEntries
      .map((entry) => createPvpPetSnapshot(entry, defaultDexData.pets))
      .filter((pet) => pet.traitName && !getPassiveEffect(pet.traitName))
      .map((pet) => `${pet.nameZh}:${pet.traitName}`)

    expect(missingPassives).toEqual([])
  })

  it('keeps one build for repeated pets while recording supplied bloodlines', () => {
    expect(findPvpPetEntry('帕帕斯卡')?.bloodlineName).toBe('翼系血脉')
    expect(findPvpPetEntry('帕帕斯卡')?.skills).toEqual([
      '钢铁洪流',
      '倾泻',
      '超级糖果',
      '齿轮扭矩',
    ])
    expect(findPvpPetEntry('雪影娃娃')?.bloodlineName).toBe('首领血脉')
    expect(findPvpPetEntry('寂灭骨龙')?.bloodlineName).toBe('火系血脉')
  })

  it('includes manually supplied PVP builds', () => {
    expect(findPvpPetEntry('翠顶夫人')?.skills).toEqual([
      '水刃',
      '力量增效',
      '水环',
      '飞羽',
    ])
    expect(findPvpPetEntry('皇家狮鹫')?.petKey).toBe(
      'bwiki:皇家狮鹫（崖间地的样子）',
    )
    expect(findPvpPetEntry('尖嘴狐仙')?.skills).toEqual([
      '火焰护盾',
      '暴风雪',
      '焚烧烙印',
      '高温回火',
    ])
    expect(findPvpPetEntry('龙息帕尔')?.skills).toEqual([
      '力量增效',
      '先发制人',
      '蝙蝠',
      '火云车',
    ])
    expect(findPvpPetEntry('龙息帕尔')?.traitName).toBeNull()
  })

  it('creates the fixed wing-core training team', () => {
    const team = createPvpTeamCombatantInputs('wing-core', defaultDexData.pets)

    const pets = team.map((entry) => ('pet' in entry ? entry.pet : entry))

    expect(pets.map((pet) => pet.nameZh)).toEqual([
      '圣羽翼王',
      '翠顶夫人',
      '寂灭骨龙',
      '帕帕斯卡',
      '龙息帕尔',
      '黑猫巫师',
    ])
    expect(pets[4].skills.map((skill) => skill.name)).toEqual([
      '力量增效',
      '先发制人',
      '蝙蝠',
      '火云车',
    ])
  })

  it('creates battle-ready pet snapshots with only actual carried skills', () => {
    const state = createBattleState({
      player: createPvpCombatantInput('snow-shadow-doll', defaultDexData.pets),
      opponent: createPvpCombatantInput('holy-wing-king', defaultDexData.pets),
    })

    expect(state.combatants.player.petKey).toBe('pvp:snow-shadow-doll')
    expect(state.combatants.player.level).toBe(57)
    expect(state.combatants.player.knownSkills).toEqual([
      '赤子之心',
      '击鼓传花',
      '冰墙',
      '暴风雪',
    ])
    expect(state.combatants.player.knownSkills).not.toContain('冰冻打击')
  })

  it('can append PVP snapshots to a DexDataBundle for replay lookup', () => {
    const data = createPvpDexData(defaultDexData)
    const pet = data.pets.find((entry) => entry.key === 'pvp:sonic-tita')

    expect(data.pets).toHaveLength(defaultDexData.pets.length + 26)
    expect(pet?.nameZh).toBe('声波缇塔')
    expect(pet?.skills.map((skill) => skill.name)).toEqual([
      '轴承支撑',
      '齿轮扭矩',
      '地刺',
      '啮合传递',
    ])
  })
})
