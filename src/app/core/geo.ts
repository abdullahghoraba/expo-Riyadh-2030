/**
 * Local metric frame and small maths helpers (port of reference js/util.js).
 * Coordinates are [lon, lat]; the local frame is metres with x = east, y = north
 * around a configurable centre (same projection as the data generator).
 */
import { LonLat } from './models';

export type XY = [number, number];
export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];
export type Color = number[];

const R = 6378137;
export const DEG = Math.PI / 180;

let C = { lon: 46.715, lat: 24.895 };

export function setCenter(c: { lon: number; lat: number }): void {
  C = { lon: c.lon, lat: c.lat };
}

export function getCenter(): { lon: number; lat: number } {
  return { ...C };
}

/** lon/lat → local metres. */
export function xy(ll: readonly number[]): XY {
  return [(ll[0] - C.lon) * DEG * R * Math.cos(C.lat * DEG), (ll[1] - C.lat) * DEG * R];
}

/** local metres → lon/lat. */
export function ll(p: readonly number[]): LonLat {
  return [C.lon + p[0] / (R * Math.cos(C.lat * DEG)) / DEG, C.lat + p[1] / R / DEG];
}

export function dist(a: readonly number[], b: readonly number[]): number {
  const p = xy(a), q = xy(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

/** Geographic heading (clockwise from north, degrees) from a to b. */
export function heading(a: readonly number[], b: readonly number[]): number {
  const p = xy(a), q = xy(b);
  return (Math.atan2(q[0] - p[0], q[1] - p[1]) / DEG + 360) % 360;
}

export function offset(p: readonly number[], dxm: number, dym: number): LonLat {
  const q = xy(p);
  return ll([q[0] + dxm, q[1] + dym]);
}

/** Move from a lon/lat point by `d` metres along a geographic heading. */
export function move(p: readonly number[], headingDeg: number, d: number): LonLat {
  const h = headingDeg * DEG;
  return offset(p, Math.sin(h) * d, Math.cos(h) * d);
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const smooth = (t: number): number => t * t * (3 - 2 * t);

export function angLerp(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

export function fmt(n: number | string, d = 0): string {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
}

/** FNV-1a style string hash (non-negative). */
export function hash(s: unknown): number {
  let h = 2166136261;
  for (const c of String(s)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** '#rrggbb' / '#rgb' → [r, g, b] or [r, g, b, a]. */
export function rgb(hex: string): RGB;
export function rgb(hex: string, a: number): RGBA;
export function rgb(hex: string, a?: number): Color;
export function rgb(hex: string, a?: number): Color {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  const out: number[] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  if (a !== undefined) out.push(a);
  return out;
}

/** Blend the RGB part of c1 towards c2 (alpha of c1 kept). */
export function mix(c1: readonly number[], c2: readonly number[], t: number): number[] {
  return c1.map((v, i) => (i < 3 ? Math.round(v + (c2[i] - v) * t) : v));
}

/** Polyline length (lon/lat coords) in metres. */
export function pathLength(coords: readonly (readonly number[])[]): number {
  let s = 0;
  for (let i = 1; i < coords.length; i++) s += dist(coords[i - 1], coords[i]);
  return s;
}

/** Point and heading at distance d along a lon/lat path. */
export function along(coords: readonly (readonly number[])[], d: number): { p: LonLat; h: number } {
  for (let i = 1; i < coords.length; i++) {
    const l = dist(coords[i - 1], coords[i]);
    if (d <= l || i === coords.length - 1) {
      const t = l ? clamp(d / l, 0, 1) : 0;
      return {
        p: [lerp(coords[i - 1][0], coords[i][0], t), lerp(coords[i - 1][1], coords[i][1], t)],
        h: heading(coords[i - 1], coords[i])
      };
    }
    d -= l;
  }
  const last = coords[coords.length - 1];
  return { p: [last[0], last[1]], h: 0 };
}
