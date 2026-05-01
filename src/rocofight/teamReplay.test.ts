import { describe, expect, it } from 'vitest'
import { defaultDexData } from '../data/defaultData'
import {
  formatTeamReplayTrace,
  runTeamReplay,
  validateTeamReplay,
  type TeamReplayScenario,
} from './teamReplay'

const oneHpOpponentSlots = Array.from({ length: 6 }, (_, slot) => ({
  slot,
  hp: 1,
}))

describe('RocoFight 6v6 replay validation', () => {
  it('replays a complete 6v6 action-index battle with masks and winner validation', () => {
    const replay: TeamReplayScenario = {
      name: 'snow shadow doll sweeps one-hp team',
      playerTeam: {
        pvpTeamId: 'snow-shadow-sword',
      },
      opponentTeam: {
        pvpTeamId: 'team-4',
        slots: oneHpOpponentSlots,
      },
      turns: [
        { player: { actionIndex: 3 }, opponent: { type: 'wait' } },
        { player: { actionIndex: 3 }, opponent: { type: 'wait' } },
        { player: { actionIndex: 3 }, opponent: { type: 'wait' } },
        { player: { actionIndex: 4 }, opponent: { type: 'wait' } },
        { player: { actionIndex: 3 }, opponent: { type: 'wait' } },
        { player: { actionIndex: 4 }, opponent: { type: 'wait' } },
        { player: { actionIndex: 3 }, opponent: { type: 'wait' } },
        { player: { actionIndex: 3 }, opponent: { type: 'wait' } },
      ],
      expect: {
        phase: 'ended',
        winner: 'player',
        turn: 8,
        invalidActionCount: 0,
        aliveCount: {
          opponent: 0,
        },
        faintedCount: {
          opponent: 6,
        },
        logIncludes: [
          {
            type: 'forced_switch',
            side: 'opponent',
            fromSlot: 0,
            toSlot: 1,
          },
          {
            type: 'focus_used',
            side: 'player',
          },
          {
            type: 'battle_ended',
            winner: 'player',
          },
        ],
      },
    }

    const result = validateTeamReplay(defaultDexData, replay)

    expect(result.passed).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.result.trace).toHaveLength(8)
    expect(
      result.result.trace.every(
        (turn) =>
          turn.player.selectedActionValid &&
          turn.opponent.selectedActionValid,
      ),
    ).toBe(true)
    expect(result.result.trace[0].player.mask).toHaveLength(10)
  })

  it('records invalid masked actions instead of executing impossible skills', () => {
    const replay: TeamReplayScenario = {
      name: 'masked low energy skill',
      playerTeam: {
        pvpTeamId: 'snow-shadow-sword',
        slots: [
          {
            slot: 0,
            energy: 0,
          },
        ],
      },
      opponentTeam: {
        pvpTeamId: 'team-4',
      },
      turns: [{ player: { actionIndex: 3 }, opponent: { type: 'wait' } }],
      expect: {
        phase: 'ready',
        turn: 1,
        invalidActionCount: 1,
      },
    }

    const result = validateTeamReplay(defaultDexData, replay)

    expect(result.passed).toBe(true)
    expect(result.result.trace[0].player.selectedActionValid).toBe(false)
    expect(result.result.trace[0].player.invalidReason).toBe('masked_action')
    expect(result.result.trace[0].player.action).toEqual({
      side: 'player',
      type: 'wait',
    })
  })

  it('replays pending replacement choices after KO', () => {
    const replay: TeamReplayScenario = {
      name: 'pending replacement after knockout',
      replacementMode: 'pending',
      playerTeam: {
        pvpTeamId: 'snow-shadow-sword',
        activeSlot: 1,
      },
      opponentTeam: {
        pvpTeamId: 'team-4',
        slots: [{ slot: 0, hp: 1 }],
      },
      turns: [
        {
          player: { type: 'skill', skillSlot: 0 },
          opponent: { type: 'wait' },
        },
        { player: { type: 'wait' }, opponent: { actionIndex: 5 } },
      ],
      expect: {
        phase: 'ready',
        turn: 2,
        invalidActionCount: 0,
        activeSlot: {
          opponent: 1,
        },
        pendingSwitch: {
          opponent: false,
        },
        logIncludes: [
          {
            type: 'switch_pending',
            side: 'opponent',
            reason: 'active_fainted',
          },
          {
            type: 'forced_switch',
            side: 'opponent',
            fromSlot: 0,
            toSlot: 1,
            reason: 'pending_switch',
          },
        ],
      },
    }

    const result = validateTeamReplay(defaultDexData, replay)

    expect(result.passed).toBe(true)
    expect(result.failures).toEqual([])
    expect(result.result.trace[1].opponent.mask).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ])
    expect(
      result.result.trace[1].events.some(
        (event) => event.type === 'skill_used' && event.side === 'player',
      ),
    ).toBe(false)
  })

  it('formats a replay trace for readable battle records', () => {
    const result = runTeamReplay(defaultDexData, {
      name: 'single-turn formatted trace',
      playerTeam: {
        pvpTeamId: 'snow-shadow-sword',
      },
      opponentTeam: {
        pvpTeamId: 'team-4',
        slots: [{ slot: 0, hp: 1 }],
      },
      turns: [{ player: { actionIndex: 3 }, opponent: { type: 'wait' } }],
    })

    const text = formatTeamReplayTrace(result)

    expect(text).toContain('Replay: single-turn formatted trace')
    expect(text).toContain('Turn 1: player=#3')
    expect(text).toContain('fainted')
    expect(text).toContain('forced_switch')
  })
})
