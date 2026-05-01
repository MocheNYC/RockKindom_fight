# RocoFight PVP Passive Audit

Generated at: 2026-04-28

Scope: the current 25-pet PVP database in `src/rocofight/pvp.ts`.

Legend:

- `correct`: current engine behavior matches the trait text closely enough for simulation.
- `partial`: an important subset is implemented, but team, bench, timing, or stack details are incomplete.
- `incorrect`: current behavior differs materially from the trait text.
- `missing`: trait is registered or present in data, but no effective battle implementation exists.

| Pet | Trait | Official text | Current implementation | Verdict |
| --- | --- | --- | --- | --- |
| 雪影娃娃 | 捉迷藏 | 使敌方获得冻结时，也会使其获得全技能能耗+1。 | `applyStatusPassiveHooks` adds a global energy-cost modifier when this pet applies freeze. | correct |
| 圣羽翼王 | 飓风 | 对本精灵的技能，若其他翼系精灵携带相同技能，则获得迅捷。被敌方精灵击败时，自己额外损失1点魔力。 | Team battle grants swift only when another wing teammate carries the same skill; defeated-by-enemy extra energy loss is modeled. | correct |
| 帕帕斯卡 | 翼轴 | 1号位技能获得迅捷和传动1。 | Slot 1 gets priority and transmission; switch-in swift also works for slot 1. | correct |
| 岚鸟 | 顺风 | 若先于敌方攻击，本次技能威力+50%。 | First-moving damaging skills get `powerMultiplier *= 1.5`. | correct |
| 圣剑-X | 正位宝剑 | 仅可以使用1号位技能。 | Non-slot-1 skills fail legality. | correct |
| 寂灭骨龙 | 不朽 | 力竭3回合后复活。 | Team battle schedules revive after 3 turns instead of preventing lethal damage immediately; currently revives at 1 HP pending fixture confirmation. | correct |
| 巨噬针鼹 | 壮胆 | 队伍存在虫系精灵，自己获得双攻+50%。 | Team composition check grants dual attack +50% when the side has a bug pet. | correct |
| 画间沉铁兽 | 变形活画 | 攻击时，敌方每有1层增益，本次技能威力+10%。 | Counts positive stat entries and positive status/mark stacks, then adds 10% power per layer. | correct |
| 布克棱岩 | 地脉 | 初始能量为0，入场前己方精灵每放1次地系技能，回复3能量。 | Initial energy is 0; bench-side ground-skill charging now restores 3 energy per allied ground skill. | correct |
| 食尘短绒 | 特殊清洁场景 | 回合结束时偷取敌方1层印记。 | End-turn passive steals one mark stack and no longer falls back to non-mark statuses. | correct |
| 声波缇塔 | 向心力 | 1号位和2号位技能获得传动1和威力+30。 | Slot 1/2 get transmission and +30 power. | correct |
| 棋绮后 | 渗透 | 己方精灵每使用1次武系或地系技能，自己入场时获得攻防+5%。 | Team battle tracks allied fighting/ground skill history and applies attack/defense stacks on entry. | correct |
| 翠顶夫人 | 洁癖 | 离场后，自己的增益和减益会被更换入场的精灵继承。 | Switch-out inheritance copies transferable buffs and debuffs to the replacement. | correct |
| 皇家狮鹫 | 乘风连击 | 使用翼系技能后，获得连击数+1。 | Wing skill use now permanently increases this combatant's hit modifier after the skill resolves. | correct |
| 幻影灵菇 | 毒蘑菇 | 回合结束时，偷取敌方场上所有精灵1能量。 | In 1v1 active combat, steals 1 energy from the opposing active pet each end turn. | correct |
| 利灯鱼 | 对流 | 自己的能耗增加变为能耗降低；能耗降低变为能耗增加。 | Energy-cost modifier signs are inverted when applied to this combatant. | correct |
| 尖嘴狐仙 | 灵魂灼伤 | 冰系技能使敌方获得4层灼烧，火系技能使敌方获得2层冻结。 | Ice skill applies burn 4; fire skill applies freeze 2. | correct |
| 梦悠悠 | 做噩梦 | 敌方精灵离场后，更换入场的精灵失去3能量。 | Enemy replacements lose 3 energy after the nightmare pet forces or observes a switch. | correct |
| 蹦床松鼠 | 囤积 | 每有1能量，获得双防+10%。 | Effective physical/magic defense scales by `1 + energy * 0.1`. | correct |
| 落陨星兔 | 陨落 | 在场时，双方回合结束时触发的效果，触发次数-1。 | End-turn passive/status/mark effects are globally suppressed while either active pet has this trait. This is plausible but broad. | partial |
| 记忆石 | 不移 | 携带的无额外效果的攻击技能，威力+30%。 | Basic-damage-only text gets `powerMultiplier *= 1.3`. | correct |
| 化蝶 | 化茧 | 受到致命伤害时，获得1层萌化，并免疫此次伤害。 | First lethal hit is prevented when not already cute; cute is applied. | correct |
| 白金独角兽 | 目空 | 携带的非光系技能，威力+25%。 | Non-light damaging skills get `powerMultiplier *= 1.25`. | correct |
| 朔夜伊芙 | 嫁祸 | 自己每失去25%生命，连击数+2。 | Hit bonus is `floor(lostHpRatio / 0.25) * 2`. | correct |
| 黑猫巫师 | 预警 | 若敌方技能足够击败自己，回合开始时自己获得速度+50。 | Lethal incoming skill detection applies a temporary flat speed +50 at turn start. | correct |

## Summary

| Verdict | Count |
| --- | ---: |
| correct | 24 |
| partial | 1 |
| incorrect | 0 |
| missing | 0 |

## Remaining Risk

1. `陨落`: current code suppresses end-turn passive/status/mark effects globally while either active pet has this trait. The text says end-turn trigger count becomes 1, so official fixtures are still needed to decide whether suppression should be narrower.
2. `不朽`: delayed revive timing is implemented; the exact revive HP is assumed to be 1 until an official fixture proves another value.
