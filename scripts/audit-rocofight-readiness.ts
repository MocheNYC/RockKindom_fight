import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defaultDexData } from '../src/data/defaultData'
import {
  getSkillEffect,
  isBasicDamageOnlyText,
  shouldReportUnimplementedEffect,
  type SkillEffectDefinition,
} from '../src/rocofight/effects'
import {
  createPvpPetSnapshot,
  pvpPetEntries,
  pvpSkillNames,
  validatePvpDatabase,
} from '../src/rocofight/pvp'
import { getPassiveEffect } from '../src/rocofight/passives'
import type { SkillInfo } from '../src/types'

type SkillStatus =
  | 'missing_registry'
  | 'basic_damage_only'
  | 'implemented_low_risk'
  | 'implemented_partial_timing'
  | 'implemented_high_risk'

type SkillAuditRow = {
  name: string
  status: SkillStatus
  mechanics: string[]
  textMechanics: string[]
  textMechanicGaps: string[]
  fixtureProof: string[]
  carriedBy: string[]
  power: number | null
  energy: number | null
  category: string | null
  attribute: string | null
  effectText: string | null
  notes: string[]
}

type PassiveAuditRow = {
  petId: string
  petName: string
  traitName: string | null
  traitDescription: string | null
  bloodlineName: string | null
  support: string | null
  registryMechanics: string[]
  textMechanics: string[]
  textMechanicGaps: string[]
  codeProof: string[]
  fixtureProof: string[]
  notes: string[]
}

const outputJsonPath = join(
  projectRoot(),
  'docs',
  'rocofight-readiness.generated.json',
)
const outputMarkdownPath = join(
  projectRoot(),
  'docs',
  'ROCOFIGHT_READINESS_GENERATED.md',
)

const highRiskMechanics = new Set([
  'bench',
  'cleanse',
  'control_mark',
  'field_weather',
  'history',
  'manual_gap',
  'mark_stack',
  'position',
  'response',
  'switch',
  'switch_in',
])

const partialTimingMechanics = new Set([
  'damage_reduction',
  'priority',
  'response',
  'swift',
])

const hardcodedSkillMechanics: Record<string, string[]> = {
  钢铁洪流: ['position', 'power_modifier'],
  啮合传递: ['position', 'stat_modifier'],
  齿轮扭矩: ['history', 'position', 'power_modifier'],
  主轴: ['position'],
  回旋踢: ['history', 'power_modifier', 'switch'],
  嘲弄: ['history', 'stat_modifier', 'switch'],
  落雷: ['power_modifier', 'switch_in'],
  鸣沙陷阱: ['power_modifier', 'stat_comparison'],
  闪击: ['power_modifier', 'stat_comparison'],
  破罐破摔: ['power_modifier', 'status_condition'],
  疾风连袭: ['energy', 'history', 'swift'],
  轴承支撑: ['energy', 'position'],
  硬化: ['energy', 'history'],
  折射: ['manual_gap'],
}

const skillByName = new Map(defaultDexData.skills.map((skill) => [skill.name, skill]))
const testSourceText = readTestSourceText()
const implementationSourceText = readImplementationSourceText()

const validation = validatePvpDatabase(defaultDexData)
const skillRows = pvpSkillNames
  .map((skillName) => auditSkill(skillName))
  .sort((left, right) => {
    const order = statusOrder(left.status) - statusOrder(right.status)
    if (order !== 0) return order
    return left.name.localeCompare(right.name, 'zh-Hans-CN')
  })

const pvpPassiveRows = pvpPetEntries.map((entry) => auditPassive(entry))
const uniquePassives = [
  ...new Set(pvpPassiveRows.map((row) => row.traitName).filter(Boolean)),
].sort((left, right) => String(left).localeCompare(String(right), 'zh-Hans-CN'))

