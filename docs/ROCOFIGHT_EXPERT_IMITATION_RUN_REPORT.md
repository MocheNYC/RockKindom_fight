# Expert Imitation Run Report

本轮目标：以当前 `expert-script` 为唯一主要对手，完成从 expert 轨迹采集、BC、DAgger、PPO warm start 到 release gate 的 12 阶段闭环。

## Final Candidates

推荐保留两个模型，而不是只保留一个：

| Candidate | Path | 用途 | Expert random-roster | Expert fixed wing-core |
| --- | --- | --- | --- | --- |
| best-random | `outputs/expert-stage8-competitive-lowlr/checkpoints/best_mean_model.zip` | 随机阵容泛化优先 | 98/256 = 38.28% | 0/96 = 0.00% |
| safe-fixed | `outputs/expert-stage11-consolidation/bc-r4/expert_bc_best_model.zip` | 固定阵容稳定性优先 | 29/96 = 30.21% | 96/96 = 100.00% |

`best-random` 是当前随机阵容打 expert 的最好模型；`safe-fixed` 保留了 imitation 对固定阵容的稳定执行能力。

## Stage Results

| Stage | Artifact | Result |
| --- | --- | --- |
| Stage 1 expert data | `outputs/expert-trajectories/` | random 6,068 samples; fixed 7,392 samples; invalid labels 0 |
| Stage 2 QA/split | `outputs/expert-imit-stage2/expert_dataset_summary.json` | 13,460 samples; observation dim 693; invalid labels 0 |
| Stage 3 BC | `outputs/expert-bc-stage3b/expert_bc_summary.json` | valid 92.87%; test 91.38% |
| Stage 4 BC eval | `outputs/expert-bc-stage4-random-eval/` | random 18/96; fixed 96/96 |
| Stage 5 DAgger R1 data | `outputs/expert-dagger-stage5/` | 5,264 samples; model-expert match 51.25% |
| Stage 6 DAgger R1 | `outputs/expert-dagger-stage6-r1-random-eval/` | random 23/96 |
| Stage 6 DAgger R2 | `outputs/expert-dagger-stage6-r2-random-eval/` | random 32/96 |
| Stage 6 DAgger R3 | `outputs/expert-dagger-stage6-r3-random-eval/` | random 28/96 |
| Stage 7 PPO warm | `outputs/expert-ppo-stage7-warm-r2/` | final 22/96; best checkpoints did not beat DAgger R2 |
| Stage 8 ablation | `outputs/expert-stage8-competitive-lowlr/` | best checkpoint 36/96 on 96-episode eval; 98/256 on larger eval |
| Stage 9 robustness | `outputs/expert-stage9-best-random256/` | random 98/256; fixed collapsed to 0/96 |
| Stage 10 loss analysis | `outputs/expert-loss-analysis/` | losses show random endgame wait/focus mistakes and fixed-route policy collapse |
| Stage 11 consolidation | `outputs/expert-stage11-consolidation/` | BC-R4 restores fixed 96/96; random 29/96 |
| Stage 12 release gate | this report | two-model release recommendation |

## Key Findings

- 从零 PPO 打强 expert 探索成本过高：旧 best 对当前 expert 是 0/96，从零 random PPO 最好约 19/96。
- BC 能快速学到 expert 的大部分动作分布，但 random 闭环仍会分布偏移。
- DAgger 是本轮最有效的稳定提升手段：18/96 -> 23/96 -> 32/96。
- PPO 需要极低学习率；普通 warm start 会破坏 imitation policy。
- PPO best-random 提升到 38.28%，但牺牲固定阵容策略。
- BC-R4 能恢复固定阵容 100% 胜率，但 random 不如 PPO best-random。

## Next Recommendation

下一轮不要直接继续长 PPO。优先做：

1. 多任务模型选择：同时保存 random-best 与 fixed-safe。
2. 给 PPO 加 imitation anchor loss，防止 fixed policy collapse。
3. DAgger 采样增加 fixed-failure 与 endgame-failure oversampling。
4. 将 switch 动作低频类别做 class-balanced BC loss。
5. Release gate 固定为 random 256 + fixed 96，两项都过线才升级主模型。
