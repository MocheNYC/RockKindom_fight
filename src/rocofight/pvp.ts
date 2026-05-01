import type { DexDataBundle, Pet } from '../types'
import type {
  BattleCombatantInput,
  BattleNature,
  BattleStatKey,
} from './types'

export type PvpTeamId = 'snow-shadow-sword' | 'team-4' | 'manual-pvp-builds'

export type PvpTeamEntry = {
  id: PvpTeamId
  name: string
  sourceImage: string
}

export type PvpPetEntry = {
  id: string
  teamId: PvpTeamId
  sourceImage: string
  petName: string
  sourceName?: string
  petKey: string
  level?: number
  natureLabel?: string
  nature?: BattleNature
  traitName?: string
  bloodlineName?: string
  individualFocus?: readonly BattleStatKey[]
  skills: readonly [string, string, string, string]
}

export type PvpDatabaseValidation = {
  duplicateIds: string[]
  missingPetKeys: string[]
  missingSkills: string[]
}

export const pvpTeams = [
  {
    id: 'snow-shadow-sword',
    name: '雪影圣剑队',
    sourceImage: 'patch1.jpg',
  },
  {
    id: 'team-4',
    name: '队伍4',
    sourceImage: 'patch2.jpg',
  },
  {
    id: 'manual-pvp-builds',
    name: '手工补充PVP配招',
    sourceImage: 'user-message',
  },
] as const satisfies readonly PvpTeamEntry[]

