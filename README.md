# rock-fight

从 RocoDex 主项目拆出的 RocoFight 对战引擎、6v6 队伍骨架、Node bridge 和 MaskablePPO 训练入口。

## 目录

```text
src/rocofight/                         TypeScript 对战引擎、6v6 队伍逻辑、replay、MaskPPO action mask
src/data/                              从 RocoDex 复制来的精灵/技能/属性生成数据
src/types.ts                           RocoDex 数据类型，供引擎读取数据
scripts/rocofight-engine-bridge.ts     Python 训练脚本调用 TS 引擎的 JSONL bridge
python/train_rocofight_maskable_ppo.py MaskablePPO 训练、评估、保存模型、rollout 导出
docs/                                  设计、审计、训练流程旧文档
outputs/                               训练输出目录，默认不提交
```

## 环境准备

Node 侧：

```powershell
cd G:\rock-fight
npm install
```

Python 侧需要 `gymnasium`、`numpy`、`matplotlib`、`stable-baselines3`、`sb3-contrib`。本机已经用 `G:\DRL\.venv` 跑通；如果新建环境，可执行：

```powershell
pip install -r requirements.txt
```

## 验证和构建

```powershell
cd G:\rock-fight
npm run test
npm run typecheck
npm run bridge:build
```

`bridge:build` 会生成：

```text
G:\rock-fight\dist-node\rocofight-engine-bridge.mjs
```

## 跑一次 MaskablePPO smoke

推荐先用很短步数确认链路：

```powershell
G:\DRL\.venv\Scripts\python.exe G:\rock-fight\python\train_rocofight_maskable_ppo.py --backend engine --total-timesteps 256 --eval-every 128 --eval-episodes 2 --n-steps 64 --batch-size 32 --max-turns 40 --hp-scale 0.7 --matchup-mode random-roster --opponent-policy basic-pool --output-dir G:\rock-fight\outputs\engine-smoke
```

输出文件：

```text
rocofight_maskppo_history.csv
rocofight_maskppo_curve.png
rocofight_maskppo_model.zip
rocofight_maskppo_rollout.json
rocofight_maskppo_summary.json
```

## 本次验收结果

在 `G:\rock-fight` 已完成：

```text
npm run test:       6 files, 78 tests passed
npm run typecheck:  passed
npm run bridge:build: passed
py_compile train_rocofight_maskable_ppo.py: passed
engine smoke 256 steps: completed
```

本次 smoke summary：

```text
backend=engine
observation_dim=613
action_space=Discrete(10)
final_rollout_invalid_selected=0
eval_suite_invalid_selected=0
eval_suite_win_rate=3/32 = 9.375%
```

## 当前判断

可以开始用 MaskablePPO 基于基础对战骨架尝试训练了。现在的训练链路已经不是纯 Python toy env，而是通过 Node bridge 调用 TypeScript 的 `TeamBattleState`、真实 action mask、随机 6v6 阵容、对手策略池，并能完成训练、评估、模型保存、模型加载和 rollout 导出。

需要注意：这仍是早期训练骨架，不等于官方规则完整复现。当前重点适合做工程链路、action mask、reward、对手池、自博弈和 replay 检查；策略强度还不能作为最终目标。本次短 smoke 胜率很低是正常的，主要用于证明流程可跑通。

## 常用长训练起点

```powershell
G:\DRL\.venv\Scripts\python.exe G:\rock-fight\python\train_rocofight_maskable_ppo.py --backend engine --matchup-mode random-roster --opponent-policy basic-pool --total-timesteps 8192 --eval-every 1024 --eval-episodes 12 --n-steps 128 --batch-size 64 --max-turns 60 --hp-scale 0.7 --ent-coef 0.02 --output-dir G:\rock-fight\outputs\engine-basic-pool-8192
```

继续训练已有模型：

```powershell
G:\DRL\.venv\Scripts\python.exe G:\rock-fight\python\train_rocofight_maskable_ppo.py --backend engine --load-model G:\rock-fight\outputs\engine-basic-pool-8192\rocofight_maskppo_model.zip --total-timesteps 32768 --eval-every 4096 --output-dir G:\rock-fight\outputs\engine-basic-pool-continued
```
