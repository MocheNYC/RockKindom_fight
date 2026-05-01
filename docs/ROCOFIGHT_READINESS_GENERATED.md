# RocoFight Readiness Generated Audit

Generated at: 2026-05-01T16:51:29.106Z

## Summary

| Metric | Value |
| --- | ---: |
| PVP pets | 26 |
| Unique PVP skills | 80 |
| Unique PVP passives | 25 |
| Missing registry skills | 0 |
| Invalid PVP database items | 0 |
| Missing passive registry entries | 0 |
| Passives without code proof | 0 |
| Passives without fixture proof | 0 |
| Passives with text mechanic gaps | 0 |
| Skills with text mechanic gaps | 0 |
| High-risk skills without fixture proof | 0 |
| Partial-timing skills without fixture proof | 0 |

## Skill Status

| Status | Count |
| --- | ---: |
| implemented_high_risk | 49 |
| implemented_low_risk | 16 |
| basic_damage_only | 13 |
| implemented_partial_timing | 2 |

## Mechanic Buckets

| Mechanic | Count |
| --- | ---: |
| response | 21 |
| energy | 16 |
| power_modifier | 13 |
| mark_stack | 12 |
| damage_reduction | 11 |
| history | 9 |
| multi_hit | 9 |
| switch | 7 |
| cleanse | 5 |
| position | 5 |
| priority | 5 |
| stat_modifier | 5 |
| heal | 4 |
| control_mark | 2 |
| stat_comparison | 2 |
| field_weather | 1 |
| manual_gap | 1 |
| status_condition | 1 |
| swift | 1 |
| switch_in | 1 |

## Skill Text Mechanic Gaps

| Mechanic | Count |
| --- | ---: |

## PVP Passive Support

| Pet | Passive | Registry mechanics | Text mechanics | Text gaps | Code proof | Fixture proof | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 雪影娃娃 | 捉迷藏 | mark_status, energy_modifier | energy_modifier |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_mark_status_metadata, passive_energy_modifier_metadata |  |
| 圣羽翼王 | 飓风 | priority_modifier, energy_modifier | energy_modifier, priority_modifier |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_priority_modifier_metadata, passive_energy_modifier_metadata |  |
| 帕帕斯卡 | 翼轴 | priority_modifier, position_transmission | priority_modifier |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_priority_modifier_metadata, passive_position_transmission_metadata |  |
| 岚鸟 | 顺风 | damage_modifier | damage_modifier |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_damage_modifier_metadata |  |
| 圣剑-X | 正位宝剑 | skill_restriction |  |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_skill_restriction_metadata |  |
| 寂灭骨龙 | 不朽 | delayed_revive | delayed_revive |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_delayed_revive_metadata |  |
| 巨噬针鼹 | 壮胆 | team_composition, stat_modifier | stat_modifier |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_team_composition_metadata, passive_stat_modifier_metadata |  |
| 画间沉铁兽 | 变形活画 | damage_modifier | damage_modifier |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_damage_modifier_metadata |  |
| 布克棱岩 | 地脉 | battle_start, bench_energy | energy_modifier, switch_in |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_battle_start_metadata, passive_bench_energy_metadata |  |
| 食尘短绒 | 特殊清洁场景 | end_turn, mark_status | end_turn, mark_status |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_end_turn_metadata, passive_mark_status_metadata |  |
| 声波缇塔 | 向心力 | damage_modifier, position_transmission | damage_modifier |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_damage_modifier_metadata, passive_position_transmission_metadata |  |
| 棋绮后 | 渗透 | team_history, switch_in, stat_modifier | switch_in |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_team_history_metadata, passive_switch_in_metadata, passive_stat_modifier_metadata |  |
| 翠顶夫人 | 洁癖 | switch_inheritance | switch_in, switch_inheritance |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_switch_inheritance_metadata |  |
| 皇家狮鹫 | 乘风连击 | hit_modifier | hit_modifier |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_hit_modifier_metadata |  |
| 幻影灵菇 | 毒蘑菇 | end_turn, energy_modifier | end_turn, energy_modifier |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_end_turn_metadata, passive_energy_modifier_metadata |  |
| 利灯鱼 | 对流 | energy_modifier | energy_modifier |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_energy_modifier_metadata |  |
| 尖嘴狐仙 | 灵魂灼伤 | mark_status | mark_status |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_mark_status_metadata |  |
| 梦悠悠 | 做噩梦 | switch_in, energy_modifier | energy_modifier, switch_in |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_switch_in_metadata, passive_energy_modifier_metadata |  |
| 蹦床松鼠 | 囤积 | stat_modifier | stat_modifier |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_stat_modifier_metadata |  |
| 落陨星兔 | 陨落 | field_suppression | end_turn |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_field_suppression_metadata |  |
| 记忆石 | 不移 | damage_modifier | damage_modifier |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_damage_modifier_metadata |  |
| 化蝶 | 化茧 | lethal_guard, mark_status | damage_modifier, lethal_guard, mark_status |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_lethal_guard_metadata, passive_mark_status_metadata |  |
| 白金独角兽 | 目空 | damage_modifier | damage_modifier |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_damage_modifier_metadata |  |
| 朔夜伊芙 | 嫁祸 | hit_modifier | hit_modifier |  | engine_or_team_code_reference | all_pvp_passive_registry_fixture, passive_hit_modifier_metadata |  |
| 黑猫巫师 | 预警 | priority_modifier, stat_modifier | stat_modifier |  | engine_or_team_code_reference | focused_passive_test, all_pvp_passive_registry_fixture, passive_priority_modifier_metadata, passive_stat_modifier_metadata |  |
| 龙息帕尔 |  |  |  |  |  |  | PVP pet has no trait name.; No trait description in source data.; No direct implementation code reference found.; No direct or generic passive fixture proof found. |

