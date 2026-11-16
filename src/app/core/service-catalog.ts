import { ServiceType } from './models';

export interface ServiceInfo { label: string; glyph: string; color: string }

/** Service catalogue used by the panel, map icons and analysis (reference `E.SERVICE`). */
export const SERVICE: Record<ServiceType, ServiceInfo> = {
  restroom: { label: 'Restrooms', glyph: '🚻', color: '#3a6ea5' },
  prayer: { label: 'Prayer room', glyph: '🕌', color: '#2a9d8f' },
  aid: { label: 'First aid', glyph: '✚', color: '#d64545' },
  food: { label: 'Food court', glyph: '🍴', color: '#e07b39' },
  visitor: { label: 'Visitor gate', glyph: '🚶', color: '#7b5ea7' },
  servicegate: { label: 'Service gate', glyph: '🚚', color: '#6c757d' },
  metro: { label: 'Metro station', glyph: 'Ⓜ', color: '#0b7a4b' }
};

/** Services listed in "What's near" (reference app.js NEAR). */
export const NEAR_TYPES: ServiceType[] = ['restroom', 'prayer', 'aid', 'food', 'visitor', 'metro'];

export const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

const iconCache: Record<string, string> = {};

/**
 * Draws and caches a circular icon bitmap containing a color disc and emoji/symbol glyph onto an HTML canvas,
 * returning it as a PNG data URL.
 *
 * @param glyph Character or emoji symbol to render in the center.
 * @param color CSS background color string for the circle.
 * @param size Canvas width and height in pixels (default is 64).
 * @returns PNG data URL string suitable for ArcGIS 3D icon resources.
 */
export function icon(glyph: string, color: string, size = 64): string {
  const key = glyph + color + size;
  if (iconCache[key]) return iconCache[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (!g) return '';
  g.beginPath();
  g.arc(size / 2, size / 2, size / 2 - 3, 0, 7);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `bold ${Math.round(size * 0.46)}px "Segoe UI Emoji","Segoe UI Symbol","Segoe UI",sans-serif`;
  g.fillText(glyph, size / 2, size / 2 + 2);
  return (iconCache[key] = c.toDataURL());
}

/** Alias for {@link icon} conforming to descriptive verb-phrase function naming. */
export const createIconDataUrl = icon;

/**
 * Triggers a browser file download of a Blob or raw text string.
 * Creates a transient anchor link element and cleans up the created object URL.
 *
 * @param name Desired file name for the download.
 * @param data Blob instance or text string to save.
 * @param mime Optional MIME type if data is a raw string (defaults to 'text/plain').
 */
export function download(name: string, data: Blob | string, mime?: string): void {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
