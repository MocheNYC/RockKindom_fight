import { calculateDamage } from './engine'
import {
  chooseFirstLegalTeamAction,
  getActiveCombatant,
  getSwitchTargets,
  isTeamBattleActionLegal,
  type TeamBattleAction,
  type TeamBattleState,
} from './team'
import type { BattleContext, BattleSide } from './types'

export const expertSkillLoops: Record<string, readonly string[]> = {
  雪影娃娃: ['赤子之心', '冰墙', '暴风雪', '击鼓传花'],
  圣羽翼王: ['力量增效', '水刃', '闪击', '疾风连袭'],
  帕帕斯卡: ['钢铁洪流', '齿轮扭矩', '超级糖果', '倾泻'],
  岚鸟: ['龙卷风', '闪击', '先发制人', '水刃'],
  '圣剑-X': ['鸣沙陷阱'],
  寂灭骨龙: ['降灵', '偷袭', '隼鳞', '吓退'],
  巨噬针鼹: ['力量增效', '吞噬', '地刺', '冰爪'],
  画间沉铁兽: ['力量增效', '截拳', '回旋踢', '先发制人'],
  布克棱岩: ['地刺', '硬化', '沙涌', '遁地'],
  食尘短绒: ['沙涌', '地刺', '尾后针', '遁地'],
  声波缇塔: ['轴承支撑', '啮合传递', '齿轮扭矩', '地刺'],
  棋绮后: ['破绽', '听桥', '影袭', '鸣沙陷阱'],
  翠顶夫人: ['力量增效', '水环', '水刃', '飞羽'],
  皇家狮鹫: ['羽化加速', '疾风刺', '光之矛', '有效预防'],
  幻影灵菇: ['报复', '惊吓盒子', '藤绞', '抽枝'],
  利灯鱼: ['打湿', '落雷', '水光冲击', '加大功率'],
  尖嘴狐仙: ['暴风雪', '火焰护盾', '焚烧烙印', '高温回火'],
  梦悠悠: ['操控', '勾魂', '背袭', '灵媒'],
  蹦床松鼠: ['热身运动', '音波弹', '休息回复', '吓退'],
  落陨星兔: ['嗜痛', '嘲弄', '大爆炸', '恐吓'],
  记忆石: ['光合作用', '顶端优势', '跺地', '防御'],
  化蝶: ['毒孢子', '破罐破摔', '食腐', '晒太阳'],
  白金独角兽: ['气泡', '追打', '回旋风暴', '折射'],
  朔夜伊芙: ['羽化加速', '撕咬', '缠丝劲', '有效预防'],
  黑猫巫师: ['嗜痛', '羽化加速', '乱打', '午夜噪音'],
  龙息帕尔: ['力量增效', '火云车', '蝙蝠', '先发制人'],
}

export type ExpertScriptMemory = {
  cursorBySideSlot: Record<BattleSide, number[]>
  usedSkillNamesBySideSlot: Record<BattleSide, Array<Set<string>>>
}

export function createExpertScriptMemory(): ExpertScriptMemory {
  return {
    cursorBySideSlot: {
      player: Array.from({ length: 6 }, () => 0),
      opponent: Array.from({ length: 6 }, () => 0),
    },
    usedSkillNamesBySideSlot: {
      player: Array.from({ length: 6 }, () => new Set<string>()),
      opponent: Array.from({ length: 6 }, () => new Set<string>()),
    },
  }
}

const setupSkillNames = new Set([
  '赤子之心',
  '力量增效',
  '轴承支撑',
  '啮合传递',
  '破绽',
  '沙涌',
  '打湿',
  '操控',
  '热身运动',
  '嘲弄',
  '光合作用',
  '毒孢子',
  '晒太阳',
  '羽化加速',
  '降灵',
])

const pivotSkillNames = new Set(['击鼓传花', '遁地', '加大功率', '高温回火'])
const sustainSkillNames = new Set(['休息回复', '食腐', '抽枝', '蝙蝠'])

