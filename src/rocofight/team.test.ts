import { describe, expect, it } from 'vitest'
import { defaultDexData } from '../data/defaultData'
import type { Pet, PetStats } from '../types'
import { createBattleContext, getEffectiveStat } from './engine'
import { createPvpTeamCombatantInputs } from './pvp'
import {
  adjudicateTeamBattleByAliveCount,
  advanceTeamBattleTurn,
  chooseFirstLegalTeamAction,
  createTeamBattleState,
  decodeTeamBattleAction,
  encodeTeamBattleObservation,
  getActiveCombatant,
  getTeamBattleActionMask,
  getSwitchTargets,
  isTeamBattleActionLegal,
  teamBattleObservationLength,
} from './team'

const context = createBattleContext(defaultDexData)

function makePet(
  name: string,
  stats: Partial<PetStats>,
  skills: string[],
  overrides: Partial<Pet> = {},
): Pet {
  const fullStats = {
    health: 100,
    physicalAttack: 80,
    magicAttack: 80,
    physicalDefense: 80,
    magicDefense: 80,
    speed: 80,
    baseStats: 500,
    ...stats,
  }

  return {
    key: `test:${name}`,
    title: name,
    href: '',
    id: `test:${name}`,
    nameZh: name,
    nameEn: name,
    image: '',
    attributes: ['normal'],
    formName: '测试形态',
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
    stats: fullStats,
    dexTasks: [],
    taskSkillStones: [],
    skills: skills.map((skillName) => ({ name: skillName, level: 1 })),
    bloodlineSkills: [],
    learnableSkillStones: [],
    updateVersion: null,
    pageUrl: null,
    sourceKey: 'bwiki-rocom',
    ...overrides,
  }
}

function fillTeam(first: Pet, second?: Pet) {
  return [
    first,
    second ?? makePet(`${first.nameZh}-bench-1`, {}, ['猛烈撞击']),
    makePet(`${first.nameZh}-bench-2`, {}, ['猛烈撞击']),
    makePet(`${first.nameZh}-bench-3`, {}, ['猛烈撞击']),
    makePet(`${first.nameZh}-bench-4`, {}, ['猛烈撞击']),
    makePet(`${first.nameZh}-bench-5`, {}, ['猛烈撞击']),
  ]
}

function createPvpSixVsSixState() {
  return createTeamBattleState({
    player: createPvpTeamCombatantInputs(
      'snow-shadow-sword',
      defaultDexData.pets,
    ),
    opponent: createPvpTeamCombatantInputs('team-4', defaultDexData.pets),
  })
}

