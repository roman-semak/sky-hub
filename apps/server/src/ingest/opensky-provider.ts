import type { Aircraft } from '@skytrace/adsb-types';
import { resolveEmergency } from '@skytrace/adsb-types';
import { splitBBox, type CoverageCircle } from '@skytrace/geo';
import { z } from 'zod';
import { USER_AGENT, type FetchFn, type Provider, type ProviderOutcome } from './provider.js';

// OpenSky state vector, positional array.
// https://openskynetwork.github.io/opensky-api/rest.html#all-state-vectors
const StateVectorSchema = z
  .tuple([
    z.string(), // 0 icao24
    z.string().nullable(), // 1 callsign
    z.string(), // 2 origin_country
    z.number().nullable(), // 3 time_position
    z.number(), // 4 last_contact
    z.number().nullable(), // 5 longitude
    z.number().nullable(), // 6 latitude
    z.number().nullable(), // 7 baro_altitude (m)
    z.boolean(), // 8 on_ground
    z.number().nullable(), // 9 velocity (m/s)
    z.number().nullable(), // 10 true_track
    z.number().nullable(), // 11 vertical_rate (m/s)
    z.unknown(), // 12 sensors
    z.number().nullable(), // 13 geo_altitude (m)
    z.string().nullable(), // 14 squawk
    z.boolean(), // 15 spi
    z.number(), // 16 position_source
  ])
  .rest(z.unknown());

const ResponseSchema = z.object({
  time: z.number(),
  states: z.array(z.unknown()).nullable(),
});

const M_TO_FT = 3.28084;
const MPS_TO_KT = 1.943844;
const MPS_TO_FPM = 196.8504;

const round = (v: number | null, k: number): number | null =>
  v === null ? null : Math.round(v * k);

type StateVector = z.infer<typeof StateVectorSchema>;

export function stateVectorToAircraft(sv: StateVector): Aircraft | null {
  const [
    icao,
    callsign,
    ,
    timePos,
    lastContact,
    lon,
    lat,
    baroAlt,
    onGround,
    vel,
    trk,
    vr,
    ,
    geoAlt,
    squawk,
    ,
    posSource,
  ] = sv;
  if (lat === null || lon === null || timePos === null) return null;
  const cs = callsign?.trim() ?? '';
  return {
    hex: icao.toLowerCase(),
    callsign: cs === '' ? null : cs,
    registration: null,
    typeCode: null,
    lat,
    lon,
    altBaro: onGround ? 0 : round(baroAlt, M_TO_FT),
    altGeom: round(geoAlt, M_TO_FT),
    onGround,
    gs: vel === null ? null : Math.round(vel * MPS_TO_KT * 10) / 10,
    track: trk,
    baroRate: round(vr, MPS_TO_FPM),
    squawk,
    emergency: resolveEmergency(undefined, squawk ?? undefined),
    category: null,
    navAltitudeMcp: null,
    messages: 0,
    rssi: null,
    mlat: posSource === 2,
    tisb: false,
    military: false,
    ladd: false,
    pia: false,
    posTime: timePos * 1000,
    seenTime: lastContact * 1000,
  };
}

/**
 * OpenSky Network anonymous REST API. Strict daily credit limits, so it is
 * only used for circles outside community coverage and responses are cached
 * for at least 10 s (SPEC § 1.3).
 */
export class OpenSkyProvider implements Provider {
  readonly id = 'opensky';
  readonly fallbackOnly = true;
  private readonly cache = new Map<string, { at: number; outcome: ProviderOutcome }>();

  constructor(
    readonly minIntervalMs = 30_000,
    private readonly cacheTtlMs = 10_000,
    private readonly fetchFn: FetchFn = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async fetchCircle(circle: CoverageCircle, signal: AbortSignal): Promise<ProviderOutcome> {
    const cached = this.cache.get(circle.id);
    if (cached !== undefined && this.now() - cached.at < this.cacheTtlMs) return cached.outcome;
    // OpenSky bboxes cannot cross the antimeridian; take the larger half.
    const [box] = splitBBox(circle.bbox);
    if (box === undefined) return { kind: 'ok', aircraft: [], invalid: 0 };
    const [w, s, e, n] = box;
    const url = `https://opensky-network.org/api/states/all?lamin=${s}&lomin=${w}&lamax=${n}&lomax=${e}`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        headers: { 'user-agent': USER_AGENT },
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      });
    } catch (err) {
      return {
        kind: 'error',
        status: null,
        message: err instanceof Error ? err.message : String(err),
      };
    }
    if (res.status === 429) return { kind: 'rate-limited', status: 429 };
    if (!res.ok) return { kind: 'error', status: res.status, message: `HTTP ${res.status}` };
    const parsed = ResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success)
      return { kind: 'error', status: res.status, message: parsed.error.message };
    const aircraft: Aircraft[] = [];
    let invalid = 0;
    for (const raw of parsed.data.states ?? []) {
      const sv = StateVectorSchema.safeParse(raw);
      if (!sv.success) {
        invalid++;
        continue;
      }
      const ac = stateVectorToAircraft(sv.data);
      if (ac !== null) aircraft.push(ac);
    }
    const outcome: ProviderOutcome = { kind: 'ok', aircraft, invalid };
    this.cache.set(circle.id, { at: this.now(), outcome });
    return outcome;
  }
}
