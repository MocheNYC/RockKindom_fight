# RocoFight MaskPPO 工作流

记录日期：2026-04-28

## 目标

把 RocoFight 从规则复现推进到可训练的 6v6 强化学习环境。当前优先目标不是直接追求强策略，而是把 MaskablePPO 的工程链路落地：

- 固定动作空间：`Discrete(10)`。
- 每回合最多 10 个合法动作：4 个技能、1 个聚能、5 个切换。
- 任何能量不足、精灵倒下、目标切换非法的动作都必须由 action mask 屏蔽。
- 训练、评估、模型保存、模型加载、rollout 战报都能跑通。

## 动作语义

固定动作映射如下：

```text
0-3: 当前场上精灵的 4 个技能槽
4: 聚能 / 回复能量
5-9: 切换到仍存活且非当前场上精灵的队友，按队伍 slot 顺序压缩到 5 个动作
```

这个版本采用用户指定的 10 动作空间。切换动作是“第 N 个可切换队友”，不是固定切到 slot N；因此后续训练、回放和 UI 必须始终保存当回合的 switch target 映射，避免动作编号脱离上下文。

## Mask 规则

技能动作合法条件：

- 当前精灵存活。
- 技能槽存在。
- 当前能量大于等于技能能量消耗。
- 没有被特性、状态或回合规则禁止。

聚能动作合法条件：

- 当前精灵存活。
- 默认能量未满时合法；如后续规则需要，也可以配置为永远合法。

切换动作合法条件：

- 队友存活。
- 目标不是当前场上精灵。
- 队伍按 slot 顺序列出最多 5 个目标，对应动作 `5-9`。
- 当前精灵倒下时，只允许切换动作。

## 已落地内容

### RocoFight 引擎侧

新增引擎合法动作接口：

- `isSkillActionLegal(state, context, side, skillName)`
- `getLegalSkillActions(state, context, side)`
- `chooseFirstLegalSkillAction(state, context, side, preferredSkillNames)`

这些接口解决了“能量不足仍尝试释放技能”的问题，后续 AI、脚本对手、UI、回放都应通过它们取动作，而不是直接构造技能动作。

新增 MaskPPO 适配层：

- `maskPpoActionCount = 10`
- `decodeMaskPpoAction(actionIndex, activeSlot, team)`
- `getMaskPpoActionMask(input)`
- `getMaskPpoSwitchTargets(activeSlot, team)`
- `encodeMaskPpoObservation(input)`

当前 TypeScript 侧 compact observation 是 29 维：6 个队伍槽位摘要、当前 active slot、10 维 action mask。完整训练环境后续会扩展为双方队伍、技能摘要、状态、血脉、特性和上回合动作。

### Python MaskablePPO smoke 环境

位置：

```text
G:\DRL\pettingzoo_demo\train_rocofight_maskable_ppo.py
```

环境：

```text
RocoFightMaskablePPOEnv
action_space = Discrete(10)
observation_dim = 63
```

它使用 6v6 固定队伍、简化伤害公式、能量、换人、击败、聚能和 scripted opponent，作用是验证 MaskablePPO 链路：

- `action_masks()` 能被 SB3-Contrib 读取。
- `MaskablePPO.predict(..., action_masks=mask)` 不会选择非法动作。
- 模型可以训练、保存、加载、评估。
- rollout 能记录每步动作、合法动作数量、奖励、双方 active、事件列表。

## 训练命令

从 `G:\DRL` 运行：

```powershell
.\.venv\Scripts\python.exe .\pettingzoo_demo\train_rocofight_maskable_ppo.py
```

短步数 smoke：

```powershell
.\.venv\Scripts\python.exe .\pettingzoo_demo\train_rocofight_maskable_ppo.py --total-timesteps 256 --eval-every 128 --eval-episodes 2 --n-steps 64 --batch-size 32 --max-turns 80 --output-dir .\pettingzoo_demo\outputs\rocofight_maskppo_smoke
```

输出：

```text
rocofight_maskppo_history.csv
rocofight_maskppo_curve.png
rocofight_maskppo_model.zip
rocofight_maskppo_rollout.json
rocofight_maskppo_summary.json
```

## 验收标准

当前 MaskPPO 落地必须同时满足：

- TypeScript 单测通过。
- TypeScript build 通过。
- ESLint 通过。
- Python 脚本 `py_compile` 通过。
- smoke 训练完成并写出全部输出文件。
- summary 中 `final_rollout_invalid_selected = 0`。
- rollout 中每步 `selected_action_valid = true`。

本次验证结果：

```text
npm run test: 6 files, 48 passed
npm run build: passed
npm run lint: passed
py_compile train_rocofight_maskable_ppo.py: passed
smoke total_timesteps=256: final_rollout_invalid_selected=0
```

## 后续阶段

阶段 1：当前已完成。

用 Python smoke 环境证明 MaskablePPO、action mask、训练输出、模型加载和 rollout 全链路可用。

阶段 2：6v6 引擎层落地。

当前已新增 `src/rocofight/team.ts`，提供 `TeamBattleState`、10 动作 mask、动作解码、主动切换、聚能、KO 后继续战斗和整队胜负。`src/rocofight/teamReplay.ts` 已提供 6v6 action-index replay、逐回合快照、mask 合法性记录和期望校验。详见 `docs/ROCOFIGHT_6V6.md`。

阶段 3：完整 Python 训练桥接。

把 Python smoke 环境替换为真实 RocoFight 规则来源。推荐两种路线：

- Node 子进程/HTTP bridge 调 TypeScript 引擎，Python 环境只负责 Gymnasium/PettingZoo 包装。
- 将稳定规则导出为 JSON，再在 Python 侧实现轻量同步模拟器。

阶段 4：PettingZoo 双玩家环境。

建立 `player_0` 和 `player_1` 的 AEC 或 Parallel 环境，保留相同 `Discrete(10)` 动作语义，并为双方都提供 action mask。

阶段 5：训练策略升级。

从 scripted opponent 过渡到 opponent pool，混合随机、规则、历史模型和当前模型 self-play。训练指标从平均回报扩展为胜率、击败数、非法动作率、回合数、对局 replay 质量。

阶段 6：对战复现闭环。

把训练 rollout 和 RocoFight replay 统一成同一套战报格式，前端可以直接展示 6v6 对局记录，用于检查技能、特性、先制、应对和换人决策是否符合预期。
