import streetsJson from '../../../public/data/streets.geojson';
import plotsJson from '../../../public/data/plots.geojson';
import siteJson from '../../../public/data/site.json';
import { dist, offset, setCenter } from './geo';
import { LonLat, PlotCollection, Site, StreetCollection } from './models';
import { StreetLines, WalkRouter } from './walk-router';

const C: LonLat = [46.715, 24.895];
const P = (x: number, y: number): LonLat => offset(C, x, y);
const line = (...pts: LonLat[]) => ({ geometry: { coordinates: pts } });

describe('WalkRouter', () => {
  beforeEach(() => setCenter({ lon: C[0], lat: C[1] }));

  describe('synthetic graph', () => {
    // A ── B ── C  (100 m + 100 m)
    // │         │
    // D ─────── E   (detour: A-D 100, D-E 200, E-C 100)
    const A = P(0, 0), B = P(100, 0), Cc = P(200, 0), D = P(0, -100), E = P(200, -100);
    const streets: StreetLines = { features: [line(A, B, Cc), line(A, D), line(D, E), line(E, Cc)] };

    it('builds shared nodes and undirected edges', () => {
      const r = new WalkRouter(streets);
      expect(r.nodes.length).toBe(5);
      expect(r.edges.length).toBe(5);
      expect(r.adj.every(a => a.length >= 2)).toBe(true);
    });

    it('finds the shortest path', () => {
      const r = new WalkRouter(streets);
      const route = r.route(A, Cc);
      expect(route.length).toBeCloseTo(200, 6);
      expect(route.coords.length).toBe(5); // origin, A, B, C, target
      expect(dist(route.coords[2], B)).toBeLessThan(1e-6);
      expect(route.node).toBe(r.nearest(Cc).node);
    });

    it('adds snapping distances at both ends', () => {
      const r = new WalkRouter(streets);
      const from = P(0, 10), to = P(200, -110);
      const route = r.route(from, to);
      // from snaps to A (10 m), A→C 200 m, C→E 100 m, E snaps to target (10 m)
      expect(route.length).toBeCloseTo(10 + 200 + 100 + 10, 6);
      expect(route.coords[0]).toEqual(from);
      expect(route.coords[route.coords.length - 1]).toEqual(to);
    });

    it('from/to reuse one shortest-path tree', () => {
      const r = new WalkRouter(streets);
      const spt = r.from(A);
      expect(spt.dist[r.nearest(A).node]).toBe(0);
      expect(r.to(spt, E).length).toBeCloseTo(300, 6);
      expect(r.to(spt, D).length).toBeCloseTo(100, 6);
    });

    it('isochrone trims partially reachable edges', () => {
      const r = new WalkRouter(streets);
      const paths = r.isochrone(r.from(A), 150);
      // A-B fully, B-C half, A-D fully, D-E quarter (50 of 200 m)
      expect(paths.length).toBe(4);
      const total = paths.reduce((s, p) => s + dist(p[0], p[1]), 0);
      expect(total).toBeCloseTo(100 + 50 + 100 + 50, 6);
      expect(r.reach(r.from(A), 150)).toEqual(paths);
    });

    it('unreachable targets give an infinite length', () => {
      const r = new WalkRouter({ features: [line(A, B), line(P(500, 500), P(600, 500))] });
      expect(r.route(A, P(600, 500)).length).toBe(Infinity);
    });
  });

  describe('real streets.geojson', () => {
    const site = siteJson as Site;
    const streets = JSON.parse(streetsJson) as StreetCollection;
    const plots = JSON.parse(plotsJson) as PlotCollection;

    beforeEach(() => setCenter(site.center));

    it('routes from the metro station to every plot entrance', () => {
      const r = new WalkRouter(streets);
      expect(r.nodes.length).toBeGreaterThan(100);
      const spt = r.from(site.station);
      for (const f of plots.features) {
        const route = r.to(spt, [f.properties.ex, f.properties.ey]);
        expect(Number.isFinite(route.length)).toBe(true);
        expect(route.length).toBeGreaterThan(0);
        expect(route.length).toBeLessThan(5000);
        expect(route.coords.length).toBeGreaterThan(2);
      }
    });

    it('a network route is never shorter than the straight line', () => {
      const r = new WalkRouter(streets);
      const p = plots.features[0].properties;
      const route = r.route(site.station, [p.ex, p.ey]);
      expect(route.length).toBeGreaterThanOrEqual(dist(site.station, [p.ex, p.ey]) - 1e-6);
    });
  });
});
