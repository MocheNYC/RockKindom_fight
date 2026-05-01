# RocoFight MaskPPO Engine Backend

更新日期：2026-05-01

## 当前落地内容

- Python 训练脚本已经可以通过 Node JSONL bridge 调用真实 TypeScript `TeamBattleState`。
- 动作空间固定为 `Discrete(10)`：4 个技能、`action=4` 聚能/等待、5 个换人动作。
- 训练端使用真实引擎 action mask，能量不足技能、非法换人、倒下后非换人动作都会被屏蔽。
- KO 后待补位时，如果只有对方需要换人，玩家侧只暴露 `action=4` 作为等待动作，避免训练到不会执行的假动作。
- 支持 `--matchup-mode fixed` 和 `--matchup-mode random-roster`。
- `random-roster` 会从 PvP 精灵数据库抽取双方 6v6 队伍，用于降低固定队伍下的动作编号过拟合。
- observation 已扩展到 613 维，包含双方队伍面板、双方 12 只精灵的携带技能摘要、当前技能威力/消耗/类型/应对/迅捷等特征。
- 训练脚本支持 `--load-model` 继续训练、`--net-arch` 调整 MLP 宽度、`--activation-fn` 选择激活函数、`--n-envs` 多环境采样、`--eval-suite-policies` 跨对手集评估。
- bridge 支持 `--reward-profile potential|dense|terminal`。默认 `potential` 使用 PBRS 风格的 `gamma * Phi(s') - Phi(s)`，同时保留终局、非法动作和少量事件项。
- bridge 支持 `--draw-penalty` 惩罚回合上限时血量接近的拖局结果。
- `--opponent-model path\to\model.zip` 支持冻结历史模型作为对手，训练端使用 opponent-side observation 和 opponent action mask 预测对手动作。
- `--save-eval-checkpoints` 会保存每个 eval 节点；默认保存 `best_mean_model.zip` 和 `best_rollout_model.zip`。
- `--feature-extractor structured` 会按 12 个精灵槽编码 613 维 engine observation，作为普通 MLP 之外的结构化策略实验入口。

## 设计依据

- Invalid action masking：固定 `Discrete(10)` 下严格使用 action mask，避免从完整动作空间采样非法动作。
- Potential-based reward shaping：把血量、存活数和能量领先组合成状态势函数，减少稀疏终局奖励的 credit assignment 压力。
- Self-play / league training：先落地冻结历史模型对手，后续可以把多个 checkpoint 做成 model pool，再按胜率或 PFSP 权重采样。
- Curriculum：当前可通过 `hp_scale`、`matchup-mode`、`opponent-policy`、`opponent-model` 和训练阶段脚本组合实现；还没有引入复杂调度器。

## 构建 bridge

```powershell
cd G:\rock-fight
npm.cmd run bridge:build
```

输出位置：

```text
G:\rock-fight\dist-node\rocofight-engine-bridge.mjs
```

注意：bridge 输出到 `dist-node/`，避免和前端/库构建产物混在一起。

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

从仓库根目录运行：

```powershell
.\.venv\Scripts\python.exe .\python\train_rocofight_maskable_ppo.py --backend engine --matchup-mode random-roster --opponent-policy basic-pool --reward-profile potential --total-timesteps 8192 --eval-every 1024 --eval-episodes 12 --n-steps 256 --batch-size 64 --max-turns 60 --hp-scale 0.7 --ent-coef 0.02 --net-arch 256,256 --activation-fn silu --learning-rate-schedule linear --output-dir .\outputs\engine-basic-pool-8192
```

带 checkpoint 保存的课程训练示例：

```powershell
.\.venv\Scripts\python.exe .\python\train_rocofight_maskable_ppo.py --backend engine --load-model .\outputs\engine-curriculum-mix-24576\rocofight_maskppo_model.zip --matchup-mode random-roster --opponent-policy basic-pool --reward-profile potential --draw-penalty 8 --total-timesteps 32768 --eval-every 4096 --eval-episodes 16 --eval-suite-episodes 64 --n-envs 4 --n-steps 128 --batch-size 128 --max-turns 60 --hp-scale 0.7 --ent-coef 0.03 --learning-rate 0.0001 --save-eval-checkpoints --output-dir .\outputs\engine-nenv4-mix-32768
```

结构化 extractor 从零训练示例：

```powershell
.\.venv\Scripts\python.exe .\python\train_rocofight_maskable_ppo.py --backend engine --matchup-mode random-roster --opponent-policy basic-pool --reward-profile potential --draw-penalty 8 --total-timesteps 32768 --eval-every 4096 --eval-episodes 16 --eval-suite-episodes 64 --n-steps 256 --batch-size 64 --max-turns 60 --hp-scale 0.7 --ent-coef 0.03 --learning-rate 0.0002 --net-arch 256,128 --activation-fn silu --feature-extractor structured --structured-features-dim 256 --structured-slot-dim 64 --save-eval-checkpoints --output-dir .\outputs\engine-structured-32768
```

冻结历史模型自博弈：

```powershell
.\.venv\Scripts\python.exe .\python\train_rocofight_maskable_ppo.py --backend engine --load-model .\outputs\engine-basic-pool-8192\rocofight_maskppo_model.zip --opponent-model .\outputs\engine-basic-pool-8192\rocofight_maskppo_model.zip --matchup-mode random-roster --opponent-policy basic-pool --total-timesteps 32768 --eval-every 4096 --output-dir .\outputs\engine-selfplay-continued
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
npm.cmd run test: 8 files, 180 passed
npm.cmd run typecheck: passed
npm.cmd run audit:readiness: passed
npm.cmd run build: passed
py_compile train_rocofight_maskable_ppo.py: passed
engine potential reward smoke 256 steps: invalid=0, wins=6/32
frozen-opponent smoke 128 steps: invalid=0
n-envs=4 smoke: invalid=0
structured extractor smoke: invalid=0
```

当前本仓库训练记录：

```text
best_model=outputs\engine-nenv4-mix-32768\checkpoints\step_00028672.zip
eval_suite_episodes=64 per policy, 256 total
aggregate_win_rate=90/256 = 35.16%
greedy-best=23/64 = 35.94%
cycle-skills=11/64 = 17.19%
random-legal=28/64 = 43.75%
basic-pool=28/64 = 43.75%
invalid_selected=0
```

历史长训记录：

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