export function chooseExpertScriptAction(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
  memory: ExpertScriptMemory,
): TeamBattleAction {
  const opponentSide = side === 'player' ? 'opponent' : 'player'
  const pendingTarget = state.pendingSwitch[side]
    ? getSwitchTargets(state, side)[0]
    : undefined
  if (pendingTarget !== undefined) return { side, type: 'switch', targetSlot: pendingTarget }

  if (state.pendingSwitch[opponentSide]) return { side, type: 'wait' }

  const active = getActiveCombatant(state, side)
  const target = getActiveCombatant(state, opponentSide)
  const switchTarget = getSwitchTargets(state, side)[0]
  const hpRatio = active.maxHp > 0 ? active.currentHp / active.maxHp : 0
  if (hpRatio > 0 && hpRatio < 0.16 && switchTarget !== undefined) {
    return { side, type: 'switch', targetSlot: switchTarget }
  }

  const activeSlot = state.teams[side].activeSlot
  const loop = expertSkillLoops[active.name] ?? active.skillSlots
  const usedSkillNames = memory.usedSkillNamesBySideSlot[side][activeSlot]
  const lethal = chooseLethalSkill(state, context, side, loop)
  if (lethal) return rememberAction(lethal, state, side, memory)

  const targetEnergy = target.energy
  const emergencyDefense =
    hpRatio < 0.34 || (hpRatio < 0.68 && targetEnergy >= 3)
      ? chooseFirstMatchingSkill(state, context, side, loop, (skillName) => {
          const skill = context.skillMap.get(skillName)
          return Boolean(skill?.category?.includes('防御'))
        })
      : null
  if (emergencyDefense) {
    return rememberAction(emergencyDefense, state, side, memory)
  }

  const sustain =
    hpRatio < 0.5
      ? chooseFirstMatchingSkill(state, context, side, loop, (skillName) =>
          sustainSkillNames.has(skillName),
        )
      : null
  if (sustain) return rememberAction(sustain, state, side, memory)

  const pressureAttack =
    targetEnergy >= 4 ? chooseBestAttackSkill(state, context, side, loop) : null
  if (pressureAttack) return rememberAction(pressureAttack, state, side, memory)

  const setup =
    hpRatio > 0.55
      ? chooseFirstMatchingSkill(state, context, side, loop, (skillName) => {
          return setupSkillNames.has(skillName) && !usedSkillNames.has(skillName)
        })
      : null
  if (setup) return rememberAction(setup, state, side, memory)

  const bestAttack = chooseBestAttackSkill(state, context, side, loop)
  if (bestAttack) return rememberAction(bestAttack, state, side, memory)

  const start = memory.cursorBySideSlot[side][activeSlot] ?? 0
  for (let offset = 0; offset < loop.length; offset += 1) {
    const loopIndex = (start + offset) % loop.length
    const skillName = loop[loopIndex]
    const skillSlot = active.skillSlots.indexOf(skillName)
    if (skillSlot < 0) continue

    const action = { side, type: 'skill', skillSlot } as const
    if (!isTeamBattleActionLegal(state, context, action).legal) continue
    if (shouldSkipLoopSkill(state, context, side, skillName)) continue

    return rememberAction(action, state, side, memory, loopIndex + 1, loop.length)
  }

  const focus = { side, type: 'focus' } as const
  if (isTeamBattleActionLegal(state, context, focus).legal) return focus

  return (
    chooseFirstLegalTeamAction(state, context, side, loop) ??
    (switchTarget !== undefined
      ? { side, type: 'switch', targetSlot: switchTarget }
      : { side, type: 'wait' })
  )
}

function chooseLethalSkill(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
  loop: readonly string[],
): TeamBattleAction | null {
  const target = getActiveCombatant(state, side === 'player' ? 'opponent' : 'player')
  const candidates = legalSkillActions(state, context, side, loop)
    .filter(({ skill }) => (skill.power ?? 0) > 0)
    .map(({ action, skill }) => ({
      action,
      damage: calculateDamage(
        getActiveCombatant(state, side),
        target,
        skill,
        context.attributeMap,
        state.rules,
      ).finalDamage,
    }))
    .filter(({ damage }) => damage >= target.currentHp)
    .sort((a, b) => b.damage - a.damage)

  return candidates[0]?.action ?? null
}

function chooseBestAttackSkill(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
  loop: readonly string[],
): TeamBattleAction | null {
  const active = getActiveCombatant(state, side)
  const target = getActiveCombatant(state, side === 'player' ? 'opponent' : 'player')
  const candidates = legalSkillActions(state, context, side, loop)
    .filter(({ skillName, skill }) => {
      if ((skill.power ?? 0) <= 0) return false
      if (pivotSkillNames.has(skillName) && active.currentHp / active.maxHp > 0.35) {
        return false
      }
      return true
    })
    .map(({ action, skill, order }) => {
      const damage = calculateDamage(
        active,
        target,
        skill,
        context.attributeMap,
        state.rules,
      ).finalDamage
      const speedBonus = skill.effect?.includes('先手') || skill.effect?.includes('迅捷') ? 8 : 0
      const drainBonus = skill.effect?.includes('吸血') && active.currentHp < active.maxHp ? 12 : 0
      return { action, score: damage + speedBonus + drainBonus - order * 0.01 }
    })
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.action ?? null
}

function chooseFirstMatchingSkill(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
  loop: readonly string[],
  predicate: (skillName: string) => boolean,
): TeamBattleAction | null {
  return (
    legalSkillActions(state, context, side, loop).find(({ skillName }) =>
      predicate(skillName),
    )?.action ?? null
  )
}

function legalSkillActions(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
  loop: readonly string[],
) {
  const active = getActiveCombatant(state, side)
  return loop
    .map((skillName, order) => {
      const skillSlot = active.skillSlots.indexOf(skillName)
      const skill = context.skillMap.get(skillName)
      if (skillSlot < 0 || !skill) return null
      const action = { side, type: 'skill', skillSlot } as const
      if (!isTeamBattleActionLegal(state, context, action).legal) return null
      return { action, skillName, skill, order }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
}

function shouldSkipLoopSkill(
  state: TeamBattleState,
  context: BattleContext,
  side: BattleSide,
  skillName: string,
) {
  const active = getActiveCombatant(state, side)
  const target = getActiveCombatant(state, side === 'player' ? 'opponent' : 'player')
  const hpRatio = active.maxHp > 0 ? active.currentHp / active.maxHp : 0
  const skill = context.skillMap.get(skillName)
  if (!skill) return false

  if (skill.category?.includes('防御')) {
    return hpRatio > 0.55 && target.energy < 4
  }

  if (pivotSkillNames.has(skillName)) return hpRatio > 0.35
  if (sustainSkillNames.has(skillName)) return hpRatio > 0.7
  return false
}

function rememberAction(
  action: TeamBattleAction,
  state: TeamBattleState,
  side: BattleSide,
  memory: ExpertScriptMemory,
  nextCursor?: number,
  loopLength?: number,
) {
  if (action.type === 'skill') {
    const active = getActiveCombatant(state, side)
    const activeSlot = state.teams[side].activeSlot
    const skillName = active.skillSlots[action.skillSlot ?? 0]
    if (skillName) {
      memory.usedSkillNamesBySideSlot[side][activeSlot].add(skillName)
    }
    if (nextCursor !== undefined && loopLength) {
      memory.cursorBySideSlot[side][activeSlot] = nextCursor % loopLength
    }
  }
  return action
}
