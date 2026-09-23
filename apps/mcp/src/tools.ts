import { z } from 'zod';
import type { SkyTraceApi } from './api.js';
import {
  formatAirport,
  formatFlight,
  formatHeatmap,
  formatOverhead,
  formatRoute,
  formatSearch,
  formatStats,
  formatTrack,
} from './format.js';
import {
  AirportSchema,
  FlightSchema,
  HeatmapSchema,
  OverheadSchema,
  RouteSchema,
  SearchSchema,
  StatsSchema,
  TrackSchema,
} from './schemas.js';

/**
 * A tool as this package defines it: a name, a description the model reads,
 * a Zod shape for the arguments and a handler that returns plain text.
 * `registerAll` adapts these to the MCP SDK; tests call `run` directly.
 */
export interface ToolDef<Shape extends z.ZodRawShape = z.ZodRawShape> {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly input: Shape;
  run(api: SkyTraceApi, args: z.infer<z.ZodObject<Shape>>): Promise<string>;
}

const HOUR_MS = 3_600_000;

const define = <Shape extends z.ZodRawShape>(def: ToolDef<Shape>): ToolDef<Shape> => def;

const hex = z
  .string()
  .regex(/^~?[0-9a-fA-F]{6}$/, 'ICAO24 address, six hex digits (a leading ~ for non-ICAO)');

const searchFlights = define({
  name: 'search_flights',
  title: 'Search live flights',
  description:
    'Search aircraft currently being tracked by callsign, registration or ICAO24 hex, plus airports and airlines by code or name. Returns the live position of each match.',
  input: {
    query: z.string().min(2).describe('callsign, registration, hex, airport or airline'),
    limit: z.number().int().min(1).max(50).default(10),
  },
  async run(api, { query, limit }) {
    const data = await api.json('/api/search', SearchSchema, { q: query, limit });
    return formatSearch(data.results);
  },
});

const getFlight = define({
  name: 'get_flight',
  title: 'Get one flight',
  description:
    'Full live state of one aircraft by ICAO24 hex: position, altitude, speed, track, squawk, operator, type and country of registration.',
  input: { hex },
  async run(api, args) {
    return formatFlight(await api.json(`/api/ac/${args.hex.toLowerCase()}`, FlightSchema));
  },
});

const getRoute = define({
  name: 'get_route',
  title: 'Look up a scheduled route',
  description:
    'Scheduled origin and destination for a callsign, from free route databases. Not authoritative: it can return the other leg of the rotation.',
  input: { callsign: z.string().min(3).describe('flight callsign, e.g. TAP1234') },
  async run(api, { callsign }) {
    return formatRoute(
      await api.json(`/api/route/${encodeURIComponent(callsign.toUpperCase())}`, RouteSchema),
    );
  },
});

const flightsOverhead = define({
  name: 'flights_overhead',
  title: "What's flying over a point",
  description:
    'Aircraft visible from a ground position, sorted by elevation angle above the horizon. Gives azimuth, elevation and slant range, so the answer says where to look in the sky.',
  input: {
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    // Bounds mirror the API's own; a wider tool schema only buys a 400.
    elevationFt: z
      .number()
      .min(-1400)
      .max(30_000)
      .default(0)
      .describe("observer's ground elevation in feet"),
    limit: z.number().int().min(1).max(20).default(8),
  },
  async run(api, { lat, lon, elevationFt, limit }) {
    return formatOverhead(
      await api.json('/api/overhead', OverheadSchema, { lat, lon, elevationFt, limit }),
    );
  },
});

const airportStatus = define({
  name: 'airport_status',
  title: 'Airport weather and traffic',
  description:
    'METAR, TAF and live traffic within 50 nm of an airport, split into arrivals, departures, aircraft on the ground and overflights.',
  input: { code: z.string().min(3).max(4).describe('ICAO or IATA code, e.g. LPPT or LIS') },
  async run(api, { code }) {
    return formatAirport(
      await api.json(`/api/airport/${encodeURIComponent(code.toUpperCase())}`, AirportSchema),
    );
  },
});

const flightTrack = define({
  name: 'flight_track',
  title: 'Recorded track',
  description:
    'Recorded positions of one aircraft over a time window (default: the last hour), thinned to a readable number of rows.',
  input: {
    hex,
    hours: z.number().min(0.25).max(24).default(1).describe('how far back to look, in hours'),
    maxRows: z.number().int().min(5).max(200).default(40),
  },
  async run(api, args) {
    const to = Date.now();
    const data = await api.json(`/api/track/${args.hex.toLowerCase()}`, TrackSchema, {
      from: to - args.hours * HOUR_MS,
      to,
    });
    return formatTrack(data, args.maxRows);
  },
});

const exportTrack = define({
  name: 'export_track',
  title: 'Export a track as KML or GPX',
  description:
    'The recorded track of one aircraft as a KML or GPX document, ready to open in Google Earth or a GPS tool. Returns the file contents.',
  input: {
    hex,
    format: z.enum(['kml', 'gpx']).default('kml'),
    hours: z.number().min(0.25).max(24).default(1),
  },
  async run(api, args) {
    const to = Date.now();
    return api.text(`/api/track/${args.hex.toLowerCase()}`, {
      format: args.format,
      from: to - args.hours * HOUR_MS,
      to,
    });
  },
});

const busiestAreas = define({
  name: 'busiest_areas',
  title: 'Traffic density',
  description:
    'Busiest grid cells inside a bounding box over the last 24 hours, from recorded positions. Useful for "where is the traffic" questions.',
  input: {
    bbox: z
      .tuple([z.number(), z.number(), z.number(), z.number()])
      .describe('[west, south, east, north] in degrees'),
    limit: z.number().int().min(1).max(100).default(15),
  },
  async run(api, { bbox, limit }) {
    // The endpoint's own `limit` is a render budget (min 100), not a top-N,
    // so the busiest cells are taken here; the API returns them sorted.
    const data = await api.json('/api/heatmap', HeatmapSchema, { bbox: bbox.join(',') });
    return formatHeatmap({ ...data, cells: data.cells.slice(0, limit) });
  },
});

const trafficStats = define({
  name: 'traffic_stats',
  title: 'Network-wide statistics',
  description:
    'How much traffic SkyTrace is tracking right now: totals, military, emergency squawks, top operators and types, and the altitude distribution.',
  input: {},
  async run(api) {
    return formatStats(await api.json('/api/stats', StatsSchema));
  },
});

/** Every tool the MCP server exposes. */
export const TOOLS = [
  searchFlights,
  getFlight,
  getRoute,
  flightsOverhead,
  airportStatus,
  flightTrack,
  exportTrack,
  busiestAreas,
  trafficStats,
] as const;
