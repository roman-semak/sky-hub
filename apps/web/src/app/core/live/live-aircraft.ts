import type { TrackState } from '@skytrace/geo';
import type { AircraftRecord } from '@skytrace/protocol';
import type { SilhouetteId } from '../../map/layers/silhouettes';

/** Client-side state of one streamed aircraft. Mutated in place for speed. */
export interface LiveAircraft {
  readonly hex: string;
  record: AircraftRecord;
  track: TrackState;
  silhouette: SilhouetteId;
  /** Local ms of the last position fix. */
  fixTime: number;
}
