import type { Provenance, Weekend } from '../../src/shared/contracts/results.js';
type WeekendOverrides = Omit<Partial<Weekend>, 'metadata'> & {
  metadata?: { calendar?: Partial<Provenance>; timing?: Partial<Provenance> };
};
export function weekendFixture(overrides: WeekendOverrides = {}): Weekend {
  const provenance: Provenance = { source: 'Fixture', at: 0, stale: false, message: null };
  return {
    season: '2026',
    round: '1',
    name: 'Fixture Grand Prix',
    circuitId: 'albert_park',
    circuit: 'Albert Park',
    location: 'Melbourne',
    country: 'Australia',
    date: '2026-03-08',
    time: null,
    sessions: [],
    meetingKey: null,
    pollFrom: 0,
    pollUntil: 0,
    ...overrides,
    metadata: {
      calendar: { ...provenance, ...overrides.metadata?.calendar },
      timing: { ...provenance, ...overrides.metadata?.timing },
    },
  };
}
