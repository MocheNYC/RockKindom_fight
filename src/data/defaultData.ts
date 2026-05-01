import { attributes } from './attributes.generated'
import { pets } from './pets.generated'
import { supplement } from './supplement.generated'
import { skills } from './skills.generated'
import { dataSnapshot } from './snapshot.generated'
import type { DexDataBundle } from '../types'

export const defaultDexData = {
  snapshot: dataSnapshot,
  pets,
  attributes,
  skills,
  supplement,
} satisfies DexDataBundle
