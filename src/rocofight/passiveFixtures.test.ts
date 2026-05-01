import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultDexData } from '../data/defaultData'
import { getPassiveEffect } from './passives'
import { createPvpPetSnapshot, pvpPetEntries } from './pvp'

const implementationSourceText = ['engine.ts', 'team.ts', 'passives.ts']
  .map((fileName) =>
    readFileSync(join(process.cwd(), 'src', 'rocofight', fileName), 'utf-8'),
  )
  .join('\n')

describe('PVP passive fixture coverage', () => {
  it('maps every PVP pet trait to registry mechanics and implementation code', () => {
    const rows = pvpPetEntries.map((entry) => {
      const pet = createPvpPetSnapshot(entry, defaultDexData.pets)
      const passive = getPassiveEffect(pet.traitName)

      return {
        pet: entry.petName,
        traitName: pet.traitName,
        traitDescription: pet.traitDescription,
        support: passive?.support,
        mechanics: passive?.mechanics ?? [],
        hasCodeReference: pet.traitName
          ? implementationSourceText.includes(pet.traitName)
          : false,
      }
    })

    expect(rows).toHaveLength(25)
    expect(rows.map((row) => row.traitName)).not.toContain(null)
    expect(rows.filter((row) => !row.traitDescription)).toEqual([])
    expect(rows.filter((row) => row.support !== 'implemented')).toEqual([])
    expect(rows.filter((row) => row.mechanics.length === 0)).toEqual([])
    expect(rows.filter((row) => !row.hasCodeReference)).toEqual([])
  })

  it('keeps passive mechanics metadata aligned with the current PVP passive set', () => {
    const mechanicsByPassive = new Map(
      pvpPetEntries.map((entry) => {
        const pet = createPvpPetSnapshot(entry, defaultDexData.pets)
        return [pet.traitName, getPassiveEffect(pet.traitName)?.mechanics ?? []]
      }),
    )

    expect(mechanicsByPassive.get('正位宝剑')).toContain('skill_restriction')
    expect(mechanicsByPassive.get('不朽')).toContain('delayed_revive')
    expect(mechanicsByPassive.get('翼轴')).toEqual(
      expect.arrayContaining(['priority_modifier', 'position_transmission']),
    )
    expect(mechanicsByPassive.get('地脉')).toEqual(
      expect.arrayContaining(['battle_start', 'bench_energy']),
    )
    expect(mechanicsByPassive.get('向心力')).toEqual(
      expect.arrayContaining(['damage_modifier', 'position_transmission']),
    )
    expect(mechanicsByPassive.get('洁癖')).toContain('switch_inheritance')
    expect(mechanicsByPassive.get('做噩梦')).toEqual(
      expect.arrayContaining(['switch_in', 'energy_modifier']),
    )
    expect(mechanicsByPassive.get('预警')).toEqual(
      expect.arrayContaining(['priority_modifier', 'stat_modifier']),
    )
  })
})