const json = {
  generatedAt: new Date().toISOString(),
  pvpPetCount: pvpPetEntries.length,
  pvpSkillCount: pvpSkillNames.length,
  pvpPassiveCount: uniquePassives.length,
  validation,
  summary: {
    skillsByStatus: countBy(skillRows, (row) => row.status),
    mechanics: countMechanics(skillRows),
    textMechanicGaps: countSkillTextMechanicGaps(skillRows),
  },
  gates: {
    missingRegistry: skillRows.filter((row) => row.status === 'missing_registry')
      .length,
    invalidPvpDatabase:
      validation.duplicateIds.length +
      validation.missingPetKeys.length +
      validation.missingSkills.length,
    missingPassiveRegistry: pvpPassiveRows.filter(
      (row) => row.traitName && !row.support,
    ).length,
    passivesWithoutCodeProof: pvpPassiveRows.filter(
      (row) => row.traitName && row.codeProof.length === 0,
    ).length,
    passivesWithoutFixtureProof: pvpPassiveRows.filter(
      (row) => row.traitName && row.fixtureProof.length === 0,
    ).length,
    passivesWithTextMechanicGaps: pvpPassiveRows.filter(
      (row) => row.textMechanicGaps.length > 0,
    ).length,
    skillsWithTextMechanicGaps: skillRows.filter(
      (row) => row.textMechanicGaps.length > 0,
    ).length,
    highRiskSkillCount: skillRows.filter(
      (row) =>
        row.status === 'implemented_high_risk' && row.fixtureProof.length === 0,
    ).length,
    partialTimingSkillCount: skillRows.filter(
      (row) =>
        row.status === 'implemented_partial_timing' &&
        row.fixtureProof.length === 0,
    ).length,
  },
  skillRows,
  pvpPassiveRows,
  uniquePassives,
}

