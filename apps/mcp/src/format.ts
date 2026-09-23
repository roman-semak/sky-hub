import type { z } from 'zod';
import type {
  AirportSchema,
  Flight,
  HeatmapSchema,
  OverheadSchema,
  RouteSchema,
  SearchHit,
  StatsSchema,
  TrackSchema,
} from './schemas.js';

const NM_PER_DEG = 60;

const ft = (v: number | null): string => (v === null ? 'alt unknown' : `${v.toLocaleString()} ft`);
const kt = (v: number | null): string => (v === null ? 'speed unknown' : `${v} kt`);
const deg = (v: number | null): string => (v === null ? '—' : `${Math.round(v)}°`);
const iso = (t: number): string => new Date(t).toISOString().replace('.000', '');
const name = (f: { callsign: string | null; hex: string }): string =>
  f.callsign ?? f.hex.toUpperCase();

export function formatFlight(f: Flight): string {
  const lines = [
    `${name(f)} · ${f.hex.toUpperCase()}${f.registration === null ? '' : ` · ${f.registration}`}`,
    `Type: ${f.aircraftType?.name ?? f.typeCode ?? 'unknown'}`,
    `Operator: ${f.airline?.name ?? 'unknown'}${f.country === null ? '' : ` · registered in ${f.country}`}`,
    `Position: ${f.lat.toFixed(4)}, ${f.lon.toFixed(4)} at ${iso(f.posTime)}`,
    f.onGround
      ? 'On ground'
      : `Altitude ${ft(f.altBaro)}, ${kt(f.gs)}, track ${deg(f.track)}, ${
          f.baroRate === null ? 'vertical rate unknown' : `vertical rate ${f.baroRate} ft/min`
        }`,
    `Squawk: ${f.squawk ?? 'none'}${f.emergency === 'none' ? '' : ` · emergency: ${f.emergency}`}`,
  ];
  if (f.military) lines.push('Flagged military by the feed.');
  return lines.join('\n');
}

export function formatSearch(hits: readonly SearchHit[]): string {
  if (hits.length === 0) return 'No matches.';
  return hits
    .map((h) => {
      switch (h.kind) {
        case 'aircraft':
          return `aircraft · ${name(h)} · ${h.hex.toUpperCase()}${
            h.registration === null ? '' : ` · ${h.registration}`
          } · ${h.typeCode ?? 'type unknown'} · ${h.lat.toFixed(3)}, ${h.lon.toFixed(3)}`;
        case 'airport':
          return `airport · ${h.icao}${h.iata === null ? '' : `/${h.iata}`} · ${h.name} · ${h.country}`;
        case 'airline':
          return `airline · ${h.name}${h.icao === null ? '' : ` · ${h.icao}`}`;
      }
    })
    .join('\n');
}

export function formatOverhead(data: z.infer<typeof OverheadSchema>): string {
  if (data.aircraft.length === 0) return 'Nothing above the horizon right now.';
  const head = `Observer ${data.observer.lat.toFixed(4)}, ${data.observer.lon.toFixed(4)} at ${data.observer.elevationFt} ft, sorted by elevation angle:`;
  const rows = data.aircraft.map(
    (a) =>
      `${name(a)} · ${a.typeCode ?? 'type unknown'} · elevation ${a.elevation.toFixed(1)}°, azimuth ${a.azimuth.toFixed(0)}° · ${ft(a.altitude)} · ${a.slantRangeNm.toFixed(1)} nm slant (${a.groundRangeNm.toFixed(1)} nm ground)`,
  );
  return [head, ...rows].join('\n');
}

export function formatRoute(r: z.infer<typeof RouteSchema>): string {
  const end = (a: {
    icao: string;
    iata: string | null;
    name: string;
    city: string | null;
  }): string =>
    `${a.icao}${a.iata === null ? '' : `/${a.iata}`} ${a.name}${a.city === null ? '' : ` (${a.city})`}`;
  return [
    `${r.callsign}: ${end(r.origin)} → ${end(r.destination)}`,
    `Operator: ${r.airline ?? 'unknown'} · source: ${r.source}`,
    'Scheduled route from a free database — it may be the other leg of the rotation.',
  ].join('\n');
}