export const pvpPetEntries: readonly PvpPetEntry[] = [
  {
    id: 'snow-shadow-doll',
    teamId: 'snow-shadow-sword',
    sourceImage: 'patch1.jpg',
    petName: '雪影娃娃',
    petKey: 'bwiki:雪影娃娃',
    level: 57,
    natureLabel: '踏实',
    traitName: '捉迷藏',
    bloodlineName: '首领血脉',
    skills: ['赤子之心', '击鼓传花', '冰墙', '暴风雪'],
  },
  {
    id: 'holy-wing-king',
    teamId: 'snow-shadow-sword',
    sourceImage: 'patch1.jpg',
    petName: '圣羽翼王',
    petKey: 'bwiki:圣羽翼王',
    level: 60,
    natureLabel: '开朗',
    traitName: '飓风',
    skills: ['水刃', '力量增效', '闪击', '疾风连袭'],
  },
  {
    id: 'papasika',
    teamId: 'snow-shadow-sword',
    sourceImage: 'patch1.jpg',
    petName: '帕帕斯卡',
    petKey: 'bwiki:帕帕斯卡',
    level: 58,
    natureLabel: '固执',
    traitName: '翼轴',
    bloodlineName: '翼系血脉',
    skills: ['钢铁洪流', '倾泻', '超级糖果', '齿轮扭矩'],
  },
  {
    id: 'lan-bird',
    teamId: 'snow-shadow-sword',
    sourceImage: 'patch1.jpg',
    petName: '岚鸟',
    petKey: 'bwiki:岚鸟（本来的样子）',
    level: 47,
    natureLabel: '开朗',
    traitName: '顺风',
    skills: ['水刃', '闪击', '先发制人', '龙卷风'],
  },
  {
    id: 'holy-sword-x',
    teamId: 'snow-shadow-sword',
    sourceImage: 'patch1.jpg',
    petName: '圣剑-X',
    petKey: 'bwiki:圣剑-X',
    level: 50,
    natureLabel: '踏实',
    traitName: '正位宝剑',
    skills: ['鸣沙陷阱', '啮合传递', '齿轮扭矩', '主轴'],
  },
  {
    id: 'annihilation-bone-dragon',
    teamId: 'snow-shadow-sword',
    sourceImage: 'patch1.jpg',
    petName: '寂灭骨龙',
    petKey: 'bwiki:寂灭骨龙',
    level: 50,
    natureLabel: '平和',
    traitName: '不朽',
    bloodlineName: '火系血脉',
    skills: ['隼鳞', '偷袭', '吓退', '降灵'],
  },
  {
    id: 'giant-devourer-echidna',
    teamId: 'team-4',
    sourceImage: 'patch2.jpg',
    petName: '巨噬针鼹',
    petKey: 'bwiki:巨噬针鼹',
    natureLabel: '物攻↑ 物防↓',
    nature: {
      increased: 'physicalAttack',
      decreased: 'physicalDefense',
    },
    individualFocus: ['physicalAttack', 'health', 'magicDefense'],
    skills: ['力量增效', '冰爪', '吞噬', '地刺'],
  },
  {
    id: 'gallery-iron-beast',
    teamId: 'team-4',
    sourceImage: 'patch2.jpg',
    petName: '画间沉铁兽',
    petKey: 'bwiki:画间沉铁兽',
    natureLabel: '速度↑ 生命↓',
    nature: {
      increased: 'speed',
      decreased: 'health',
    },
    individualFocus: ['physicalAttack', 'magicAttack', 'speed'],
    skills: ['先发制人', '力量增效', '截拳', '回旋踢'],
  },
  {
    id: 'book-prism-rock',
    teamId: 'team-4',
    sourceImage: 'patch2.jpg',
    petName: '布克棱岩',
    petKey: 'bwiki:布克棱岩',
    natureLabel: '物攻↑ 物防↓',
    nature: {
      increased: 'physicalAttack',
      decreased: 'physicalDefense',
    },
    individualFocus: ['physicalAttack', 'physicalDefense', 'magicDefense'],
    skills: ['地刺', '硬化', '沙涌', '遁地'],
  },
  {
    id: 'dust-eating-fuzz',
    teamId: 'team-4',
    sourceImage: 'patch2.jpg',
    petName: '食尘短绒',
    sourceName: '食尘短蚁',
    petKey: 'bwiki:食尘短绒',
    natureLabel: '物攻↑ 魔攻↓',
    nature: {
      increased: 'physicalAttack',
      decreased: 'magicAttack',
    },
    individualFocus: ['magicDefense', 'speed'],
    skills: ['尾后针', '沙涌', '地刺', '遁地'],
  },
  {
    id: 'sonic-tita',
    teamId: 'team-4',
    sourceImage: 'patch2.jpg',
    petName: '声波缇塔',
    petKey: 'bwiki:声波缇塔',
    natureLabel: '物攻↑ 物防↓',
    nature: {
      increased: 'physicalAttack',
      decreased: 'physicalDefense',
    },
    individualFocus: ['physicalAttack', 'health', 'speed'],
    skills: ['轴承支撑', '齿轮扭矩', '地刺', '啮合传递'],
  },
  {
    id: 'chess-queen',
    teamId: 'team-4',
    sourceImage: 'patch2.jpg',
    petName: '棋绮后',
    petKey: 'bwiki:棋绮后（白子）',
    natureLabel: '生命↑ 魔攻↓',
    nature: {
      increased: 'health',
      decreased: 'magicAttack',
    },
    individualFocus: ['physicalDefense', 'health', 'magicDefense'],
    skills: ['鸣沙陷阱', '影袭', '听桥', '破绽'],
  },
  {
    id: 'emerald-lady',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '翠顶夫人',
    petKey: 'bwiki:翠顶夫人',
    bloodlineName: '恶系血脉',
    skills: ['水刃', '力量增效', '水环', '飞羽'],
  },
  {
    id: 'royal-griffin',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '皇家狮鹫',
    petKey: 'bwiki:皇家狮鹫（崖间地的样子）',
    bloodlineName: '翼系血脉',
    skills: ['羽化加速', '疾风刺', '有效预防', '光之矛'],
  },
  {
    id: 'phantom-mushroom',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '幻影灵菇',
    petKey: 'bwiki:幻影灵菇',
    bloodlineName: '幽系血脉',
    skills: ['抽枝', '惊吓盒子', '藤绞', '报复'],
  },
  {
    id: 'light-lantern-fish',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '利灯鱼',
    petKey: 'bwiki:利灯鱼',
    bloodlineName: '水系血脉',
    skills: ['水光冲击', '落雷', '加大功率', '打湿'],
  },
  {
    id: 'sharp-beak-fox-fairy',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '尖嘴狐仙',
    petKey: 'bwiki:尖嘴狐仙',
    bloodlineName: '冰系血脉',
    skills: ['火焰护盾', '暴风雪', '焚烧烙印', '高温回火'],
  },
  {
    id: 'dream-yoyo',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '梦悠悠',
    petKey: 'bwiki:梦悠悠（穿旧睡衣的样子）',
    bloodlineName: '幽系血脉',
    skills: ['勾魂', '灵媒', '操控', '背袭'],
  },
  {
    id: 'trampoline-squirrel',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '蹦床松鼠',
    petKey: 'bwiki:蹦床松鼠',
    bloodlineName: '普通系血脉',
    skills: ['吓退', '音波弹', '热身运动', '休息回复'],
  },
  {
    id: 'fallen-star-rabbit',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '落陨星兔',
    petKey: 'bwiki:落陨星兔',
    bloodlineName: '恶系血脉',
    skills: ['嗜痛', '嘲弄', '大爆炸', '恐吓'],
  },
  {
    id: 'memory-stone',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '记忆石',
    petKey: 'bwiki:记忆石',
    bloodlineName: '地系血脉',
    skills: ['光合作用', '顶端优势', '防御', '跺地'],
  },
  {
    id: 'butterfly',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '化蝶',
    petKey: 'bwiki:化蝶（平常的样子）',
    bloodlineName: '毒系血脉',
    skills: ['食腐', '晒太阳', '破罐破摔', '毒孢子'],
  },
  {
    id: 'platinum-unicorn',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '白金独角兽',
    petKey: 'bwiki:白金独角兽',
    bloodlineName: '首领血脉',
    skills: ['折射', '气泡', '追打', '回旋风暴'],
  },
  {
    id: 'shuo-night-eve',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '朔夜伊芙',
    petKey: 'bwiki:朔夜伊芙',
    bloodlineName: '翼系血脉',
    skills: ['撕咬', '羽化加速', '缠丝劲', '有效预防'],
  },
  {
    id: 'black-cat-wizard',
    teamId: 'manual-pvp-builds',
    sourceImage: 'user-message',
    petName: '黑猫巫师',
    petKey: 'bwiki:黑猫巫师',
    bloodlineName: '首领血脉',
    skills: ['嗜痛', '羽化加速', '乱打', '午夜噪音'],
  },
]

