# RocoFight 官方级模拟器路线

记录日期：2026-04-28

## 目标

目标不是“能跑一场 6v6”，而是尽量像游戏本体一样预测真实对局结果。工程验收标准必须从功能可用提升到可对拍：

- 同样队伍、面板、性格、血脉、技能和特性。
- 同样动作序列。
- 每回合出手顺序一致。
- HP、能量、状态层数、增益/减益、换人结果一致。
- 胜负一致。

如果没有官方战报或实测录像，只能达到“高保真推断”；要宣称官方级，需要持续引入官方对拍 fixture。

## 长流程

### 阶段 0：可运行基线

状态：已完成。

- 25 只 PVP 精灵数据库。
- 6v6 `TeamBattleState`。
- `Discrete(10)` action mask。
- action-index replay。
- 迅捷主动切换触发。
- 技能脱离换人初步接入。
- `replacementMode: 'pending'` 支持 KO 后由玩家选择替补。
- 技能槽位传动、`主轴` 固定、`齿轮扭矩` 位置变化加威力。
- `起飞加速` 首次使用技能记忆。
- 印记 `marks` 与普通状态 `statuses` 拆分。
- `落雷` 入场永久威力累计。

验收：

```text
npm run test
npm run build
npm run lint
npm run rocofight:readiness
```

### 阶段 1：官方准备度仪表盘

状态：已完成第一版。

入口：

```text
scripts/audit-rocofight-official-readiness.mjs
docs/ROCOFIGHT_OFFICIAL_READINESS.md
docs/rocofight-official-readiness.json
```

当前 PVP 技能状态：

```text
implemented_low_risk: 34
implemented_partial_timing: 22
implemented_high_risk: 22
missing_registry: 0
```

当前 PVP 特性状态：

```text
implemented: 18
active-battle-limited: 7
```

阶段目标：

- 每次机制迭代后刷新 readiness。
- 高风险技能必须逐个降级为 partial 或 low-risk。
- active-battle-limited 特性必须逐个迁移到 team-aware 实现。

### 阶段 2：回合时点完全化

优先处理影响胜负最大的时点：

1. 主动切换、迅捷、脱离、强制换人。
2. 应对触发和应对收益。
3. 技能使用前/命中前/伤害后/击败后/回合末。
4. 入场、离场、继承、场下收益。
5. pending switch：KO 后由玩家选择上场，而不是自动第一个存活。

验收：

- 每种时点至少有一个 6v6 replay fixture。
- replay trace 能解释每个状态变化。
- 非法动作不能进入结算。

当前状态：

- 主动切换、迅捷、技能脱离、自动强制换人已有 fixture。
- pending switch 已支持可配置模式，并有 unit/replay fixture。
- 技能位置与传动已有基础实现和 unit fixture。
- 印记已经从普通状态拆出，后续需要官方对拍确认每种印记的伤害、层数上限和清除时点。
- 入场 hook 已有第一版，`落雷` 已迁入 team-aware 实现。
- 未完成的是离场、击败后、场下收益、继承等细分 hook。

### 阶段 3：PVP 78 技能逐项精修

处理顺序：

1. PVP 队伍高频技能。
2. `implemented_high_risk`。
3. `implemented_partial_timing`。
4. 低风险技能的数值对拍。

每个技能的完成定义：

- 有 effect registry。
- 有至少一个 unit test。
- 有至少一个 6v6 replay fixture。
- 如果涉及应对、迅捷、换人、历史、位置、传动、印记、天气，必须有跨回合 fixture。

### 阶段 4：PVP 25 特性 team-aware 化

重点从 active-only 转为 team-aware：

- 入场/离场触发。
- 场下精灵影响。
- 队伍内相同技能/属性检查。
- 击败时额外效果。
- 继承增益/减益。
- 本场首次使用、每次入场、每次位置变化。

完成定义：

- `passiveEffectRegistry` 不再只是说明支持水平。
- 特性逻辑有可执行 hook。
- readiness 中 active-battle-limited 数量归零。

### 阶段 5：官方对拍夹具

建立 `official fixtures`：

```text
队伍配置
每回合动作
官方结果：出手顺序、伤害、能量、状态、换人、胜负
模拟器结果
diff
```

建议夹具来源：

- 玩家手录战报。
- 固定房间重复测试。
- 官方技能描述的最小复现。
- 单技能单特性微型对拍。

完成定义：

- 每个高风险技能至少 1 个官方 fixture。
- 每个 active-battle-limited 特性至少 1 个官方 fixture。
- 核心 PVP 队伍至少 10 场真实对局动作序列对拍。

### 阶段 6：数值校准

当前数值是按预期面板和伤害目标校准，不是官方公式。要预测真实对局，需要继续校准：

- 面板：等级、性格、努力、个体、血脉、装备或其他养成项。
- 伤害：同系加成、克制倍率、随机因子、防御技能、减伤叠加。
- 多段：每段取整还是总伤取整。
- 状态伤害：层数、取整、触发时点。

完成定义：

- 常见 120/140/110 种族样例继续通过。
- 官方实测伤害误差在可接受阈值内。
- 每次公式调整都有 regression fixture。

### 阶段 7：训练环境回接

只有引擎接近稳定后，再把 MaskPPO 从 smoke 环境切到正式引擎：

- Python 通过 bridge 调用 `TeamBattleState`。
- rollout 直接导出 `TeamReplayRunResult`。
- action mask 使用同一套合法动作接口。
- 训练不允许依赖与正式 replay 不同的简化规则。

## 当前最近任务

优先级：

1. 为 22 个 high-risk PVP 技能逐个补官方或推断 fixture。
2. 把 pending replacement、传动、印记作为官方 fixture 默认模式接入 replay 样例。
3. 继续把 active-battle-limited 特性迁移到 team-aware hooks。
4. 增加离场和场下收益 hook，处理 `洁癖`、`做噩梦`、`地脉`。
5. 对拍中毒、灼烧、冻结、湿润、光合、降灵的层数上限和回合末时点。