export function formatAirport(a: z.infer<typeof AirportSchema>): string {
  const lines = [
    `${a.icao}${a.iata === null ? '' : `/${a.iata}`} · ${a.name} · ${a.country}`,
    a.metar === null ? 'No METAR available.' : `METAR (${iso(a.metar.observedAt)}): ${a.metar.raw}`,
  ];
  if (a.metar !== null) {
    lines.push(
      `Wind ${a.metar.windDir === null ? 'VRB' : `${a.metar.windDir}°`} ${a.metar.windKt ?? '—'} kt · visibility ${a.metar.visibility ?? '—'} · ${a.metar.category ?? 'category unknown'}`,
    );
  }
  if (a.taf !== null) lines.push(`TAF: ${a.taf.raw}`);
  const byRole = new Map<string, string[]>();
  for (const t of a.traffic) {
    const row = `${t.callsign ?? t.hex.toUpperCase()} · ${t.typeCode ?? 'type unknown'} · ${t.distanceNm.toFixed(1)} nm · ${ft(t.altitude)}`;
    byRole.set(t.role, [...(byRole.get(t.role) ?? []), row]);
  }
  for (const role of ['arrival', 'departure', 'ground', 'overflight']) {
    const rows = byRole.get(role);
    if (rows !== undefined) lines.push(`${role} (${rows.length}):`, ...rows.map((r) => `  ${r}`));
  }
  if (a.traffic.length === 0) lines.push('No traffic within 50 nm.');
  return lines.join('\n');
}

export function formatStats(s: z.infer<typeof StatsSchema>): string {
  const bands = s.altitudeBands
    .filter(([, count]) => count > 0)
    .map(([start, count]) => `  FL${String(Math.round(start / 100)).padStart(3, '0')}+ ${count}`);
  return [
    `As of ${iso(s.generatedAt)}: ${s.total} tracked, ${s.airborne} airborne, ${s.onGround} on ground, ${s.military} military.`,
    s.emergencies.length === 0
      ? 'No emergency squawks.'
      : `Emergency squawks: ${s.emergencies.map((e) => `${e.callsign ?? e.hex.toUpperCase()} (${e.squawk ?? 'unknown'})`).join(', ')}`,
    `Top operators: ${s.topOperators.map(([n, c]) => `${n} ${c}`).join(', ')}`,
    `Top types: ${s.topTypes.map(([n, c]) => `${n} ${c}`).join(', ')}`,
    'Airborne by altitude band:',
    ...bands,
  ].join('\n');
}

export function formatTrack(t: z.infer<typeof TrackSchema>, maxRows: number): string {
  if (t.points.length === 0) return `No recorded track for ${t.hex.toUpperCase()}.`;
  // Long tracks are thinned evenly: the shape matters, every fix does not.
  const step = Math.max(1, Math.ceil(t.points.length / maxRows));
  const rows = t.points
    .filter((_, i) => i % step === 0)
    .map(
      (p) => `${iso(p.t)} · ${p.lat.toFixed(4)}, ${p.lon.toFixed(4)} · ${ft(p.alt)} · ${kt(p.gs)}`,
    );
  return [
    `${t.hex.toUpperCase()}: ${t.points.length} recorded fixes, showing every ${step}.`,
    ...rows,
  ].join('\n');
}

export function formatHeatmap(h: z.infer<typeof HeatmapSchema>): string {
  if (h.cells.length === 0) return 'No recorded traffic in that area yet.';
  const side = (h.cellDeg * NM_PER_DEG).toFixed(0);
  const rows = h.cells.map((c) => `${c.lat.toFixed(2)}, ${c.lon.toFixed(2)} · ${c.count} fixes`);
  return [
    `Busiest cells over the last ${h.windowHours} h (${h.cellDeg}° ≈ ${side} nm per cell, peak ${h.max}):`,
    ...rows,
  ].join('\n');
}
