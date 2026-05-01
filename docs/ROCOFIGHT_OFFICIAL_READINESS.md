# RocoFight Official Readiness Audit

Generated at: 2026-04-28T13:29:28.707Z

## Summary

| Metric | Value |
| --- | ---: |
| PVP pets | 25 |
| Unique PVP skills | 78 |
| PVP passives | 25 |

| Skill status | Count |
| --- | ---: |
| implemented_partial_timing | 22 |
| implemented_high_risk | 22 |
| implemented_low_risk | 34 |

## PVP Passive Support

| Passive | Support | Notes |
| --- | --- | --- |
| 变形活画 | implemented |  |
| 不朽 | implemented | Team battle revives after 3 turns at 1 HP; official revive HP still needs fixture proof. |
| 不移 | implemented |  |
| 乘风连击 | implemented |  |
| 地脉 | implemented | Initial energy is 0; bench pets gain 3 energy when an ally uses a ground skill. |
| 毒蘑菇 | implemented |  |
| 对流 | implemented |  |
| 囤积 | implemented |  |
| 化茧 | implemented |  |
| 嫁祸 | implemented |  |
| 洁癖 | implemented | Switch-out inheritance copies transferable buffs and debuffs to the replacement. |
| 飓风 | implemented | Team battle grants swift only when another wing teammate carries the same skill; defeated-by-enemy extra energy loss is modeled. |
| 灵魂灼伤 | implemented |  |
| 目空 | implemented |  |
| 渗透 | implemented | Team battle tracks allied fighting/ground skill history and applies attack/defense on entry. |
| 顺风 | implemented |  |
| 特殊清洁场景 | implemented |  |
| 向心力 | implemented | Slots 1 and 2 gain power and transmission 1. |
| 翼轴 | implemented | Slot 1 gains swift on switch-in and transmission 1. |
| 预警 | implemented |  |
| 陨落 | implemented |  |
| 正位宝剑 | implemented |  |
| 壮胆 | implemented | Team composition check grants dual attack +50% when the side has a bug pet. |
| 捉迷藏 | implemented |  |
| 做噩梦 | implemented | Enemy replacements lose 3 energy after the nightmare pet forces or observes a switch. |

## Non-Low-Risk PVP Skill Queue