export const pvpSkillNames = [
  ...new Set(pvpPetEntries.flatMap((entry) => entry.skills)),
]

export function findPvpPetEntry(value: string) {
  return pvpPetEntries.find(
    (entry) =>
      entry.id === value ||
      entry.petKey === value ||
      entry.petName === value ||
      entry.sourceName === value,
  )
}

export function createPvpCombatantInput(
  value: string | PvpPetEntry,
  pets: readonly Pet[],
): BattleCombatantInput {
  const entry = resolvePvpPetEntry(value)

  return {
    pet: createPvpPetSnapshot(entry, pets),
    level: entry.level,
    bloodlineName: entry.bloodlineName ?? null,
    nature: entry.nature ?? null,
  }
}

export function getPvpTeamEntries(teamId: PvpTeamId) {
  return pvpPetEntries.filter((entry) => entry.teamId === teamId)
}

export function createPvpTeamCombatantInputs(
  teamId: PvpTeamId,
  pets: readonly Pet[],
  teamSize = 6,
) {
  const entries = getPvpTeamEntries(teamId).slice(0, teamSize)
  if (entries.length !== teamSize) {
    throw new Error(
      `PVP team ${teamId} has ${entries.length} entries, expected ${teamSize}`,
    )
  }

  return entries.map((entry) => createPvpCombatantInput(entry, pets))
}

export function createPvpDexData(data: DexDataBundle): DexDataBundle {
  return {
    ...data,
    pets: [
      ...data.pets,
      ...pvpPetEntries.map((entry) => createPvpPetSnapshot(entry, data.pets)),
    ],
  }
}

export function createPvpPetSnapshot(
  value: string | PvpPetEntry,
  pets: readonly Pet[],
): Pet {
  const entry = resolvePvpPetEntry(value)
  const pet = findBasePet(entry, pets)

  return {
    ...pet,
    key: `pvp:${entry.id}`,
    title: `${pet.title} PVP`,
    traitName: entry.traitName ?? pet.traitName,
    skills: entry.skills.map((name) => ({
      name,
      level: null,
    })),
    bloodlineSkills: [],
    learnableSkillStones: [],
    taskSkillStones: [],
  }
}

export function validatePvpDatabase(
  data: Pick<DexDataBundle, 'pets' | 'skills'>,
): PvpDatabaseValidation {
  const petKeys = new Set(data.pets.map((pet) => pet.key))
  const skillNames = new Set(data.skills.map((skill) => skill.name))
  const seenIds = new Set<string>()
  const duplicateIds = new Set<string>()
  const missingPetKeys = new Set<string>()
  const missingSkills = new Set<string>()

  for (const entry of pvpPetEntries) {
    if (seenIds.has(entry.id)) duplicateIds.add(entry.id)
    seenIds.add(entry.id)

    if (!petKeys.has(entry.petKey)) missingPetKeys.add(entry.petKey)

    for (const skillName of entry.skills) {
      if (!skillNames.has(skillName)) missingSkills.add(skillName)
    }
  }

  return {
    duplicateIds: [...duplicateIds],
    missingPetKeys: [...missingPetKeys],
    missingSkills: [...missingSkills],
  }
}

function resolvePvpPetEntry(value: string | PvpPetEntry) {
  if (typeof value !== 'string') return value

  const entry = findPvpPetEntry(value)
  if (!entry) throw new Error(`PVP pet entry not found: ${value}`)
  return entry
}

function findBasePet(entry: PvpPetEntry, pets: readonly Pet[]) {
  const pet = pets.find((item) => item.key === entry.petKey)
  if (!pet) {
    throw new Error(`PVP base pet not found: ${entry.petName} (${entry.petKey})`)
  }
  return pet
}
