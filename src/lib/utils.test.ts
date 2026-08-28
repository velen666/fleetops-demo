import { describe, expect, it } from 'vitest'
import { ruCount } from './utils'

describe('ruCount', () => {
  const forms = ['инцидент', 'инцидента', 'инцидентов'] as const

  it.each([
    [0, '0 инцидентов'],
    [1, '1 инцидент'],
    [2, '2 инцидента'],
    [4, '4 инцидента'],
    [5, '5 инцидентов'],
    [11, '11 инцидентов'],
    [21, '21 инцидент'],
    [22, '22 инцидента'],
    [25, '25 инцидентов'],
  ])('uses the correct Russian form for %i', (count, expected) => {
    expect(ruCount(count, forms)).toBe(expected)
  })
})
