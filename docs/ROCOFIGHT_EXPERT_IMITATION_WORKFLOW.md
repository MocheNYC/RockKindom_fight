# RocoFight Expert Imitation Workflow

目标是把当前强 `expert-script` 变成模型的起点，再用 DRL 超过它。直接从零 PPO 打 expert 的探索成本过高，先做 imitation，再做 PPO fine-tune。

## Stage 1: Expert Trajectory Dataset

采集 expert 在大量局面下的 `(observation, action_mask, expert_action)`，同时记录动作分布、胜负、回合数和阵容分布。

验收指标：
- `invalid_action_labels = 0`
- 样本量、动作直方图、平均回合数写入 summary
- 至少包含 random-roster 和固定阵容两种数据源

## Stage 2: Dataset QA and Split

检查 observation 维度、mask 与 action 一致性、动作类别覆盖、active 精灵覆盖、重复 state 比例。生成 train/valid/test split。

验收指标：
- train/valid/test 可复现
- 每个 split 的 action histogram 接近全量分布
- 无非法标签

## Stage 3: Behavior Cloning Baseline

用监督学习训练 policy 网络预测 expert action，loss 对非法动作做 mask。

验收指标：
- valid top-1 action accuracy
- valid legal top-1 accuracy
- per-action recall，尤其是 focus 和 switch

## Stage 4: BC Policy Engine Evaluation

把 BC policy 接回 engine，直接打 `expert-script`，只评估 expert 对手。

验收指标：
- expert win rate
- invalid selected
- mean turns
- loss trace 抽样

## Stage 5: DAgger Round 1

让 BC 模型上场，对模型访问到的 states 重新查询 expert label，补充模型分布下的数据。

验收指标：
- 新数据中模型错误率
- switch/focus 错误占比
- DAgger 后 expert win rate

## Stage 6: DAgger Round 2-3

重复采样、标注、训练，重点覆盖残局、被压制、pending switch 和高能量爆发局面。

验收指标：
- expert imitation accuracy 提升或稳定
- expert win rate 提升
- loss trace 中低级错误减少

## Stage 7: PPO Warm Start

从 DAgger policy 初始化 MaskablePPO，只打 `expert-script`，reward 使用 `competitive`。

验收指标：
- expert win rate 高于纯 BC
- invalid selected = 0
- mean reward 上升

## Stage 8: PPO Reward Ablation

对比 `competitive`、`potential`、terminal-heavy reward 和不同 draw penalty。

验收指标：
- 同 seed、同 eval episodes 的 expert win rate 排名
- 胜率和平均回合数同时考虑

## Stage 9: Opponent-Side Robustness

只以 expert 为主目标，但加入少量 fixed/random roster 评估切片，防止模型只记阵容。

验收指标：
- random-roster expert win rate
- fixed wing-core expert win rate
- action entropy 不坍缩

## Stage 10: Expert Counter Mining

分析模型输给 expert 的 trace，挖出常见失败模式，反向增加 DAgger 采样或 reward 项。

验收指标：
- top loss patterns 列表
- 每个 pattern 有对应数据或 reward 修正

## Stage 11: Long Run Consolidation

用最佳 BC/DAgger/PPO 组合跑长训练，保存每个 eval checkpoint。

验收指标：
- best_mean_model
- best_rollout_model
- final_model 三者各自 expert 评估

## Stage 12: Release Gate

固定测试集上评估最终模型，保留 summary、rollout、loss traces 和训练曲线。

验收指标：
- expert win rate
- invalid selected = 0
- 可复现实验命令写入 README 或 docs
