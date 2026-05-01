import type { DataSource } from '../types'

export const dataSources = [
  {
    key: 'bwiki-rocom',
    name: 'BWIKI 洛克王国:手游WIKI',
    url: 'https://wiki.biligame.com/rocom/精灵图鉴',
    license: 'CC BY-NC-SA 4.0',
    note: '本地 demo 使用公开精灵图鉴页与精灵信息模板作为主数据源。',
  },
  {
    key: 'rocokingdom-dex',
    name: 'Roco Kingdom Dex',
    url: 'https://github.com/CeerDecy/rocokingdom-dex',
    license: 'Apache-2.0',
    note: '本地 demo 使用其公开 pets.json 与属性表补充属性克制和部分进化条件。',
  },
] satisfies DataSource[]