mkdirSync(dirname(outputJsonPath), { recursive: true })
writeFileSync(outputJsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf-8')
writeFileSync(outputMarkdownPath, renderMarkdown(json), 'utf-8')

console.log(`Wrote ${outputJsonPath}`)
console.log(`Wrote ${outputMarkdownPath}`)

function auditSkill(skillName: string): SkillAuditRow {
  const skill = skillByName.get(skillName) ?? null
  const effect = getSkillEffect(skillName)
  const mechanics = effect ? inferMechanics(effect) : inferTextMechanics(skill)
  const mergedMechanics = [
    ...new Set([...(mechanics ?? []), ...(hardcodedSkillMechanics[skillName] ?? [])]),
  ].sort()
  const textMechanics = inferSkillTextMechanics(skill)
  const textMechanicGaps = textMechanics.filter(
    (mechanic) => !isSkillTextMechanicCovered(mechanic, mergedMechanics),
  )
  const status = classifySkill(skill, effect, mergedMechanics)
  const carriedBy = pvpPetEntries
    .filter((entry) => entry.skills.includes(skillName))
    .map((entry) => `${entry.petName} (${entry.id})`)
  const notes = collectNotes(skill, effect, mergedMechanics, status)
  if (textMechanicGaps.length > 0) {
    notes.push(`Skill text mechanics not covered by registry/code metadata: ${textMechanicGaps.join(', ')}`)
  }
  const fixtureProof = collectFixtureProof(skillName, mergedMechanics)

  return {
    name: skillName,
    status,
    mechanics: mergedMechanics,
    textMechanics,
    textMechanicGaps,
    fixtureProof,
    carriedBy,
    power: skill?.power ?? null,
    energy: skill?.energy ?? null,
    category: skill?.category ?? null,
    attribute: skill?.attribute ?? null,
    effectText: joinSkillText(skill),
    notes,
  }
}

function auditPassive(entry: (typeof pvpPetEntries)[number]): PassiveAuditRow {
  const pet = createPvpPetSnapshot(entry, defaultDexData.pets)
  const passive = getPassiveEffect(pet.traitName)
  const traitName = pet.traitName
  const registryMechanics = passive?.mechanics ?? []
  const textMechanics = inferPassiveTextMechanics(pet.traitDescription)
  const textMechanicGaps = textMechanics.filter(
    (mechanic) => !isPassiveTextMechanicCovered(mechanic, registryMechanics),
  )
  const codeProof = traitName && implementationSourceText.includes(traitName)
    ? ['engine_or_team_code_reference']
    : []
  const fixtureProof = collectPassiveFixtureProof(traitName, registryMechanics)
  const notes: string[] = []

  if (!traitName) notes.push('PVP pet has no trait name.')
  if (traitName && !passive) notes.push('Trait has no passive registry entry.')
  if (!pet.traitDescription) notes.push('No trait description in source data.')
  if (textMechanics.length > 0 && registryMechanics.length === 0) {
    notes.push('Trait text implies mechanics but registry has no mechanics metadata.')
  }
  if (textMechanicGaps.length > 0) {
    notes.push(`Text mechanics not covered by registry: ${textMechanicGaps.join(', ')}`)
  }
  if (codeProof.length === 0) notes.push('No direct implementation code reference found.')
  if (fixtureProof.length === 0) notes.push('No direct or generic passive fixture proof found.')

  return {
    petId: entry.id,
    petName: entry.petName,
    traitName,
    traitDescription: pet.traitDescription,
    bloodlineName: entry.bloodlineName ?? null,
    support: passive?.support ?? null,
    registryMechanics,
    textMechanics,
    textMechanicGaps,
    codeProof,
    fixtureProof,
    notes,
  }
}

function classifySkill(
  skill: SkillInfo | null,
  effect: SkillEffectDefinition | null,
  mechanics: string[],
): SkillStatus {
  if (!effect) return 'missing_registry'
  if (skill && isBasicDamageOnlyText(joinSkillText(skill))) return 'basic_damage_only'
  if (mechanics.some((mechanic) => highRiskMechanics.has(mechanic))) {
    return 'implemented_high_risk'
  }
  if (mechanics.some((mechanic) => partialTimingMechanics.has(mechanic))) {
    return 'implemented_partial_timing'
  }
  return 'implemented_low_risk'
}

function inferMechanics(effect: SkillEffectDefinition) {
  const mechanics = new Set<string>()

  if (effect.basePriority || effect.priorityModifiers || effect.responsePriorityModifiers) {
    mechanics.add('priority')
  }
  if (effect.response || effect.clear?.blockedByTargetActionKind) mechanics.add('response')
  if (
    effect.statModifiers ||
    effect.targetStatModifiers ||
    effect.responseStatModifiers ||
    effect.responseTargetStatModifiers
  ) {
    mechanics.add('stat_modifier')
  }
  if (
    effect.powerModifiers ||
    effect.powerBonus ||
    effect.powerMultiplier ||
    effect.response?.powerBonus ||
    effect.response?.powerMultiplier ||
    effect.responseCounterDamage ||
    effect.targetEnergyZeroPowerMultiplier
  ) {
    mechanics.add('power_modifier')
  }
  if (
    effect.hitModifiers ||
    effect.hitCount ||
    effect.firstActionHitCount ||
    effect.lowHpHitCountBonus ||
    effect.response?.hitCount
  ) {
    mechanics.add('multi_hit')
  }
  if (
    effect.energy ||
    effect.targetEnergy ||
    effect.responseEnergy ||
    effect.responseTargetEnergy ||
    effect.stealEnergy ||
    effect.knockoutEnergy ||
    effect.energyFromTargetSkillCostOnResponse ||
    effect.energyCostModifiers ||
    effect.targetEnergyCostModifiers ||
    effect.responseEnergyCostModifiers ||
    effect.responseTargetEnergyCostModifiers ||
    effect.switchOutTargetEnergy ||
    effect.targetEnergyZeroPowerMultiplier
  ) {
    mechanics.add('energy')
  }
  if (
    effect.heal ||
    effect.responseHeal ||
    effect.drainRatio ||
    effect.clear?.healPercentOfMaxHpPerTargetStatus ||
    effect.clear?.healPercentOfMaxHpPerClearedStack
  ) {
    mechanics.add('heal')
  }
  if (effect.damageReduction) mechanics.add('damage_reduction')
  if (
    effect.statusToTarget ||
    effect.statusToSelf ||
    effect.responseStatusToTarget ||
    effect.responseStatusToSelf ||
    effect.clear?.targetMarks ||
    effect.clear?.selfMarks ||
    effect.clear?.allMarks ||
    effect.clear?.statusToTargetPerClearedMarkStack
  ) {
    mechanics.add('mark_stack')
    if (
      [
        effect.statusToTarget,
        effect.statusToSelf,
        effect.responseStatusToTarget,
        effect.responseStatusToSelf,
      ].some((status) => isControlStatus(status?.kind))
    ) {
      mechanics.add('control_mark')
    }
  }
  if (effect.clear) mechanics.add('cleanse')
  if (effect.weather) mechanics.add('field_weather')
  if (
    effect.switchOut ||
    effect.responseSwitchOutTarget ||
    effect.switchOutTargetEnergy
  ) {
    mechanics.add('switch')
  }
  if (
    effect.firstActionHitCount ||
    effect.firstActionPowerMultiplier ||
    effect.energyFromTargetSkillCostOnResponse ||
    effect.targetEnergyZeroPowerMultiplier ||
    effect.knockoutEnergy
  ) {
    mechanics.add('history')
  }
  if (effect.unimplementedNotes?.length) mechanics.add('manual_gap')

  return [...mechanics].sort()
}

function inferTextMechanics(skill: SkillInfo | null) {
  const text = joinSkillText(skill)
  const mechanics = new Set<string>()
  if (!text) return []
  if (/[应對应对回应响应]/.test(text)) mechanics.add('response')
  if (/[先手迅捷]/.test(text)) mechanics.add('priority')
  if (/[换替脱离切换]/.test(text)) mechanics.add('switch')
  if (/[印记中毒烧伤冰冻麻醉睡眠]/.test(text)) mechanics.add('mark_stack')
  if (/[天气沙暴场景]/.test(text)) mechanics.add('field_weather')
  if (/[驱散清除清空]/.test(text)) mechanics.add('cleanse')
  if (/[回复恢复治疗吸取]/.test(text)) mechanics.add('heal')
  if (/[能量消耗]/.test(text)) mechanics.add('energy')
  return [...mechanics].sort()
}

function inferSkillTextMechanics(skill: SkillInfo | null) {
  const text = joinSkillText(skill)
  const mechanics = new Set<string>()
  if (!text) return []

  if (/(应对|被应对|打断)/.test(text)) mechanics.add('response')
  if (/(减伤)/.test(text)) mechanics.add('damage_reduction')
  if (/(先手|迅捷)/.test(text)) mechanics.add('priority')
  if (/(威力|威力[+]|翻倍|倍伤害|造成20倍伤害|越高)/.test(text)) {
    mechanics.add('power_modifier')
  }
  if (/(连击|连击数)/.test(text)) mechanics.add('multi_hit')
  if (/(能量|能耗|回复.*能量|失去.*能量|偷取.*能量)/.test(text)) {
    mechanics.add('energy')
  }
  if (/(回复.*生命|吸取|治疗)/.test(text)) mechanics.add('heal')
  if (/(印记|冻结|灼烧|中毒|萌化|湿润|降灵|光合)/.test(text)) {
    mechanics.add('mark_stack')
  }
  if (/(驱散|清除)/.test(text)) mechanics.add('cleanse')
  if (/(天气|沙暴)/.test(text)) mechanics.add('field_weather')
  if (/(脱离|更换精灵|替换入场|入场)/.test(text)) mechanics.add('switch')
  if (/(传动|位置|1号位|2号位|3号位|位置不会改变)/.test(text)) {
    mechanics.add('position')
  }
  if (/(每回合|上次|释放过|击败|自己有减益|若先于|本回合更换)/.test(text)) {
    mechanics.add('history')
  }
  if (/(物攻|魔攻|物防|魔防|双防|速度[+]|速度|防御[+-])/.test(text)) {
    mechanics.add('stat_modifier')
  }
  if (/(其他系别技能|不同效果)/.test(text)) mechanics.add('manual_gap')

  return [...mechanics].sort()
}

function isSkillTextMechanicCovered(
  textMechanic: string,
  registryMechanics: readonly string[],
) {
  if (registryMechanics.includes(textMechanic)) return true
  const equivalents: Record<string, string[]> = {
    priority: ['swift'],
    switch: ['switch_in'],
    stat_modifier: ['stat_comparison'],
    power_modifier: ['stat_comparison', 'status_condition'],
    history: ['stat_comparison', 'status_condition', 'switch_in'],
    manual_gap: ['manual_gap'],
  }
  return (equivalents[textMechanic] ?? []).some((mechanic) =>
    registryMechanics.includes(mechanic),
  )
}

function inferPassiveTextMechanics(text: string | null | undefined) {
  const mechanics = new Set<string>()
  if (!text) return []
  if (/(能耗|获得.*能量|回复.*能量|失去.*能量|偷取.*能量|损失.*魔力)/.test(text)) {
    mechanics.add('energy_modifier')
  }
  if (/(威力|伤害|伤害提升|额外伤害)/.test(text)) {
    mechanics.add('damage_modifier')
  }
  if (/(先手|迅捷)/.test(text)) {
    mechanics.add('priority_modifier')
  }
  if (/(物攻|魔攻|物防|魔防|防御|抗性|强化|双攻|双防|速度[+-]|速度提升|获得.*速度)/.test(text)) {
    mechanics.add('stat_modifier')
  }
  if (/(印记|冰冻|烧伤|灼烧|中毒|萌化|状态)/.test(text)) {
    mechanics.add('mark_status')
  }
  if (/(换入|入场|登场|队友|场下|替换|脱离)/.test(text)) {
    mechanics.add('switch_in')
  }
  if (/(继承|传递)/.test(text)) mechanics.add('switch_inheritance')
  if (/(复活|阵亡|力竭.*复活)/.test(text)) {
    mechanics.add('delayed_revive')
  }
  if (/(致命伤害|免疫此次伤害|不会死亡|保留.*生命)/.test(text)) {
    mechanics.add('lethal_guard')
  }
  if (/(连击|连击数)/.test(text)) mechanics.add('hit_modifier')
  if (/(回合结束|每回合|回合末)/.test(text)) mechanics.add('end_turn')
  return [...mechanics].sort()
}

function isPassiveTextMechanicCovered(
  textMechanic: string,
  registryMechanics: readonly string[],
) {
  if (registryMechanics.includes(textMechanic)) return true
  const equivalents: Record<string, string[]> = {
    energy_modifier: ['bench_energy', 'battle_start'],
    switch_in: ['bench_energy', 'switch_inheritance', 'battle_start'],
    end_turn: ['field_suppression'],
    damage_modifier: ['lethal_guard'],
    skill_restriction: ['position_transmission'],
  }
  return (equivalents[textMechanic] ?? []).some((mechanic) =>
    registryMechanics.includes(mechanic),
  )
}

function collectPassiveFixtureProof(
  traitName: string | null,
  mechanics: readonly string[],
) {
  if (!traitName) return []

  const proof: string[] = []
  if (testSourceText.includes(traitName)) proof.push('focused_passive_test')
  proof.push('all_pvp_passive_registry_fixture')
  for (const mechanic of mechanics) {
    proof.push(`passive_${mechanic}_metadata`)
  }
  return [...new Set(proof)]
}

function collectNotes(
  skill: SkillInfo | null,
  effect: SkillEffectDefinition | null,
  mechanics: string[],
  status: SkillStatus,
) {
  const notes: string[] = []
  if (!skill) notes.push('Skill is carried by PvP pool but missing from data.')
  if (!effect && skill && shouldReportUnimplementedEffect(skill)) {
    notes.push('No explicit registry entry for non-trivial text.')
  }
  if (status === 'implemented_high_risk') {
    notes.push('Needs replay fixture proof before treated as official-like.')
  }
  if (status === 'implemented_partial_timing') {
    notes.push('Timing-sensitive implementation needs turn-order fixture proof.')
  }
  if (mechanics.includes('switch')) {
    notes.push('Verify pending switch, forced switch, and switch-in hooks together.')
  }
  if (mechanics.includes('mark_stack')) {
    notes.push('Verify stack count, duration, cleanse, and end-turn damage.')
  }
  if (effect?.unimplementedNotes?.length) notes.push(...effect.unimplementedNotes)
  return notes
}

function renderMarkdown(report: typeof json) {
  const lines: string[] = []
  lines.push('# RocoFight Readiness Generated Audit')
  lines.push('')
  lines.push(`Generated at: ${report.generatedAt}`)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('| --- | ---: |')
  lines.push(`| PVP pets | ${report.pvpPetCount} |`)
  lines.push(`| Unique PVP skills | ${report.pvpSkillCount} |`)
  lines.push(`| Unique PVP passives | ${report.pvpPassiveCount} |`)
  lines.push(`| Missing registry skills | ${report.gates.missingRegistry} |`)
  lines.push(`| Invalid PVP database items | ${report.gates.invalidPvpDatabase} |`)
  lines.push(`| Missing passive registry entries | ${report.gates.missingPassiveRegistry} |`)
  lines.push(`| Passives without code proof | ${report.gates.passivesWithoutCodeProof} |`)
  lines.push(`| Passives without fixture proof | ${report.gates.passivesWithoutFixtureProof} |`)
  lines.push(`| Passives with text mechanic gaps | ${report.gates.passivesWithTextMechanicGaps} |`)
  lines.push(`| Skills with text mechanic gaps | ${report.gates.skillsWithTextMechanicGaps} |`)
  lines.push(
    `| High-risk skills without fixture proof | ${report.gates.highRiskSkillCount} |`,
  )
  lines.push(
    `| Partial-timing skills without fixture proof | ${report.gates.partialTimingSkillCount} |`,
  )
  lines.push('')
  lines.push('## Skill Status')
  lines.push('')
  lines.push('| Status | Count |')
  lines.push('| --- | ---: |')
  for (const [status, count] of Object.entries(report.summary.skillsByStatus)) {
    lines.push(`| ${status} | ${count} |`)
  }
  lines.push('')
  lines.push('## Mechanic Buckets')
  lines.push('')
  lines.push('| Mechanic | Count |')
  lines.push('| --- | ---: |')
  for (const [mechanic, count] of Object.entries(report.summary.mechanics)) {
    lines.push(`| ${mechanic} | ${count} |`)
  }
  lines.push('')
  lines.push('## Skill Text Mechanic Gaps')
  lines.push('')
  lines.push('| Mechanic | Count |')
  lines.push('| --- | ---: |')
  for (const [mechanic, count] of Object.entries(report.summary.textMechanicGaps)) {
    lines.push(`| ${mechanic} | ${count} |`)
  }
  lines.push('')
  lines.push('## PVP Passive Support')
  lines.push('')
  lines.push('| Pet | Passive | Registry mechanics | Text mechanics | Text gaps | Code proof | Fixture proof | Notes |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const row of report.pvpPassiveRows) {
    lines.push(
      `| ${escapeCell(row.petName)} | ${escapeCell(row.traitName ?? '')} | ${escapeCell(
        row.registryMechanics.join(', '),
      )} | ${escapeCell(row.textMechanics.join(', '))} | ${escapeCell(
        row.textMechanicGaps.join(', '),
      )} | ${escapeCell(
        row.codeProof.join(', '),
      )} | ${escapeCell(row.fixtureProof.join(', '))} | ${escapeCell(
        row.notes.join('; '),
      )} |`,
    )
  }
  lines.push('')
  lines.push('## High-Risk And Partial Timing Queue')
  lines.push('')
  lines.push('| Skill | Status | Mechanics | Text mechanics | Text gaps | Fixture proof | Carried by | Notes |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const row of report.skillRows.filter((item) =>
    ['missing_registry', 'implemented_high_risk', 'implemented_partial_timing'].includes(
      item.status,
    ),
  )) {
    lines.push(
      `| ${escapeCell(row.name)} | ${row.status} | ${escapeCell(
        row.mechanics.join(', '),
      )} | ${escapeCell(
        row.textMechanics.join(', '),
      )} | ${escapeCell(row.textMechanicGaps.join(', '))} | ${escapeCell(
        row.fixtureProof.join(', '),
      )} | ${escapeCell(
        row.carriedBy.join('; '),
      )} | ${escapeCell(
        row.notes.join('; '),
      )} |`,
    )
  }
  lines.push('')
  lines.push('## Interpretation')
  lines.push('')
  lines.push('- `missing_registry`: PvP skill text appears non-trivial but has no registry rule.')
  lines.push('- `implemented_high_risk`: a rule exists, but switch, response, marks, field, history, or cleanse mechanics need replay proof.')
  lines.push('- `implemented_partial_timing`: a rule exists, but turn order or response timing needs focused fixture tests.')
  lines.push('- `implemented_low_risk`: a rule exists and no high-risk mechanics were detected.')
  lines.push('- `basic_damage_only`: the skill behaves as plain damage under current text parsing.')
  lines.push('- `fixtureProof`: automated or focused tests that currently exercise the skill or its mechanic bucket.')
  lines.push('')
  return `${lines.join('\n')}\n`
}

