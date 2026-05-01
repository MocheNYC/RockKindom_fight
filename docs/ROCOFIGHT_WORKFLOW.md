# RocoFight Workflow

RocoFight is developed as a deterministic battle simulation layer on top of the
RocoDex data bundle. The first goal is not to guess every live-game rule. The
first goal is to make each assumption explicit, executable, and testable.

## Workstreams

1. Data baseline
   - Reuse `DexDataBundle` from RocoDex.
   - Treat pets, skills, and attributes as read-only input.
   - Keep PVP observed builds in `src/rocofight/pvp.ts`, where each pet
     snapshot carries only its observed four skills.
   - Record missing or uncertain battle data as explicit rule gaps.

2. Battle core
   - Keep the engine pure TypeScript.
   - No React dependency in the core.
   - Every turn must be reproducible from input state, actions, and rules.
   - Return structured logs instead of relying on UI text.

3. Rule authoring
   - Start with a conservative baseline formula.
   - Add skill effects as structured rules only after each effect is understood.
   - Keep unimplemented effects visible in logs or metadata.

4. Verification
   - Unit-test every core rule.
   - Add replay fixtures when real battle examples are available.
   - Use `npm.cmd run test` and `npm.cmd run build` before packaging.

5. UI and tools
   - Build UI after the core can simulate one complete turn.
   - Keep replay import/export JSON compatible with the core state model.
   - Keep batch simulation and UI simulation on the same engine.

## Development Loop

1. Define the rule or data contract.
2. Add or update a test that describes the expected result.
3. Implement the smallest core change.
4. Run tests.
5. If the rule is inferred, document it as provisional.
6. Promote the rule to stable only after it matches trusted battle evidence.

## Validation Gates

- Core tests pass.
- Production build passes.
- No generated RocoDex data is edited by hand.
- No battle rule is hidden in UI components.
- New uncertain mechanics are documented as assumptions.

## Near-Term Milestones

1. Minimal turn engine
   - Two active combatants.
   - Level 60 stat construction from RocoDex base stats.
   - Speed order.
   - Skill energy cost.
   - Physical and magical damage.
   - Attribute multiplier.
   - Faint and winner detection.
   - Structured logs for implemented and unimplemented skill effects.
   - Response matching by opponent action kind.

2. Replay model
   - JSON action list.
   - Deterministic log output.
   - Fixture-based regression tests.
   - Programmatic replay validation in `src/rocofight/replay.ts`.

3. Skill effect registry
   - Map skill names or effect ids to executable effects.
   - Track unknown effects separately from known no-op effects.
   - Keep effect definitions declarative where possible.
   - Audit all skill text with `npm run rocofight:audit`.

4. Simulator UI
   - Team setup.
   - Skill picker.
   - Turn log.
   - State inspector for debugging rule gaps.
