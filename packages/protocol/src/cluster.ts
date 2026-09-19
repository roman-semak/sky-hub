/** Aggregated aircraft for low zoom levels. */
export interface Cluster {
  /** Centroid, degrees, 1e-6 precision. */
  readonly lat: number;
  readonly lon: number;
  readonly count: number;
}