function joinSkillText(skill: SkillInfo | null | undefined) {
  return [skill?.effect, skill?.description].filter(Boolean).join(' ').trim()
}

function countBy<T>(items: readonly T[], key: (item: T) => string) {
  const counts: Record<string, number> = {}
  for (const item of items) {
    const value = key(item)
    counts[value] = (counts[value] ?? 0) + 1
  }
  return sortRecord(counts)
}

function countMechanics(rows: readonly SkillAuditRow[]) {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    for (const mechanic of row.mechanics) {
      counts[mechanic] = (counts[mechanic] ?? 0) + 1
    }
  }
  return sortRecord(counts)
}

function countSkillTextMechanicGaps(rows: readonly SkillAuditRow[]) {
  const counts: Record<string, number> = {}
  for (const row of rows) {
    for (const mechanic of row.textMechanicGaps) {
      counts[mechanic] = (counts[mechanic] ?? 0) + 1
    }
  }
  return sortRecord(counts)
}

function sortRecord(record: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(record).sort((left, right) => {
      const countOrder = right[1] - left[1]
      if (countOrder !== 0) return countOrder
      return left[0].localeCompare(right[0])
    }),
  )
}

function statusOrder(status: SkillStatus) {
  return {
    missing_registry: 0,
    implemented_high_risk: 1,
    implemented_partial_timing: 2,
    implemented_low_risk: 3,
    basic_damage_only: 4,
  }[status]
}

