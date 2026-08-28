import { describe, expect, it } from 'vitest'
import { CONTROL_TOTALS, generateDemoData } from './generator'
import {
  confirmedLossRubles,
  impactSeconds,
  powerAvailabilityPct,
  techAvailabilityPct,
  techUnavailableSeconds,
} from './metrics'

describe('canonical report metrics', () => {
  it('keeps technical availability, power availability, impact, technical unavailability, and loss separate', () => {
    const data = generateDemoData()

    expect(techAvailabilityPct(data.downtimes, data.robots.length)).toBeCloseTo(
      CONTROL_TOTALS.technicalAvailabilityPct,
      2,
    )
    expect(powerAvailabilityPct(data.downtimes, data.robots.length)).toBeCloseTo(
      CONTROL_TOTALS.operationalAvailabilityPct,
      2,
    )
    expect(impactSeconds(data.downtimes)).toBe(CONTROL_TOTALS.confirmedImpactMinutes * 60)
    expect(techUnavailableSeconds(data.downtimes)).toBe(49.5 * 3600)
    expect(confirmedLossRubles(data.downtimes)).toBe(986667)
  })
})
