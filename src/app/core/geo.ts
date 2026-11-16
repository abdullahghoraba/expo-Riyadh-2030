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

/**
 * Sets the geographic center coordinates used for the local metric Cartesian projection.
 *
 * @param c The new center coordinates containing longitude and latitude.
 */
export function setCenter(c: { lon: number; lat: number }): void {
  C = { lon: c.lon, lat: c.lat };
}

/**
 * Returns the current center coordinates of the local metric projection frame.
 *
 * @returns A copy of the current center coordinate object.
 */
export function getCenter(): { lon: number; lat: number } {
  return { ...C };
}

/**
 * Projects geographic coordinates [longitude, latitude] into local Cartesian metric coordinates [x, y] in metres.
 * x points east, y points north relative to the configured center point.
 *
 * @param ll An array with [longitude, latitude] in degrees.
 * @returns A tuple [x, y] representing local metres from the center.
 */
export function xy(ll: readonly number[]): XY {
  return [(ll[0] - C.lon) * DEG * R * Math.cos(C.lat * DEG), (ll[1] - C.lat) * DEG * R];
}

/** Alias for {@link xy} converting geographic lon/lat to local Cartesian metres. */
export const lonLatToLocalMeters = xy;

/**
 * Unprojects local Cartesian metric coordinates [x, y] in metres back into geographic coordinates [longitude, latitude].
 *
 * @param p An array with [x, y] in local metres.
 * @returns A tuple [longitude, latitude] in degrees.
 */
export function ll(p: readonly number[]): LonLat {
  return [C.lon + p[0] / (R * Math.cos(C.lat * DEG)) / DEG, C.lat + p[1] / R / DEG];
}

/** Alias for {@link ll} converting local Cartesian metres to geographic lon/lat. */
export const localMetersToLonLat = ll;

/**
 * Calculates Euclidean distance between two geographic coordinates [lon, lat] in local metres.
 *
 * @param a First coordinate [longitude, latitude].
 * @param b Second coordinate [longitude, latitude].
 * @returns The straight-line distance in metres.
 */
export function dist(a: readonly number[], b: readonly number[]): number {
  const p = xy(a), q = xy(b);
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

/**
 * Computes the geographic heading in degrees (clockwise from north, 0..360) from point a to point b.
 *
 * @param a Starting coordinate [longitude, latitude].
 * @param b Target coordinate [longitude, latitude].
 * @returns Geographic azimuth heading in degrees from 0 to 360.
 */
export function heading(a: readonly number[], b: readonly number[]): number {
  const p = xy(a), q = xy(b);
  return (Math.atan2(q[0] - p[0], q[1] - p[1]) / DEG + 360) % 360;
}

/**
 * Offsets a geographic coordinate by specified easting (dxm) and northing (dym) distances in metres.
 *
 * @param p Base geographic coordinate [longitude, latitude].
 * @param dxm Distance in metres along the east-west axis (positive = east).
 * @param dym Distance in metres along the north-south axis (positive = north).
 * @returns The new offset geographic coordinate.
 */
export function offset(p: readonly number[], dxm: number, dym: number): LonLat {
  const q = xy(p);
  return ll([q[0] + dxm, q[1] + dym]);
}

/**
 * Moves a geographic coordinate by distance `d` metres along a geographic azimuth heading.
 *
 * @param p Starting coordinate [longitude, latitude].
 * @param headingDeg Direction angle in degrees (clockwise from north).
 * @param d Distance to travel in metres.
 * @returns The new destination coordinate [longitude, latitude].
 */
export function move(p: readonly number[], headingDeg: number, d: number): LonLat {
  const h = headingDeg * DEG;
  return offset(p, Math.sin(h) * d, Math.cos(h) * d);
}

/**
 * Linear interpolation between values a and b by parameter t (0..1).
 *
 * @param a Start value.
 * @param b End value.
 * @param t Interpolation factor (0 = a, 1 = b).
 * @returns The interpolated value.
 */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Clamps a numeric value within the range [min, max].
 *
 * @param v Value to clamp.
 * @param a Lower boundary.
 * @param b Upper boundary.
 * @returns Clamped value between a and b.
 */
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

/**
 * Standard cubic ease-in-out easing curve mapping t from [0, 1] to [0, 1].
 *
 * @param t Linear progress from 0 to 1.
 * @returns Eased progress factor.
 */
export const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * Smoothstep S-curve easing function (Hermite interpolation: 3t^2 - 2t^3).
 *
 * @param t Progress factor from 0 to 1.
 * @returns Smoothstep value.
 */
export const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Interpolates smoothly between two angles in degrees along the shortest arc.
 *
 * @param a Starting angle in degrees.
 * @param b Destination angle in degrees.
 * @param t Interpolation factor (0..1).
 * @returns Interpolated angle in degrees normalized to [0, 360).
 */
export function angLerp(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
}

/**
 * Asynchronously pauses execution for a given duration in milliseconds.
 *
 * @param ms Delay time in milliseconds.
 * @returns A promise that resolves after the specified duration.
 */
export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/**
 * Formats a number with comma thousands grouping and a fixed number of decimal digits.
 *
 * @param n Number or numeric string to format.
 * @param d Number of decimal places (default is 0).
 * @returns Formatted localized string representation.
 */
export function fmt(n: number | string, d = 0): string {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
}

/** Alias for {@link fmt} formatting numbers with thousand separators. */
export const formatNumber = fmt;

/**
 * Computes a non-negative 32-bit FNV-1a hash code from any input value.
 *
 * @param s Input value to hash.
 * @returns Non-negative 32-bit integer hash code.
 */
export function hash(s: unknown): number {
  let h = 2166136261;
  for (const c of String(s)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Converts a hex color string ('#rrggbb' or '#rgb') to an RGB or RGBA numeric color array.
 *
 * @param hex Hex color code string.
 * @param a Optional alpha opacity component (0..1).
 * @returns Array representing [r, g, b] (0..255) or [r, g, b, a].
 */
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

/**
 * Linearly blends RGB components of color c1 towards c2 by factor t, preserving c1's alpha channel if present.
 *
 * @param c1 Base source color array.
 * @param c2 Target color array to blend towards.
 * @param t Blend factor from 0 (c1) to 1 (c2).
 * @returns Blended numeric color array.
 */
export function mix(c1: readonly number[], c2: readonly number[], t: number): number[] {
  return c1.map((v, i) => (i < 3 ? Math.round(v + (c2[i] - v) * t) : v));
}

/**
 * Computes the total Euclidean length of a polyline given as geographic lon/lat vertices in metres.
 *
 * @param coords Array of sequential geographic lon/lat coordinates.
 * @returns Total distance along the path in metres.
 */
export function pathLength(coords: readonly (readonly number[])[]): number {
  let s = 0;
  for (let i = 1; i < coords.length; i++) s += dist(coords[i - 1], coords[i]);
  return s;
}

/**
 * Finds the geographic coordinate and heading at distance `d` metres along a polyline.
 *
 * @param coords Polyline vertices in geographic lon/lat.
 * @param d Distance in metres along the polyline from its start.
 * @returns An object containing position `p` [lon, lat] and heading `h` in degrees.
 */
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
