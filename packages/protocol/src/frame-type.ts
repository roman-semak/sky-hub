/** First byte of every binary frame (SPEC § 4.2). */
export const FrameType = {
  Snapshot: 0x01,
  Delta: 0x02,
  Removals: 0x03,
  /** Zoom ≤ 3 aggregation by geohash-3 (SPEC § 4.1). Not in the SPEC table; see ADR-004. */
  Clusters: 0x04,
} as const;

export type FrameType = (typeof FrameType)[keyof typeof FrameType];
