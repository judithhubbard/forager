// Browser-side GPX/KML parser. No external deps — uses DOMParser.
//
// GPX: track points live in <trk>/<trkseg>/<trkpt lat lon> with
// optional <time> + <ele> children. Route points (<rte>/<rtept>)
// are also supported as a fallback.
//
// KML: simple <LineString><coordinates> are supported. Google's
// time-bearing track extension (gx:Track with paired <when> and
// gx:coord arrays) is parsed when present so timed tracks from
// Google Earth / mobile apps come in with timestamps intact.

export interface ParsedTrackPoint {
  lat: number;
  lng: number;
  /** ISO-8601 timestamp from the file, or null if untimed. */
  recorded_at: string | null;
  /** Elevation in meters, or null if absent. */
  elevation_m: number | null;
}

export interface ParsedTrack {
  /** Title from <name> in the file (track name, document name, or
   *  metadata name in that priority order). Null if none found. */
  title: string | null;
  points: ParsedTrackPoint[];
  source: 'gpx' | 'kml';
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function parseGpx(text: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse GPX file.');
  const title =
    doc.querySelector('trk > name')?.textContent?.trim() ||
    doc.querySelector('metadata > name')?.textContent?.trim() ||
    null;

  const points: ParsedTrackPoint[] = [];
  // Track points first; if none, fall back to route points.
  let nodes = Array.from(doc.querySelectorAll('trkseg > trkpt'));
  if (nodes.length === 0) nodes = Array.from(doc.querySelectorAll('rte > rtept'));

  for (const pt of nodes) {
    const lat = parseFloat(pt.getAttribute('lat') ?? '');
    const lng = parseFloat(pt.getAttribute('lon') ?? '');
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) continue;
    const time = pt.querySelector('time')?.textContent?.trim() ?? null;
    const eleStr = pt.querySelector('ele')?.textContent?.trim();
    const ele = eleStr ? parseFloat(eleStr) : NaN;
    points.push({
      lat,
      lng,
      recorded_at: time,
      elevation_m: isFiniteNumber(ele) ? ele : null
    });
  }
  return { title, points, source: 'gpx' };
}

export function parseKml(text: string): ParsedTrack {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse KML file.');

  const title =
    doc.querySelector('Document > name, Folder > name, Placemark > name')?.textContent?.trim() ||
    null;

  const points: ParsedTrackPoint[] = [];

  // Plain LineString coordinate lists.
  for (const coordEl of doc.querySelectorAll('LineString > coordinates')) {
    const text = (coordEl.textContent ?? '').trim();
    for (const tuple of text.split(/\s+/)) {
      const [lngStr, latStr, eleStr] = tuple.split(',');
      const lng = parseFloat(lngStr);
      const lat = parseFloat(latStr);
      const ele = eleStr ? parseFloat(eleStr) : NaN;
      if (isFiniteNumber(lat) && isFiniteNumber(lng)) {
        points.push({
          lat,
          lng,
          recorded_at: null,
          elevation_m: isFiniteNumber(ele) ? ele : null
        });
      }
    }
  }

  // gx:Track (Google's time-bearing track). Paired <when> + gx:coord
  // children are supposed to be index-aligned.
  const gxNs = 'http://www.google.com/kml/ext/2.2';
  for (const gxTrack of Array.from(doc.getElementsByTagNameNS(gxNs, 'Track'))) {
    const whens: string[] = [];
    const coords: string[] = [];
    for (const child of Array.from(gxTrack.children)) {
      if (child.localName === 'when') whens.push(child.textContent?.trim() ?? '');
      if (child.localName === 'coord' && child.namespaceURI === gxNs) {
        coords.push(child.textContent?.trim() ?? '');
      }
    }
    const n = Math.min(whens.length, coords.length);
    for (let i = 0; i < n; i++) {
      const [lngStr, latStr, eleStr] = coords[i].split(/\s+/);
      const lng = parseFloat(lngStr);
      const lat = parseFloat(latStr);
      const ele = eleStr ? parseFloat(eleStr) : NaN;
      if (isFiniteNumber(lat) && isFiniteNumber(lng)) {
        points.push({
          lat,
          lng,
          recorded_at: whens[i] || null,
          elevation_m: isFiniteNumber(ele) ? ele : null
        });
      }
    }
  }

  return { title, points, source: 'kml' };
}

/** Detect format by extension first, then sniff the text. */
export function parseTrackFile(filename: string, text: string): ParsedTrack {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.gpx')) return parseGpx(text);
  if (lower.endsWith('.kml')) return parseKml(text);
  // Sniff if the extension is missing or wrong.
  const head = text.slice(0, 2000);
  if (/<gpx[\s>]/.test(head)) return parseGpx(text);
  if (/<kml[\s>]/.test(head)) return parseKml(text);
  throw new Error('Unrecognized file format. Expected .gpx or .kml.');
}
