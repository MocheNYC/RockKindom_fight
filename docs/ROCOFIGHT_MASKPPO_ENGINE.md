# RocoFight MaskPPO Engine Backend

更新日期：2026-04-28

## 当前落地内容

- Python 训练脚本已经可以通过 Node JSONL bridge 调用真实 TypeScript `TeamBattleState`。
- 动作空间固定为 `Discrete(10)`：4 个技能、`action=4` 聚能/等待、5 个换人动作。
- 训练端使用真实引擎 action mask，能量不足技能、非法换人、倒下后非换人动作都会被屏蔽。
- KO 后待补位时，如果只有对方需要换人，玩家侧只暴露 `action=4` 作为等待动作，避免训练到不会执行的假动作。
- 支持 `--matchup-mode fixed` 和 `--matchup-mode random-roster`。
- `random-roster` 会从 PvP 精灵数据库抽取双方 6v6 队伍，用于降低固定队伍下的动作编号过拟合。
- observation 已扩展到 613 维，包含双方队伍面板、双方 12 只精灵的携带技能摘要、当前技能威力/消耗/类型/应对/迅捷等特征。
- 训练脚本支持 `--load-model` 继续训练、`--net-arch` 调整 MLP 宽度、`--n-envs` 多环境采样、`--eval-suite-policies` 跨对手集评估。

## 构建 bridge

```powershell
cd G:\rock_world
npm.cmd run rocofight:bridge:build
```

输出位置：

```text
G:\rock_world\dist-node\rocofight-engine-bridge.mjs
```

注意：bridge 不再输出到 `dist/`，避免被 Vite build 清理。

## 对手集

训练脚本通过 `--opponent-policy` 选择对手策略：

```text
greedy-best: 现有启发式对手，低血量会换人，技能按威力/速度/消耗评分选择。
cycle-skills: 固定顺序对手，当前精灵按技能槽 1 -> 2 -> 3 -> 4 循环；下一技能能量不足时聚能；只做强制补位。
random-legal: 从当前所有合法动作中均匀随机选择。
basic-pool: 每局从 greedy-best、cycle-skills、random-legal 中按 seed 随机采样一个对手。
```

`cycle-skills` 的技能游标按对方精灵 slot 单独记录；玩家或对方 KO 补位回合中，非补位方会 `wait`，不会推进顺序游标。

## 训练命令

从 `G:\DRL` 运行：

```powershell
.\.venv\Scripts\python.exe .\pettingzoo_demo\train_rocofight_maskable_ppo.py --backend engine --matchup-mode random-roster --opponent-policy basic-pool --total-timesteps 8192 --eval-every 1024 --eval-episodes 12 --n-steps 128 --batch-size 64 --max-turns 60 --hp-scale 0.7 --ent-coef 0.02 --output-dir .\pettingzoo_demo\outputs\rocofight_engine_maskppo_basic_pool_8192
```

输出文件：

```text
rocofight_maskppo_history.csv
rocofight_maskppo_curve.png
rocofight_maskppo_model.zip
rocofight_maskppo_rollout.json
rocofight_maskppo_summary.json
```

## 最近一次验证

```text
npm.cmd run test: 8 files, 67 passed
npm.cmd run build: passed
npm.cmd run lint: passed
npm.cmd run rocofight:bridge:build: passed
py_compile train_rocofight_maskable_ppo.py: passed
```

最近一次 engine random-roster 训练：

```text
best_model=G:\DRL\pettingzoo_demo\outputs\rocofight_engine_maskppo_terminal_reward_65536\rocofight_maskppo_model.zip
opponent_policy=basic-pool
total_timesteps=65536 after 256x256 rich-team pretraining
observation_dim=613
eval_suite_episodes=64 per policy, 256 total
aggregate_win_rate=225/256 = 87.89%
greedy-best=48/64 = 75.00%
cycle-skills=56/64 = 87.50%
random-legal=64/64 = 100.00%
basic-pool=57/64 = 89.06%
invalid_selected=0
```

对手集 smoke 训练也已验证：

```text
cycle-skills total_timesteps=512: final_rollout_invalid_selected=0
basic-pool total_timesteps=512: final_rollout_invalid_selected=0
```

当前尚未达到“任意随机队伍稳定 90%+ 战胜全部对手集”。主要短板是 `greedy-best` 对手在随机 roster 下仍只有约 75% 胜率；单独微调 `cycle-skills` 或 `greedy-best` 会带来迁移损伤。下一步需要引入更强的 opponent curriculum/model-pool 选择，或把 team matchup 分层，避免把明显劣势随机队伍也计入同一稳定胜率目标。

这个结果说明 MaskPPO 工程链路已经落地，但策略强度还处于早期阶段。下一步重点不是继续堆步数，而是做对手池、自博弈、胜负制 reward、更多 matchup 评估和官方对局日志校验。
