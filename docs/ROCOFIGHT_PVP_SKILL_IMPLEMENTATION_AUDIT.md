# RocoFight PVP Skill Implementation Audit

Generated at: 2026-04-28

Scope: 78 unique skills carried by the current 25-pet PVP database in `src/rocofight/pvp.ts`.

Legend:

- `aligned`: implemented directly against the current skill text.
- `assumption`: implemented, but the text does not expose an exact official formula or timing edge case.
- `fixture_needed`: the current code has a placeholder or partial model and needs official replay/simulator samples before it can be called final.

| Skill | Verdict | Current implementation check |
| --- | --- | --- |
| 报复 | aligned | Reduces incoming attack damage by 70%; on attack response, target loses 3 energy. |
| 暴风雪 | aligned | Deals physical damage and applies 1 freeze mark. |
| 背袭 | aligned | Deals magical damage; if target energy is 0, damage multiplier is 20x. |
| 冰墙 | aligned | Reduces incoming attack damage by 80%; on attack response, applies 2 freeze marks. |
| 冰爪 | aligned | Basic physical damage. |
| 操控 | assumption | Applies target global energy cost +7 for 3 turns. If the user acts after the target, current-turn cost is not retroactively changed. |
| 缠丝劲 | aligned | Physical damage, 2 hits. |
| 超级糖果 | aligned | Physical damage with current-use power +60 and self cute. Illegal when energy is insufficient. |
| 嘲弄 | aligned | Self magic attack +90%; if target actively switched this turn, self speed +70. |
| 齿轮扭矩 | aligned | Gains permanent +20 power whenever this skill's slot changes. |
| 赤子之心 | aligned | Self cute and permanent all-skill energy cost -3. |
| 抽枝 | aligned | Physical damage; on status response, heals 50% max HP and restores 5 energy. |
| 打湿 | aligned | Applies 1 wet mark to self. |
| 大爆炸 | aligned | Basic magical damage. |
| 地刺 | aligned | Physical damage; on status response, interrupts the answered skill. |
| 顶端优势 | aligned | Basic physical damage. |
| 毒孢子 | aligned | Applies 5 poison marks using the engine poison stack rules. |
| 遁地 | assumption | Reduces incoming attack damage by 50% and switches self out. Official fixture can clarify whether switch-out requires a triggered response. |
| 跺地 | aligned | Basic physical damage. |
| 防御 | aligned | On attack response, reduces incoming damage by 70%. |
| 飞羽 | aligned | Native swift trigger on active switch-in, resolved by normal speed order; clears 1 enemy positive effect stack/entry. |
| 焚烧烙印 | aligned | Clears all marks on both active pets; target receives 5 burn marks per cleared mark stack. |
| 钢铁洪流 | aligned | Physical damage; slot 1 power +90; transmission 2. |
| 高温回火 | aligned | Magical damage and switches self out. |
| 勾魂 | aligned | Steals 3 energy from target. |
| 光合作用 | aligned | Applies 1 photosynthesis mark to self. |
| 光之矛 | aligned | Physical damage, 3 hits. |
| 回旋风暴 | aligned | Basic magical damage. |
| 回旋踢 | aligned | Physical damage; if target actively switched this turn, current damage is doubled. |
| 火焰护盾 | aligned | Reduces incoming attack damage by 70%; on attack response, applies 6 burn marks. |
| 击鼓传花 | aligned | Switches self out; next active pet inherits transferable positive effects. |
| 疾风刺 | aligned | Physical damage, 1 hit; if acting before target, becomes 3 hits. |
| 疾风连袭 | aligned | Releases all currently swift skills in slot order, excluding itself. In 6v6, `飓风` teammate matching is included when deciding which skills have swift. This skill's cost includes half of the chained swift skills' current energy costs, rounded down, and still gains +1 self cost after each use. |
| 加大功率 | aligned | Switches self out; replacement restores 8 energy. |
| 降灵 | aligned | Applies 1 spirit mark to target. |
| 截拳 | aligned | Physical damage; on status response, interrupts the answered skill and refunds that skill's energy cost. |
| 惊吓盒子 | aligned | Physical damage; on status response, target loses 6 energy. |
| 恐吓 | aligned | Basic magical damage. |
| 力量增效 | aligned | Self physical attack +100%. |
| 灵媒 | aligned | Basic magical damage. |
| 龙卷风 | aligned | Native swift trigger on active switch-in, resolved by normal speed order; on status response, current power multiplier is 1.5x. |
| 乱打 | aligned | Magical damage, 5 hits. |
| 落雷 | aligned | Magical damage; each entry grants this skill permanent +20 power. |
| 鸣沙陷阱 | aligned | Physical damage; if user's physical defense is not higher than target's, power is 60; if higher, power is `min(170, 120 + defense difference)`. |
| 啮合传递 | aligned | Self speed +80; if in slot 1 or 3, self physical attack +60%; transmission 1. |
| 破罐破摔 | aligned | Magical damage; if self has a debuff, current power +60. |
| 破绽 | aligned | Target dual defense -70%; on defense response, self physical attack +70%. |
| 气泡 | aligned | Basic magical damage. |
| 倾泻 | aligned | Magical damage; clears all marks on both active pets only when target did not choose defense. |
| 热身运动 | aligned | Self hit count +3. |
| 沙涌 | aligned | Starts 8-turn sandstorm weather. While active, ground skill energy costs are halved and rounded down. |
| 晒太阳 | aligned | Clears all enemy positive effects. |
| 闪击 | aligned | Physical damage; if user's speed is not higher than target's, power is 60; if higher, power is `min(170, 120 + speed difference)`. |
| 食腐 | aligned | Clears target marks only; heals 10% max HP per cleared mark stack. |
| 嗜痛 | assumption | Reduces incoming attack damage by 80%; on attack response, grants dual attack +40% once per answered damage event. Multi-hit per-hit stacking needs official confirmation. |
| 水光冲击 | aligned | Basic magical damage. |
| 水环 | aligned | Reduces incoming attack damage by 60%; on attack response, self all-skill energy cost -2. |
| 水刃 | aligned | Physical damage; on status response, this skill's energy cost permanently -4. |
| 撕咬 | aligned | Physical damage, 3 hits; if self HP is below 50%, +2 hits. |
| 隼鳞 | aligned | Basic physical damage. |
| 藤绞 | aligned | Physical damage and restores 5 energy. |
| 听桥 | aligned | Reduces incoming attack damage by 60%; on attack response, deals physical counter damage using the answered skill's power through the normal damage formula. |
| 偷袭 | aligned | Physical damage; on status response, current power multiplier is 3x. |
| 吞噬 | aligned | Physical damage; if it knocks out the target, self restores 6 energy. |
| 尾后针 | aligned | Basic physical damage. |
| 午夜噪音 | aligned | Magical damage, 5 hits. |
| 吓退 | aligned | Reduces incoming attack damage by 60%; on attack response, forces the attacking target to switch out. |
| 先发制人 | aligned | Physical damage with priority +1. |
| 休息回复 | aligned | Heals self for 30% max HP. |
| 音波弹 | aligned | Magical damage, 1 hit. |
| 影袭 | aligned | Basic physical damage. |
| 硬化 | aligned | Reduces incoming attack damage by 90%; if the previous used skill was an attack, this skill's energy cost is reduced by 2. |
| 有效预防 | aligned | Reduces incoming attack damage by 50%; on attack response, next action gains priority +1. |
| 羽化加速 | aligned | Native swift trigger on active switch-in, resolved by normal speed order; self all-skill power +20. |
| 折射 | aligned | Uses the simplified PVP model: after each release, all self skill energy costs -1, self magic attack +40%, and future `折射` power +20. |
| 轴承支撑 | aligned | Active use permanently reduces this skill's own energy cost by 1; adjacent skills cost -1; transmission 1. |
| 主轴 | aligned | Basic physical damage; fixed slot, does not move through transmission. |
| 追打 | aligned | Magical damage, 1 hit; on status response, becomes 3 hits. |

## Code Changes From This Audit

- Corrected swift semantics: native swift is a switch-in trigger and still resolves by normal speed order; it is not priority by itself.
- Split mark clearing from status clearing, so mark-only skills no longer erase ordinary statuses.
- Added per-cleared-mark burn/heal handling for `焚烧烙印` and `食腐`.
- Added target-switch handling for `吓退`, switch-turn conditions for `回旋踢` and `嘲弄`, next-turn priority persistence for `有效预防`, and full-formula counter damage for `听桥`.
- Added `硬化` previous-attack cost logic, `轴承支撑` adjacent cost logic, and broader effect inheritance for `击鼓传花` / `洁癖`.
- Added global sandstorm weather, `疾风连袭` chained swift execution, and the simplified stacking `折射` model.