describe('RocoFight 6v6 team battle engine', () => {
  it('creates a battle-ready 6v6 state from PVP teams', () => {
    const state = createPvpSixVsSixState()

    expect(state.phase).toBe('ready')
    expect(state.teams.player.combatants).toHaveLength(6)
    expect(state.teams.opponent.combatants).toHaveLength(6)
    expect(getActiveCombatant(state, 'player').name).toBe('雪影娃娃')
    expect(getActiveCombatant(state, 'opponent').name).toBe('巨噬针鼹')
    expect(getActiveCombatant(state, 'player').skillSlots).toEqual([
      '赤子之心',
      '击鼓传花',
      '冰墙',
      '暴风雪',
    ])
  })

  it('adjudicates an unresolved turn-limit battle by alive pet count', () => {
    const state = createPvpSixVsSixState()
    state.turn = 160
    state.teams.opponent.combatants[1].currentHp = 0
    state.teams.opponent.combatants[2].currentHp = 0

    const adjudicated = adjudicateTeamBattleByAliveCount(state)

    expect(adjudicated.phase).toBe('ended')
    expect(adjudicated.winner).toBe('player')
    expect(adjudicated.log.at(-1)).toMatchObject({
      type: 'battle_ended',
      turn: 160,
      winner: 'player',
      reason: 'turn_limit_alive_count',
    })
    expect(state.phase).not.toBe('ended')
  })

  it('leaves an unresolved turn-limit battle open when alive counts are tied', () => {
    const state = createPvpSixVsSixState()
    state.turn = 160

    const adjudicated = adjudicateTeamBattleByAliveCount(state)

    expect(adjudicated).toBe(state)
    expect(adjudicated.winner).toBeNull()
  })

  it('exposes the fixed 10-action MaskPPO mask for 4 skills, focus, and 5 switches', () => {
    const state = createPvpSixVsSixState()
    const mask = getTeamBattleActionMask(state, context, 'player')

    expect(mask).toEqual([
      true,
      true,
      true,
      true,
      false,
      true,
      true,
      true,
      true,
      true,
    ])
    expect(getSwitchTargets(state, 'player')).toEqual([1, 2, 3, 4, 5])
  })

  it('keeps action masks consistent with team action legality for PVP states', () => {
    let state = createPvpSixVsSixState()

    for (let round = 0; round < 6; round += 1) {
      for (const side of ['player', 'opponent'] as const) {
        const mask = getTeamBattleActionMask(state, context, side)

        for (let actionIndex = 0; actionIndex < 10; actionIndex += 1) {
          const decoded = decodeTeamBattleAction(state, side, actionIndex)
          const legal =
            decoded.type !== 'invalid' &&
            isTeamBattleActionLegal(state, context, decoded).legal

          expect(mask[actionIndex]).toBe(legal)
        }
      }

      state = advanceTeamBattleTurn(state, context, [
        chooseFirstLegalTeamAction(state, context, 'player'),
        chooseFirstLegalTeamAction(state, context, 'opponent'),
      ])
      if (state.phase === 'ended') break
    }
  })

  it('decodes switch action indexes through the current alive teammate order', () => {
    const state = createPvpSixVsSixState()

    expect(decodeTeamBattleAction(state, 'player', 0)).toEqual({
      side: 'player',
      type: 'skill',
      skillSlot: 0,
    })
    expect(decodeTeamBattleAction(state, 'player', 4)).toEqual({
      side: 'player',
      type: 'focus',
    })
    expect(decodeTeamBattleAction(state, 'player', 5)).toEqual({
      side: 'player',
      type: 'switch',
      targetSlot: 1,
    })
  })

  it('switches active pets without ending the turn system', () => {
    const state = createPvpSixVsSixState()
    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'switch', targetSlot: 1 },
      { side: 'opponent', type: 'wait' },
    ])

    expect(next.turn).toBe(1)
    expect(next.phase).toBe('ready')
    expect(next.teams.player.activeSlot).toBe(1)
    expect(getActiveCombatant(next, 'player').name).toBe('圣羽翼王')
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'switched',
        side: 'player',
        fromSlot: 0,
        toSlot: 1,
      }),
    )
  })

  it('triggers swift on active switch-in and applies swift skill priority', () => {
    const slowSwift = makePet(
      '慢速迅捷测试体',
      {
        health: 180,
        physicalDefense: 160,
        speed: 1,
      },
      ['飞羽'],
      {
        attributes: ['wing'],
      },
    )
    const fastAttacker = makePet(
      '高速攻击测试体',
      {
        physicalAttack: 120,
        speed: 200,
      },
      ['猛烈撞击'],
    )
    const state = createTeamBattleState({
      player: fillTeam(makePet('首发测试体', {}, ['猛烈撞击']), slowSwift),
      opponent: fillTeam(fastAttacker),
    })

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'switch', targetSlot: 1 },
      { side: 'opponent', type: 'skill', skillName: '猛烈撞击' },
    ])
    const opponentSkillIndex = next.log.findIndex(
      (event) => event.type === 'skill_used' && event.side === 'opponent',
    )
    const swiftSkillIndex = next.log.findIndex(
      (event) =>
        event.type === 'skill_used' &&
        event.side === 'player' &&
        event.skillName === '飞羽',
    )

    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'swift_triggered',
        side: 'player',
        skillName: '飞羽',
        reason: 'active_switch',
      }),
    )
    expect(opponentSkillIndex).toBeGreaterThan(-1)
    expect(swiftSkillIndex).toBeGreaterThan(-1)
    expect(swiftSkillIndex).toBeLessThan(opponentSkillIndex)
  })

  it('records first used skills so takeoff acceleration can grant switch-in swift', () => {
    const takeoffPet = makePet(
      '起飞加速测试体',
      {
        health: 180,
        physicalAttack: 120,
      },
      ['闪击'],
      {
        traitName: '起飞加速',
      },
    )
    const bench = makePet('替补测试体', {}, ['猛烈撞击'])
    const state = createTeamBattleState({
      player: fillTeam(takeoffPet, bench),
      opponent: fillTeam(
        makePet(
          '记录靶子',
          {
            health: 220,
            physicalDefense: 180,
          },
          ['猛烈撞击'],
        ),
      ),
      rules: {
        maxEnergy: 20,
        startingEnergy: 20,
      },
    })

    const afterFirstUse = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillSlot: 0 },
      { side: 'opponent', type: 'wait' },
    ])
    const afterSwitchOut = advanceTeamBattleTurn(afterFirstUse, context, [
      { side: 'player', type: 'switch', targetSlot: 1 },
      { side: 'opponent', type: 'wait' },
    ])
    const afterSwitchBack = advanceTeamBattleTurn(afterSwitchOut, context, [
      { side: 'player', type: 'switch', targetSlot: 0 },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterFirstUse.memory.firstUsedSkillBySlot.player[0]).toBe('闪击')
    expect(afterSwitchBack.log).toContainEqual(
      expect.objectContaining({
        type: 'swift_triggered',
        side: 'player',
        skillName: '闪击',
        reason: 'active_switch',
      }),
    )
  })

  it('resolves skill switch-out effects in 6v6 and applies replacement energy gains', () => {
    const switchUser = makePet('脱离技能测试体', {}, ['加大功率'])
    const replacement = makePet('入场回能测试体', {}, ['猛烈撞击'])
    const state = createTeamBattleState({
      player: fillTeam(switchUser, replacement),
      opponent: fillTeam(makePet('等待测试体', {}, ['猛烈撞击'])),
    })
    state.teams.player.combatants[1].energy = 0

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '加大功率' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(next.teams.player.activeSlot).toBe(1)
    expect(next.teams.player.combatants[1].energy).toBe(8)
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '加大功率',
        effectName: 'switch_out',
      }),
    )
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'forced_switch',
        side: 'player',
        fromSlot: 0,
        toSlot: 1,
        reason: 'skill_switch_out',
      }),
    )
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'energy_recovered',
        side: 'player',
        skillName: '加大功率',
        amount: 8,
        energy: 8,
        reason: 'switch_out_target_energy',
      }),
    )
  })

  it('doubles spin kick damage when the target switches this turn', () => {
    const kicker = makePet('回旋踢测试体', {}, ['回旋踢'])
    const target = makePet('回旋踢换出体', {}, ['猛烈撞击'])
    const replacement = makePet('回旋踢替补', {}, ['猛烈撞击'])
    const state = createTeamBattleState({
      player: fillTeam(kicker),
      opponent: fillTeam(target, replacement),
    })

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '回旋踢' },
      { side: 'opponent', type: 'switch', targetSlot: 1 },
    ])
    const damage = next.log.find(
      (event) => event.type === 'damage' && event.skillName === '回旋踢',
    )

    expect(damage?.breakdown?.powerMultiplier).toBe(2)
  })

  it('grants taunt speed when the target switches this turn', () => {
    const taunter = makePet('嘲弄测试体', {}, ['嘲弄'])
    const target = makePet('嘲弄换出体', {}, ['猛烈撞击'])
    const replacement = makePet('嘲弄替补', {}, ['猛烈撞击'])
    const state = createTeamBattleState({
      player: fillTeam(taunter),
      opponent: fillTeam(target, replacement),
    })

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '嘲弄' },
      { side: 'opponent', type: 'switch', targetSlot: 1 },
    ])

    expect(getActiveCombatant(next, 'player').effects.statModifiers).toContainEqual(
      expect.objectContaining({
        sourceSkillName: '嘲弄',
        stat: 'speed',
        flat: 70,
      }),
    )
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '嘲弄',
        effectName: 'stat_modifier',
        stat: 'speed',
        amount: 70,
        reason: 'target_switched',
      }),
    )
  })

  it('makes retreat force the attacking target out instead of the defender', () => {
    const defender = makePet('吓退测试体', {}, ['吓退'])
    const attacker = makePet('吓退攻击者', {}, ['猛烈撞击'])
    const replacement = makePet('吓退替补', {}, ['猛烈撞击'])
    const state = createTeamBattleState({
      player: fillTeam(defender),
      opponent: fillTeam(attacker, replacement),
    })

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '吓退' },
      { side: 'opponent', type: 'skill', skillName: '猛烈撞击' },
    ])

    expect(next.teams.player.activeSlot).toBe(0)
    expect(next.teams.opponent.activeSlot).toBe(1)
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'forced_switch',
        side: 'opponent',
        toSlot: 1,
        reason: 'skill_switch_out',
      }),
    )
  })

  it('passes positive stat gains to the next pet through drum relay', () => {
    const relay = makePet('击鼓传花测试体', {}, ['力量增效', '击鼓传花'])
    const replacement = makePet('击鼓传花继承者', {}, ['猛烈撞击'])
    const state = createTeamBattleState({
      player: fillTeam(relay, replacement),
      opponent: fillTeam(makePet('击鼓传花靶子', {}, ['猛烈撞击'])),
    })

    const afterBuff = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '力量增效' },
      { side: 'opponent', type: 'wait' },
    ])
    const afterRelay = advanceTeamBattleTurn(afterBuff, context, [
      { side: 'player', type: 'skill', skillName: '击鼓传花' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterRelay.teams.player.activeSlot).toBe(1)
    expect(getActiveCombatant(afterRelay, 'player').effects.statModifiers).toContainEqual(
      expect.objectContaining({
        sourceSkillName: '击鼓传花',
        stat: 'physicalAttack',
        percent: 1,
      }),
    )
  })

  it('passes non-stat positive effects through drum relay', () => {
    const relay = makePet('赤子传花测试体', {}, ['赤子之心', '击鼓传花'])
    const replacement = makePet('赤子传花继承者', {}, ['猛烈撞击'])
    const state = createTeamBattleState({
      player: fillTeam(relay, replacement),
      opponent: fillTeam(makePet('赤子传花靶子', {}, ['猛烈撞击'])),
    })

    const afterCute = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '赤子之心' },
      { side: 'opponent', type: 'wait' },
    ])
    const afterRelay = advanceTeamBattleTurn(afterCute, context, [
      { side: 'player', type: 'skill', skillName: '击鼓传花' },
      { side: 'opponent', type: 'wait' },
    ])
    const active = getActiveCombatant(afterRelay, 'player')

    expect(active.effects.statuses).toContainEqual(
      expect.objectContaining({
        sourceSkillName: '击鼓传花',
        kind: 'cute',
      }),
    )
    expect(active.effects.energyCostModifiers).toContainEqual(
      expect.objectContaining({
        sourceSkillName: '击鼓传花',
        amount: -3,
      }),
    )
  })

  it('applies permanent entry power bonuses for thunder skills', () => {
    const thunderUser = makePet('落雷入场测试体', {}, ['落雷'])
    const bench = makePet('落雷替补测试体', {}, ['猛烈撞击'])
    const state = createTeamBattleState({
      player: fillTeam(thunderUser, bench),
      opponent: fillTeam(makePet('落雷靶子', {}, ['猛烈撞击'])),
    })

    expect(
      state.teams.player.combatants[0].effects.powerModifiers,
    ).toContainEqual(
      expect.objectContaining({
        sourceSkillName: '落雷',
        skillName: '落雷',
        amount: 20,
      }),
    )

    const afterSwitchOut = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'switch', targetSlot: 1 },
      { side: 'opponent', type: 'wait' },
    ])
    const afterSwitchBack = advanceTeamBattleTurn(afterSwitchOut, context, [
      { side: 'player', type: 'switch', targetSlot: 0 },
      { side: 'opponent', type: 'wait' },
    ])

    expect(
      afterSwitchBack.teams.player.combatants[0].effects.powerModifiers,
    ).toContainEqual(
      expect.objectContaining({
        sourceSkillName: '落雷',
        skillName: '落雷',
        amount: 40,
      }),
    )
    expect(afterSwitchBack.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '落雷',
        effectName: 'skill_power_bonus',
        amount: 40,
        reason: 'switched',
      }),
    )
  })

  it('continues after an active pet faints when teammates remain', () => {
    const state = createPvpSixVsSixState()
    state.teams.player.activeSlot = 1
    state.teams.opponent.combatants[0].currentHp = 1

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '水刃' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(next.phase).toBe('ready')
    expect(next.winner).toBeNull()
    expect(next.teams.opponent.combatants[0].currentHp).toBe(0)
    expect(next.teams.opponent.activeSlot).toBe(1)
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'fainted',
        side: 'opponent',
      }),
    )
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'forced_switch',
        side: 'opponent',
        fromSlot: 0,
        toSlot: 1,
      }),
    )
  })

  it('can require a player-selected replacement after KO', () => {
    const state = createTeamBattleState({
      player: createPvpTeamCombatantInputs(
        'snow-shadow-sword',
        defaultDexData.pets,
      ),
      opponent: createPvpTeamCombatantInputs('team-4', defaultDexData.pets),
      replacementMode: 'pending',
    })
    state.teams.player.activeSlot = 1
    state.teams.opponent.combatants[0].currentHp = 1

    const afterKo = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillSlot: 0 },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterKo.phase).toBe('ready')
    expect(afterKo.pendingSwitch.opponent).toBe(true)
    expect(afterKo.teams.opponent.activeSlot).toBe(0)
    expect(afterKo.teams.opponent.combatants[0].currentHp).toBe(0)
    expect(getTeamBattleActionMask(afterKo, context, 'opponent')).toEqual([
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
      isTeamBattleActionLegal(afterKo, context, {
        side: 'opponent',
        type: 'skill',
        skillSlot: 0,
      }),
    ).toEqual({
      legal: false,
      reason: 'pending_switch',
    })
    expect(afterKo.log).toContainEqual(
      expect.objectContaining({
        type: 'switch_pending',
        side: 'opponent',
        reason: 'active_fainted',
      }),
    )
    expect(afterKo.log).not.toContainEqual(
      expect.objectContaining({
        type: 'forced_switch',
        side: 'opponent',
        fromSlot: 0,
        toSlot: 1,
      }),
    )

    const afterReplacement = advanceTeamBattleTurn(afterKo, context, [
      { side: 'player', type: 'skill', skillSlot: 0 },
      { side: 'opponent', type: 'switch', targetSlot: 2 },
    ])

    expect(afterReplacement.turn).toBe(2)
    expect(afterReplacement.pendingSwitch.opponent).toBe(false)
    expect(afterReplacement.teams.opponent.activeSlot).toBe(2)
    expect(afterReplacement.log).toContainEqual(
      expect.objectContaining({
        type: 'forced_switch',
        side: 'opponent',
        fromSlot: 0,
        toSlot: 2,
        reason: 'pending_switch',
      }),
    )
    expect(
      afterReplacement.log.some(
        (event) =>
          event.type === 'skill_used' &&
          event.side === 'player' &&
          event.turn === 2,
      ),
    ).toBe(false)
  })

  it('ends only after all six pets on one side are fainted', () => {
    const state = createPvpSixVsSixState()
    state.teams.player.activeSlot = 1
    for (const combatant of state.teams.opponent.combatants) {
      combatant.currentHp = 0
    }
    state.teams.opponent.combatants[0].currentHp = 1

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '水刃' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(next.phase).toBe('ended')
    expect(next.winner).toBe('player')
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'battle_ended',
        winner: 'player',
      }),
    )
  })

  it('grants hurricane swift only when a wing teammate carries the same skill', () => {
    const hurricaneUser = makePet(
      '飓风测试体',
      {
        speed: 1,
      },
      ['飞羽'],
      {
        attributes: ['wing'],
        traitName: '飓风',
      },
    )
    const sameSkillWing = makePet('同技翼系队友', {}, ['飞羽'], {
      attributes: ['wing'],
    })
    const fastOpponent = makePet(
      '高速对手',
      {
        speed: 200,
      },
      ['猛烈撞击'],
    )
    const state = createTeamBattleState({
      player: fillTeam(hurricaneUser, sameSkillWing),
      opponent: fillTeam(fastOpponent),
    })

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '飞羽' },
      { side: 'opponent', type: 'skill', skillName: '猛烈撞击' },
    ])
    const playerSkillIndex = next.log.findIndex(
      (event) => event.type === 'skill_used' && event.side === 'player',
    )
    const opponentSkillIndex = next.log.findIndex(
      (event) => event.type === 'skill_used' && event.side === 'opponent',
    )

    expect(playerSkillIndex).toBeGreaterThan(-1)
    expect(opponentSkillIndex).toBeGreaterThan(-1)
    expect(playerSkillIndex).toBeLessThan(opponentSkillIndex)
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '飞羽',
        effectName: 'priority_modifier',
        reason: 'hurricane_same_skill_teammate',
      }),
    )
  })

  it('chains current swift skills in slot order through gale combo', () => {
    const hurricane = makePet(
      '疾风连袭测试体',
      {
        health: 220,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 180,
        magicDefense: 180,
        speed: 100,
      },
      ['水刃', '疾风连袭', '闪击', '龙卷风'],
      {
        traitName: '飓风',
      },
    )
    const sameSkillWing = makePet('水刃翼系队友', {}, ['水刃'], {
      attributes: ['wing'],
    })
    const state = createTeamBattleState({
      player: fillTeam(hurricane, sameSkillWing),
      opponent: fillTeam(
        makePet(
          '疾风连袭靶子',
          {
            health: 260,
            physicalDefense: 220,
            magicDefense: 220,
            speed: 1,
          },
          ['猛烈撞击'],
        ),
      ),
      rules: {
        startingEnergy: 10,
      },
    })

    expect(
      isTeamBattleActionLegal(state, context, {
        side: 'player',
        type: 'skill',
        skillName: '疾风连袭',
      }),
    ).toMatchObject({
      legal: true,
    })

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '疾风连袭' },
      { side: 'opponent', type: 'wait' },
    ])
    const playerSkills = next.log
      .filter((event) => event.type === 'skill_used' && event.side === 'player')
      .map((event) => event.skillName)

    expect(playerSkills).toEqual(['疾风连袭', '水刃', '龙卷风'])
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'skill_used',
        side: 'player',
        skillName: '疾风连袭',
        energyCost: 4,
      }),
    )
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '疾风连袭',
        effectName: 'chain_skill',
        reason: '水刃',
      }),
    )
  })

  it('revives immortal pets after three turns instead of preventing lethal damage', () => {
    const immortal = makePet(
      '不朽测试体',
      {
        health: 80,
        physicalDefense: 1,
      },
      ['猛烈撞击'],
      {
        traitName: '不朽',
      },
    )
    const bench = makePet('不朽替补', {}, ['猛烈撞击'])
    const attacker = makePet(
      '不朽击杀者',
      {
        physicalAttack: 300,
        speed: 200,
      },
      ['猛烈撞击'],
    )
    const state = createTeamBattleState({
      player: fillTeam(immortal, bench),
      opponent: fillTeam(attacker),
      rules: {
        maxEnergy: 20,
        startingEnergy: 20,
      },
    })
    state.teams.player.combatants[0].currentHp = 1

    const afterKo = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'wait' },
      { side: 'opponent', type: 'skill', skillName: '猛烈撞击' },
    ])
    const afterOne = advanceTeamBattleTurn(afterKo, context, [
      { side: 'player', type: 'skill', skillName: '猛烈撞击' },
      { side: 'opponent', type: 'wait' },
    ])
    const afterTwo = advanceTeamBattleTurn(afterOne, context, [
      { side: 'player', type: 'skill', skillName: '猛烈撞击' },
      { side: 'opponent', type: 'wait' },
    ])
    const afterThree = advanceTeamBattleTurn(afterTwo, context, [
      { side: 'player', type: 'skill', skillName: '猛烈撞击' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterKo.teams.player.combatants[0].currentHp).toBe(0)
    expect(afterKo.memory.immortalReviveCountdownBySlot.player[0]).toBe(3)
    expect(afterOne.teams.player.combatants[0].currentHp).toBe(0)
    expect(afterTwo.teams.player.combatants[0].currentHp).toBe(0)
    expect(afterThree.teams.player.combatants[0].currentHp).toBe(1)
    expect(afterThree.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '不朽',
        effectName: 'immortal_revived',
        hp: 1,
      }),
    )
  })

  it('applies courage when a bug teammate exists', () => {
    const courage = makePet(
      '壮胆测试体',
      {
        physicalAttack: 100,
        magicAttack: 100,
      },
      ['猛烈撞击'],
      {
        traitName: '壮胆',
      },
    )
    const bugTeammate = makePet('虫系队友', {}, ['猛烈撞击'], {
      attributes: ['bug'],
    })
    const state = createTeamBattleState({
      player: fillTeam(courage, bugTeammate),
      opponent: fillTeam(makePet('壮胆靶子', {}, ['猛烈撞击'])),
    })
    const active = getActiveCombatant(state, 'player')

    expect(getEffectiveStat(active, 'physicalAttack')).toBe(
      Math.floor(active.stats.physicalAttack * 1.5),
    )
    expect(getEffectiveStat(active, 'magicAttack')).toBe(
      Math.floor(active.stats.magicAttack * 1.5),
    )
  })

  it('charges earth-vein pets on the bench from allied ground skills', () => {
    const groundUser = makePet('地系队友', {}, ['地刺'])
    const earthVein = makePet('地脉测试体', {}, ['猛烈撞击'], {
      traitName: '地脉',
    })
    const state = createTeamBattleState({
      player: fillTeam(groundUser, earthVein),
      opponent: fillTeam(makePet('地脉靶子', {}, ['猛烈撞击'])),
      rules: {
        maxEnergy: 10,
        startingEnergy: 10,
        energyRecoveryPerTurn: 0,
      },
    })
    state.teams.player.combatants[1].energy = 0

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '地刺' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(next.teams.player.combatants[1].energy).toBe(3)
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '地刺',
        effectName: 'energy_delta',
        amount: 3,
        reason: 'geo_pulse_bench_charge',
      }),
    )
  })

  it('applies infiltration attack and defense bonuses on entry from team history', () => {
    const groundUser = makePet('渗透队友', {}, ['地刺'])
    const infiltrator = makePet('渗透测试体', {}, ['猛烈撞击'], {
      traitName: '渗透',
    })
    const state = createTeamBattleState({
      player: fillTeam(groundUser, infiltrator),
      opponent: fillTeam(makePet('渗透靶子', {}, ['猛烈撞击'])),
      rules: {
        maxEnergy: 10,
        startingEnergy: 10,
      },
    })

    const afterGround = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '地刺' },
      { side: 'opponent', type: 'wait' },
    ])
    const afterEntry = advanceTeamBattleTurn(afterGround, context, [
      { side: 'player', type: 'switch', targetSlot: 1 },
      { side: 'opponent', type: 'wait' },
    ])
    const active = getActiveCombatant(afterEntry, 'player')

    expect(
      active.effects.statModifiers.filter(
        (modifier) => modifier.sourceSkillName === '渗透',
      ),
    ).toHaveLength(4)
    expect(getEffectiveStat(active, 'physicalAttack')).toBe(
      Math.floor(active.stats.physicalAttack * 1.05),
    )
    expect(getEffectiveStat(active, 'physicalDefense')).toBe(
      Math.floor(active.stats.physicalDefense * 1.05),
    )
  })

  it('passes stat changes to the replacement through cleanliness', () => {
    const clean = makePet('洁癖测试体', {}, ['力量增效'], {
      traitName: '洁癖',
    })
    const replacement = makePet('洁癖继承者', {}, ['猛烈撞击'])
    const state = createTeamBattleState({
      player: fillTeam(clean, replacement),
      opponent: fillTeam(makePet('洁癖靶子', {}, ['猛烈撞击'])),
    })
    const afterBoost = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'skill', skillName: '力量增效' },
      { side: 'opponent', type: 'wait' },
    ])
    const afterSwitch = advanceTeamBattleTurn(afterBoost, context, [
      { side: 'player', type: 'switch', targetSlot: 1 },
      { side: 'opponent', type: 'wait' },
    ])
    const active = getActiveCombatant(afterSwitch, 'player')

    expect(active.effects.statModifiers).toContainEqual(
      expect.objectContaining({
        sourceSkillName: '洁癖',
        stat: 'physicalAttack',
        percent: 1,
      }),
    )
    expect(afterSwitch.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '洁癖',
        effectName: 'stat_modifier',
        reason: 'cleanliness_inheritance',
      }),
    )
  })

  it('makes replacements lose energy while nightmare is active', () => {
    const switcher = makePet('做噩梦换入者', {}, ['猛烈撞击'])
    const replacement = makePet('做噩梦受害者', {}, ['猛烈撞击'])
    const nightmare = makePet('做噩梦测试体', {}, ['猛烈撞击'], {
      traitName: '做噩梦',
    })
    const state = createTeamBattleState({
      player: fillTeam(switcher, replacement),
      opponent: fillTeam(nightmare),
      rules: {
        maxEnergy: 10,
        startingEnergy: 10,
        energyRecoveryPerTurn: 0,
      },
    })

    const next = advanceTeamBattleTurn(state, context, [
      { side: 'player', type: 'switch', targetSlot: 1 },
      { side: 'opponent', type: 'wait' },
    ])

    expect(getActiveCombatant(next, 'player').energy).toBe(7)
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '做噩梦',
        effectName: 'energy_delta',
        amount: -3,
        reason: 'replacement_nightmare',
      }),
    )
  })

  it('supports focus and compact 6v6 observations for training adapters', () => {
    const state = createPvpSixVsSixState()
    state.teams.player.combatants[0].energy = 0

    const focusAction = chooseFirstLegalTeamAction(state, context, 'player', [
      '不存在的技能',
    ])
    const afterFocus = advanceTeamBattleTurn(state, context, [
      focusAction,
      { side: 'opponent', type: 'wait' },
    ])

    expect(focusAction).toEqual({ side: 'player', type: 'focus' })
    expect(afterFocus.log).toContainEqual(
      expect.objectContaining({
        type: 'focus_used',
        side: 'player',
      }),
    )
    expect(afterFocus.teams.player.combatants[0].energy).toBeGreaterThan(0)
    expect(encodeTeamBattleObservation(afterFocus, context, 'player')).toHaveLength(
      teamBattleObservationLength,
    )
  })
})
