/** Walking network: graph from the streets layer, Dijkstra, isochrone segments (port of reference js/router.js). */
import { clamp, dist, lerp } from './geo';
import { LonLat } from './models';

/** Minimal shape needed to build the graph (any LineString feature collection). */
export interface StreetLines { features: { geometry: { coordinates: readonly (readonly number[])[] } }[] }

/** Shortest-path tree from an origin snapped to the nearest node. */
export interface ShortestPathTree {
  origin: LonLat;
  start: number;
  dist: Float64Array;
  prev: Int32Array;
}

export interface WalkRoute {
  coords: LonLat[];
  length: number;
  node: number;
}

/**
 * Generates a unique string hash key for a 2D coordinate for vertex indexing.
 *
 * @param c Geographic coordinate pair [lon, lat].
 * @returns Formatted coordinate key string.
 */
const key = (c: readonly number[]): string => c[0].toFixed(7) + ',' + c[1].toFixed(7);

/**
 * Binary min-heap priority queue used for Dijkstra's shortest path algorithm.
 */
class MinHeap {
  private a: [number, number][] = [];

  /**
   * Inserts a node index with its current shortest distance into the priority queue.
   *
   * @param n Graph node index.
   * @param d Distance priority value.
   */
  push(n: number, d: number): void {
    const a = this.a;
    a.push([d, n]);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }

  /**
   * Removes and returns the entry [distance, nodeIndex] with the minimum distance.
   *
   * @returns The tuple [distance, nodeIndex] of the closest node.
   */
  pop(): [number, number] {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }

  /**
   * Returns the number of items currently in the priority queue.
   */
  get size(): number {
    return this.a.length;
  }
}

/**
 * Walking network router built from street centerlines.
 * Computes shortest walking paths using Dijkstra's algorithm and generates isochrone reachability subgraphs.
 */
export class WalkRouter {
  readonly nodes: LonLat[] = [];
  readonly idx: Record<string, number> = {};
  readonly adj: [number, number][][] = [];
  readonly edges: [number, number, number][] = [];

  /**
   * Constructs the walk router, optionally building the topological graph from street features.
   *
   * @param streets Optional LineString feature collection representing walkable street centerlines.
   */
  constructor(streets?: StreetLines) {
    if (streets) this.build(streets);
  }

  /**
   * Builds the network graph topology (nodes, adjacency lists, weighted edges) from line geometries.
   *
   * @param streets Street line collection.
   */
  build(streets: StreetLines): void {
    const node = (c: readonly number[]): number => {
      const k = key(c);
      if (this.idx[k] === undefined) {
        this.idx[k] = this.nodes.length;
        this.nodes.push([+c[0], +c[1]]);
        this.adj.push([]);
      }
      return this.idx[k];
    };
    for (const f of streets.features) {
      const cs = f.geometry.coordinates;
      for (let i = 1; i < cs.length; i++) {
        const a = node(cs[i - 1]), b = node(cs[i]);
        if (a === b) continue;
        const w = dist(this.nodes[a], this.nodes[b]);
        this.adj[a].push([b, w]);
        this.adj[b].push([a, w]);
        this.edges.push([a, b, w]);
      }
    }
  }

  /**
   * Searches for the closest network node to a given geographic point.
   *
   * @param p Geographic coordinate [lon, lat].
   * @returns Object with the index `node` of the closest node and the distance `d` in metres.
   */
  nearest(p: readonly number[]): { node: number; d: number } {
    let best = -1, bd = Infinity;
    this.nodes.forEach((n, i) => {
      const d = dist(n, p);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return { node: best, d: bd };
  }

  /**
   * Computes a single-source shortest path tree (Dijkstra) from a geographic point snapped to the closest node.
   *
   * @param p Starting coordinate [lon, lat].
   * @returns ShortestPathTree containing origin point, start node, distance array, and predecessor array.
   */
  from(p: readonly number[]): ShortestPathTree {
    const s = this.nearest(p), n = this.nodes.length;
    const d0 = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1);
    d0[s.node] = s.d;
    const h = new MinHeap();
    h.push(s.node, s.d);
    while (h.size) {
      const [d, u] = h.pop();
      if (d > d0[u]) continue;
      for (const [v, w] of this.adj[u]) {
        const nd = d + w;
        if (nd < d0[v]) {
          d0[v] = nd;
          prev[v] = u;
          h.push(v, nd);
        }
      }
    }
    return { origin: [p[0], p[1]], start: s.node, dist: d0, prev };
  }

  /**
   * Reconstructs the shortest walking route from a computed shortest-path tree to a target geographic point.
   *
   * @param spt ShortestPathTree calculated via {@link from}.
   * @param p Destination coordinate [lon, lat].
   * @returns WalkRoute object with route coordinates, total distance in metres, and destination node index.
   */
  to(spt: ShortestPathTree, p: readonly number[]): WalkRoute {
    const t = this.nearest(p);
    const path: LonLat[] = [];
    for (let v = t.node; v !== -1; v = spt.prev[v]) path.push(this.nodes[v]);
    path.reverse();
    const coords: LonLat[] = [spt.origin, ...path, [p[0], p[1]]];
    return { coords, length: spt.dist[t.node] + t.d, node: t.node };
  }

  /**
   * Convenience method to compute the complete shortest path route directly between two coordinates.
   *
   * @param a Origin coordinate [lon, lat].
   * @param b Destination coordinate [lon, lat].
   * @returns WalkRoute connecting a to b.
   */
  route(a: readonly number[], b: readonly number[]): WalkRoute {
    return this.to(this.from(a), b);
  }

  /**
   * Extracts reachable network segments within a maximum walking distance in metres (isochrone paths).
   * Partially reachable edges are interpolated and clipped.
   *
   * @param spt ShortestPathTree calculated from the origin.
   * @param maxD Maximum walking distance in metres.
   * @returns Array of line segments (coordinate pairs) forming the reachable subgraph.
   */
  reach(spt: ShortestPathTree, maxD: number): LonLat[][] {
    const paths: LonLat[][] = [];
    for (const [a, b, w] of this.edges) {
      const da = spt.dist[a], db = spt.dist[b];
      if (da > maxD && db > maxD) continue;
      const A = this.nodes[a], B = this.nodes[b];
      if (da <= maxD && db <= maxD) {
        paths.push([A, B]);
        continue;
      }
      const [P, Q, dp] = da <= maxD ? [A, B, da] : [B, A, db];
      const t = clamp((maxD - dp) / w, 0, 1);
      paths.push([P, [lerp(P[0], Q[0], t), lerp(P[1], Q[1], t)]]);
    }
    return paths;
  }

  /**
   * Alias for {@link reach}: returns isochrone network segments within maxD metres.
   *
   * @param spt ShortestPathTree calculated from the origin.
   * @param maxD Maximum distance in metres.
   * @returns Array of reachable polyline segments.
   */
  isochrone(spt: ShortestPathTree, maxD: number): LonLat[][] {
    return this.reach(spt, maxD);
  }
}
