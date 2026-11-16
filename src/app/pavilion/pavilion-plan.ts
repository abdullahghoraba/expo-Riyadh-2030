/**
 * Parametric pavilion floor plans shared by the 3D model and the CAD viewer (port of the plan engine in
 * reference js/pavilion.js). Pure TypeScript – no browser or ArcGIS dependency.
 *
 * Plan coordinates are metres in the pavilion frame: x across the front (−W/2 … W/2), y from the back
 * (−D/2) to the entrance front (+D/2). Each floor is additionally offset (dx, dy) and rotated (dr, degrees).
 */
import { BuildingProps, PavilionSpec, PlotDesign, PlotProps } from '../core/models';

// ---------------- types ----------------
export type FurnitureKind =
  | 'none' | 'lobby' | 'tables' | 'shelves' | 'plinths' | 'wc' | 'wc1' | 'racks' | 'sofas' | 'seats' | 'plant' | 'meeting'
  | 'desks' | 'counters' | 'planters' | 'studio' | 'carpets' | 'basins' | 'chairs' | 'beds' | 'security' | 'gates';

export interface RoomDef {
  /** Default label. */
  l: string;
  /** Floor colour. */
  c: string;
  /** Furniture generator. */
  f: FurnitureKind;
}

export type RoomType =
  | 'lobby' | 'cafe' | 'shop' | 'exhibit' | 'restroom' | 'core' | 'boh' | 'gallery' | 'lounge' | 'theatre' | 'plant' | 'majlis'
  | 'meeting' | 'office' | 'pantry' | 'storage' | 'restaurant' | 'terrace' | 'dining' | 'kitchen' | 'studio' | 'control'
  | 'wc_m' | 'wc_f' | 'wc_a' | 'prayer_m' | 'prayer_f' | 'ablution' | 'shoes' | 'seating' | 'waiting' | 'treatment'
  | 'security' | 'ticket' | 'concourse';

/** One cell of a template row: [room, widthShare, isEntrance?, label?]. */
export type TemplateCell = [RoomType, number, (0 | 1)?, string?];
/** A template row from the front (entrance) to the back: [depthShare, cells]. */
export type TemplateRow = [number, TemplateCell[]];

export type ProgramId = 'pavilion' | 'hospitality' | 'retail' | 'media' | 'restroom_b' | 'prayer_b' | 'food_b' | 'aid_b' | 'gate' | 'metro';
export type FloorTemplates = Partial<Record<0 | 1 | 2 | 'top', TemplateRow[]>> & { 0: TemplateRow[] };

/** Axis-aligned rectangle with derived size (plan metres). */
export interface PlanRect { x0: number; x1: number; y0: number; y1: number; w: number; d: number }

export interface PlanRoom extends PlanRect {
  type: RoomType;
  label: string;
  color: string;
  f: FurnitureKind;
  area: number;
  /** Template row index (0 = entrance front). */
  row: number;
  entrance: boolean;
}

export type PlanPoint = [number, number];

export interface PlanLine { a: PlanPoint; b: PlanPoint; ext?: number }
/** Wall segment; `ext` = 1 for the exterior envelope. */
export type PlanWall = PlanLine;

export interface PlanDoor { x: number; y: number; w: number; main?: number }

export interface FurnitureItem {
  t: 'box' | 'cyl';
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  c: string;
  /** Elevation above the finished floor. */
  z: number;
  /** Label of the room the item belongs to. */
  room?: string;
}

export interface PlanFloor {
  rooms: PlanRoom[];
  walls: PlanWall[];
  doors: PlanDoor[];
  columns: PlanPoint[];
  core: PlanRoom | undefined;
  furniture: FurnitureItem[];
  /** Structural grid lines. */
  xs: number[];
  ys: number[];
  level: number;
  name: string;
  W: number;
  D: number;
  dx: number;
  dy: number;
  /** Floor rotation (degrees). */
  dr: number;
  /** Floor elevation above the pavilion base (level × H). */
  z: number;
  area: number;
}

export interface PavilionPlan {
  floors: PlanFloor[];
  /** Floor-to-floor height. */
  H: number;
  /** Gross floor area (m²). */
  gfa: number;
  height: number;
  prog: ProgramId;
}