| Skill | Status | Mechanics | Effect |
| --- | --- | --- | --- |
| 报复 | implemented_partial_timing | response_attack, damage_reduction, energy | 减伤70%，应对攻击：敌方失去3能量。 |
| 暴风雪 | implemented_high_risk | freeze, mark_stack | 造成物伤，敌方获得1层冻结。 |
| 冰墙 | implemented_high_risk | response_attack, damage_reduction, freeze, mark_stack | 减伤80%，应对攻击：敌方获得2层冻结。 |
| 嘲弄 | implemented_partial_timing | switch_out, stat_modifier | 自己获得魔攻+90%，若敌方本回合更换精灵，自己获得速度+70。 |
| 齿轮扭矩 | implemented_high_risk | power_modifier, history, position_transmission | 造成物伤，每回合位置发生变化时，本技能威力永久+20。 |
| 赤子之心 | implemented_high_risk | energy, history | 自己获得萌化：全技能能耗永久-3。 |
| 抽枝 | implemented_partial_timing | response_status, energy, heal | 造成物伤，应对状态：自己回复50%生命和5能量。 |
| 打湿 | implemented_high_risk | mark_stack | 自己获得1层湿润印记。 |
| 地刺 | implemented_partial_timing | response_status | 造成物伤，应对状态：额外打断被应对技能。 |
| 毒孢子 | implemented_high_risk | poison, mark_stack | 敌方获得5层中毒。 |
| 遁地 | implemented_partial_timing | response_attack, switch_out, damage_reduction | 减伤50%并脱离，应对攻击。 |
| 防御 | implemented_partial_timing | response_attack, damage_reduction | 减伤70%，应对攻击。 |
| 飞羽 | implemented_partial_timing | swift, cleanse | 迅捷，驱散敌方1种增益。 |
| 焚烧烙印 | implemented_high_risk | burn, cleanse, mark_stack | 驱散双方所有印记，每驱散1层，敌方获得5层灼烧。 |
| 钢铁洪流 | implemented_high_risk | power_modifier, position_transmission | 造成物伤，本技能位于1号位时威力+90，传动2。 |
| 高温回火 | implemented_partial_timing | switch_out | 造成魔伤，自己脱离。 |
| 光合作用 | implemented_high_risk | mark_stack | 自己获得1层光合印记。 |
| 回旋踢 | implemented_partial_timing | switch_out, power_modifier | 造成物伤，若敌方本回合更换精灵，本次技能威力翻倍。 |
| 火焰护盾 | implemented_high_risk | response_attack, damage_reduction, burn, mark_stack | 减伤70%，应对攻击：敌方获得6层灼烧。 |
| 击鼓传花 | implemented_high_risk | switch_out, team_bench | 自己脱离，下个入场精灵继承自己增益。 |
| 疾风连袭 | implemented_high_risk | swift, energy, history | 释放自己释放过的迅捷技能，其能耗之和的二分之一加至本技能能耗，每次使用后能耗+1。 |
| 加大功率 | implemented_high_risk | switch_out, energy, heal, team_bench | 自己脱离，替换入场的精灵回复8能量。 |
| 降灵 | implemented_high_risk | mark_stack | 敌方获得1层降灵印记。 |
| 截拳 | implemented_partial_timing | response_status, energy, heal | 造成物伤，应对状态：额外造成打断，回复该技能能耗的能量。 |
| 惊吓盒子 | implemented_partial_timing | response_status, energy | 造成物伤，应对状态：使敌方失去6能量。 |
| 龙卷风 | implemented_partial_timing | response_status, swift, power_modifier | 造成物伤，迅捷，应对状态：本次技能威力变为1.5倍。 |
| 落雷 | implemented_high_risk | power_modifier, history, team_bench | 造成魔伤，每次入场，本技能威力永久+20。 |
| 啮合传递 | implemented_high_risk | stat_modifier, position_transmission | 自己获得速度+80，本技能位于1号或3号位时额外获得物攻+60%，传动1。 |
| 破绽 | implemented_partial_timing | response_defense, stat_modifier | 敌方获得双防-70%，应对防御：自己额外获得物攻+70%。 |
| 倾泻 | implemented_high_risk | cleanse, mark_stack | 造成魔伤，若本次攻击未被防御技能应对，则驱散双方所有印记。 |
| 沙涌 | implemented_high_risk | weather_field | 将天气改为沙暴，持续8回合。 |
| 食腐 | implemented_high_risk | heal, cleanse, mark_stack | 驱散敌方印记，每层印记回复自己10%生命。 |
| 嗜痛 | implemented_partial_timing | response_attack, damage_reduction, stat_modifier | 减伤80%，应对攻击：期间自己每次受到伤害，获得双攻+40%。 |
| 水环 | implemented_partial_timing | response_attack, damage_reduction, energy | 减伤60%，应对攻击：自己获得全技能能耗-2。 |
| 水刃 | implemented_high_risk | response_status, energy, history | 造成物伤，应对状态：本技能能耗永久-4。 |
| 听桥 | implemented_partial_timing | response_attack, damage_reduction, power_modifier | 减伤60%，应对攻击：对敌方造成物理伤害，威力与被应对技能相等。 |
| 偷袭 | implemented_partial_timing | response_status, power_modifier | 造成物伤，应对状态：本次技能威力变为3倍。 |
| 吓退 | implemented_partial_timing | response_attack, switch_out, damage_reduction | 减伤60%，应对攻击：敌方脱离。 |
| 硬化 | implemented_partial_timing | response_attack, damage_reduction, energy | 减伤90%，若上次使用攻击技则本技能能耗-2，应对攻击。 |
| 有效预防 | implemented_partial_timing | response_attack, damage_reduction | 减伤50%，应对攻击：下一次行动获得先手+1。 |
| 羽化加速 | implemented_partial_timing | swift, power_modifier | 自己获得全技能威力+20，迅捷。 |
| 轴承支撑 | implemented_high_risk | energy, position_transmission | 主动：本技能被动额外-1能耗，被动：两侧技能能耗-1，传动1。 |
| 主轴 | implemented_high_risk | position_transmission | 造成物伤，此技能位置不会改变。 |
| 追打 | implemented_partial_timing | response_status, multi_hit | 造成魔伤，1连击，应对状态：本技能变为3连击。 |

## Interpretation

- `implemented_low_risk`: registry has a rule and no high-risk text pattern was detected.
- `implemented_partial_timing`: registry has a rule, but timing-sensitive mechanics such as response or swift need replay proof.
- `implemented_high_risk`: registry has a rule, but text mentions history, bench, field, position, mark, or control mechanics that require official fixture validation.
- `missing_registry`: carried PVP skill has no explicit effect registry entry.
