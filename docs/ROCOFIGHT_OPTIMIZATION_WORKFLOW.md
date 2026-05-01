# RocoFight Optimization Workflow

这份工作流把项目拆成两个长期方向：

- 对战框架复现：让 TypeScript battle engine 尽量接近游戏规则。
- DRL 训练优化：在规则可信的环境上优化 reward、对手池和训练策略。

当前优先级是先完善对战框架。MaskablePPO smoke 只作为工程回归测试，不作为现阶段策略强度目标。

## Definition Of Usable Battle Framework

达到下面条件后，才认为对战框架进入“可用于认真训练”的状态：

1. `npm run test`、`npm run typecheck`、`npm run bridge:build` 全部通过。
2. `npm run audit:readiness` 可生成稳定报告。
3. PvP 池没有 `missing_registry` 技能。
4. 所有 high-risk PvP 技能至少有一个 focused fixture test 或人工标注的可接受近似。
5. action mask 和 engine legality 保持一致，engine smoke 中 `invalid_selected=0`。
6. replay 能解释每回合的 action、mask、出手顺序、伤害、能量、状态、换人和终局。
7. 规则变更后能用短训练 smoke 验证 Python bridge 没断。

## Loop

每轮优化按同一套闭环走：

```text
Audit -> Pick high-impact gap -> Implement or mark approximation -> Add fixture tests -> Run smoke -> Inspect replay -> Commit
```

## Phase 1: Rule Audit Baseline

命令：

```powershell
npm run audit:readiness
```

输出：

```text
docs/rocofight-readiness.generated.json
docs/ROCOFIGHT_READINESS_GENERATED.md
```

审计关注：

- PvP 精灵池是否有缺失精灵、缺失技能、重复 id。
- 78 个 PvP 技能分别属于 plain damage、low risk、partial timing、high risk 还是 missing registry。
- 高风险机制分布：response、switch、mark stack、cleanse、field、history、position、bench。

## Phase 2: Battle Framework Completion

优先补主干，不先追求全图鉴。

### Turn Flow

- 行动合法性：倒下、能量不足、未携带技能、被动限制。
- 行动排序：基础优先级、技能先手、响应技能、速度。
- 技能执行：伤害、能量消耗、多段、吸血、治疗、强化、弱化。
- 状态结算：印记层数、持续伤害、持续回合、驱散。
- 换人流程：主动换人、强制换人、击倒后补位、入场效果。
- 终局：整队倒下、最大回合截断、胜负归因。

### Skill Buckets

按机制补测试和实现：

1. Plain damage
2. Priority / swift
3. Response / counter
4. Damage reduction / shield
5. Stat modifier
6. Energy modifier
7. Heal / drain
8. Mark stack / status damage
9. Cleanse / clear effects
10. Switch / forced switch / inheritance
11. Field / weather
12. History / position / bench mechanics

### Fixture Tests

每个高风险技能至少覆盖：

- 普通释放是否合法。
- 应对/先手时序是否符合预期。
- 对 HP、能量、状态、换人的具体影响。
- 与 action mask 的一致性。
- replay log 是否足够解释该回合。

## Phase 3: Replay And Debugging

训练输出的 `rocofight_maskppo_rollout.json` 必须能回答：

- 这一回合有哪些合法 action？
- 策略选了哪个 action？
- 为什么先手？
- 伤害来自哪里？
- 能量为什么变化？
- 为什么切换或补位？
- reward 为什么是这个数？

如果回答不了，就优先补 log 字段或 reward breakdown，而不是继续训练。

## Phase 4: DRL Optimization

对战框架过基线后，再扩大训练工作：

- Reward breakdown：终局、HP 差、击倒、存活、状态收益、换人成本、非法动作惩罚。
- Curriculum：fixed team -> random roster -> opponent pool -> historical model pool。
- Evaluation suite：固定弱对手、启发式强对手、随机合法对手、历史模型、自博弈。
- Observation audit：确认关键状态进入 observation，而不是只存在于 engine。
- Replay sampling：每次长训练抽样若干胜负局人工检查。

## Commands

```powershell
npm run audit:readiness
npm run test
npm run typecheck
npm run bridge:build
.\.venv\Scripts\python.exe .\python\train_rocofight_maskable_ppo.py --backend engine --total-timesteps 256 --eval-every 128 --eval-episodes 2 --n-steps 64 --batch-size 32 --max-turns 160 --hp-scale 0.7 --matchup-mode random-roster --opponent-policy basic-pool --output-dir .\outputs\engine-smoke
```

## Current Bias

在框架没有达到可用标准前，不以胜率作为主要目标。现阶段最重要指标是：

- `missing_registry=0`
- high-risk 技能有 fixture 或明确近似说明
- `invalid_selected=0`
- replay 可解释
- 每次规则改动后测试和 smoke 都能跑通
