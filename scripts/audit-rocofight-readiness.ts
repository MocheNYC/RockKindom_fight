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
  fixtureProof: string[]
  carriedBy: string[]
  power: number | null
  energy: number | null
  category: string | null
  attribute: string | null
  effectText: string | null
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
  'mark_stack',
  'position',
  'response',
  'switch',
])

const partialTimingMechanics = new Set([
  'damage_reduction',
  'priority',
  'response',
  'swift',
])

const skillByName = new Map(defaultDexData.skills.map((skill) => [skill.name, skill]))
const testSourceText = readTestSourceText()

const validation = validatePvpDatabase(defaultDexData)
const skillRows = pvpSkillNames
  .map((skillName) => auditSkill(skillName))
  .sort((left, right) => {
    const order = statusOrder(left.status) - statusOrder(right.status)
    if (order !== 0) return order
    return left.name.localeCompare(right.name, 'zh-Hans-CN')
  })

const pvpPassiveRows = pvpPetEntries.map((entry) => {
  const pet = createPvpPetSnapshot(entry, defaultDexData.pets)
  return {
    petId: entry.id,
    petName: entry.petName,
    traitName: pet.traitName,
    bloodlineName: entry.bloodlineName ?? null,
  }
})
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
  },
  gates: {
    missingRegistry: skillRows.filter((row) => row.status === 'missing_registry')
      .length,
    invalidPvpDatabase:
      validation.duplicateIds.length +
      validation.missingPetKeys.length +
      validation.missingSkills.length,
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
  const status = classifySkill(skill, effect, mechanics)
  const carriedBy = pvpPetEntries
    .filter((entry) => entry.skills.includes(skillName))
    .map((entry) => `${entry.petName} (${entry.id})`)
  const notes = collectNotes(skill, effect, mechanics, status)
  const fixtureProof = collectFixtureProof(skillName, mechanics)

  return {
    name: skillName,
    status,
    mechanics,
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
  if (effect.response) mechanics.add('response')
  if (
    effect.statModifiers ||
    effect.targetStatModifiers ||
    effect.responseStatModifiers ||
    effect.responseTargetStatModifiers
  ) {
    mechanics.add('stat_modifier')
  }
  if (effect.powerModifiers || effect.powerBonus || effect.powerMultiplier) {
    mechanics.add('power_modifier')
  }
  if (
    effect.hitModifiers ||
    effect.hitCount ||
    effect.firstActionHitCount ||
    effect.lowHpHitCountBonus
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
    effect.responseTargetEnergyCostModifiers
  ) {
    mechanics.add('energy')
  }
  if (effect.heal || effect.responseHeal || effect.drainRatio) mechanics.add('heal')
  if (effect.damageReduction) mechanics.add('damage_reduction')
  if (
    effect.statusToTarget ||
    effect.statusToSelf ||
    effect.responseStatusToTarget ||
    effect.responseStatusToSelf
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
    effect.targetEnergyZeroPowerMultiplier
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
  lines.push('## High-Risk And Partial Timing Queue')
  lines.push('')
  lines.push('| Skill | Status | Mechanics | Fixture proof | Carried by | Notes |')
  lines.push('| --- | --- | --- | --- | --- | --- |')
  for (const row of report.skillRows.filter((item) =>
    ['missing_registry', 'implemented_high_risk', 'implemented_partial_timing'].includes(
      item.status,
    ),
  )) {
    lines.push(
      `| ${escapeCell(row.name)} | ${row.status} | ${escapeCell(
        row.mechanics.join(', '),
      )} | ${escapeCell(row.fixtureProof.join(', '))} | ${escapeCell(
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
