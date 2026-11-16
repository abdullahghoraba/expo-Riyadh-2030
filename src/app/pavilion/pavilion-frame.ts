/** Placement of a pavilion plan on the site: plan metres → lon/lat (pure, shared by the 3D builder and the panels). */
import { DEG, heading, ll, xy } from '../core/geo';
import { LonLat, PavilionSpec } from '../core/models';
import { floorGeom } from './pavilion-plan';

/** Per-floor transform values (see `PlanFloor`). */
export interface FloorTransform { dx: number; dy: number; dr: number }

export interface PavilionFrame {
  /** Pavilion frame (x across the front, y towards the entrance) → lon/lat. */
  world(X: number, Y: number): LonLat;
  /** Floor-local plan coordinates → lon/lat (applies the floor offset and rotation). */
  floor(f: FloorTransform): (x: number, y: number) => LonLat;
  /** Heading for ArcGIS object symbols aligned with the floor's x axis. */
  objectHeading(f: FloorTransform): number;
}

/**
 * Computes the spatial coordinate frame for orienting and placing a pavilion plan in the 3D globe coordinate system.
 * Converts floor-local offsets and rotations into geographic [longitude, latitude] coordinates.
 *
 * @param s Pavilion specification containing centroid [cx, cy], orientation rotation in degrees, and side flip.
 * @returns Object providing world, floor coordinate transformation, and symbol object heading calculations.
 */
export function pavilionFrame(s: Pick<PavilionSpec, 'cx' | 'cy' | 'rot' | 'side'>): PavilionFrame {
  const C0 = xy([s.cx, s.cy]), r = s.rot * DEG, u = [Math.cos(r), Math.sin(r)], n = [-Math.sin(r) * s.side, Math.cos(r) * s.side];
  const world = (X: number, Y: number): LonLat => ll([C0[0] + u[0] * X + n[0] * Y, C0[1] + u[1] * X + n[1] * Y]);
  return {
    world,
    floor: f => {
      const c = Math.cos(f.dr * DEG), sn = Math.sin(f.dr * DEG);
      return (x, y) => world(f.dx + x * c - y * sn, f.dy + x * sn + y * c);
    },
    objectHeading: f => {
      const c = Math.cos(f.dr * DEG), sn = Math.sin(f.dr * DEG);
      const ex = [u[0] * c + n[0] * sn, u[1] * c + n[1] * sn];
      return -Math.atan2(ex[1], ex[0]) / DEG;
    }
  };
}

/**
 * Calculates the geographic compass heading towards which the pavilion ground floor entrance points.
 *
 * @param s Pavilion specification.
 * @returns Compass heading in degrees [0..360].
 */
export function frontHeading(s: PavilionSpec): number {
  const T0 = pavilionFrame(s).floor(floorGeom(s, 0));
  return heading(T0(0, 0), T0(0, 10));
}
