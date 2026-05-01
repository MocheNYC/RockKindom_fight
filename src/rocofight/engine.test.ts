import { describe, expect, it } from 'vitest'
import { defaultDexData } from '../data/defaultData'
import type { Pet, SkillInfo } from '../types'
import {
  advanceTurn,
  calculateAttributeMultiplier,
  calculateDamage,
  chooseFirstLegalSkillAction,
  constructBattleStats,
  createBattleContext,
  createBattleState,
  getLegalSkillActions,
  getEffectiveStat,
  isSkillActionLegal,
} from './engine'

const context = createBattleContext(defaultDexData)

function findPet(name: string): Pet {
  const pet = defaultDexData.pets.find((entry) => entry.nameZh === name)
  if (!pet) throw new Error(`Missing test pet: ${name}`)
  return pet
}

function findSkill(name: string): SkillInfo {
  const skill = defaultDexData.skills.find((entry) => entry.name === name)
  if (!skill) throw new Error(`Missing test skill: ${name}`)
  return skill
}

function makePet(overrides: Partial<Pet>): Pet {
  return {
    key: 'test:pet',
    title: 'Test Pet',
    href: '',
    id: '999',
    nameZh: '测试精灵',
    nameEn: 'Test Pet',
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
    stats: {
      health: 80,
      physicalAttack: 80,
      magicAttack: 80,
      physicalDefense: 80,
      magicDefense: 80,
      speed: 80,
      baseStats: 480,
    },
    dexTasks: [],
    taskSkillStones: [],
    skills: [],
    bloodlineSkills: [],
    learnableSkillStones: [],
    updateVersion: null,
    pageUrl: null,
    sourceKey: 'bwiki-rocom',
    ...overrides,
  }
}

