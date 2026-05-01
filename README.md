# RockKindom Fight

RocoFight 是从 RocoDex 中拆出来的洛克王国对战实验项目，目标是把基础 6v6 对战骨架接到 MaskablePPO 训练流程上。

当前仓库包含：

- TypeScript 对战引擎、队伍战斗、action mask、replay 校验。
- 从 RocoDex 复制来的精灵、技能、属性数据。
- Node JSONL bridge，用于让 Python 环境调用 TypeScript 对战引擎。
- Python MaskablePPO 训练脚本，支持训练、评估、保存模型、加载模型和 rollout 导出。

> 状态说明：训练链路已经跑通，但规则复现和策略强度仍处于早期阶段。现在适合做 action mask、reward、对手池、自博弈、replay 检查和规则补全。

## 快速开始

### 1. Clone

```powershell
git clone https://github.com/MocheNYC/RockKindom_fight.git
cd RockKindom_fight
```

### 2. 安装 Node 依赖

建议使用 Node.js 20+。当前本机验证版本是 Node `v22.19.0`、npm `11.12.1`。

```powershell
npm install
```

### 3. 安装 Python 依赖

建议使用 Python 3.11+。当前本机验证版本是 Python `3.12.7`。

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

macOS / Linux:

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install --upgrade pip
./.venv/bin/python -m pip install -r requirements.txt
```

## 验证工程

先确认 TypeScript 侧测试和 bridge 构建都可用：

```powershell
npm run test
npm run typecheck
npm run audit:readiness
npm run bridge:build
```

`bridge:build` 会生成：

```text
dist-node/rocofight-engine-bridge.mjs
```

Python 的 engine backend 依赖这个文件；如果没构建 bridge，训练脚本会直接报错。

`audit:readiness` 会生成当前 PvP 池规则覆盖率报告：

```text
docs/rocofight-readiness.generated.json
docs/ROCOFIGHT_READINESS_GENERATED.md
```

## 跑一次最小训练

Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe .\python\train_rocofight_maskable_ppo.py --backend engine --total-timesteps 256 --eval-every 128 --eval-episodes 2 --n-steps 64 --batch-size 32 --max-turns 40 --hp-scale 0.7 --matchup-mode random-roster --opponent-policy basic-pool --output-dir .\outputs\engine-smoke
```

macOS / Linux:

```bash
./.venv/bin/python ./python/train_rocofight_maskable_ppo.py --backend engine --total-timesteps 256 --eval-every 128 --eval-episodes 2 --n-steps 64 --batch-size 32 --max-turns 40 --hp-scale 0.7 --matchup-mode random-roster --opponent-policy basic-pool --output-dir ./outputs/engine-smoke
```

成功后会看到类似输出：

```text
timesteps=    0 ...
timesteps=  128 ...
timesteps=  256 ...

Done.
history: ...
curve:   ...
model:   ...
rollout: ...
summary: ...
suite:   win_rate=... invalid=0
```

生成文件位于 `outputs/engine-smoke/`：

```text
rocofight_maskppo_history.csv
rocofight_maskppo_curve.png
rocofight_maskppo_model.zip
rocofight_maskppo_rollout.json
rocofight_maskppo_summary.json
```

`outputs/` 默认被 `.gitignore` 忽略，不会提交训练产物。

## NPM 快捷命令

如果已经激活 Python venv，也可以使用：

```powershell
npm run train:engine:smoke
```

注意：这个快捷命令调用的是环境里的 `python`。如果没有激活 venv，请优先使用上一节的显式 `.venv` 命令。

## 常用长训练起点

```powershell
.\.venv\Scripts\python.exe .\python\train_rocofight_maskable_ppo.py --backend engine --matchup-mode random-roster --opponent-policy basic-pool --total-timesteps 8192 --eval-every 1024 --eval-episodes 12 --n-steps 128 --batch-size 64 --max-turns 60 --hp-scale 0.7 --ent-coef 0.02 --output-dir .\outputs\engine-basic-pool-8192
```

