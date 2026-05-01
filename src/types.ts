export type AttributeKey =
  | 'bug'
  | 'cute'
  | 'demon'
  | 'dragon'
  | 'electric'
  | 'fantasy'
  | 'fighting'
  | 'fire'
  | 'ghost'
  | 'grass'
  | 'ground'
  | 'ice'
  | 'light'
  | 'mechanical'
  | 'normal'
  | 'poison'
  | 'water'
  | 'wing'

export type Stage = 'Ⅰ阶' | 'Ⅱ阶' | '最终形态' | '独立形态' | '未知'

export type PetStats = {
  health: number
  physicalAttack: number
  magicAttack: number
  physicalDefense: number
  magicDefense: number
  speed: number
  baseStats: number
}

export type EvolutionInfo = {
  previous: string | null
  next: string | null
  level: number | null
  condition: string | null
}

export type Pet = {
  key: string
  title: string
  href: string
  id: string
  nameZh: string
  nameEn: string
  image: string
  attributes: AttributeKey[]
  formName: string
  initialName: string | null
  petType: string | null
  hasShiny: boolean
  introductionZh: string
  introductionEn: string
  traitName: string | null
  traitDescription: string | null
  height: string | null
  weight: string | null
  distributionZh: string | null
  distributionEn: string | null
  evolution: EvolutionInfo
  stage: Stage
  stats: PetStats
  dexTasks: string[]
  taskSkillStones: string[]
  skills: Array<{
    name: string
    level: number | null
  }>
  bloodlineSkills: string[]
  learnableSkillStones: string[]
  updateVersion: string | null
  pageUrl: string | null
  sourceKey: 'rocokingdom-dex' | 'bwiki-rocom'
}

export type MultiplierTable = {
  '0.5': AttributeKey[]
  '2.0': AttributeKey[]
}

export type AttributeMeta = {
  key: AttributeKey
  nameZh: string
  nameEn: string
  color: string
  textColor: string
  descriptionZh: string | null
  offense: MultiplierTable
  defense: MultiplierTable
}

export type SkillInfo = {
  name: string
  attribute: AttributeKey | null
  category: string | null
  energy: number | null
  power: number | null
  effect: string | null
  description: string | null
  version: string | null
  pageUrl: string | null
}

export type ExternalSourceInfo = {
  name: string
  url: string
  license: string
  copyright: string
  note: string
}

export type SupplementalEggMeasurement = {
  recordId: number
  diameter: string
  weight: string
}

export type SupplementalPetData = {
  petKey: string
  petId: string
  nameZh: string
  eggGroups: string[]
  eggMeasurements: SupplementalEggMeasurement[]
  canBreed: boolean | null
  hasShinySeedRoute: boolean
  evolutionChain: string[]
  rocomeggSkillCount: number | null
}

export type SupplementalSkillData = {
  skillId: string
  name: string
  learnerCount: number
  resolvedLearnerCount: number
}

export type DexSupplement = {
  source: ExternalSourceInfo
  importedAt: string
  petCount: number
  matchedPetCount: number
  eggMeasurementPetCount: number
  skillCount: number
  matchedSkillCount: number
  eggGroups: string[]
  pets: SupplementalPetData[]
  skills: SupplementalSkillData[]
}

export type DataSnapshot = {
  importedAt: string
  petCount: number
  detailCount?: number
  evolutionDetailCount?: number
  skillCount?: number
  skillDetailCount?: number
  attributeCount: number
  sourceUrl: string
  skillSourceUrl?: string
  updatePackageVersion?: number
  supplementPetCount?: number
  supplementSkillCount?: number
}

export type DexDataBundle = {
  snapshot: DataSnapshot
  pets: Pet[]
  attributes: AttributeMeta[]
  skills: SkillInfo[]
  supplement?: DexSupplement
}

export type DataSource = {
  key: Pet['sourceKey']
  name: string
  url: string
  license: string
  note: string
}
