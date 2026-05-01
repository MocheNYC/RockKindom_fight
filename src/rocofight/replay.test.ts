import { describe, expect, it } from 'vitest'
import { defaultDexData } from '../data/defaultData'
import { runReplay, validateReplay, type ReplayScenario } from './replay'

describe('RocoFight replay validation', () => {
  it('runs a replay and validates expected response logs', () => {
    const replay: ReplayScenario = {
      name: 'defense response fixture',
      player: {
        pet: '迪莫',
      },
      opponent: {
        pet: '火神',
      },
      rules: {
        enforceLearnsets: false,
      },
      turns: [
        {
          player: {
            side: 'player',
            skillName: '防御',
          },
          opponent: {
            side: 'opponent',
            skillName: '猛烈撞击',
          },
        },
      ],
      expect: {
        phase: 'ready',
        turn: 1,
        minHp: {
          player: 1,
        },
        logIncludes: [
          {
            type: 'response_triggered',
            side: 'player',
            skillName: '防御',
          },
          {
            type: 'turn_ended',
          },
        ],
      },
    }

    const result = validateReplay(defaultDexData, replay)

    expect(result.passed).toBe(true)
    expect(result.failures).toEqual([])
  })

  it('returns expectation failures instead of throwing for mismatches', () => {
    const replay: ReplayScenario = {
      name: 'intentional mismatch',
      player: {
        pet: '迪莫',
      },
      opponent: {
        pet: '火神',
      },
      turns: [],
      expect: {
        winner: 'player',
      },
    }

    const result = validateReplay(defaultDexData, replay)

    expect(result.passed).toBe(false)
    expect(result.failures[0]).toContain('winner expected player')
  })

  it('can run without expectations for state inspection', () => {
    const state = runReplay(defaultDexData, {
      name: 'inspect only',
      player: {
        pet: '迪莫',
        hp: 200,
      },
      opponent: {
        pet: '火神',
      },
      rules: {
        enforceLearnsets: false,
      },
      turns: [
        {
          player: {
            side: 'player',
            skillName: '光球',
          },
          opponent: {
            side: 'opponent',
            type: 'wait',
          },
        },
      ],
    })

    expect(state.turn).toBe(1)
    expect(state.combatants.player.currentHp).toBe(200)
    expect(state.combatants.opponent.currentHp).toBeLessThan(
      state.combatants.opponent.maxHp,
    )
  })
})
