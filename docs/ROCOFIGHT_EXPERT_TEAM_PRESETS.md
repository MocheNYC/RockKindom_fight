# RocoFight Expert Team Presets

本文档记录当前 PVP 精灵池中新增的 5 个固定实验阵容。它们的目的不是替代随机阵容训练，而是扩展 expert-script 的监督来源：不同阵容应学习不同的开局、切换、能量管理和收割节奏。

## 阵容总览

| Team ID | 成员 | 核心用途 |
| --- | --- | --- |
| `expert-wing-burst` | 圣羽翼王 / 翡翠夫人 / 龙息帕尔 / 画间沉铁兽 / 帕帕斯卡 / 黑猫巫师 | 高压爆发队，保留原 wing-core 的稳定性，同时加入沉铁兽强化收割。 |
| `expert-sand-bulwark` | 布克棱岩 / 食土呆兜 / 棋契陛下 / 声波缇塔 / 巨噬针鼹 / 记忆石 | 地面、沙暴、耐久与能量压制，适合训练长回合消耗。 |
| `expert-phantom-drain` | 幽蘑菇 / 黑猫巫师 / 梦悠悠 / 朔夜帕尔 / 蝴蝶 / 落星灵兔 | 幽灵、状态、吸取与扰乱，适合训练低血线换人和残局判断。 |
| `expert-priority-offense` | 画间沉铁兽 / 岚鸟 / 圣羽翼王 / 龙息帕尔 / 皇家狮鹫 / 朔夜帕尔 | 先手、速度和连续击杀，适合训练短窗口爆发。 |
| `expert-anti-sweep-balance` | 翡翠夫人 / 白金独角兽 / 帕帕斯卡 / 寂灭骨龙 / 明灯鱼 / 蹦床松鼠 | 反强化、续航和防守反击，适合训练抗 sweep 和稳定兜底。 |

## Expert 设计

### `expert-wing-burst`

这队继承目前最熟悉的翼王、夫人、帕帕、龙息帕尔、黑猫框架，把骨龙换成更主动的画间沉铁兽。expert 的目标是用翼王或夫人抢节奏，保留龙息帕尔和沉铁兽作为中后期爆发点。

开局优先让圣羽翼王或翡翠夫人站场。若面对低威胁或对方能量不足，优先使用强化与高收益水系/飞行系技能；若己方前排低血且后排有满血爆发手，则立刻切换。龙息帕尔保留能量，目标低血时连续使用先发制人、蝙蝠、火云车一类高威力技能完成收割。黑猫巫师用于扰乱和残局补刀，不应过早消耗。

### `expert-sand-bulwark`

这是耐久消耗组。布克棱岩、食土呆兜、棋契陛下和声波缇塔负责建立地面/沙暴压力，巨噬针鼹提供物攻突破，记忆石承担残局或换人缓冲。

expert 应避免无意义硬拼。开局优先选择布克棱岩或食土呆兜，先打环境、陷阱、轴承支撑、地刺等长期收益技能；血线低于安全线时切到抗性或耐久更好的成员。棋契陛下适合在对方速度或能量劣势时入场，利用影袭、破碎类技能打残。巨噬针鼹只在能保证交换价值时上场，避免早期被消耗。

### `expert-phantom-drain`

这是状态和吸取组，依赖幽蘑菇、黑猫巫师、梦悠悠、朔夜帕尔制造低血、低能量和负面状态。蝴蝶与落星灵兔提供补位和特殊残局。

expert 的核心是拖慢对手，不急于第一时间击杀。开局优先使用状态、吸取、控制或低风险输出；当对方血线进入斩杀范围时，切到黑猫巫师或朔夜帕尔补刀。若己方前排无法两回合内取得收益，应切换到仍有完整技能循环的成员。残局优先保护能造成状态或吸取的精灵。

### `expert-priority-offense`

这是最激进的攻击组。画间沉铁兽、岚鸟、翼王、龙息帕尔、皇家狮鹫、朔夜帕尔都有较强的抢速或高压能力。

expert 应把血线阈值作为主要判断：对方进入斩杀线时连续使用先手和高威力技能，不为了保守切换而错过收割。画间沉铁兽和翼王负责中期建立强化或压血，岚鸟与龙息帕尔负责抢先手，皇家狮鹫和朔夜帕尔在对方低血或低能量时入场。该队允许牺牲一只前排换取连续击杀窗口。

### `expert-anti-sweep-balance`

这是用于克制爆发队的均衡组。翡翠夫人、白金独角兽、帕帕斯卡、寂灭骨龙、明灯鱼、蹦床松鼠组成高容错结构，重点不是最快击杀，而是中断对方强化和稳定拉长回合。

expert 开局优先选择翡翠夫人或白金独角兽。如果对方正在强化或连续先手，优先切到能承受伤害并反制的成员；寂灭骨龙用于偷袭、吓退、降灵等打乱节奏，帕帕斯卡和明灯鱼用于补足水/飞行/辅助覆盖。血线领先时不急于 all-in，保持至少两只健康后排以处理对方 sweep。

## 采样建议

固定阵容采样时建议先构造 round-robin，而不是只让一个队伍反复打 `wing-core`。这能让 imitation 数据覆盖更多决策分布：

```powershell
npx rolldown scripts/collect-expert-trajectories.ts --file dist-node/collect-expert-trajectories.mjs --format esm --platform node
node .\dist-node\collect-expert-trajectories.mjs --matchup-mode fixed --player-team-id expert-wing-burst --opponent-team-id expert-sand-bulwark --episodes 512 --output outputs\expert-data\wing-vs-sand.jsonl --summary-output outputs\expert-data\wing-vs-sand.summary.json
node .\dist-node\collect-expert-trajectories.mjs --matchup-mode fixed --player-team-id expert-sand-bulwark --opponent-team-id expert-priority-offense --episodes 512 --output outputs\expert-data\sand-vs-priority.jsonl --summary-output outputs\expert-data\sand-vs-priority.summary.json
node .\dist-node\collect-expert-trajectories.mjs --matchup-mode fixed --player-team-id expert-phantom-drain --opponent-team-id expert-anti-sweep-balance --episodes 512 --output outputs\expert-data\phantom-vs-balance.jsonl --summary-output outputs\expert-data\phantom-vs-balance.summary.json
```

后续更合理的训练集应包含三类数据：固定强队互打、固定强队打随机队、随机队打固定强队。这样 BC/DAgger 学到的不是单一脚本，而是多阵容、多节奏下的 expert policy。