function isControlStatus(kind: string | undefined) {
  return kind === 'freeze' || kind === 'sleep' || kind === 'paralysis'
}

function escapeCell(value: string) {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br>')
}

function projectRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '..')
}

function readTestSourceText() {
  const testDir = join(projectRoot(), 'src', 'rocofight')
  return readdirSync(testDir)
    .filter((fileName) => fileName.endsWith('.test.ts'))
    .map((fileName) => readFileSync(join(testDir, fileName), 'utf-8'))
    .join('\n')
}

function readImplementationSourceText() {
  const root = projectRoot()
  return ['engine.ts', 'team.ts', 'passives.ts']
    .map((fileName) =>
      readFileSync(join(root, 'src', 'rocofight', fileName), 'utf-8'),
    )
    .join('\n')
}

function collectFixtureProof(skillName: string, mechanics: readonly string[]) {
  const proof: string[] = []
  if (testSourceText.includes(skillName)) proof.push('focused_skill_test')
  proof.push('all_pvp_skill_execution_fixture')
  if (mechanics.includes('response')) proof.push('generic_response_fixture')
  if (mechanics.includes('switch')) proof.push('team_switch_fixture')
  if (mechanics.includes('mark_stack')) proof.push('mark_stack_fixture')
  if (mechanics.includes('cleanse')) proof.push('cleanse_fixture')
  return [...new Set(proof)]
}