export interface Palette { name: string; fin: string; glass: [number, number, number]; accent: string }

// ---------------- catalogues ----------------
export const ROOM: Record<RoomType, RoomDef> = {
  lobby: { l: 'Entrance lobby', c: '#efe6cf', f: 'lobby' }, cafe: { l: 'Café', c: '#f4a261', f: 'tables' }, shop: { l: 'Shop', c: '#cdb4db', f: 'shelves' },
  exhibit: { l: 'Exhibition hall', c: '#e9c46a', f: 'plinths' }, restroom: { l: 'Restrooms', c: '#a8dadc', f: 'wc' }, core: { l: 'Stairs & lift', c: '#8d99ae', f: 'none' },
  boh: { l: 'Back of house', c: '#b7b7a4', f: 'racks' }, gallery: { l: 'Gallery', c: '#ffd6a5', f: 'plinths' }, lounge: { l: 'Lounge', c: '#caffbf', f: 'sofas' },
  theatre: { l: 'Immersive theatre', c: '#8e7dbe', f: 'seats' }, plant: { l: 'Plant room', c: '#adb5bd', f: 'plant' }, majlis: { l: 'VIP majlis', c: '#c08552', f: 'sofas' },
  meeting: { l: 'Meeting room', c: '#9bf6ff', f: 'meeting' }, office: { l: 'Offices', c: '#bde0fe', f: 'desks' }, pantry: { l: 'Pantry', c: '#fdffb6', f: 'counters' },
  storage: { l: 'Storage', c: '#ced4da', f: 'racks' }, restaurant: { l: 'Rooftop restaurant', c: '#ffadad', f: 'tables' }, terrace: { l: 'Terrace', c: '#b5e48c', f: 'planters' },
  dining: { l: 'Private dining', c: '#ffc6ff', f: 'tables' }, kitchen: { l: 'Kitchen', c: '#f1e3dd', f: 'counters' }, studio: { l: 'Broadcast studio', c: '#a0c4ff', f: 'studio' },
  control: { l: 'Control room', c: '#bdb2ff', f: 'desks' }, wc_m: { l: 'Men', c: '#a8dadc', f: 'wc' }, wc_f: { l: 'Women', c: '#ffc8dd', f: 'wc' }, wc_a: { l: 'Accessible WC', c: '#cde7b0', f: 'wc1' },
  prayer_m: { l: "Men's prayer hall", c: '#cfe1b9', f: 'carpets' }, prayer_f: { l: "Women's prayer hall", c: '#e9d8a6', f: 'carpets' }, ablution: { l: 'Ablution', c: '#a8dadc', f: 'basins' },
  shoes: { l: 'Shoe racks', c: '#e5e5e5', f: 'racks' }, seating: { l: 'Food court seating', c: '#ffe5b4', f: 'tables' }, waiting: { l: 'Waiting area', c: '#e2ece9', f: 'chairs' },
  treatment: { l: 'Treatment room', c: '#cdeac0', f: 'beds' }, security: { l: 'Security screening', c: '#d0d6dd', f: 'security' }, ticket: { l: 'Tickets & info', c: '#ffe8a3', f: 'counters' },
  concourse: { l: 'Concourse', c: '#e9edc9', f: 'gates' }
};

const BACK = (a: RoomType, b: RoomType): TemplateRow => [0.25, [[a, 0.35], ['core', 0.3], [b, 0.35]]];