继续训练已有模型：

```powershell
.\.venv\Scripts\python.exe .\python\train_rocofight_maskable_ppo.py --backend engine --load-model .\outputs\engine-basic-pool-8192\rocofight_maskppo_model.zip --total-timesteps 32768 --eval-every 4096 --output-dir .\outputs\engine-basic-pool-continued
```

## 项目结构

```text
src/rocofight/                         TypeScript 对战引擎、6v6 队伍逻辑、replay、MaskPPO action mask
src/data/                              从 RocoDex 复制来的精灵/技能/属性生成数据
src/types.ts                           RocoDex 数据类型，供引擎读取数据
scripts/rocofight-engine-bridge.ts     Python 训练脚本调用 TS 引擎的 JSONL bridge
python/train_rocofight_maskable_ppo.py MaskablePPO 训练、评估、保存模型、rollout 导出
docs/                                  设计、审计、训练流程文档
outputs/                               训练输出目录，默认不提交
```

## 训练接口概要

动作空间固定为 `Discrete(10)`：

```text
0-3: 当前场上精灵的 4 个技能槽
4: 聚能 / 等待
5-9: 切换到仍存活且非当前场上精灵的队友，按 slot 顺序压缩到最多 5 个动作
```

engine backend 使用 TypeScript `TeamBattleState` 计算：

- 当前 observation。
- 双方 action mask。
- 技能、聚能、主动切换、击倒后补位。
- 对手策略：`greedy-best`、`cycle-skills`、`random-legal`、`basic-pool`。
- 训练 reward、rollout trace、summary。

## 当前验收基线

最近一次在 `G:\rock-fight` 验证：

```text
npm run test:       8 files, 180 tests passed
npm run typecheck:  passed
npm run audit:readiness: passed
npm run build:      passed
engine smoke 256 steps: completed
```

smoke summary：

```text
backend=engine
observation_dim=613
action_space=Discrete(10)
final_rollout_invalid_selected=0
eval_suite_invalid_selected=0
eval_suite_win_rate=3/32 = 9.375%
readiness_missing_registry=0
readiness_high_risk_without_fixture=0
readiness_partial_timing_without_fixture=0
readiness_missing_passive_registry=0
readiness_passives_without_code_proof=0
readiness_passives_without_fixture_proof=0
readiness_passives_with_text_mechanic_gaps=0
readiness_skills_with_text_mechanic_gaps=0
```

短 smoke 的胜率只用于证明流程可跑通，不代表策略已经有实际强度。

## 常见问题

### bridge not found

先执行：

```powershell
npm run bridge:build
```

然后再运行 Python 训练脚本。

### Python 找不到 sb3_contrib / stable_baselines3

说明当前 Python 环境没有装依赖。确认使用的是项目 venv：

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 想把项目放在别的目录

训练脚本默认会把仓库根目录识别为 `ROCOFIGHT_ROOT`。正常 clone 后无需配置。

如果要手动指定：

```powershell
$env:ROCOFIGHT_ROOT="D:\path\to\RockKindom_fight"
.\.venv\Scripts\python.exe .\python\train_rocofight_maskable_ppo.py --backend engine
```

也可以直接传：

```powershell
.\.venv\Scripts\python.exe .\python\train_rocofight_maskable_ppo.py --backend engine --rock-world-root .
```

## 协作建议

- 改 TypeScript 引擎后先跑 `npm run test` 和 `npm run typecheck`。
- 改 bridge 后先跑 `npm run bridge:build`，再跑一次 engine smoke。
- 改 reward、observation 或 action mask 后，检查 `rocofight_maskppo_summary.json` 中的 `final_rollout_invalid_selected` 和 `eval_suite.aggregate.invalid_selected`。
- 大模型文件、训练曲线和 rollout 默认放 `outputs/`，不要提交到 git。
