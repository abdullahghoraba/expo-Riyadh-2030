import { DEG, along, angLerp, clamp, dist, ease, fmt, getCenter, hash, heading, lerp, ll, mix, move, offset, pathLength, rgb, setCenter, smooth, xy } from './geo';

describe('geo', () => {
  beforeEach(() => setCenter({ lon: 46.715, lat: 24.895 }));

  it('xy ↔ ll round-trips within 1e-6', () => {
    const pts: [number, number][] = [[46.715, 24.895], [46.7198583, 24.8969963], [46.70, 24.88], [46.73, 24.91], [46.715, 24.9018272]];
    for (const p of pts) {
      const back = ll(xy(p));
      expect(Math.abs(back[0] - p[0])).toBeLessThan(1e-6);
      expect(Math.abs(back[1] - p[1])).toBeLessThan(1e-6);
    }
    for (const m of [[0, 0], [123.4, -567.8], [-930, 640]]) {
      const back = xy(ll(m));
      expect(Math.abs(back[0] - m[0])).toBeLessThan(1e-6);
      expect(Math.abs(back[1] - m[1])).toBeLessThan(1e-6);
    }
  });

  it('centre maps to the origin and setCenter moves the frame', () => {
    expect(xy([46.715, 24.895])).toEqual([0, 0]);
    setCenter({ lon: 10, lat: 50 });
    expect(getCenter()).toEqual({ lon: 10, lat: 50 });
    const p = xy([10, 50]);
    expect(p[0]).toBeCloseTo(0, 9);
    expect(p[1]).toBeCloseTo(0, 9);
  });

  it('offset / dist / heading / move agree with each other', () => {
    const a: [number, number] = [46.715, 24.895];
    const east = offset(a, 100, 0), north = offset(a, 0, 100);
    expect(dist(a, east)).toBeCloseTo(100, 6);
    expect(heading(a, east)).toBeCloseTo(90, 6);
    expect(heading(a, north)).toBeCloseTo(0, 6);
    const m = move(a, 225, 50);
    expect(dist(a, m)).toBeCloseTo(50, 6);
    expect(heading(a, m)).toBeCloseTo(225, 6);
  });

  it('interpolation helpers', () => {
    expect(lerp(2, 4, 0.25)).toBe(2.5);
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    expect(ease(0.5)).toBeCloseTo(0.5, 9);
    expect(smooth(0.5)).toBe(0.5);
    expect(angLerp(350, 10, 0.5)).toBeCloseTo(0, 9);
    expect(angLerp(10, 350, 0.25)).toBeCloseTo(5, 9);
    expect(DEG).toBeCloseTo(Math.PI / 180, 12);
  });

  it('fmt / rgb / mix / hash', () => {
    expect(fmt(1600)).toBe('1,600');
    expect(fmt(3.14159, 1)).toBe('3.1');
    expect(rgb('#2eb872')).toEqual([46, 184, 114]);
    expect(rgb('#fff', 0.5)).toEqual([255, 255, 255, 0.5]);
    expect(mix([0, 0, 0, 0.4], [255, 255, 255], 0.5)).toEqual([128, 128, 128, 0.4]);
    expect(hash('NE-01')).toBe(hash('NE-01'));
    expect(hash('NE-01')).toBeGreaterThanOrEqual(0);
  });

  it('pathLength / along', () => {
    const a: [number, number] = [46.715, 24.895];
    const path = [a, offset(a, 100, 0), offset(a, 100, 100)];
    expect(pathLength(path)).toBeCloseTo(200, 6);
    const mid = along(path, 150);
    expect(dist(mid.p, offset(a, 100, 50))).toBeLessThan(1e-3);
    expect(mid.h).toBeCloseTo(0, 6);
    expect(dist(along(path, 1000).p, path[2])).toBeLessThan(1e-6);
  });
});