describe('RocoFight battle engine', () => {
  it('creates a ready battle state from RocoDex pets', () => {
    const state = createBattleState({
      player: findPet('迪莫'),
      opponent: findPet('火神'),
    })

    expect(state.phase).toBe('ready')
    expect(state.turn).toBe(0)
    expect(state.combatants.player.name).toBe('迪莫')
    expect(state.combatants.player.level).toBe(60)
    expect(state.combatants.player.baseStats.health).toBe(120)
    expect(state.combatants.player.currentHp).toBe(400)
    expect(state.combatants.player.knownSkills).toContain('光球')
    expect(state.log).toEqual([{ type: 'battle_started', turn: 0 }])
  })

  it('constructs expected level 60 battle panels from nature-boosted base stats', () => {
    const baseStats = {
      health: 140,
      physicalAttack: 120,
      magicAttack: 70,
      physicalDefense: 110,
      magicDefense: 90,
      speed: 120,
      baseStats: 650,
    }

    expect(
      constructBattleStats(baseStats, 60, undefined, {
        increased: 'health',
      }).health,
    ).toBe(540)
    expect(
      constructBattleStats(baseStats, 60, undefined, {
        increased: 'physicalAttack',
      }).physicalAttack,
    ).toBe(360)
    expect(
      constructBattleStats(baseStats, 60, undefined, {
        increased: 'physicalDefense',
      }).physicalDefense,
    ).toBe(330)
    expect(
      constructBattleStats(baseStats, 60, undefined, {
        increased: 'speed',
      }).speed,
    ).toBe(260)
  })

  it('applies Roco nature modifiers as +20 percent and -10 percent', () => {
    const baseStats = {
      health: 80,
      physicalAttack: 120,
      magicAttack: 80,
      physicalDefense: 80,
      magicDefense: 80,
      speed: 120,
      baseStats: 560,
    }
    const neutral = constructBattleStats(baseStats)
    const natured = constructBattleStats(baseStats, 60, undefined, {
      increased: 'physicalAttack',
      decreased: 'speed',
    })

    expect(neutral.health).toBe(300)
    expect(neutral.physicalAttack).toBe(300)
    expect(neutral.speed).toBe(216)
    expect(natured.physicalAttack).toBe(360)
    expect(natured.speed).toBe(195)
  })

  it('calibrates a 120 attack base stat and 400 power skill against 80 HP and 110 defense', () => {
    const calibrationSkill: SkillInfo = {
      name: '校准重击',
      attribute: null,
      category: '物攻',
      energy: 0,
      power: 400,
      effect: null,
      description: null,
      version: null,
      pageUrl: null,
    }
    const attacker = makePet({
      key: 'test:attacker',
      nameZh: '攻击校准体',
      stats: {
        health: 80,
        physicalAttack: 120,
        magicAttack: 1,
        physicalDefense: 80,
        magicDefense: 80,
        speed: 100,
        baseStats: 461,
      },
      skills: [{ name: calibrationSkill.name, level: 1 }],
    })
    const defender = makePet({
      key: 'test:defender',
      nameZh: '防御校准体',
      stats: {
        health: 80,
        physicalAttack: 80,
        magicAttack: 1,
        physicalDefense: 110,
        magicDefense: 80,
        speed: 50,
        baseStats: 401,
      },
    })
    const calibrationContext = createBattleContext({
      attributes: defaultDexData.attributes,
      skills: [...defaultDexData.skills, calibrationSkill],
    })
    const state = createBattleState({
      player: {
        pet: attacker,
        nature: {
          increased: 'physicalAttack',
          decreased: 'magicAttack',
        },
      },
      opponent: {
        pet: defender,
        nature: {
          increased: 'physicalDefense',
          decreased: 'magicAttack',
        },
      },
    })

    const next = advanceTurn(state, calibrationContext, [
      { side: 'player', skillName: calibrationSkill.name },
      { side: 'opponent', type: 'wait' },
    ])

    expect(state.combatants.player.stats.physicalAttack).toBe(360)
    expect(state.combatants.opponent.maxHp).toBe(300)
    expect(state.combatants.opponent.stats.physicalDefense).toBe(330)
    expect(next.combatants.opponent.currentHp).toBe(0)
    expect(next.winner).toBe('player')
  })

  it('orders actions by speed and applies physical damage', () => {
    const state = createBattleState({
      player: findPet('迪莫'),
      opponent: findPet('火神'),
    })

    const next = advanceTurn(state, context, [
      { side: 'player', skillName: '猛烈撞击' },
      { side: 'opponent', skillName: '猛烈撞击' },
    ])

    const skillEvents = next.log.filter((event) => event.type === 'skill_used')
    const damageEvents = next.log.filter((event) => event.type === 'damage')

    expect(skillEvents[0]?.side).toBe('opponent')
    expect(skillEvents[1]?.side).toBe('player')
    expect(next.combatants.player.currentHp).toBeLessThan(
      state.combatants.player.currentHp,
    )
    expect(next.combatants.opponent.currentHp).toBeLessThan(
      state.combatants.opponent.currentHp,
    )
    expect(damageEvents[0]?.breakdown?.category).toBe('physical')
  })

  it('calculates same-attribute magical damage', () => {
    const state = createBattleState({
      player: findPet('迪莫'),
      opponent: findPet('火神'),
    })
    const breakdown = calculateDamage(
      state.combatants.player,
      state.combatants.opponent,
      findSkill('光球'),
      context.attributeMap,
      state.rules,
    )

    expect(breakdown.category).toBe('magical')
    expect(breakdown.sameAttributeBonus).toBe(1.5)
    expect(breakdown.finalDamage).toBeGreaterThan(0)
  })

  it('uses stacked attribute metadata for type multipliers', () => {
    expect(
      calculateAttributeMultiplier(
        'water',
        findPet('火神').attributes,
        context.attributeMap,
      ),
    ).toBe(2)
    expect(
      calculateAttributeMultiplier(
        'grass',
        findPet('火神').attributes,
        context.attributeMap,
      ),
    ).toBe(0.5)
  })

  it('calculates conditional fixed power for flash strike and singing sand trap', () => {
    const getPower = (
      skillName: '闪击' | '鸣沙陷阱',
      configure: (state: ReturnType<typeof createBattleState>) => void,
    ) => {
      const state = createBattleState({
        player: makePet({
          key: `test:${skillName}:user`,
          nameZh: `${skillName}测试体`,
          skills: [{ name: skillName, level: 1 }],
        }),
        opponent: makePet({
          key: `test:${skillName}:target`,
          nameZh: `${skillName}靶子`,
          stats: {
            health: 220,
            physicalAttack: 80,
            magicAttack: 80,
            physicalDefense: 120,
            magicDefense: 120,
            speed: 80,
            baseStats: 680,
          },
        }),
        rules: {
          startingEnergy: 20,
        },
      })
      configure(state)

      const next = advanceTurn(state, context, [
        { side: 'player', skillName },
        { side: 'opponent', type: 'wait' },
      ])
      return next.log.find(
        (event) => event.type === 'damage' && event.skillName === skillName,
      )?.breakdown?.power
    }

    expect(
      getPower('闪击', (state) => {
        state.combatants.player.stats.speed = 90
        state.combatants.opponent.stats.speed = 100
      }),
    ).toBe(60)
    expect(
      getPower('闪击', (state) => {
        state.combatants.player.stats.speed = 105
        state.combatants.opponent.stats.speed = 100
      }),
    ).toBe(125)
    expect(
      getPower('鸣沙陷阱', (state) => {
        state.combatants.player.stats.physicalDefense = 90
        state.combatants.opponent.stats.physicalDefense = 100
      }),
    ).toBe(60)
    expect(
      getPower('鸣沙陷阱', (state) => {
        state.combatants.player.stats.physicalDefense = 230
        state.combatants.opponent.stats.physicalDefense = 100
      }),
    ).toBe(170)
  })

  it('fails actions with insufficient energy without spending a turn attack', () => {
    const state = createBattleState({
      player: findPet('迪莫'),
      opponent: findPet('火神'),
      rules: {
        startingEnergy: 0,
      },
    })

    const next = advanceTurn(state, context, [
      { side: 'player', skillName: '光球' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'action_failed',
        side: 'player',
        skillName: '光球',
        reason: 'not_enough_energy',
      }),
    )
    expect(next.combatants.opponent.currentHp).toBe(
      state.combatants.opponent.currentHp,
    )
  })

  it('exposes legal skill actions so callers can avoid impossible moves', () => {
    const player = makePet({
      key: 'test:legal-actions',
      nameZh: '合法动作测试体',
      skills: [
        { name: '超级糖果', level: 1 },
        { name: '钢铁洪流', level: 1 },
        { name: '齿轮扭矩', level: 1 },
      ],
    })
    const state = createBattleState({
      player,
      opponent: findPet('火神'),
      rules: {
        startingEnergy: 2,
      },
    })

    expect(
      isSkillActionLegal(state, context, 'player', '超级糖果'),
    ).toMatchObject({
      legal: false,
      reason: 'not_enough_energy',
      energyCost: 3,
      energy: 2,
    })
    expect(getLegalSkillActions(state, context, 'player').map((action) => action.skillName)).toEqual([])
    expect(
      chooseFirstLegalSkillAction(state, context, 'player', [
        '超级糖果',
        '钢铁洪流',
      ]),
    ).toEqual({
      side: 'player',
      type: 'wait',
    })
  })

  it('rejects unlearned skills when learnset enforcement is enabled', () => {
    const state = createBattleState({
      player: findPet('迪莫'),
      opponent: findPet('火神'),
    })

    const next = advanceTurn(state, context, [
      { side: 'player', skillName: '暗突袭' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'action_failed',
        side: 'player',
        skillName: '暗突袭',
        reason: 'unlearned_skill',
      }),
    )
  })

  it('applies axis support adjacent energy discounts and active self discount', () => {
    const player = makePet({
      key: 'test:axis-support',
      nameZh: '轴承支撑测试体',
      skills: [
        { name: '钢铁洪流', level: 1 },
        { name: '轴承支撑', level: 1 },
        { name: '齿轮扭矩', level: 1 },
      ],
    })
    const state = createBattleState({
      player,
      opponent: findPet('火神'),
      rules: {
        startingEnergy: 20,
      },
    })

    expect(
      isSkillActionLegal(state, context, 'player', '钢铁洪流'),
    ).toMatchObject({
      legal: true,
      energyCost: 2,
    })

    const afterAxis = advanceTurn(state, context, [
      { side: 'player', skillName: '轴承支撑' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(
      isSkillActionLegal(afterAxis, context, 'player', '轴承支撑'),
    ).toMatchObject({
      legal: true,
      energyCost: 2,
    })
  })

  it('halves ground skill energy costs during sandstorm weather', () => {
    const player = makePet({
      key: 'test:sandstorm-user',
      nameZh: '沙涌测试体',
      skills: [
        { name: '沙涌', level: 1 },
        { name: '跺地', level: 1 },
      ],
    })
    const state = createBattleState({
      player,
      opponent: findPet('火神'),
      rules: {
        startingEnergy: 10,
      },
    })

    const afterSandstorm = advanceTurn(state, context, [
      { side: 'player', skillName: '沙涌' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterSandstorm.field.weather).toEqual({
      kind: 'sandstorm',
      remainingTurns: 7,
    })
    expect(
      isSkillActionLegal(afterSandstorm, context, 'player', '跺地'),
    ).toMatchObject({
      legal: true,
      energyCost: 1,
    })

    let expired = afterSandstorm
    for (let turn = 0; turn < 7; turn += 1) {
      expired = advanceTurn(expired, context, [
        { side: 'player', type: 'wait' },
        { side: 'opponent', type: 'wait' },
      ])
    }
    expect(expired.field.weather).toBeNull()
  })

  it('stacks refraction rewards after each release', () => {
    const player = makePet({
      key: 'test:refraction-user',
      nameZh: '折射测试体',
      stats: {
        health: 180,
        physicalAttack: 80,
        magicAttack: 100,
        physicalDefense: 120,
        magicDefense: 120,
        speed: 80,
        baseStats: 680,
      },
      skills: [{ name: '折射', level: 1 }],
    })
    const opponent = makePet({
      key: 'test:refraction-target',
      nameZh: '折射靶子',
      stats: {
        health: 400,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 200,
        magicDefense: 200,
        speed: 1,
        baseStats: 961,
      },
    })
    const state = createBattleState({
      player,
      opponent,
      rules: {
        startingEnergy: 10,
      },
    })

    const afterFirst = advanceTurn(state, context, [
      { side: 'player', skillName: '折射' },
      { side: 'opponent', type: 'wait' },
    ])
    const firstDamage = afterFirst.log.find(
      (event) => event.type === 'damage' && event.skillName === '折射',
    )

    expect(firstDamage?.breakdown?.power).toBe(50)
    expect(
      isSkillActionLegal(afterFirst, context, 'player', '折射'),
    ).toMatchObject({
      legal: true,
      energyCost: 3,
    })
    expect(getEffectiveStat(afterFirst.combatants.player, 'magicAttack')).toBe(
      Math.floor(afterFirst.combatants.player.stats.magicAttack * 1.4),
    )

    const afterSecond = advanceTurn(afterFirst, context, [
      { side: 'player', skillName: '折射' },
      { side: 'opponent', type: 'wait' },
    ])
    const secondDamage = [...afterSecond.log]
      .reverse()
      .find((event) => event.type === 'damage' && event.skillName === '折射')

    expect(secondDamage?.breakdown?.power).toBe(70)
    expect(afterSecond.combatants.player.effects.powerModifiers).toContainEqual(
      expect.objectContaining({
        sourceSkillName: '折射',
        skillName: '折射',
        amount: 40,
      }),
    )
  })

  it('discounts harden only after the previous used skill was an attack', () => {
    const player = makePet({
      key: 'test:harden-history',
      nameZh: '硬化测试体',
      skills: [
        { name: '地刺', level: 1 },
        { name: '硬化', level: 1 },
      ],
    })
    const opponent = makePet({
      key: 'test:harden-target',
      nameZh: '硬化靶子',
      stats: {
        health: 220,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 220,
        magicDefense: 220,
        speed: 20,
        baseStats: 840,
      },
    })
    const state = createBattleState({
      player,
      opponent,
      rules: {
        startingEnergy: 20,
      },
    })

    const afterAttack = advanceTurn(state, context, [
      { side: 'player', skillName: '地刺' },
      { side: 'opponent', type: 'wait' },
    ])
    expect(
      isSkillActionLegal(afterAttack, context, 'player', '硬化'),
    ).toMatchObject({
      legal: true,
      energyCost: 0,
    })

    const afterHarden = advanceTurn(afterAttack, context, [
      { side: 'player', skillName: '硬化' },
      { side: 'opponent', type: 'wait' },
    ])
    expect(
      isSkillActionLegal(afterHarden, context, 'player', '硬化'),
    ).toMatchObject({
      legal: true,
      energyCost: 2,
    })
  })

  it('keeps effective prevention priority for the next action', () => {
    const player = makePet({
      key: 'test:effective-prevention',
      nameZh: '有效预防测试体',
      stats: {
        health: 180,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 180,
        magicDefense: 180,
        speed: 1,
        baseStats: 701,
      },
      skills: [
        { name: '有效预防', level: 1 },
        { name: '猛烈撞击', level: 1 },
      ],
    })
    const opponent = makePet({
      key: 'test:effective-prevention-target',
      nameZh: '有效预防靶子',
      stats: {
        health: 180,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 180,
        magicDefense: 180,
        speed: 200,
        baseStats: 800,
      },
      skills: [{ name: '猛烈撞击', level: 1 }],
    })
    const afterPrevention = advanceTurn(
      createBattleState({
        player,
        opponent,
        rules: {
          startingEnergy: 20,
        },
      }),
      context,
      [
        { side: 'player', skillName: '有效预防' },
        { side: 'opponent', skillName: '猛烈撞击' },
      ],
    )
    const afterAttack = advanceTurn(afterPrevention, context, [
      { side: 'player', skillName: '猛烈撞击' },
      { side: 'opponent', skillName: '猛烈撞击' },
    ])
    const turnTwoSkills = afterAttack.log.filter(
      (event) => event.type === 'skill_used' && event.turn === 2,
    )

    expect(turnTwoSkills[0]?.side).toBe('player')
  })

  it('applies swift priority for dragon tornado before faster attacks', () => {
    const dragonTornado = '\u9f99\u5377\u98ce'
    const heavyCollision = '\u731b\u70c8\u649e\u51fb'
    const player = makePet({
      key: 'test:dragon-tornado-priority',
      nameZh: 'Dragon tornado priority test',
      stats: {
        health: 180,
        physicalAttack: 140,
        magicAttack: 80,
        physicalDefense: 160,
        magicDefense: 160,
        speed: 1,
        baseStats: 721,
      },
      skills: [{ name: dragonTornado, level: 1 }],
    })
    const opponent = makePet({
      key: 'test:dragon-tornado-target',
      nameZh: 'Dragon tornado target',
      stats: {
        health: 180,
        physicalAttack: 120,
        magicAttack: 80,
        physicalDefense: 160,
        magicDefense: 160,
        speed: 200,
        baseStats: 700,
      },
      skills: [{ name: heavyCollision, level: 1 }],
    })

    const next = advanceTurn(
      createBattleState({
        player,
        opponent,
        rules: {
          startingEnergy: 20,
        },
      }),
      context,
      [
        { side: 'player', skillName: dragonTornado },
        { side: 'opponent', skillName: heavyCollision },
      ],
    )
    const playerSkillIndex = next.log.findIndex(
      (event) =>
        event.type === 'skill_used' &&
        event.side === 'player' &&
        event.skillName === dragonTornado,
    )
    const opponentSkillIndex = next.log.findIndex(
      (event) => event.type === 'skill_used' && event.side === 'opponent',
    )

    expect(playerSkillIndex).toBeGreaterThan(-1)
    expect(opponentSkillIndex).toBeGreaterThan(-1)
    expect(playerSkillIndex).toBeLessThan(opponentSkillIndex)
  })

  it('calculates bridge-listening counter damage from the answered skill power', () => {
    const heavyStrike: SkillInfo = {
      name: '听桥重击',
      attribute: 'normal',
      category: '物攻',
      energy: 0,
      power: 120,
      effect: null,
      description: null,
      version: null,
      pageUrl: null,
    }
    const customContext = createBattleContext({
      attributes: defaultDexData.attributes,
      skills: [...defaultDexData.skills, heavyStrike],
    })
    const player = makePet({
      key: 'test:bridge-listening',
      nameZh: '听桥测试体',
      stats: {
        health: 180,
        physicalAttack: 220,
        magicAttack: 80,
        physicalDefense: 160,
        magicDefense: 160,
        speed: 1,
        baseStats: 801,
      },
      skills: [{ name: '听桥', level: 1 }],
    })
    const opponent = makePet({
      key: 'test:bridge-listening-target',
      nameZh: '听桥靶子',
      stats: {
        health: 240,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 20,
        magicDefense: 80,
        speed: 200,
        baseStats: 700,
      },
      skills: [{ name: heavyStrike.name, level: 1 }],
    })

    const next = advanceTurn(
      createBattleState({
        player,
        opponent,
        rules: {
          startingEnergy: 20,
        },
      }),
      customContext,
      [
        { side: 'player', skillName: '听桥' },
        { side: 'opponent', skillName: heavyStrike.name },
      ],
    )
    const counterDamage = next.log.find(
      (event) =>
        event.type === 'damage' &&
        event.skillName === '听桥' &&
        event.effectName === 'response_counter_damage',
    )

    expect(counterDamage?.breakdown?.basePower).toBe(120)
    expect(counterDamage?.breakdown?.category).toBe('physical')
    expect(counterDamage?.damage).not.toBe(120)
  })

  it('moves transmitted skill positions and powers up gear torque when its slot changes', () => {
    const player = makePet({
      key: 'test:transmission',
      nameZh: '传动测试体',
      traitName: '翼轴',
      skills: [
        { name: '钢铁洪流', level: 1 },
        { name: '倾泻', level: 1 },
        { name: '齿轮扭矩', level: 1 },
        { name: '主轴', level: 1 },
      ],
    })
    const opponent = makePet({
      key: 'test:transmission-target',
      nameZh: '传动靶子',
      stats: {
        health: 220,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 220,
        magicDefense: 220,
        speed: 20,
        baseStats: 840,
      },
      skills: [{ name: '猛烈撞击', level: 1 }],
    })
    const afterSteel = advanceTurn(
      createBattleState({
        player,
        opponent,
        rules: {
          maxEnergy: 20,
          startingEnergy: 20,
        },
      }),
      context,
      [
        { side: 'player', skillName: '钢铁洪流' },
        { side: 'opponent', type: 'wait' },
      ],
    )

    expect(afterSteel.combatants.player.skillSlots).toEqual([
      '倾泻',
      '齿轮扭矩',
      '钢铁洪流',
      '主轴',
    ])
    expect(afterSteel.log).toContainEqual(
      expect.objectContaining({
        type: 'skill_position_changed',
        side: 'player',
        skillName: '钢铁洪流',
        fromSlot: 1,
        toSlot: 3,
        amount: 2,
      }),
    )
    expect(afterSteel.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '齿轮扭矩',
        effectName: 'skill_power_bonus',
        amount: 20,
      }),
    )

    const afterGear = advanceTurn(afterSteel, context, [
      { side: 'player', skillName: '齿轮扭矩' },
      { side: 'opponent', type: 'wait' },
    ])
    const gearDamage = [...afterGear.log]
      .reverse()
      .find(
        (event) => event.type === 'damage' && event.skillName === '齿轮扭矩',
      )

    expect(gearDamage?.breakdown?.power).toBe(
      (findSkill('齿轮扭矩').power ?? 0) + 20,
    )
  })

  it('applies mesh transmission slot bonuses before moving the skill', () => {
    const player = makePet({
      key: 'test:mesh-transmission',
      nameZh: '啮合传动测试体',
      skills: [
        { name: '啮合传递', level: 1 },
        { name: '齿轮扭矩', level: 1 },
        { name: '主轴', level: 1 },
      ],
    })
    const next = advanceTurn(
      createBattleState({
        player,
        opponent: findPet('火神'),
      }),
      context,
      [
        { side: 'player', skillName: '啮合传递' },
        { side: 'opponent', type: 'wait' },
      ],
    )

    expect(next.combatants.player.skillSlots.slice(0, 3)).toEqual([
      '齿轮扭矩',
      '啮合传递',
      '主轴',
    ])
    expect(next.combatants.player.effects.statModifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceSkillName: '啮合传递',
          stat: 'speed',
          flat: 80,
        }),
        expect.objectContaining({
          sourceSkillName: '啮合传递',
          stat: 'physicalAttack',
          percent: 0.6,
        }),
      ]),
    )
  })

  it('applies physical and magical stat buff effects without stacking the same source repeatedly', () => {
    const player = makePet({
      key: 'test:buffer',
      nameZh: '强化测试体',
      skills: [
        { name: '力量增效', level: 1 },
        { name: '魔法增效', level: 1 },
      ],
    })
    const state = createBattleState({
      player,
      opponent: findPet('火神'),
    })
    const afterPhysical = advanceTurn(state, context, [
      { side: 'player', skillName: '力量增效' },
      { side: 'opponent', type: 'wait' },
    ])
    const afterRepeatedPhysical = advanceTurn(afterPhysical, context, [
      { side: 'player', skillName: '力量增效' },
      { side: 'opponent', type: 'wait' },
    ])
    const afterMagical = advanceTurn(afterRepeatedPhysical, context, [
      { side: 'player', skillName: '魔法增效' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterMagical.combatants.player.effects.statModifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceSkillName: '力量增效',
          stat: 'physicalAttack',
          percent: 1,
        }),
        expect.objectContaining({
          sourceSkillName: '魔法增效',
          stat: 'magicAttack',
          percent: 0.7,
        }),
      ]),
    )
    expect(
      afterRepeatedPhysical.combatants.player.effects.statModifiers.filter(
        (modifier) => modifier.sourceSkillName === '力量增效',
      ),
    ).toHaveLength(1)
    expect(getEffectiveStat(afterMagical.combatants.player, 'physicalAttack')).toBe(
      afterMagical.combatants.player.stats.physicalAttack * 2,
    )
    expect(getEffectiveStat(afterMagical.combatants.player, 'magicAttack')).toBe(
      Math.floor(afterMagical.combatants.player.stats.magicAttack * 1.7),
    )
  })

  it('gives defense priority and reduces the next incoming hit by 70 percent', () => {
    const defender = makePet({
      key: 'test:defender-with-guard',
      nameZh: '防御测试体',
      stats: {
        health: 100,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 100,
        magicDefense: 100,
        speed: 1,
        baseStats: 461,
      },
      skills: [{ name: '防御', level: 1 }],
    })
    const attacker = makePet({
      key: 'test:attacker-into-guard',
      nameZh: '攻击测试体',
      stats: {
        health: 100,
        physicalAttack: 120,
        magicAttack: 80,
        physicalDefense: 80,
        magicDefense: 80,
        speed: 200,
        baseStats: 660,
      },
      skills: [{ name: '猛烈撞击', level: 1 }],
    })
    const state = createBattleState({
      player: defender,
      opponent: attacker,
    })

    const next = advanceTurn(state, context, [
      { side: 'player', skillName: '防御' },
      { side: 'opponent', skillName: '猛烈撞击' },
    ])

    const skillEvents = next.log.filter((event) => event.type === 'skill_used')
    const damageEvent = next.log.find((event) => event.type === 'damage')

    expect(skillEvents[0]?.side).toBe('player')
    expect(skillEvents[0]?.skillName).toBe('防御')
    expect(damageEvent?.breakdown?.damageMultiplier).toBe(0.3)
    expect(next.combatants.player.effects.damageReductions).toHaveLength(0)
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'response_triggered',
        side: 'player',
        skillName: '防御',
        actionKind: 'defense',
        targetActionKind: 'attack',
      }),
    )
  })

  it('does not give defense response priority when the opponent uses status', () => {
    const defender = makePet({
      key: 'test:defender-vs-status',
      nameZh: '防御未应对体',
      stats: {
        health: 100,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 100,
        magicDefense: 100,
        speed: 1,
        baseStats: 461,
      },
      skills: [{ name: '防御', level: 1 }],
    })
    const statusUser = makePet({
      key: 'test:status-before-defense',
      nameZh: '状态测试体',
      stats: {
        health: 100,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 80,
        magicDefense: 80,
        speed: 200,
        baseStats: 620,
      },
      skills: [{ name: '魔法增效', level: 1 }],
    })
    const state = createBattleState({
      player: defender,
      opponent: statusUser,
    })

    const next = advanceTurn(state, context, [
      { side: 'player', skillName: '防御' },
      { side: 'opponent', skillName: '魔法增效' },
    ])

    const skillEvents = next.log.filter((event) => event.type === 'skill_used')

    expect(skillEvents[0]?.side).toBe('opponent')
    expect(skillEvents[0]?.skillName).toBe('魔法增效')
    expect(next.log).not.toContainEqual(
      expect.objectContaining({
        type: 'response_triggered',
        side: 'player',
        skillName: '防御',
      }),
    )
    expect(next.combatants.player.effects.damageReductions).toHaveLength(0)
  })

  it('lets dark assault respond to status, act first, double power, and drain damage', () => {
    const darkUser = makePet({
      key: 'test:dark-user',
      nameZh: '暗袭测试体',
      attributes: ['demon'],
      stats: {
        health: 140,
        physicalAttack: 120,
        magicAttack: 80,
        physicalDefense: 80,
        magicDefense: 80,
        speed: 40,
        baseStats: 540,
      },
      skills: [{ name: '暗突袭', level: 1 }],
    })
    const fasterAttacker = makePet({
      key: 'test:faster-status-user',
      nameZh: '先手状态体',
      stats: {
        health: 140,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 80,
        magicDefense: 80,
        speed: 160,
        baseStats: 620,
      },
      skills: [{ name: '力量增效', level: 1 }],
    })
    const state = createBattleState({
      player: darkUser,
      opponent: fasterAttacker,
    })
    state.combatants.player.currentHp = 300

    const next = advanceTurn(state, context, [
      { side: 'player', skillName: '暗突袭' },
      { side: 'opponent', skillName: '力量增效' },
    ])
    const skillEvents = next.log.filter((event) => event.type === 'skill_used')
    const darkDamage = next.log.find(
      (event) => event.type === 'damage' && event.skillName === '暗突袭',
    )
    const drainHeal = next.log.find(
      (event) => event.type === 'healed' && event.skillName === '暗突袭',
    )

    expect(skillEvents[0]?.side).toBe('player')
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'response_triggered',
        side: 'player',
        skillName: '暗突袭',
        actionKind: 'attack',
        targetActionKind: 'status',
      }),
    )
    expect(darkDamage?.breakdown?.powerMultiplier).toBe(2)
    expect(drainHeal?.amount).toBe(Math.floor((darkDamage?.damage ?? 0) * 0.5))
    expect(next.combatants.player.currentHp).toBeGreaterThan(300)
  })

  it('does not double dark assault when the opponent uses an attack action', () => {
    const darkUser = makePet({
      key: 'test:dark-user-no-response',
      nameZh: '暗袭无应对体',
      attributes: ['demon'],
      stats: {
        health: 140,
        physicalAttack: 120,
        magicAttack: 80,
        physicalDefense: 80,
        magicDefense: 80,
        speed: 40,
        baseStats: 540,
      },
      skills: [{ name: '暗突袭', level: 1 }],
    })
    const fasterAttacker = makePet({
      key: 'test:faster-attack-user',
      nameZh: '先手攻击体',
      stats: {
        health: 140,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 80,
        magicDefense: 80,
        speed: 160,
        baseStats: 620,
      },
      skills: [{ name: '猛烈撞击', level: 1 }],
    })
    const state = createBattleState({
      player: darkUser,
      opponent: fasterAttacker,
    })

    const next = advanceTurn(state, context, [
      { side: 'player', skillName: '暗突袭' },
      { side: 'opponent', skillName: '猛烈撞击' },
    ])
    const darkDamage = next.log.find(
      (event) => event.type === 'damage' && event.skillName === '暗突袭',
    )

    expect(next.log).not.toContainEqual(
      expect.objectContaining({
        type: 'response_triggered',
        side: 'player',
        skillName: '暗突袭',
      }),
    )
    expect(darkDamage?.breakdown?.powerMultiplier).toBe(1)
  })

  it('logs unimplemented registered gaps for unknown non-basic skill effects', () => {
    const customSkill: SkillInfo = {
      name: '未实现追加技',
      attribute: 'normal',
      category: '物攻',
      energy: 0,
      power: 60,
      effect: '造成物伤，追加中毒。',
      description: null,
      version: null,
      pageUrl: null,
    }
    const customContext = createBattleContext({
      attributes: defaultDexData.attributes,
      skills: [...defaultDexData.skills, customSkill],
    })
    const player = makePet({
      key: 'test:unimplemented-user',
      nameZh: '未实现测试体',
      skills: [{ name: customSkill.name, level: 1 }],
    })
    const state = createBattleState({
      player,
      opponent: findPet('火神'),
    })

    const next = advanceTurn(state, customContext, [
      { side: 'player', skillName: customSkill.name },
      { side: 'opponent', type: 'wait' },
    ])

    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_unimplemented',
        side: 'player',
        skillName: customSkill.name,
        reason: 'effect_not_registered',
      }),
    )
  })

  it('stacks Royal Griffin wind combo hits after wing skill use', () => {
    const wingSkill: SkillInfo = {
      name: '测试翼击',
      attribute: 'wing',
      category: '物攻',
      energy: 0,
      power: 10,
      effect: '造成物伤。',
      description: null,
      version: null,
      pageUrl: null,
    }
    const customContext = createBattleContext({
      attributes: defaultDexData.attributes,
      skills: [...defaultDexData.skills, wingSkill],
    })
    const player = makePet({
      key: 'test:wind-combo-user',
      nameZh: '连击狮鹫测试体',
      attributes: ['wing'],
      traitName: '乘风连击',
      traitDescription: '使用翼系技能后，获得连击数+1。',
      skills: [{ name: wingSkill.name, level: 1 }],
    })
    const opponent = makePet({
      key: 'test:wind-combo-target',
      nameZh: '连击靶子',
      stats: {
        health: 220,
        physicalAttack: 60,
        magicAttack: 60,
        physicalDefense: 180,
        magicDefense: 180,
        speed: 1,
        baseStats: 701,
      },
    })
    const state = createBattleState({
      player,
      opponent,
      rules: { startingEnergy: 10 },
    })

    const afterFirst = advanceTurn(state, customContext, [
      { side: 'player', skillName: wingSkill.name },
      { side: 'opponent', type: 'wait' },
    ])
    const afterSecond = advanceTurn(afterFirst, customContext, [
      { side: 'player', skillName: wingSkill.name },
      { side: 'opponent', type: 'wait' },
    ])
    const afterThird = advanceTurn(afterSecond, customContext, [
      { side: 'player', skillName: wingSkill.name },
      { side: 'opponent', type: 'wait' },
    ])

    const lastDamageHitCount = (stateAfterTurn: typeof afterFirst) =>
      [...stateAfterTurn.log]
        .reverse()
        .find(
          (event) =>
            event.type === 'damage' && event.skillName === wingSkill.name,
        )?.breakdown?.hitCount

    expect(lastDamageHitCount(afterFirst)).toBe(1)
    expect(lastDamageHitCount(afterSecond)).toBe(2)
    expect(lastDamageHitCount(afterThird)).toBe(3)
    expect(afterThird.combatants.player.effects.hitModifiers).toContainEqual(
      expect.objectContaining({
        id: 'hit:passive:乘风连击',
        amount: 3,
      }),
    )
  })

  it('supports grouped heal and energy effects', () => {
    const player = makePet({
      key: 'test:heal-energy',
      nameZh: '回复测试体',
      skills: [
        { name: '根吸收', level: 1 },
        { name: '寸拳', level: 1 },
      ],
    })
    const state = createBattleState({
      player,
      opponent: findPet('火神'),
      rules: {
        startingEnergy: 2,
      },
    })
    state.combatants.player.currentHp = 200

    const afterHeal = advanceTurn(state, context, [
      { side: 'player', skillName: '根吸收' },
      { side: 'opponent', type: 'wait' },
    ])
    const afterPunch = advanceTurn(afterHeal, context, [
      { side: 'player', skillName: '寸拳' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterHeal.log).toContainEqual(
      expect.objectContaining({
        type: 'healed',
        side: 'player',
        skillName: '根吸收',
        effectName: 'direct',
      }),
    )
    expect(afterHeal.combatants.player.currentHp).toBeGreaterThan(200)
    expect(afterHeal.combatants.player.energy).toBeGreaterThan(
      state.combatants.player.energy,
    )
    expect(afterPunch.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '寸拳',
        effectName: 'energy_delta',
      }),
    )
  })

  it('supports poison stacks and end-turn status damage', () => {
    const player = makePet({
      key: 'test:poison-user',
      nameZh: '中毒测试体',
      skills: [
        { name: '毒针', level: 1 },
        { name: '毒孢子', level: 1 },
      ],
    })
    const opponent = makePet({
      key: 'test:poison-target',
      nameZh: '中毒目标',
      stats: {
        health: 100,
        physicalAttack: 80,
        magicAttack: 80,
        physicalDefense: 100,
        magicDefense: 100,
        speed: 80,
        baseStats: 540,
      },
    })
    const state = createBattleState({
      player,
      opponent,
    })

    const afterNeedle = advanceTurn(state, context, [
      { side: 'player', skillName: '毒针' },
      { side: 'opponent', type: 'wait' },
    ])
    const afterSpore = advanceTurn(afterNeedle, context, [
      { side: 'player', skillName: '毒孢子' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterNeedle.combatants.opponent.effects.marks[0]).toEqual(
      expect.objectContaining({
        kind: 'poison',
        stacks: 1,
      }),
    )
    expect(afterNeedle.log).toContainEqual(
      expect.objectContaining({
        type: 'mark_damage',
        side: 'opponent',
        mark: 'poison',
      }),
    )
    expect(afterSpore.combatants.opponent.effects.marks[0]).toEqual(
      expect.objectContaining({
        kind: 'poison',
        stacks: 6,
      }),
    )
  })

  it('clears mark stacks separately from ordinary statuses', () => {
    const player = makePet({
      key: 'test:mark-cleanser',
      nameZh: '印记清理测试体',
      skills: [
        { name: '毒孢子', level: 1 },
        { name: '食腐', level: 1 },
      ],
    })
    const opponent = makePet({
      key: 'test:mark-cleanser-target',
      nameZh: '印记清理目标',
    })
    const afterPoison = advanceTurn(
      createBattleState({
        player,
        opponent,
      }),
      context,
      [
        { side: 'player', skillName: '毒孢子' },
        { side: 'opponent', type: 'wait' },
      ],
    )
    afterPoison.combatants.player.currentHp = Math.floor(
      afterPoison.combatants.player.maxHp / 2,
    )
    afterPoison.combatants.opponent.effects.statuses.push({
      id: 'status:sleep:test',
      sourceSkillName: '测试睡眠',
      kind: 'sleep',
      remainingTurns: null,
      stacks: 1,
    })

    const afterScavenge = advanceTurn(afterPoison, context, [
      { side: 'player', skillName: '食腐' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterPoison.combatants.opponent.effects.marks).toHaveLength(1)
    expect(afterScavenge.combatants.opponent.effects.marks).toHaveLength(0)
    expect(afterScavenge.combatants.opponent.effects.statuses).toContainEqual(
      expect.objectContaining({
        kind: 'sleep',
        stacks: 1,
      }),
    )
    expect(afterScavenge.log).toContainEqual(
      expect.objectContaining({
        type: 'healed',
        side: 'player',
        skillName: '食腐',
        effectName: 'clear_mark_heal',
      }),
    )
  })

  it('burning brand clears marks only and burns per cleared stack', () => {
    const state = createBattleState({
      player: makePet({
        key: 'test:burning-brand-user',
        nameZh: '焚烧烙印测试体',
        skills: [{ name: '焚烧烙印', level: 1 }],
      }),
      opponent: makePet({
        key: 'test:burning-brand-target',
        nameZh: '焚烧烙印靶子',
      }),
    })
    state.combatants.player.effects.marks.push({
      id: 'mark:photosynthesis:self',
      sourceSkillName: '测试印记',
      kind: 'photosynthesis',
      remainingTurns: null,
      stacks: 1,
    })
    state.combatants.opponent.effects.statuses.push({
      id: 'status:sleep:target',
      sourceSkillName: '测试睡眠',
      kind: 'sleep',
      remainingTurns: null,
      stacks: 1,
    })
    state.combatants.opponent.effects.marks.push(
      {
        id: 'mark:wet:target',
        sourceSkillName: '测试印记',
        kind: 'wet',
        remainingTurns: null,
        stacks: 2,
      },
      {
        id: 'mark:poison:target',
        sourceSkillName: '测试印记',
        kind: 'poison',
        remainingTurns: null,
        stacks: 1,
      },
    )

    const next = advanceTurn(state, context, [
      { side: 'player', skillName: '焚烧烙印' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(next.combatants.player.effects.marks).toHaveLength(0)
    expect(next.combatants.opponent.effects.statuses).toContainEqual(
      expect.objectContaining({
        kind: 'sleep',
        stacks: 1,
      }),
    )
    expect(next.combatants.opponent.effects.marks).toContainEqual(
      expect.objectContaining({
        kind: 'burn',
        stacks: 20,
      }),
    )
  })

  it('lets torrent clear marks only when it is not answered by defense', () => {
    const makeTorrentState = () => {
      const state = createBattleState({
        player: makePet({
          key: 'test:torrent-user',
          nameZh: '倾泻测试体',
          skills: [{ name: '倾泻', level: 1 }],
        }),
        opponent: makePet({
          key: 'test:torrent-target',
          nameZh: '倾泻靶子',
          skills: [{ name: '防御', level: 1 }],
        }),
      })
      state.combatants.player.effects.marks.push({
        id: 'mark:photosynthesis:self',
        sourceSkillName: '测试印记',
        kind: 'photosynthesis',
        remainingTurns: null,
        stacks: 1,
      })
      state.combatants.opponent.effects.marks.push({
        id: 'mark:wet:target',
        sourceSkillName: '测试印记',
        kind: 'wet',
        remainingTurns: null,
        stacks: 2,
      })
      return state
    }

    const blocked = advanceTurn(makeTorrentState(), context, [
      { side: 'player', skillName: '倾泻' },
      { side: 'opponent', skillName: '防御' },
    ])
    const cleared = advanceTurn(makeTorrentState(), context, [
      { side: 'player', skillName: '倾泻' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(blocked.combatants.player.effects.marks).toHaveLength(1)
    expect(blocked.combatants.opponent.effects.marks).toHaveLength(1)
    expect(blocked.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        skillName: '倾泻',
        effectName: 'clear_effects_blocked',
        reason: 'defense',
      }),
    )
    expect(cleared.combatants.player.effects.marks).toHaveLength(0)
    expect(cleared.combatants.opponent.effects.marks).toHaveLength(0)
  })

  it('applies prewarning as flat speed when incoming skill would be lethal', () => {
    const fastTap: SkillInfo = {
      name: '预警轻击',
      attribute: 'normal',
      category: '物攻',
      energy: 0,
      power: 1,
      effect: null,
      description: null,
      version: null,
      pageUrl: null,
    }
    const lethalStrike: SkillInfo = {
      name: '预警重击',
      attribute: 'normal',
      category: '物攻',
      energy: 0,
      power: 200,
      effect: null,
      description: null,
      version: null,
      pageUrl: null,
    }
    const customContext = createBattleContext({
      attributes: defaultDexData.attributes,
      skills: [...defaultDexData.skills, fastTap, lethalStrike],
    })
    const state = createBattleState({
      player: makePet({
        key: 'test:prewarning-user',
        nameZh: '预警测试体',
        traitName: '预警',
        skills: [{ name: fastTap.name, level: 1 }],
      }),
      opponent: makePet({
        key: 'test:prewarning-attacker',
        nameZh: '预警攻击者',
        skills: [{ name: lethalStrike.name, level: 1 }],
      }),
    })
    state.combatants.player.currentHp = 50
    state.combatants.player.stats.speed = 100
    state.combatants.player.stats.physicalDefense = 1
    state.combatants.opponent.stats.speed = 140
    state.combatants.opponent.stats.physicalAttack = 1000
    state.combatants.opponent.currentHp = state.combatants.opponent.maxHp

    const next = advanceTurn(state, customContext, [
      { side: 'player', skillName: fastTap.name },
      { side: 'opponent', skillName: lethalStrike.name },
    ])

    const skillEvents = next.log.filter((event) => event.type === 'skill_used')
    expect(skillEvents[0]?.side).toBe('player')
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'effect_applied',
        side: 'player',
        skillName: '预警',
        effectName: 'stat_modifier',
        stat: 'speed',
        amount: 50,
      }),
    )
  })

  it('counts positive effect stacks for living painting damage', () => {
    const paintingStrike: SkillInfo = {
      name: '活画测试击',
      attribute: 'normal',
      category: '物攻',
      energy: 0,
      power: 40,
      effect: null,
      description: null,
      version: null,
      pageUrl: null,
    }
    const customContext = createBattleContext({
      attributes: defaultDexData.attributes,
      skills: [...defaultDexData.skills, paintingStrike],
    })
    const state = createBattleState({
      player: makePet({
        key: 'test:living-painting-user',
        nameZh: '活画测试体',
        traitName: '变形活画',
        skills: [{ name: paintingStrike.name, level: 1 }],
      }),
      opponent: makePet({
        key: 'test:living-painting-target',
        nameZh: '活画靶子',
      }),
    })
    state.combatants.opponent.effects.statModifiers.push({
      id: 'stat:physicalDefense:test-positive',
      sourceSkillName: '测试增益',
      stat: 'physicalDefense',
      percent: 0.1,
      flat: 0,
      remainingTurns: null,
    })
    state.combatants.opponent.effects.statuses.push({
      id: 'status:wet:test-positive',
      sourceSkillName: '测试增益',
      kind: 'wet',
      remainingTurns: null,
      stacks: 2,
    })
    state.combatants.opponent.effects.marks.push({
      id: 'mark:photosynthesis:test-positive',
      sourceSkillName: '测试增益',
      kind: 'photosynthesis',
      remainingTurns: null,
      stacks: 3,
    })

    const next = advanceTurn(state, customContext, [
      { side: 'player', skillName: paintingStrike.name },
      { side: 'opponent', type: 'wait' },
    ])
    const damage = next.log.find(
      (event) => event.type === 'damage' && event.skillName === paintingStrike.name,
    )

    expect(damage?.breakdown?.powerMultiplier).toBeCloseTo(1.6, 5)
  })

  it('steals only marks for special cleaning scene', () => {
    const noMarkState = createBattleState({
      player: makePet({
        key: 'test:special-cleaning-user',
        nameZh: '特殊清洁测试体',
        traitName: '特殊清洁场景',
      }),
      opponent: makePet({
        key: 'test:special-cleaning-target',
        nameZh: '特殊清洁靶子',
      }),
    })
    noMarkState.combatants.opponent.effects.statuses.push({
      id: 'status:wet:test',
      sourceSkillName: '测试状态',
      kind: 'wet',
      remainingTurns: null,
      stacks: 2,
    })

    const afterNoMark = advanceTurn(noMarkState, context, [
      { side: 'player', type: 'wait' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterNoMark.combatants.opponent.effects.statuses[0]?.stacks).toBe(2)
    expect(afterNoMark.combatants.player.effects.statuses).toHaveLength(0)
    expect(afterNoMark.combatants.player.effects.marks).toHaveLength(0)

    const markState = createBattleState({
      player: makePet({
        key: 'test:special-cleaning-mark-user',
        nameZh: '特殊清洁印记测试体',
        traitName: '特殊清洁场景',
      }),
      opponent: makePet({
        key: 'test:special-cleaning-mark-target',
        nameZh: '特殊清洁印记靶子',
      }),
    })
    markState.combatants.opponent.effects.statuses.push({
      id: 'status:wet:test',
      sourceSkillName: '测试状态',
      kind: 'wet',
      remainingTurns: null,
      stacks: 2,
    })
    markState.combatants.opponent.effects.marks.push({
      id: 'mark:wet:test',
      sourceSkillName: '测试印记',
      kind: 'wet',
      remainingTurns: null,
      stacks: 2,
    })

    const afterMark = advanceTurn(markState, context, [
      { side: 'player', type: 'wait' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(afterMark.combatants.opponent.effects.statuses[0]?.stacks).toBe(2)
    expect(afterMark.combatants.opponent.effects.marks[0]?.stacks).toBe(1)
    expect(afterMark.combatants.player.effects.statuses).toHaveLength(0)
    expect(afterMark.combatants.player.effects.marks).toContainEqual(
      expect.objectContaining({
        kind: 'wet',
        stacks: 1,
      }),
    )
  })

  it('ends the battle when a combatant faints', () => {
    const state = createBattleState({
      player: findPet('迪莫'),
      opponent: findPet('火神'),
    })
    state.combatants.opponent.currentHp = 1

    const next = advanceTurn(state, context, [
      { side: 'player', skillName: '光球' },
      { side: 'opponent', type: 'wait' },
    ])

    expect(next.phase).toBe('ended')
    expect(next.winner).toBe('player')
    expect(next.combatants.opponent.currentHp).toBe(0)
    expect(next.log).toContainEqual(
      expect.objectContaining({
        type: 'battle_ended',
        winner: 'player',
      }),
    )
  })
})
