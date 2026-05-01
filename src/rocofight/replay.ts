import type { DexDataBundle, Pet } from '../types'
import { advanceTurn, createBattleContext, createBattleState } from './engine'
import type {
  BattleAction,
  BattleLogEvent,
  BattleNature,
  BattleRuleOverrides,
  BattleSide,
  BattleState,
} from './types'

export type ReplayCombatantSetup = {
  pet: string
  level?: number
  nature?: BattleNature | null
  hp?: number
  energy?: number
}

export type ReplayTurn = {
  player: BattleAction
  opponent: BattleAction
}

export type ReplayLogExpectation = Partial<
  Pick<
    BattleLogEvent,
    | 'type'
    | 'side'
    | 'target'
    | 'skillName'
    | 'reason'
    | 'effectName'
    | 'status'
    | 'winner'
  >
>

export type ReplayExpectation = {
  winner?: BattleSide | null
  phase?: BattleState['phase']
  turn?: number
  hp?: Partial<Record<BattleSide, number>>
  minHp?: Partial<Record<BattleSide, number>>
  maxHp?: Partial<Record<BattleSide, number>>
  energy?: Partial<Record<BattleSide, number>>
  logIncludes?: ReplayLogExpectation[]
}

export type ReplayScenario = {
  name: string
  player: ReplayCombatantSetup
  opponent: ReplayCombatantSetup
  rules?: BattleRuleOverrides
  turns: ReplayTurn[]
  expect?: ReplayExpectation
}

export type ReplayValidationResult = {
  replayName: string
  passed: boolean
  failures: string[]
  state: BattleState
}

export function runReplay(
  data: DexDataBundle,
  replay: ReplayScenario,
): BattleState {
  const context = createBattleContext(data)
  let state = createBattleState({
    player: {
      pet: findReplayPet(data.pets, replay.player.pet),
      level: replay.player.level,
      nature: replay.player.nature,
    },
    opponent: {
      pet: findReplayPet(data.pets, replay.opponent.pet),
      level: replay.opponent.level,
      nature: replay.opponent.nature,
    },
    rules: replay.rules,
  })

  state = applyReplayCombatantSetup(state, 'player', replay.player)
  state = applyReplayCombatantSetup(state, 'opponent', replay.opponent)

  for (const turn of replay.turns) {
    if (state.phase === 'ended') break
    state = advanceTurn(state, context, [turn.player, turn.opponent])
  }

  return state
}

export function validateReplay(
  data: DexDataBundle,
  replay: ReplayScenario,
): ReplayValidationResult {
  const state = runReplay(data, replay)
  const failures = replay.expect ? collectExpectationFailures(state, replay.expect) : []

  return {
    replayName: replay.name,
    passed: failures.length === 0,
    failures,
    state,
  }
}

function findReplayPet(pets: Pet[], value: string) {
  const pet = pets.find(
    (entry) =>
      entry.key === value ||
      entry.nameZh === value ||
      entry.nameEn === value ||
      entry.id === value,
  )

  if (!pet) throw new Error(`Replay pet not found: ${value}`)
  return pet
}

function applyReplayCombatantSetup(
  state: BattleState,
  side: BattleSide,
  setup: ReplayCombatantSetup,
) {
  const nextState = cloneReplayState(state)
  const combatant = nextState.combatants[side]

  if (setup.hp !== undefined) {
    combatant.currentHp = Math.min(combatant.maxHp, Math.max(0, setup.hp))
  }
  if (setup.energy !== undefined) {
    combatant.energy = Math.min(
      combatant.maxEnergy,
      Math.max(0, setup.energy),
    )
  }

  return nextState
}

