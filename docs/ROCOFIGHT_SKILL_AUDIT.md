# RocoFight Skill Audit

Generated at: 2026-04-28T13:29:28.706Z

## Summary

| Status | Count |
| --- | ---: |
| partially_implemented | 260 |
| implemented | 179 |
| unimplemented | 51 |

| Action kind | Count |
| --- | ---: |
| attack | 300 |
| status | 144 |
| defense | 46 |

## Top Mechanics

| Mechanic | Count |
| --- | ---: |
| basic_damage | 300 |
| power_modifier | 90 |
| energy | 88 |
| stat_modifier | 66 |
| multi_hit | 60 |
| response_attack | 46 |
| damage_reduction | 45 |
| response_status | 40 |
| response_defense | 25 |
| poison | 15 |
| cleanse_transform | 14 |
| heal | 14 |
| team_switch | 13 |
| burn | 9 |
| drain | 8 |

## Review Queue

| Skill | Action | Status | Mechanics | Effect |
| --- | --- | --- | --- | --- |
| 暗箱操作 | status | partially_implemented | response_defense, stat_modifier | 自己获得双攻和双防-100%，应对防御：改为敌方获得双攻和双防-100%。 |
| 孢子 | status | unimplemented |  | 敌方获得1层寄生。 |
| 孢子爆散 | attack | partially_implemented | basic_damage, multi_hit | 造成物伤，1连击，每次使用后，本技能连击数永久+2。 |
| 暴风眼 | status | unimplemented | multi_hit | 行动时连击数+100%。 |
| 爆冲 | attack | partially_implemented | basic_damage, power_modifier, response_status | 造成物伤，应对状态：本次技能威力变为5倍。 |
| 崩拳 | attack | partially_implemented | basic_damage, response_status, stat_modifier | 造成物伤，应对状态：自己获得物攻+100%。 |
| 彼岸之手 | attack | partially_implemented | basic_damage, energy | 造成物伤，自己每失去10%生命，本技能能耗-1。 |
| 壁垒 | defense | partially_implemented | damage_reduction, response_attack | 减伤90%，应对攻击：防御技能冷却-1。 |
| 蝙蝠 | attack | partially_implemented | basic_damage, drain | 造成物伤，并吸血100%。 |
| 冰雹 | attack | partially_implemented | basic_damage, energy, response_status | 造成物伤，应对状态：额外使敌方获得全技能能耗+3。 |
| 冰刺 | attack | partially_implemented | basic_damage, response_status | 造成物伤，应对状态：敌方2回合无法换宠。 |
| 冰蛋壳 | defense | partially_implemented | damage_reduction, response_attack | 减伤60%，应对攻击：敌方获得2层减速印记。 |
| 冰点 | status | unimplemented | response_defense | 敌方获得5层冻结，应对防御：额外获得5层。 |
| 冰冻光线 | attack | partially_implemented | basic_damage, energy | 造成魔伤，敌方获得全技能能耗+2。 |
| 冰锋横扫 | status | partially_implemented | energy, power_modifier | 造成魔伤，本技能威力等于敌方精灵技能总能耗的10倍。 |
| 冰荆棘 | defense | partially_implemented | damage_reduction, power_modifier, response_attack | 减伤70%，应对攻击：敌方冻结层数翻倍。 |
| 冰晶坠 | attack | partially_implemented | basic_damage, energy | 造成物伤，敌方获得全技能能耗+1。 |
| 冰捆缚 | status | partially_implemented | energy, multi_hit | 2连击，每次连击敌方获得全技能能耗+1。 |
| 冰天雪地 | defense | partially_implemented | damage_reduction, energy, response_attack | 减伤80%，应对攻击：被应对技能能耗+3。 |
| 不动如山 | defense | partially_implemented | damage_reduction, response_attack | 减伤90%，应对攻击。 |
| 不可接触 | defense | partially_implemented | damage_reduction, poison, response_attack | 减伤50%，敌方每有1层中毒效果，本技能减伤+10%，应对攻击。 |
| 草虫冲击 | attack | partially_implemented | basic_damage, power_modifier | 造成物伤，若敌方本回合更换精灵，本次威力+50且无视敌方系别抵抗。 |
| 超导 | attack | partially_implemented | basic_damage, energy | 造成魔伤，迸发：本技能能耗-1。 |
| 超导加速 | attack | partially_implemented | basic_damage, stat_modifier | 造成魔伤，自己获得速度+30。 |
| 超维投射 | status | unimplemented |  | 敌方获得4层星陨印记。 |
| 超新星馈赠 | status | unimplemented |  | 敌方获得2层星陨印记，每使用1次，赋予的星陨印记层数+1。 |
| 潮汐 | defense | partially_implemented | damage_reduction, response_attack | 减伤60%，应对攻击：自己获得1层湿润印记。 |
| 趁火打劫 | attack | partially_implemented | basic_damage, multi_hit | 造成物伤，2连击，若击败敌方，本技能连击数永久+2。 |
| 乘风 | status | partially_implemented | stat_modifier | 自己获得速度+120。 |
| 乘胜追击 | attack | partially_implemented | basic_damage, multi_hit | 造成物伤，1连击，每次使用后，本技能连击数永久+1。 |
| 持续高温 | attack | partially_implemented | basic_damage, power_modifier, response_status | 造成魔伤，应对状态：下次攻击技能威力翻倍。 |
| 齿轮扭矩 | attack | partially_implemented | basic_damage, power_modifier | 造成物伤，每回合位置发生变化时，本技能威力永久+20。 |
| 齿轮切开 | attack | partially_implemented | basic_damage, energy | 造成物伤，本技能位于1号或3号位时能耗-2，传动1。 |
| 翅刃 | attack | partially_implemented | basic_damage, cleanse_transform, response_status | 造成物伤，驱散敌方所有印记，应对状态：改为偷取印记。 |
| 充分燃烧 | status | unimplemented | burn, power_modifier | 使敌方身上的灼烧翻倍，并触发1次灼烧伤害。 |
| 冲撞 | attack | partially_implemented | basic_damage, energy | 造成物伤，回合结束时，本技能能耗永久-1。 |
| 虫刺 | attack | partially_implemented | basic_damage, multi_hit | 造成魔伤，3连击。 |
| 虫击 | attack | partially_implemented | basic_damage, power_modifier, response_status | 造成物伤，应对状态：本次技能威力变为2倍，无视敌方系别抵抗。 |
| 虫茧 | status | partially_implemented | drain, heal, team_switch | 自己回复20%生命，己方队伍获得1次奉献：获得10%吸血。 |
| 虫结阵 | defense | partially_implemented | damage_reduction, response_attack, team_switch | 减伤80%，应对攻击：己方队伍获得1次随机奉献。 |