/** Floor templates per building programme. */
export const TPL: Record<ProgramId, FloorTemplates> = {
  pavilion: {
    0: [[0.28, [['cafe', 0.3], ['lobby', 0.4, 1], ['shop', 0.3]]], [0.47, [['exhibit', 1]]], BACK('restroom', 'boh')],
    1: [[0.3, [['gallery', 0.5], ['lounge', 0.5]]], [0.45, [['theatre', 1]]], BACK('restroom', 'plant')],
    2: [[0.35, [['majlis', 0.55], ['meeting', 0.45]]], [0.4, [['office', 1]]], BACK('pantry', 'storage')],
    top: [[0.45, [['restaurant', 1]]], [0.3, [['terrace', 0.5], ['dining', 0.5]]], BACK('kitchen', 'restroom')]
  },
  hospitality: { 0: [[0.6, [['restaurant', 0.7, 1, 'Restaurant'], ['cafe', 0.3, 1]]], [0.4, [['kitchen', 0.45], ['core', 0.2], ['restroom', 0.35]]]], 1: [[0.6, [['dining', 1, 0, 'Dining hall']]], [0.4, [['kitchen', 0.45], ['core', 0.2], ['restroom', 0.35]]]] },
  retail: { 0: [[0.65, [['shop', 0.5, 1], ['shop', 0.5, 1]]], [0.35, [['storage', 0.4], ['core', 0.2], ['restroom', 0.4]]]], 1: [[0.65, [['shop', 0.5], ['shop', 0.5]]], [0.35, [['storage', 0.4], ['core', 0.2], ['restroom', 0.4]]]] },
  media: { 0: [[0.3, [['lobby', 1, 1]]], [0.45, [['studio', 0.6], ['control', 0.4]]], [0.25, [['office', 0.4], ['core', 0.2], ['restroom', 0.4]]]], 1: [[0.6, [['office', 1]]], [0.4, [['meeting', 0.4], ['core', 0.2], ['restroom', 0.4]]]] },
  restroom_b: { 0: [[1, [['wc_m', 0.4, 1], ['wc_a', 0.2, 1], ['wc_f', 0.4, 1]]]] },
  prayer_b: { 0: [[0.35, [['shoes', 0.5, 1], ['ablution', 0.5, 1]]], [0.65, [['prayer_m', 0.6], ['prayer_f', 0.4]]]] },
  food_b: { 0: [[0.62, [['seating', 1, 1]]], [0.38, [['kitchen', 0.25, 0, 'Kitchen 1'], ['kitchen', 0.25, 0, 'Kitchen 2'], ['kitchen', 0.25, 0, 'Kitchen 3'], ['kitchen', 0.25, 0, 'Kitchen 4']]]] },
  aid_b: { 0: [[0.5, [['waiting', 1, 1]]], [0.5, [['treatment', 0.5], ['treatment', 0.5]]]] },
  gate: { 0: [[1, [['security', 0.7, 1], ['ticket', 0.3, 1]]]], 1: [[1, [['office', 0.7], ['storage', 0.3]]]] },
  metro: { 0: [[0.22, [['ticket', 0.5, 1], ['shop', 0.5, 1]]], [0.58, [['concourse', 1]]], [0.2, [['core', 0.5], ['plant', 0.5]]]], 1: [[0.8, [['concourse', 1, 0, 'Platform level']]], [0.2, [['core', 0.5], ['storage', 0.5]]]] }
};

/** Façade palettes (fin colour, glass tint, accent). */
export const PAL: readonly Palette[] = [
  { name: 'Desert gold', fin: '#d4b483', glass: [175, 205, 212], accent: '#b8862b' },
  { name: 'Pearl white', fin: '#f2f0ea', glass: [150, 210, 214], accent: '#c9a24b' },
  { name: 'Terracotta', fin: '#c8693f', glass: [190, 205, 210], accent: '#7a2e12' },
  { name: 'Oasis green', fin: '#2f7d5b', glass: [160, 215, 190], accent: '#c9a24b' },
  { name: 'Night blue', fin: '#3c4a5c', glass: [140, 180, 222], accent: '#e4c56b' }
];

/** Design styles offered for your own plot (id → label). */
export const STYLES: Readonly<Record<string, string>> = {
  terrace: 'Desert terraces', twist: 'Twisting tower', cantilever: 'Cantilevered boxes', dome: 'Oasis dome', ribbon: 'Ribbon façade', lattice: 'Lattice frame'
};

/**
 * Retrieves a façade color and material palette by index with modular wrapping.
 *
 * @param i Zero-based palette index.
 * @returns Palette configuration.
 */
export const paletteOf = (i: number): Palette => PAL[i % PAL.length];

/**
 * Derives the building functional programme (e.g. exhibition pavilion, hospitality, prayer hall, metro)
 * based on the building type and name keywords.
 *
 * @param s Partial pavilion specification containing building type and name.
 * @returns Program identifier matching template catalogue.
 */
