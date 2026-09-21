/**
 * Top-down aircraft silhouettes, nose pointing north, drawn in a 64×64 box.
 * SPEC § 5.2 asks for at least 12, chosen by ADS-B emitter category.
 */
export type SilhouetteId =
  | 'heavy'
  | 'jet'
  | 'bizjet'
  | 'light'
  | 'turboprop'
  | 'helicopter'
  | 'glider'
  | 'balloon'
  | 'drone'
  | 'military'
  | 'vehicle'
  | 'obstacle'
  | 'generic';

export const SILHOUETTE_PATHS: Readonly<Record<SilhouetteId, string>> = {
  // Four-engine widebody: long swept wing, engines as pods.
  heavy:
    'M32 2c2 0 3.2 2.6 3.2 6.5V23l24 12v4.5L35.2 33v15.5l7 5.5v3.8l-10.2-3-10.2 3V54l7-5.5V33L4.8 39.5V35l24-12V8.5C28.8 4.6 30 2 32 2Z M14 30.5h3.4v6h-3.4Z M46.6 30.5H50v6h-3.4Z',
  // Twin-engine narrowbody.
  jet: 'M32 4c1.8 0 2.8 2.4 2.8 6v14L56 36.5v4.2L34.8 34v14.5l6.2 5v3.5L32 54.3 23 57v-3.5l6.2-5V34L8 40.7v-4.2L29.2 24V10c0-3.6 1-6 2.8-6Z',
  // Small jet: rear engines, T-tail.
  bizjet:
    'M32 6c1.5 0 2.4 2 2.4 5v13.5L50 34v3.4l-15.6-6V44l5.6 4.2v3.2L32 49.8l-8 1.6v-3.2l5.6-4.2V31.4L14 37.4V34l15.6-9.5V11c0-3 .9-5 2.4-5Z',
  // High-wing single piston: straight wing.
  light:
    'M32 8c1.4 0 2.2 1.5 2.2 3.4V20H58v5.6H34.2V44h8.3v4.2H21.5V44h8.3V25.6H6V20h23.8v-8.6C29.8 9.5 30.6 8 32 8Z',
  // Twin turboprop: straight wing with nacelles forward.
  turboprop:
    'M32 5c1.6 0 2.5 1.8 2.5 4V22H57v5.5H34.5V46l6.5 3.5V53H23v-3.5l6.5-3.5V27.5H7V22h22.5V9c0-2.2.9-4 2.5-4Z M16 15h4v12h-4Z M44 15h4v12h-4Z',
  // Rotor disc + tail boom.
  helicopter:
    'M32 16a8 8 0 0 1 8 8v8a8 8 0 0 1-5.5 7.6V54h5v4H24.5v-4h5V39.6A8 8 0 0 1 24 32v-8a8 8 0 0 1 8-8Z M6 20.5 58 37l-1.2 3.6L4.8 24.1Z M57.2 20.5 58.4 24 7 40.6 5.8 37Z',
  // Very long straight wing, slim fuselage.
  glider:
    'M32 10c1.2 0 1.8 1.4 1.8 3.2V24H62v3.6H33.8V50h5.8v3.2H24.4V50h5.8V27.6H2V24h28.2V13.2c0-1.8.6-3.2 1.8-3.2Z',
  balloon:
    'M32 6c10.5 0 18 7.6 18 17.4 0 8.6-7.3 15.4-11.3 20.6h-13.4C21.3 38.8 14 32 14 23.4 14 13.6 21.5 6 32 6Z M26.5 46h11v9h-11Z',
  // Quadcopter: four rotors.
  drone:
    'M28 28h8v8h-8Z M16 16a6 6 0 1 1 0 .1Z M48 16a6 6 0 1 1 0 .1Z M16 48a6 6 0 1 1 0 .1Z M48 48a6 6 0 1 1 0 .1Z M18 20l4-4 24 24-4 4Z M42 16l4 4-24 24-4-4Z',
  // Delta-wing fighter.
  military:
    'M32 2c1.8 0 3 4 3 9v11l23 22v5l-23-8v9l7 5v4l-10-2.5L22 59v-4l7-5v-9L6 49v-5l23-22V11c0-5 1.2-9 3-9Z',
  // Ground vehicle: rounded rectangle.
  vehicle: 'M22 14h20a4 4 0 0 1 4 4v28a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4Z',
  // Tethered obstacle / point object.
  obstacle: 'M32 12 50 50H14Z',
  generic:
    'M32 6c1.7 0 2.7 2.2 2.7 5.5V25L54 36v4l-19.3-5.5V48l6 4.5V56L32 53.5 23.3 56v-3.5l6-4.5V34.5L10 40v-4l19.3-11V11.5C29.3 8.2 30.3 6 32 6Z',
};

export const SILHOUETTE_IDS = Object.keys(SILHOUETTE_PATHS) as SilhouetteId[];

/**
 * Picks a silhouette from the ADS-B emitter category (DO-260B § 2.2.3.2.5.2).
 * A1 light · A2 small · A3 large · A4 B757 · A5 heavy · A6 high-performance ·
 * A7 rotorcraft · B1 glider · B2 lighter-than-air · B4 ultralight ·
 * B6 UAV · C1/C2 surface vehicles · C3+ obstacles.
 */
export function silhouetteFor(category: string | null, military: boolean): SilhouetteId {
  switch (category) {
    case 'A1':
      return 'light';
    case 'A2':
      return 'bizjet';
    case 'A3':
    case 'A4':
      return 'jet';
    case 'A5':
      return 'heavy';
    case 'A6':
      return 'military';
    case 'A7':
      return 'helicopter';
    case 'B1':
    case 'B4':
      return 'glider';
    case 'B2':
      return 'balloon';
    case 'B6':
      return 'drone';
    case 'C1':
    case 'C2':
      return 'vehicle';
    case 'C3':
    case 'C4':
    case 'C5':
      return 'obstacle';
    default:
      return military ? 'military' : 'generic';
  }
}

/** Relative icon size by silhouette: bigger aircraft read bigger. */
export const SILHOUETTE_SCALE: Readonly<Record<SilhouetteId, number>> = {
  heavy: 1.25,
  jet: 1.05,
  bizjet: 0.9,
  light: 0.8,
  turboprop: 0.9,
  helicopter: 0.85,
  glider: 0.85,
  balloon: 0.8,
  drone: 0.7,
  military: 1,
  vehicle: 0.6,
  obstacle: 0.6,
  generic: 0.95,
};