function collectExpectationFailures(
  state: BattleState,
  expectation: ReplayExpectation,
) {
  const failures: string[] = []

  if (expectation.winner !== undefined && state.winner !== expectation.winner) {
    failures.push(`winner expected ${expectation.winner}, got ${state.winner}`)
  }
  if (expectation.phase !== undefined && state.phase !== expectation.phase) {
    failures.push(`phase expected ${expectation.phase}, got ${state.phase}`)
  }
  if (expectation.turn !== undefined && state.turn !== expectation.turn) {
    failures.push(`turn expected ${expectation.turn}, got ${state.turn}`)
  }

  collectSideNumberFailures(failures, state, expectation.hp, 'hp', 'equal')
  collectSideNumberFailures(failures, state, expectation.minHp, 'hp', 'min')
  collectSideNumberFailures(failures, state, expectation.maxHp, 'hp', 'max')
  collectSideNumberFailures(
    failures,
    state,
    expectation.energy,
    'energy',
    'equal',
  )

  for (const logExpectation of expectation.logIncludes ?? []) {
    if (!state.log.some((event) => matchesLogExpectation(event, logExpectation))) {
      failures.push(`missing log event ${JSON.stringify(logExpectation)}`)
    }
  }

  return failures
}

function collectSideNumberFailures(
  failures: string[],
  state: BattleState,
  expectedValues: Partial<Record<BattleSide, number>> | undefined,
  field: 'hp' | 'energy',
  mode: 'equal' | 'min' | 'max',
) {
  for (const [side, expectedValue] of Object.entries(expectedValues ?? {}) as [
    BattleSide,
    number,
  ][]) {
    const actualValue =
      field === 'hp'
        ? state.combatants[side].currentHp
        : state.combatants[side].energy
    const passed =
      mode === 'equal'
        ? actualValue === expectedValue
        : mode === 'min'
          ? actualValue >= expectedValue
          : actualValue <= expectedValue

    if (!passed) {
      failures.push(
        `${side}.${field} expected ${mode} ${expectedValue}, got ${actualValue}`,
      )
    }
  }
}

function matchesLogExpectation(
  event: BattleLogEvent,
  expectation: ReplayLogExpectation,
) {
  return Object.entries(expectation).every(
    ([key, value]) => event[key as keyof BattleLogEvent] === value,
  )
}

function cloneReplayState(state: BattleState): BattleState {
  return {
    ...state,
    combatants: {
      player: {
        ...state.combatants.player,
        attributes: [...state.combatants.player.attributes],
        baseStats: { ...state.combatants.player.baseStats },
        nature: state.combatants.player.nature
          ? { ...state.combatants.player.nature }
          : null,
        stats: { ...state.combatants.player.stats },
        skillSlots: [...state.combatants.player.skillSlots],
        knownSkills: [...state.combatants.player.knownSkills],
        effects: {
          statModifiers: [...state.combatants.player.effects.statModifiers],
          powerModifiers: [...state.combatants.player.effects.powerModifiers],
          hitModifiers: [...state.combatants.player.effects.hitModifiers],
          priorityModifiers: [
            ...state.combatants.player.effects.priorityModifiers,
          ],
          energyCostModifiers: [
            ...state.combatants.player.effects.energyCostModifiers,
          ],
          damageReductions: [...state.combatants.player.effects.damageReductions],
          statuses: [...state.combatants.player.effects.statuses],
          marks: [...state.combatants.player.effects.marks],
        },
      },
      opponent: {
        ...state.combatants.opponent,
        attributes: [...state.combatants.opponent.attributes],
        baseStats: { ...state.combatants.opponent.baseStats },
        nature: state.combatants.opponent.nature
          ? { ...state.combatants.opponent.nature }
          : null,
        stats: { ...state.combatants.opponent.stats },
        skillSlots: [...state.combatants.opponent.skillSlots],
        knownSkills: [...state.combatants.opponent.knownSkills],
        effects: {
          statModifiers: [...state.combatants.opponent.effects.statModifiers],
          powerModifiers: [...state.combatants.opponent.effects.powerModifiers],
          hitModifiers: [...state.combatants.opponent.effects.hitModifiers],
          priorityModifiers: [
            ...state.combatants.opponent.effects.priorityModifiers,
          ],
          energyCostModifiers: [
            ...state.combatants.opponent.effects.energyCostModifiers,
          ],
          damageReductions: [
            ...state.combatants.opponent.effects.damageReductions,
          ],
          statuses: [...state.combatants.opponent.effects.statuses],
          marks: [...state.combatants.opponent.effects.marks],
        },
      },
    },
    log: [...state.log],
  }
}
