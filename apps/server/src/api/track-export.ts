import type { TrackPoint } from '../history/track-history.js';

export type TrackFormat = 'kml' | 'gpx';

const escape = (s: string): string =>
  s.replace(
    /[<>&'"]/g,
    (c) => `&${{ '<': 'lt', '>': 'gt', '&': 'amp', "'": 'apos', '"': 'quot' }[c] ?? ''};`,
  );

const FEET_TO_M = 0.3048;

export const MIME: Readonly<Record<TrackFormat, string>> = {
  kml: 'application/vnd.google-earth.kml+xml',
  gpx: 'application/gpx+xml',
};

/**
 * Exports a recorded track (SPEC phase 8). KML carries absolute altitudes so
 * Google Earth draws the real 3-D path; GPX carries `<ele>` in metres, which
 * is what every GPS tool expects.
 */
export function exportTrack(
  points: readonly TrackPoint[],
  format: TrackFormat,
  name: string,
): string {
  return format === 'kml' ? toKml(points, name) : toGpx(points, name);
}

function toKml(points: readonly TrackPoint[], name: string): string {
  const coords = points
    .map((p) => `${p.lon.toFixed(6)},${p.lat.toFixed(6)},${Math.round((p.alt ?? 0) * FEET_TO_M)}`)
    .join('\n          ');
  const when = points.map((p) => `<when>${new Date(p.t).toISOString()}</when>`).join('\n        ');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>${escape(name)}</name>
    <description>Recorded by SkyTrace from community ADS-B data (ODbL). Not for navigation.</description>
    <Style id="track">
      <LineStyle><color>ff e0 8a 96</color><width>2</width></LineStyle>
    </Style>
    <Placemark>
      <name>${escape(name)}</name>
      <styleUrl>#track</styleUrl>
      <gx:Track>
        <altitudeMode>absolute</altitudeMode>
        ${when}
        ${points.map((p) => `<gx:coord>${p.lon.toFixed(6)} ${p.lat.toFixed(6)} ${Math.round((p.alt ?? 0) * FEET_TO_M)}</gx:coord>`).join('\n        ')}
      </gx:Track>
    </Placemark>
    <Placemark>
      <name>${escape(name)} path</name>
      <styleUrl>#track</styleUrl>
      <LineString>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
          ${coords}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
`.replace('ff e0 8a 96', 'ffe08a96');
}

function toGpx(points: readonly TrackPoint[], name: string): string {
  const pts = points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">\n` +
        `        <ele>${((p.alt ?? 0) * FEET_TO_M).toFixed(1)}</ele>\n` +
        // GPX 1.1 dropped <speed> from a trackpoint; readers derive it from
        // consecutive fixes, and keeping it would fail schema validation.
        `        <time>${new Date(p.t).toISOString()}</time>\n` +
        `      </trkpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="SkyTrace" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escape(name)}</name>
    <desc>Recorded by SkyTrace from community ADS-B data (ODbL). Not for navigation.</desc>
  </metadata>
  <trk>
    <name>${escape(name)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>
`;
}
