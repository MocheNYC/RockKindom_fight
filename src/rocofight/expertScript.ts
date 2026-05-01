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
}

export function createExpertScriptMemory(): ExpertScriptMemory {
  return {
    cursorBySideSlot: {
      player: Array.from({ length: 6 }, () => 0),
      opponent: Array.from({ length: 6 }, () => 0),
    },
  }
}

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
  const switchTarget = getSwitchTargets(state, side)[0]
  const hpRatio = active.maxHp > 0 ? active.currentHp / active.maxHp : 0
  if (hpRatio > 0 && hpRatio < 0.18 && switchTarget !== undefined) {
    return { side, type: 'switch', targetSlot: switchTarget }
  }

  const activeSlot = state.teams[side].activeSlot
  const loop = expertSkillLoops[active.name] ?? active.skillSlots
  const start = memory.cursorBySideSlot[side][activeSlot] ?? 0
  for (let offset = 0; offset < loop.length; offset += 1) {
    const loopIndex = (start + offset) % loop.length
    const skillName = loop[loopIndex]
    const skillSlot = active.skillSlots.indexOf(skillName)
    if (skillSlot < 0) continue

    const action = { side, type: 'skill', skillSlot } as const
    if (!isTeamBattleActionLegal(state, context, action).legal) continue

    memory.cursorBySideSlot[side][activeSlot] = (loopIndex + 1) % loop.length
    return action
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