export function program(s: Pick<PavilionSpec, 'btype' | 'name'>): ProgramId {
  const t = s.btype, n = (s.name || '').toLowerCase();
  if (t === 'service') {
    if (n.includes('restroom')) return 'restroom_b';
    if (n.includes('prayer')) return 'prayer_b';
    if (n.includes('food')) return 'food_b';
    if (n.includes('aid')) return 'aid_b';
  }
  return t in TPL ? (t as ProgramId) : 'pavilion';
}

/**
 * Retrieves the zoning layout template rows for a given floor level within a building programme.
 *
 * @param prog Functional programme identifier.
 * @param i Zero-based floor index.
 * @param floors Total number of floors in the pavilion.
 * @returns Array of template rows defining room proportions and types.
 */
export function template(prog: ProgramId, i: number, floors: number): TemplateRow[] {
  const T = TPL[prog];
  if (prog === 'pavilion') {
    if (i === 0) return T[0];
    if (floors >= 3 && i === floors - 1) return T.top!;
    return T[(1 + ((i - 1) % 2)) as 1 | 2]!;
  }
  return i === 0 ? T[0] : (T[1] || T[0]);
}

/**
 * Computes the per-floor footprint dimensions, lateral offsets, and rotation angles
 * driven by the architectural style (e.g. desert terraces, twisting tower, cantilevered boxes).
 *
 * @param s Pavilion specification.
 * @param i Zero-based floor index.
 * @returns Object with width (W), depth (D), offsets (dx, dy), and rotation in degrees (dr).
 */
export function floorGeom(s: PavilionSpec, i: number): { W: number; D: number; dx: number; dy: number; dr: number } {
  let W = s.W, D = s.D, dx = 0, dy = s.oy || 0, dr = 0;
  if (s.style === 'terrace') {
    const k = Math.min(i * 3.5, Math.min(s.W, s.D) * 0.35);
    W -= k;
    D -= k;
    dy -= k / 2;
  }
  if (s.style === 'twist') dr = i * 6;
  if (s.style === 'cantilever' && i > 0) dx = (i % 2 ? 1 : -1) * s.W * 0.12;
  return { W, D, dx, dy, dr };
}

// ---------------- furniture ----------------
/**
 * Distributes furniture items in a regular grid inside a room boundary, automatically
 * adjusting spacing so that total items do not exceed the capacity limit.
 *
 * @param r Room boundary rectangle.
 * @param sx Desired x-axis spacing between items.
 * @param sy Desired y-axis spacing between items.
 * @param m Inset margin from room walls.
 * @param cap Maximum number of items to generate.
 * @param fn Callback called for each grid coordinate [x, y, gridCol, gridRow].
 */
export function grid(r: PlanRect, sx: number, sy: number, m: number, cap: number, fn: (x: number, y: number, i: number, j: number) => void): void {
  const area = Math.max(1, (r.w - 2 * m) * (r.d - 2 * m)), k = Math.max(1, Math.sqrt(area / (sx * sy) / cap));
  sx *= k;
  sy *= k;
  const nx = Math.max(1, Math.floor((r.w - 2 * m) / sx)), ny = Math.max(1, Math.floor((r.d - 2 * m) / sy));
  const ox = (r.x0 + r.x1) / 2 - (nx - 1) * sx / 2, oy = (r.y0 + r.y1) / 2 - (ny - 1) * sy / 2;
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) fn(ox + i * sx, oy + j * sy, i, j);
}

/**
 * Creates a rectangular cuboid furniture item.
 */
const box = (x: number, y: number, w: number, d: number, h: number, c: string, z?: number): FurnitureItem => ({ t: 'box', x, y, w, d, h, c, z: z || 0 });

/**
 * Creates a cylindrical furniture item.
 */
const cyl = (x: number, y: number, dm: number, h: number, c: string, z?: number): FurnitureItem => ({ t: 'cyl', x, y, w: dm, d: dm, h, c, z: z || 0 });

type FurnFn = (r: PlanRoom, cap: number) => FurnitureItem[];