## High-Risk And Partial Timing Queue

| Skill | Status | Mechanics | Text mechanics | Text gaps | Fixture proof | Carried by | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 报复 | implemented_high_risk | damage_reduction, energy, response | damage_reduction, energy, response |  | all_pvp_skill_execution_fixture, generic_response_fixture | 幻影灵菇 (phantom-mushroom) | Needs replay fixture proof before treated as official-like. |
| 暴风雪 | implemented_high_risk | control_mark, mark_stack | mark_stack |  | focused_skill_test, all_pvp_skill_execution_fixture, mark_stack_fixture | 雪影娃娃 (snow-shadow-doll); 尖嘴狐仙 (sharp-beak-fox-fairy) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 背袭 | implemented_high_risk | energy, history, power_modifier | energy, power_modifier |  | all_pvp_skill_execution_fixture | 梦悠悠 (dream-yoyo) | Needs replay fixture proof before treated as official-like. |
| 冰墙 | implemented_high_risk | control_mark, damage_reduction, mark_stack, response | damage_reduction, mark_stack, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture, mark_stack_fixture | 雪影娃娃 (snow-shadow-doll) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 超级糖果 | implemented_high_risk | mark_stack, power_modifier | mark_stack, power_modifier |  | focused_skill_test, all_pvp_skill_execution_fixture, mark_stack_fixture | 帕帕斯卡 (papasika) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 嘲弄 | implemented_high_risk | history, stat_modifier, switch | history, stat_modifier, switch |  | focused_skill_test, all_pvp_skill_execution_fixture, team_switch_fixture | 落陨星兔 (fallen-star-rabbit) | Needs replay fixture proof before treated as official-like.; Verify pending switch, forced switch, and switch-in hooks together. |
| 齿轮扭矩 | implemented_high_risk | history, position, power_modifier | history, position, power_modifier |  | focused_skill_test, all_pvp_skill_execution_fixture | 帕帕斯卡 (papasika); 圣剑-X (holy-sword-x); 声波缇塔 (sonic-tita) | Needs replay fixture proof before treated as official-like. |
| 赤子之心 | implemented_high_risk | energy, mark_stack | energy, mark_stack |  | focused_skill_test, all_pvp_skill_execution_fixture, mark_stack_fixture | 雪影娃娃 (snow-shadow-doll) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 抽枝 | implemented_high_risk | energy, heal, response | energy, heal, response |  | all_pvp_skill_execution_fixture, generic_response_fixture | 幻影灵菇 (phantom-mushroom) | Needs replay fixture proof before treated as official-like. |
| 打湿 | implemented_high_risk | mark_stack | mark_stack |  | all_pvp_skill_execution_fixture, mark_stack_fixture | 利灯鱼 (light-lantern-fish) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 地刺 | implemented_high_risk | response | response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture | 巨噬针鼹 (giant-devourer-echidna); 布克棱岩 (book-prism-rock); 食尘短绒 (dust-eating-fuzz); 声波缇塔 (sonic-tita) | Needs replay fixture proof before treated as official-like. |
| 毒孢子 | implemented_high_risk | mark_stack | mark_stack |  | focused_skill_test, all_pvp_skill_execution_fixture, mark_stack_fixture | 化蝶 (butterfly) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 遁地 | implemented_high_risk | damage_reduction, response, switch | damage_reduction, response, switch |  | all_pvp_skill_execution_fixture, generic_response_fixture, team_switch_fixture | 布克棱岩 (book-prism-rock); 食尘短绒 (dust-eating-fuzz) | Needs replay fixture proof before treated as official-like.; Verify pending switch, forced switch, and switch-in hooks together. |
| 防御 | implemented_high_risk | damage_reduction, response | damage_reduction, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture | 记忆石 (memory-stone) | Needs replay fixture proof before treated as official-like. |
| 飞羽 | implemented_high_risk | cleanse, priority | cleanse, priority |  | focused_skill_test, all_pvp_skill_execution_fixture, cleanse_fixture | 翠顶夫人 (emerald-lady) | Needs replay fixture proof before treated as official-like. |
| 焚烧烙印 | implemented_high_risk | cleanse, mark_stack | cleanse, mark_stack |  | focused_skill_test, all_pvp_skill_execution_fixture, mark_stack_fixture, cleanse_fixture | 尖嘴狐仙 (sharp-beak-fox-fairy) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 钢铁洪流 | implemented_high_risk | position, power_modifier | position, power_modifier |  | focused_skill_test, all_pvp_skill_execution_fixture | 帕帕斯卡 (papasika) | Needs replay fixture proof before treated as official-like. |
| 高温回火 | implemented_high_risk | switch | switch |  | focused_skill_test, all_pvp_skill_execution_fixture, team_switch_fixture | 尖嘴狐仙 (sharp-beak-fox-fairy) | Needs replay fixture proof before treated as official-like.; Verify pending switch, forced switch, and switch-in hooks together. |
| 光合作用 | implemented_high_risk | mark_stack | mark_stack |  | all_pvp_skill_execution_fixture, mark_stack_fixture | 记忆石 (memory-stone) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 回旋踢 | implemented_high_risk | history, power_modifier, switch | history, power_modifier, switch |  | focused_skill_test, all_pvp_skill_execution_fixture, team_switch_fixture | 画间沉铁兽 (gallery-iron-beast) | Needs replay fixture proof before treated as official-like.; Verify pending switch, forced switch, and switch-in hooks together. |
| 火焰护盾 | implemented_high_risk | damage_reduction, mark_stack, response | damage_reduction, mark_stack, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture, mark_stack_fixture | 尖嘴狐仙 (sharp-beak-fox-fairy) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 击鼓传花 | implemented_high_risk | switch | switch |  | focused_skill_test, all_pvp_skill_execution_fixture, team_switch_fixture | 雪影娃娃 (snow-shadow-doll) | Needs replay fixture proof before treated as official-like.; Verify pending switch, forced switch, and switch-in hooks together. |
| 疾风刺 | implemented_high_risk | history, multi_hit | history, multi_hit |  | all_pvp_skill_execution_fixture | 皇家狮鹫 (royal-griffin) | Needs replay fixture proof before treated as official-like. |
| 疾风连袭 | implemented_high_risk | energy, history, swift | energy, history, priority |  | focused_skill_test, all_pvp_skill_execution_fixture | 圣羽翼王 (holy-wing-king) | Needs replay fixture proof before treated as official-like. |
| 加大功率 | implemented_high_risk | energy, switch | energy, switch |  | focused_skill_test, all_pvp_skill_execution_fixture, team_switch_fixture | 利灯鱼 (light-lantern-fish) | Needs replay fixture proof before treated as official-like.; Verify pending switch, forced switch, and switch-in hooks together. |
| 降灵 | implemented_high_risk | mark_stack | mark_stack |  | all_pvp_skill_execution_fixture, mark_stack_fixture | 寂灭骨龙 (annihilation-bone-dragon) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 截拳 | implemented_high_risk | energy, history, response | energy, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture | 画间沉铁兽 (gallery-iron-beast) | Needs replay fixture proof before treated as official-like. |
| 惊吓盒子 | implemented_high_risk | energy, response | energy, response |  | all_pvp_skill_execution_fixture, generic_response_fixture | 幻影灵菇 (phantom-mushroom) | Needs replay fixture proof before treated as official-like. |
| 龙卷风 | implemented_high_risk | power_modifier, priority, response | power_modifier, priority, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture | 岚鸟 (lan-bird) | Needs replay fixture proof before treated as official-like. |
| 落雷 | implemented_high_risk | power_modifier, switch_in | power_modifier, switch |  | focused_skill_test, all_pvp_skill_execution_fixture | 利灯鱼 (light-lantern-fish) | Needs replay fixture proof before treated as official-like. |
| 啮合传递 | implemented_high_risk | position, stat_modifier | position, stat_modifier |  | focused_skill_test, all_pvp_skill_execution_fixture | 圣剑-X (holy-sword-x); 声波缇塔 (sonic-tita) | Needs replay fixture proof before treated as official-like. |
| 破绽 | implemented_high_risk | response, stat_modifier | response, stat_modifier |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture | 棋绮后 (chess-queen) | Needs replay fixture proof before treated as official-like. |
| 倾泻 | implemented_high_risk | cleanse, mark_stack, response | cleanse, mark_stack, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture, mark_stack_fixture, cleanse_fixture | 帕帕斯卡 (papasika) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 沙涌 | implemented_high_risk | field_weather | field_weather |  | focused_skill_test, all_pvp_skill_execution_fixture | 布克棱岩 (book-prism-rock); 食尘短绒 (dust-eating-fuzz) | Needs replay fixture proof before treated as official-like. |
| 晒太阳 | implemented_high_risk | cleanse | cleanse |  | all_pvp_skill_execution_fixture, cleanse_fixture | 化蝶 (butterfly) | Needs replay fixture proof before treated as official-like. |
| 食腐 | implemented_high_risk | cleanse, heal, mark_stack | cleanse, heal, mark_stack |  | focused_skill_test, all_pvp_skill_execution_fixture, mark_stack_fixture, cleanse_fixture | 化蝶 (butterfly) | Needs replay fixture proof before treated as official-like.; Verify stack count, duration, cleanse, and end-turn damage. |
| 嗜痛 | implemented_high_risk | damage_reduction, response, stat_modifier | damage_reduction, response |  | all_pvp_skill_execution_fixture, generic_response_fixture | 落陨星兔 (fallen-star-rabbit); 黑猫巫师 (black-cat-wizard) | Needs replay fixture proof before treated as official-like. |
| 水环 | implemented_high_risk | damage_reduction, energy, response | damage_reduction, energy, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture | 翠顶夫人 (emerald-lady) | Needs replay fixture proof before treated as official-like. |
| 水刃 | implemented_high_risk | energy, response | energy, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture | 圣羽翼王 (holy-wing-king); 岚鸟 (lan-bird); 翠顶夫人 (emerald-lady) | Needs replay fixture proof before treated as official-like. |
| 听桥 | implemented_high_risk | damage_reduction, power_modifier, response | damage_reduction, power_modifier, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture | 棋绮后 (chess-queen) | Needs replay fixture proof before treated as official-like. |
| 偷袭 | implemented_high_risk | power_modifier, response | power_modifier, response |  | all_pvp_skill_execution_fixture, generic_response_fixture | 寂灭骨龙 (annihilation-bone-dragon) | Needs replay fixture proof before treated as official-like. |
| 吞噬 | implemented_high_risk | energy, history | energy, history |  | focused_skill_test, all_pvp_skill_execution_fixture | 巨噬针鼹 (giant-devourer-echidna) | Needs replay fixture proof before treated as official-like. |
| 吓退 | implemented_high_risk | damage_reduction, response, switch | damage_reduction, response, switch |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture, team_switch_fixture | 寂灭骨龙 (annihilation-bone-dragon); 蹦床松鼠 (trampoline-squirrel) | Needs replay fixture proof before treated as official-like.; Verify pending switch, forced switch, and switch-in hooks together. |
| 硬化 | implemented_high_risk | damage_reduction, energy, history, response | damage_reduction, energy, history, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture | 布克棱岩 (book-prism-rock) | Needs replay fixture proof before treated as official-like. |
| 有效预防 | implemented_high_risk | damage_reduction, priority, response | damage_reduction, priority, response |  | focused_skill_test, all_pvp_skill_execution_fixture, generic_response_fixture | 皇家狮鹫 (royal-griffin); 朔夜伊芙 (shuo-night-eve) | Needs replay fixture proof before treated as official-like. |
| 折射 | implemented_high_risk | manual_gap | manual_gap |  | focused_skill_test, all_pvp_skill_execution_fixture | 白金独角兽 (platinum-unicorn) | Needs replay fixture proof before treated as official-like. |
| 轴承支撑 | implemented_high_risk | energy, position | energy, position |  | focused_skill_test, all_pvp_skill_execution_fixture | 声波缇塔 (sonic-tita) | Needs replay fixture proof before treated as official-like. |
| 主轴 | implemented_high_risk | position | position |  | focused_skill_test, all_pvp_skill_execution_fixture | 圣剑-X (holy-sword-x) | Needs replay fixture proof before treated as official-like. |
| 追打 | implemented_high_risk | multi_hit, response | multi_hit, response |  | all_pvp_skill_execution_fixture, generic_response_fixture | 白金独角兽 (platinum-unicorn) | Needs replay fixture proof before treated as official-like. |
| 先发制人 | implemented_partial_timing | priority | priority |  | focused_skill_test, all_pvp_skill_execution_fixture | 岚鸟 (lan-bird); 画间沉铁兽 (gallery-iron-beast); 龙息帕尔 (dragon-breath-pal) | Timing-sensitive implementation needs turn-order fixture proof. |
| 羽化加速 | implemented_partial_timing | power_modifier, priority | power_modifier, priority |  | all_pvp_skill_execution_fixture | 皇家狮鹫 (royal-griffin); 朔夜伊芙 (shuo-night-eve); 黑猫巫师 (black-cat-wizard) | Timing-sensitive implementation needs turn-order fixture proof. |

## Interpretation

- `missing_registry`: PvP skill text appears non-trivial but has no registry rule.
- `implemented_high_risk`: a rule exists, but switch, response, marks, field, history, or cleanse mechanics need replay proof.
- `implemented_partial_timing`: a rule exists, but turn order or response timing needs focused fixture tests.
- `implemented_low_risk`: a rule exists and no high-risk mechanics were detected.
- `basic_damage_only`: the skill behaves as plain damage under current text parsing.
- `fixtureProof`: automated or focused tests that currently exercise the skill or its mechanic bucket.

