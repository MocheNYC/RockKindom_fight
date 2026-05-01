import { describe, expect, it } from 'vitest'
import { expertSkillLoops } from './expertScript'
import { createPvpPetSnapshot, pvpPetEntries } from './pvp'
import { defaultDexData } from '../data/defaultData'

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
})
