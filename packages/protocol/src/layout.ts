/** Frame header: type u8 · timestamp u32 (unix s) · count u16. */
export const HEADER_SIZE = 7;
/** One aircraft (SPEC § 4.2). */
export const RECORD_SIZE = 28;
/** One removal: icao24 u24 · flags u8 (bit 0 = non-ICAO address). */
export const REMOVAL_SIZE = 4;
/** One cluster: lat i32 · lon i32 · count u16. */
export const CLUSTER_SIZE = 10;
/** Max entries per frame (u16 count). */
export const MAX_COUNT = 0xffff;

export const OFF = {
  icao: 0,
  lat: 3,
  lon: 7,
  alt: 11,
  gs: 13,
  track: 15,
  baroRate: 17,
  squawk: 19,
  flags: 21,
  category: 22,
  age: 23,
  emergency: 24,
} as const;

export const FLAG = {
  ground: 1 << 0,
  mlat: 1 << 1,
  tisb: 1 << 2,
  emergency: 1 << 3,
  military: 1 << 4,
  /** LADD or PIA: operator asked tracking sites to hide it. */
  special: 1 << 5,
  /** `~`-prefixed TIS-B/ADS-R address, not a real ICAO24. */
  nonIcao: 1 << 6,
} as const;

export const NULL_I16 = -0x8000;
export const NULL_U16 = 0xffff;
export const NULL_U8 = 0xff;
export const STALE_AGE = 255;
