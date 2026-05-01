# RocoFight 6v6 落地说明

记录日期：2026-04-28

## 当前状态

RocoFight 已从单只 active 对战扩展出 6v6 队伍战 wrapper。核心 1v1 引擎继续负责技能、伤害、能量消耗、应对、状态、特性和回合末效果；6v6 wrapper 负责队伍结构、active slot、切换、聚能、KO 后继续战斗和整队胜负。

入口文件：

```text
src/rocofight/team.ts
```

测试文件：

```text
src/rocofight/team.test.ts
src/rocofight/teamReplay.test.ts
```

## 状态结构

6v6 状态使用 `TeamBattleState`：

```text
turn
phase
rules
teams.player.activeSlot
teams.player.combatants[6]
teams.opponent.activeSlot
teams.opponent.combatants[6]
winner
log
```

每个队伍必须正好 6 只精灵。当前 PVP 数据已有两套可直接创建 6v6 的队伍：

```text
snow-shadow-sword
team-4
```

创建方式：

```ts
createTeamBattleState({
  player: createPvpTeamCombatantInputs('snow-shadow-sword', defaultDexData.pets),
  opponent: createPvpTeamCombatantInputs('team-4', defaultDexData.pets),
})
```

## 动作

`TeamBattleAction` 支持：

```text
skill:  使用当前 active 的技能，可按 skillName 或 skillSlot 指定
focus:  聚能，当前实现为 +3 能量
switch: 切换到指定队伍 slot
wait:   等待
```

MaskPPO 固定动作空间仍为：

```text
0-3: 当前 active 的 4 个技能槽
4: 聚能
5-9: 当前可切换队友，按队伍 slot 顺序压缩到 5 个动作
```

相关接口：

```ts
getTeamBattleActionMask(state, context, side)
decodeTeamBattleAction(state, side, actionIndex)
isTeamBattleActionLegal(state, context, action)
chooseFirstLegalTeamAction(state, context, side, preferredSkillNames)
```

## 回合推进

入口：

```ts
advanceTeamBattleTurn(state, context, actions)
```

当前回合顺序：

1. 校验双方动作。
2. 先执行合法切换。
3. 执行聚能。
4. 主动切换登场的精灵若有合法迅捷技能，则生成本回合迅捷技能动作。
5. 将双方当前 active 投入 1v1 引擎结算技能、应对、伤害和回合末效果。
6. 把 active 结果写回各自队伍。
7. 如果 active 倒下且队伍还有存活成员，根据 `replacementMode` 处理换入。
8. 如果一方 6 只全部倒下，战斗结束。

`replacementMode` 有两种：

- `auto`：默认模式，KO 后自动强制换上第一个存活队友，兼容早期 demo 和 smoke 测试。
- `pending`：官方复现模式，KO 后记录 `switch_pending`，保留倒下的 active slot，并在下一次决策中只开放换人动作。pending 换入阶段只处理待换入方的 switch，不执行非待换入方的技能或聚能，避免对手在替补选择阶段白打一手。

技能效果里的“自己脱离”也会在 6v6 中触发换人。当前实现为确定性换上第一个存活队友，并记录 `forced_switch`，`reason = skill_switch_out`。`加大功率` 这类“替换入场精灵回复能量”的效果会作用到新上场精灵。

## 迅捷

迅捷是主动切换登场时触发的技能机制。它不是切换瞬间立即结算，而是在切换完成后生成一个本回合技能动作，再和对方动作一起走正常优先级、应对和速度排序。

当前实现规则：

- 只有主动 `switch` 触发迅捷。
- KO 后的 `forced_switch` 不触发迅捷。
- 新登场精灵按技能槽顺序寻找第一个合法迅捷技能。
- 若能量不足或技能不合法，则跳过该迅捷技能。
- 触发时先记录 `swift_triggered`，真正出手仍表现为后续 `skill_used`。

当前迅捷来源：

- 技能效果文本自带 `迅捷`，但排除 `疾风连袭` 这种描述“释放迅捷技能”的技能。
- `快锤`：能耗小于 3 的技能获得迅捷。
- `暴食`：龙系技能获得迅捷。
- `翼轴`：1 号位技能获得迅捷。
- `飓风`：若队内其他翼系精灵携带相同技能，则该技能获得迅捷。
- `起飞加速`：本场战斗首次使用的技能会被记录，后续主动切换登场时该技能获得迅捷。

## 技能位置与传动

精灵的 `skillSlots` 现在是战斗中的可变状态，不再只是初始配招顺序。槽位相关效果会在技能结算前读取当前槽位，随后再处理传动。

当前实现规则：

- `钢铁洪流` 自带传动 2。
- `啮合传递`、`轴承支撑` 自带传动 1。
- `翼轴` 使 1 号位技能获得传动 1。
- `向心力` 使 1、2 号位技能获得传动 1，并保留已有威力 +30。
- `主轴` 固定位置，不参与其他技能传动造成的槽位移动。
- `齿轮扭矩` 的位置发生变化时，永久获得本技能威力 +20。
- `啮合传递` 在 1 或 3 号位使用时，会在传动前先获得物攻 +60%。