export const FURN: Record<FurnitureKind, FurnFn> = {
  none: () => [],
  lobby(r) {
    const cx = (r.x0 + r.x1) / 2, o = [box(cx, r.y0 + 1.8, Math.min(4, r.w * 0.5), 0.9, 1.1, '#c9a24b')];
    if (r.w > 8) o.push(box(r.x0 + 2, (r.y0 + r.y1) / 2, 0.6, Math.min(4, r.d - 2), 0.45, '#6d4c41'), box(r.x1 - 2, (r.y0 + r.y1) / 2, 0.6, Math.min(4, r.d - 2), 0.45, '#6d4c41'));
    return o;
  },
  tables(r, cap) {
    const o: FurnitureItem[] = [];
    grid(r, 2.8, 2.8, 1.4, cap / 3, (x, y) => { o.push(cyl(x, y, 0.9, 0.75, '#8d6e63'), cyl(x - 0.8, y, 0.45, 0.45, '#5d4037'), cyl(x + 0.8, y, 0.45, 0.45, '#5d4037')); });
    return o;
  },
  shelves(r) {
    const o: FurnitureItem[] = [];
    for (let y = r.y0 + 1.5; y < r.y1 - 2.2; y += 2.3) o.push(box((r.x0 + r.x1) / 2, y, Math.max(1, r.w - 3), 0.6, 1.8, '#e0e0e0'));
    o.push(box((r.x0 + r.x1) / 2, r.y1 - 1.2, Math.min(3, r.w * 0.5), 0.7, 1.1, '#c9a24b'));
    return o;
  },
  plinths(r, cap) {
    const o: FurnitureItem[] = [];
    grid(r, 4.5, 4.5, 2.2, cap, (x, y) => o.push(box(x, y, 1.2, 1.2, 1.0, '#fafafa'), box(x, y, 0.5, 0.5, 0.5, '#e76f51', 1.0)));
    o.push(box((r.x0 + r.x1) / 2, r.y0 + 0.4, Math.min(r.w * 0.6, 16), 0.2, 3, '#1d3557'));
    return o;
  },
  wc(r) {
    const o: FurnitureItem[] = [], n = Math.max(1, Math.floor((r.w - 1) / 1.25));
    for (let i = 0; i < n; i++) {
      const x = r.x0 + 0.9 + i * 1.25;
      o.push(box(x, r.y0 + 0.9, 1.05, 1.6, 2.1, '#e9ecef'));
      if (i % 2 === 0) o.push(box(x, r.y1 - 0.45, 0.55, 0.45, 0.85, '#ffffff'));
    }
    return o;
  },
  wc1(r) {
    return [box((r.x0 + r.x1) / 2, r.y0 + 1.2, Math.min(1.8, r.w - 0.6), 2, 2.1, '#e9ecef')];
  },
  racks(r) {
    const o: FurnitureItem[] = [];
    for (let y = r.y0 + 1; y < r.y1 - 1.5; y += 2.4) o.push(box((r.x0 + r.x1) / 2, y, Math.max(1, r.w - 2), 0.8, 2.4, '#9e9e9e'));
    return o;
  },
  sofas(r) {
    const o: FurnitureItem[] = [], n = Math.max(1, Math.floor((r.w - 2) / 2.4));
    for (let i = 0; i < n; i++) {
      const x = r.x0 + 1 + 1.2 + i * 2.4;
      o.push(box(x, r.y0 + 0.6, 2.0, 0.9, 0.8, '#bc8a5f'));
      if (r.d > 6) o.push(box(x, r.y1 - 0.6, 2.0, 0.9, 0.8, '#bc8a5f'));
    }
    o.push(box((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, r.w * 0.55, r.d * 0.45, 0.02, '#9b2226'), cyl((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 1.1, 0.42, '#c9a24b'));
    return o;
  },
  seats(r) {
    const cx = (r.x0 + r.x1) / 2, o = [box(cx, r.y0 + 1.9, r.w - 2, 3, 0.6, '#3d405b'), box(cx, r.y0 + 0.3, r.w - 2, 0.15, 4, '#111111')];
    let n = 0;
    for (let y = r.y0 + 5; y < r.y1 - 1.2 && n < 16; y += 1.15, n++) o.push(box(cx, y, r.w - 3.5, 0.55, 0.5, '#9d0208'));
    return o;
  },
  plant(r) {
    const o: FurnitureItem[] = [];
    grid(r, 3.4, 3.2, 1.6, 12, (x, y) => o.push(box(x, y, 2, 1.5, 1.8, '#6c757d')));
    return o;
  },
  meeting(r) {
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2, L = Math.max(2, r.w * 0.6), o = [box(cx, cy, L, 1.4, 0.75, '#6d4c41')];
    for (let x = cx - L / 2 + 0.5; x <= cx + L / 2 - 0.4; x += 1.0) o.push(cyl(x, cy - 1.05, 0.45, 0.5, '#2b2d42'), cyl(x, cy + 1.05, 0.45, 0.5, '#2b2d42'));
    return o;
  },
  desks(r, cap) {
    const o: FurnitureItem[] = [];
    grid(r, 2.8, 2.7, 1.5, cap / 2, (x, y) => o.push(box(x, y, 1.6, 0.8, 0.75, '#f5f5f5'), cyl(x, y - 0.75, 0.5, 0.5, '#2b2d42')));
    return o;
  },
  counters(r) {
    const cx = (r.x0 + r.x1) / 2, o = [box(cx, r.y0 + 0.45, Math.max(1, r.w - 1), 0.7, 0.95, '#dee2e6')];
    if (r.w > 5 && r.d > 5) o.push(box(cx, (r.y0 + r.y1) / 2 + 0.5, r.w * 0.4, 1.2, 0.95, '#adb5bd'));
    return o;
  },
  planters(r, cap) {
    const o: FurnitureItem[] = [];
    grid(r, 3.4, 3.4, 1.2, cap / 2, (x, y, i, j) => o.push((i + j) % 2 ? box(x, y, 0.7, 1.9, 0.4, '#f1faee') : box(x, y, 1.2, 1.2, 0.6, '#6a994e')));
    return o;
  },
  studio(r) {
    const cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    return [box(cx, r.y0 + 0.3, r.w - 2, 0.2, 3.5, '#1d3557'), box(cx, cy - 1, 4, 1.2, 0.9, '#e9c46a'), cyl(cx - 3, cy + 2.5, 0.35, 1.6, '#222'), cyl(cx, cy + 3, 0.35, 1.6, '#222'), cyl(cx + 3, cy + 2.5, 0.35, 1.6, '#222')];
  },
  carpets(r) {
    const o: FurnitureItem[] = [];
    let k = 0;
    for (let y = r.y1 - 1.2; y > r.y0 + 0.8; y -= 1.3, k++) o.push(box((r.x0 + r.x1) / 2, y, r.w - 1.5, 1.1, 0.02, k % 2 ? '#2d6a4f' : '#40916c'));
    return o;
  },
  basins(r) {
    const o: FurnitureItem[] = [];
    for (let x = r.x0 + 0.8; x < r.x1 - 0.5; x += 1.0) o.push(box(x, r.y0 + 0.4, 0.5, 0.5, 0.6, '#ffffff'));
    return o;
  },
  chairs(r, cap) {
    const o: FurnitureItem[] = [];
    grid(r, 0.9, 1.6, 1.2, cap, (x, y) => o.push(cyl(x, y, 0.45, 0.45, '#3a6ea5')));
    return o;
  },
  beds(r) {
    const o: FurnitureItem[] = [];
    grid(r, 2.6, 3, 1.2, 8, (x, y) => o.push(box(x, y, 0.9, 2, 0.6, '#ffffff')));
    return o;
  },
  security(r) {
    const o: FurnitureItem[] = [], n = Math.max(1, Math.floor(r.w / 3));
    for (let i = 0; i < n; i++) {
      const x = r.x0 + (i + 0.5) * r.w / n;
      o.push(box(x - r.w / n / 2, (r.y0 + r.y1) / 2, 0.15, Math.max(1, r.d - 3), 1.0, '#adb5bd'), box(x, (r.y0 + r.y1) / 2, 1.2, 1.8, 2.2, '#495057'));
    }
    return o;
  },
  gates(r) {
    const o: FurnitureItem[] = [];
    const y = (r.y0 + r.y1) / 2;
    for (let x = r.x0 + 2; x < r.x1 - 2; x += 1.3) o.push(box(x, y, 0.3, 1.4, 1.0, '#6c757d'));
    for (let x = r.x0 + 4; x < r.x1 - 4; x += 8) o.push(box(x, r.y0 + 2, 3, 0.6, 0.45, '#6d4c41'));
    return o;
  }
};

// ---------------- plan ----------------
type FloorLayout = Pick<PlanFloor, 'rooms' | 'walls' | 'doors' | 'columns' | 'core' | 'furniture' | 'xs' | 'ys'>;

/**
 * Generates the interior architectural layout for a single floor, including partitioned rooms,
 * perimeter and interior walls with door openings, regular structural column grid,
 * circulation core (stairs and elevator), and furniture placement.
 *
 * @param W Floor width in meters.
 * @param D Floor depth in meters.
 * @param rows Array of template rows specifying room layout proportions.
 * @param ground True if this floor is the ground level with main exterior entry doors.
 * @param cap Maximum item capacity for furniture density calculation.
 * @returns Object containing rooms, walls, doors, columns, core, furniture, and grid lines.
 */
export function layout(W: number, D: number, rows: TemplateRow[], ground: boolean, cap: number): FloorLayout {
  const rooms: PlanRoom[] = [], lines: PlanLine[] = [], doors: PlanDoor[] = [];
  const x0 = -W / 2, x1 = W / 2, yT = D / 2, tot = rows.reduce((s, r) => s + r[0], 0);
  let y = yT;
  rows.forEach((row, ri) => {
    const h = D * row[0] / tot, ya = y - h, ct = row[1].reduce((s, c) => s + c[1], 0);
    let x = x0;
    row[1].forEach((c, ci) => {
      const w = W * c[1] / ct, R = ROOM[c[0]];
      rooms.push({ type: c[0], label: c[3] || R.l, color: R.c, f: R.f, x0: x, x1: x + w, y0: ya, y1: y, w, d: h, area: w * h, row: ri, entrance: !!c[2] });
      if (ci > 0) lines.push({ a: [x, ya], b: [x, y] });
      x += w;
    });
    if (ri > 0) lines.push({ a: [x0, y], b: [x1, y] });
    y = ya;
  });
  const ext: PlanPoint[] = [[x0, yT], [x1, yT], [x1, -yT], [x0, -yT]];
  for (let i = 0; i < 4; i++) lines.push({ a: ext[i], b: ext[(i + 1) % 4], ext: 1 });

  rooms.forEach(r => {
    const cx = (r.x0 + r.x1) / 2, dw = r.type === 'core' ? 1.2 : r.w > 12 ? 2.4 : Math.min(1.2, r.w * 0.45);
    if (r.row === 0) {
      if (r.entrance && ground) doors.push({ x: cx, y: r.y1, w: Math.min(4, r.w * 0.45), main: 1 });
      if (rows.length > 1) doors.push({ x: cx, y: r.y0, w: dw });
      else if (!r.entrance) doors.push({ x: cx, y: r.y1, w: dw });
    } else doors.push({ x: cx, y: r.y1, w: dw });
  });
  const D2: PlanDoor[] = [];
  doors.forEach(d => {
    const o = D2.find(e => Math.abs(e.y - d.y) < 0.1 && Math.abs(e.x - d.x) < (e.w + d.w) / 2);
    if (!o) D2.push(d);
    else if (d.w > o.w) Object.assign(o, d);
  });

  const walls: PlanWall[] = [];
  lines.forEach(L => {
    const horiz = Math.abs(L.a[1] - L.b[1]) < 1e-6;
    if (!horiz) {
      walls.push(L);
      return;
    }
    const xa = Math.min(L.a[0], L.b[0]), xb = Math.max(L.a[0], L.b[0]), yy = L.a[1];
    const gaps = D2.filter(d => Math.abs(d.y - yy) < 0.05 && d.x > xa && d.x < xb).map(d => [d.x - d.w / 2, d.x + d.w / 2]).sort((p, q) => p[0] - q[0]);
    let s = xa;
    gaps.forEach(g => {
      if (g[0] - s > 0.05) walls.push({ a: [s, yy], b: [g[0], yy], ext: L.ext });
      s = Math.max(s, g[1]);
    });
    if (xb - s > 0.05) walls.push({ a: [s, yy], b: [xb, yy], ext: L.ext });
  });

  const nx = Math.max(1, Math.round(W / 8)), ny = Math.max(1, Math.round(D / 8));
  const xs = Array.from({ length: nx + 1 }, (_, i) => x0 + i * W / nx), ys = Array.from({ length: ny + 1 }, (_, i) => yT - i * D / ny);
  const core = rooms.find(r => r.type === 'core');
  const inCore = (px: number, py: number) => !!core && px > core.x0 - 0.3 && px < core.x1 + 0.3 && py > core.y0 - 0.3 && py < core.y1 + 0.3;
  const cols = new Map<string, PlanPoint>();
  const addC = (px: number, py: number) => { if (!inCore(px, py)) cols.set(px.toFixed(2) + ',' + py.toFixed(2), [px, py]); };
  xs.forEach(px => { addC(px, yT); addC(px, -yT); });
  ys.forEach(py => { addC(x0, py); addC(x1, py); });
  if (W > 14) lines.filter(L => !L.ext && Math.abs(L.a[1] - L.b[1]) < 1e-6).forEach(L => xs.forEach(px => addC(px, L.a[1])));

  const furniture: FurnitureItem[] = [];
  rooms.forEach(r => (FURN[r.f] || FURN.none)(r, cap).forEach(it => { it.room = r.label; furniture.push(it); }));
  return { rooms, walls, doors: D2, columns: [...cols.values()], core, furniture, xs, ys };
}

const planCache = new WeakMap<PavilionSpec, { key: string; plan: PavilionPlan }>();

/**
 * Computes and memoizes the complete architectural multi-floor plan package for a pavilion specification.
 * Recomputes whenever key dimensional or stylistic parameters change.
 *
 * @param s Pavilion specification.
 * @returns Fully articulated read-only PavilionPlan.
 */
export function pavilionPlan(s: PavilionSpec): PavilionPlan {
  const key = [s.W, s.D, s.floors, s.style, s.btype, s.name, s.H, s.oy].join('|');
  const hit = planCache.get(s);
  if (hit && hit.key === key) return hit.plan;
  const prog = program(s), floors: PlanFloor[] = [];
  const cap = s.W * s.D > 3000 ? 70 : 40;
  for (let i = 0; i < s.floors; i++) {
    const g = floorGeom(s, i), f = layout(g.W, g.D, template(prog, i, s.floors), i === 0, cap);
    floors.push({ ...f, level: i, name: i === 0 ? 'Ground floor' : `Level ${i}`, W: g.W, D: g.D, dx: g.dx, dy: g.dy, dr: g.dr, z: i * s.H, area: g.W * g.D });
  }
  const plan: PavilionPlan = { floors, H: s.H, gfa: floors.reduce((a, f) => a + f.area, 0), height: s.floors * s.H, prog };
  planCache.set(s, { key, plan });
  return plan;
}

/**
 * Creates a detailed PavilionSpec for a plot, integrating default plot dimensions
 * with any user-customized architectural design selections.
 *
 * @param p Selected plot GeoJSON properties.
 * @param design Optional participant design overrides (floors, style, palette, name).
 * @returns Consolidated PavilionSpec.
 */
export function specFromPlot(p: PlotProps, design?: PlotDesign): PavilionSpec {
  const d = design || {};
  return {
    id: p.pid, kind: 'plot', name: d.name || 'Concept pavilion', label: p.pid, btype: 'pavilion',
    cx: p.cx, cy: p.cy, rot: p.rotation, side: p.entranceSide, W: 30, D: 28, oy: -3, base: 0.3,
    floors: d.floors || p.floors, style: d.style || p.style, palette: d.palette !== undefined ? d.palette : p.palette, H: 5
  };
}

/**
 * Creates a detailed PavilionSpec from an existing landmark or support building feature.
 *
 * @param b Building GeoJSON properties.
 * @returns Consolidated PavilionSpec.
 */
export function specFromBuilding(b: BuildingProps): PavilionSpec {
  const floors = Math.max(1, b.floors);
  return {
    id: b.bid, kind: 'building', name: b.name, label: b.name, btype: b.type, cx: b.cx, cy: b.cy, rot: b.rotation, side: 1,
    W: b.d, D: b.w, oy: 0, base: 0, floors, style: b.style || 'box', palette: b.palette || 0, H: Math.max(3.5, b.height / floors)
  };
}