## 印记

层数类效果已经从普通 `status` 拆出为 `marks`，避免把印记、控制状态、天气/场地类状态混在同一个容器里。

当前印记类型：

- `poison`
- `burn`
- `freeze`
- `spirit`
- `wet`
- `photosynthesis`

印记获得记录为 `mark_applied`，回合末层数伤害记录为 `mark_damage`。`食腐`、`倾泻`、`焚烧烙印` 这类清除效果会清理目标印记，并按清除层数结算后续收益。

## 入场效果

6v6 wrapper 现在会在初始登场、主动切换、强制换入、pending replacement 换入和技能脱离换入后调用入场 hook。

当前实现：

- `落雷`：携带者每次入场时，本技能永久获得威力 +20。初始 active 也会在 `battle_start` 时获得一次。

## 训练观察

`encodeTeamBattleObservation(state, side)` 当前输出 63 维：

```text
己方 6 slots * 5 features
对方 6 slots * 5 features
己方 activeSlot
对方 activeSlot
turn ratio
```

每个 slot 的 5 个 features：

```text
alive
hp ratio
energy ratio
is active
speed / 500
```

action mask 单独通过 `getTeamBattleActionMask` 获取，不混入 observation。

## 已验证行为

测试覆盖：

- 从 PVP 队伍创建 6v6 战斗。
- 固定 10 动作 mask。
- MaskPPO 动作编号解码。
- 主动切换 active。
- 主动切换登场触发迅捷，但迅捷技能仍按速度流程出手。
- `起飞加速` 记录首次使用技能，并在再次主动入场时触发迅捷。
- 传动会改变技能槽位，且 `齿轮扭矩` 会在位置变化时累积威力。
- 中毒/灼烧/冻结等层数效果进入 `marks`，并通过 `mark_damage` 结算回合末伤害。
- `落雷` 按入场次数永久累积本技能威力。
- 技能脱离触发 6v6 换人，且替换入场收益作用到新 active。
- active 被击败后战斗继续，并强制换上队友。
- `replacementMode: 'pending'` 下，active 被击败后只开放换人 mask，并由玩家选择替补。
- 六只全部倒下后才结束战斗。
- 聚能动作和 63 维 observation。
- 6v6 action-index replay 完整跑到胜负。
- replay 每回合记录 action mask、动作合法性、双方队伍快照和新增事件。
- 被 mask 的非法动作会被记录为 invalid，不会进入战斗结算。

## 对局复现

入口文件：

```text
src/rocofight/teamReplay.ts
```

核心接口：

```ts
runTeamReplay(data, replay)
validateTeamReplay(data, replay)
formatTeamReplayTrace(result)
```

replay 支持两种队伍来源：

```ts
playerTeam: { pvpTeamId: 'snow-shadow-sword' }
opponentTeam: { pvpTeamId: 'team-4' }
```

或手工列出 6 只精灵：

```ts
playerTeam: {
  combatants: [
    { pet: '迪莫' },
    // ...正好 6 只
  ],
}
```

每回合动作可以直接写语义动作：

```ts
{ player: { type: 'skill', skillSlot: 3 }, opponent: { type: 'wait' } }
```

也可以写 MaskPPO 的 action index：

```ts
{ player: { actionIndex: 3 }, opponent: { actionIndex: 4 } }
```

action index 回放会先读取当回合 mask。若动作被 mask 屏蔽，复现器会：

- 将 `selectedActionValid` 记为 `false`。
- 记录 `invalidReason`。
- 不执行该非法动作，改为 wait。
- 增加 `invalidActionCount`，供 `validateTeamReplay` 断言。

当前完整 6v6 fixture：

```text
snow-shadow-sword vs team-4
雪影娃娃使用 actionIndex=3 暴风雪
能量不足时使用 actionIndex=4 聚能
击败对方 6 个 slot 后 player 胜利
invalidActionCount = 0
```

这条 fixture 验证的是复现链路本身：mask、action index 解码、技能执行、KO、强制换人、整队失败和最终战报。

验证命令：

```powershell
npm.cmd run test
npm.cmd run build
npm.cmd run lint
```

当前结果：

```text
test: 8 files, 67 passed
build: passed
lint: passed
```

## 下一步

6v6 已经可以作为引擎层落地点。后续优先级：

1. 把 Python `RocoFightMaskablePPOEnv` 的内部 smoke 规则替换为调用 `TeamBattleState`。
2. 官方 fixture 和对拍 replay 默认使用 `replacementMode: 'pending'`。
3. 让 MaskPPO rollout 直接导出 `TeamReplayScenario` 或 `TeamReplayRunResult`。
4. 再升级为 PettingZoo 双玩家环境与 self-play。
