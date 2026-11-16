import buildingsJson from '../../../public/data/buildings.geojson';
import { BuildingCollection, PlotProps } from '../core/models';
import { PlanFloor, pavilionPlan, program, specFromBuilding, specFromPlot } from './pavilion-plan';

/*
 * Expected values were produced by running the reference js/pavilion.js plan() in Node (window.EXPO shim)
 * on the same specs. `checksum` is a weighted sum over every room, wall, door, column and furniture
 * coordinate of a floor, rounded to 3 decimals, so any geometric divergence shows up.
 */
const r3 = (v: number) => Math.round(v * 1000) / 1000;
function checksum(f: PlanFloor): number {
  let s = 0;
  f.rooms.forEach(r => (s += r.x0 + 2 * r.y0 + 3 * r.x1 + 5 * r.y1));
  f.walls.forEach(w => (s += w.a[0] + 2 * w.a[1] + 3 * w.b[0] + 5 * w.b[1] + (w.ext ? 7 : 0)));
  f.doors.forEach(d => (s += d.x + 2 * d.y + 3 * d.w + (d.main ? 11 : 0)));
  f.columns.forEach(c => (s += c[0] + 2 * c[1]));
  f.furniture.forEach(it => (s += it.x + 2 * it.y + 3 * it.w + 5 * it.d + 7 * it.h + 11 * it.z));
  return r3(s);
}

interface Expected {
  prog: string; floors: number; gfa: number; height: number;
  rooms: number[]; walls: number[]; doors: number[]; columns: number[]; furniture: number[]; checksum: number[];
}

const PLOT: PlotProps = {
  pid: 'T-01', district: 'NE', districtName: 'Test', status: 'available', size: 40, area: 1600, rotation: 22.7, entranceSide: 1,
  cx: 46.715, cy: 24.895, ex: 46.715, ey: 24.895, style: 'twist', floors: 3, palette: 1, owner: ''
};

const PLOT_CASES: [style: string, floors: number, Expected][] = [
  ['terrace', 1, { prog: 'pavilion', floors: 1, gfa: 840, height: 5, rooms: [7], walls: [17], doors: [7], columns: [22], furniture: [36], checksum: [1125.48] }],
  ['twist', 2, { prog: 'pavilion', floors: 2, gfa: 1680, height: 10, rooms: [7, 6], walls: [17, 15], doors: [7, 6], columns: [22, 22], furniture: [36, 38], checksum: [1125.48, 1529.98] }],
  ['cantilever', 3, { prog: 'pavilion', floors: 3, gfa: 2520, height: 15, rooms: [7, 6, 6], walls: [17, 15, 15], doors: [7, 6, 6], columns: [22, 22, 22], furniture: [36, 38, 76], checksum: [1125.48, 1529.98, 1017] }],
  ['dome', 4, { prog: 'pavilion', floors: 4, gfa: 3360, height: 20, rooms: [7, 6, 6, 6], walls: [17, 15, 15, 15], doors: [7, 6, 6, 6], columns: [22, 22, 22, 22], furniture: [36, 38, 63, 76], checksum: [1125.48, 1529.98, 1430.655, 1017] }],
  ['lattice', 6, { prog: 'pavilion', floors: 6, gfa: 5040, height: 30, rooms: [7, 6, 6, 6, 6, 6], walls: [17, 15, 15, 15, 15, 15], doors: [7, 6, 6, 6, 6, 6], columns: [22, 22, 22, 22, 22, 22], furniture: [36, 38, 63, 38, 63, 76], checksum: [1125.48, 1529.98, 1430.655, 1529.98, 1430.655, 1017] }],
  ['terrace', 6, { prog: 'pavilion', floors: 6, gfa: 3075.17, height: 30, rooms: [7, 6, 6, 6, 6, 6], walls: [17, 15, 15, 15, 15, 15], doors: [7, 6, 6, 6, 6, 6], columns: [22, 20, 20, 18, 18, 18], furniture: [36, 30, 55, 19, 33, 33], checksum: [1125.48, 1152.917, 998.845, 639.775, 687.171, 344.875] }]
];

const BUILDING_CASES: [bid: string, Expected][] = [
  ['B-001', { prog: 'restroom_b', floors: 1, gfa: 96, height: 4, rooms: [3], walls: [9], doors: [3], columns: [6], furniture: [11], checksum: [504.5] }],
  ['B-002', { prog: 'prayer_b', floors: 1, gfa: 288, height: 7, rooms: [4], walls: [11], doors: [4], columns: [11], furniture: [24], checksum: [1098.76] }],
  ['B-004', { prog: 'food_b', floors: 2, gfa: 2392, height: 9, rooms: [5, 5], walls: [14, 13], doors: [6, 5], columns: [22, 22], furniture: [35, 35], checksum: [266.39, 33.39] }],
  ['B-005', { prog: 'aid_b', floors: 1, gfa: 192, height: 5, rooms: [3], walls: [10], doors: [4], columns: [8], furniture: [32], checksum: [645.5] }],
  ['B-021', { prog: 'gate', floors: 2, gfa: 960, height: 10, rooms: [2, 2], walls: [7, 7], doors: [2, 2], columns: [14, 14], furniture: [5, 38], checksum: [1094.55, 1279.75] }],
  ['B-029', { prog: 'metro', floors: 3, gfa: 13500, height: 16, rooms: [5, 3, 3], walls: [15, 9, 9], doors: [7, 3, 3], columns: [66, 46, 46], furniture: [153, 133, 133], checksum: [6004.874, 4034.674, 4034.674] }],
  ['B-030', { prog: 'pavilion', floors: 8, gfa: 61600, height: 42, rooms: [7, 6, 6, 6, 6, 6, 6, 6], walls: [17, 15, 15, 15, 15, 15, 15, 15], doors: [7, 6, 6, 6, 6, 6, 6, 6], columns: [62, 62, 62, 62, 62, 62, 62, 62], furniture: [226, 155, 140, 155, 140, 155, 140, 167], checksum: [6572.5, 9541.18, 6470.88, 9541.18, 6470.88, 9541.18, 6470.88, 817.5] }],
  ['B-032', { prog: 'pavilion', floors: 5, gfa: 22117.5, height: 30, rooms: [7, 6, 6, 6, 6], walls: [17, 15, 15, 15, 15], doors: [7, 6, 6, 6, 6], columns: [50, 48, 46, 42, 44], furniture: [213, 113, 119, 100, 153], checksum: [6019.35, 5937.518, 3999.115, 4874.543, 1428.02] }],
  ['B-034', { prog: 'pavilion', floors: 5, gfa: 6287.2, height: 28.4, rooms: [7, 6, 6, 6, 6], walls: [17, 15, 15, 15, 15], doors: [7, 6, 6, 6, 6], columns: [30, 30, 30, 30, 30], furniture: [54, 56, 69, 56, 68], checksum: [1267.181, 2297.442, 1984.515, 2297.442, 946.318] }],
  ['B-035', { prog: 'hospitality', floors: 1, gfa: 863.5, height: 7.3, rooms: [5], walls: [14], doors: [6], columns: [17], furniture: [73], checksum: [1883.271] }],
  ['B-051', { prog: 'retail', floors: 2, gfa: 1674, height: 11.4, rooms: [5, 5], walls: [13, 11], doors: [5, 3], columns: [18, 18], furniture: [32, 32], checksum: [1282.82, 960.82] }],
  ['B-040', { prog: 'media', floors: 5, gfa: 4787.9, height: 27.1, rooms: [6, 4, 4, 4, 4], walls: [16, 10, 10, 10, 10], doors: [7, 3, 3, 3, 3], columns: [24, 18, 18, 18, 18], furniture: [57, 64, 64, 64, 64], checksum: [1094.37, 504.042, 504.042, 504.042, 504.042] }]
];

function summary(s: Parameters<typeof pavilionPlan>[0]): Expected {
  const P = pavilionPlan(s);
  return {
    prog: P.prog, floors: P.floors.length, gfa: r3(P.gfa), height: r3(P.height),
    rooms: P.floors.map(f => f.rooms.length), walls: P.floors.map(f => f.walls.length), doors: P.floors.map(f => f.doors.length),
    columns: P.floors.map(f => f.columns.length), furniture: P.floors.map(f => f.furniture.length), checksum: P.floors.map(checksum)
  };
}

const buildings = JSON.parse(buildingsJson) as BuildingCollection;
const building = (bid: string) => buildings.features.find(f => f.properties.bid === bid)!.properties;

describe('pavilion plan engine (parity with reference pavilion.js)', () => {
  it.each(PLOT_CASES)('plot concept %s × %i floors', (style, floors, expected) => {
    const s = specFromPlot(PLOT, { style, floors, palette: 0 });
    expect(summary(s)).toEqual(expected);
  });

  it.each(BUILDING_CASES)('building %s', (bid, expected) => {
    expect(summary(specFromBuilding(building(bid)))).toEqual(expected);
  });

  it('matches the reference totals over every site building', () => {
    let gfa = 0, rooms = 0, furniture = 0;
    buildings.features.forEach(f => {
      const P = pavilionPlan(specFromBuilding(f.properties));
      gfa += P.gfa;
      P.floors.forEach(fl => { rooms += fl.rooms.length; furniture += fl.furniture.length; });
    });
    expect(buildings.features.length).toBe(217);
    expect(r3(gfa)).toBe(783258.924);
    expect(rooms).toBe(3731);
    expect(furniture).toBe(37406);
  });

  it('labels rooms like the reference', () => {
    const P = pavilionPlan(specFromPlot(PLOT, { floors: 4 }));
    expect(P.floors.map(f => f.name)).toEqual(['Ground floor', 'Level 1', 'Level 2', 'Level 3']);
    expect(P.floors[0].rooms.map(r => r.label)).toEqual(['Café', 'Entrance lobby', 'Shop', 'Exhibition hall', 'Restrooms', 'Stairs & lift', 'Back of house']);
    expect(P.floors[3].rooms.map(r => r.label)).toEqual(['Rooftop restaurant', 'Terrace', 'Private dining', 'Kitchen', 'Stairs & lift', 'Restrooms']);
    expect(P.floors[0].doors.filter(d => d.main).length).toBe(1);
    expect(P.floors[0].furniture.every(it => typeof it.room === 'string')).toBe(true);
  });

  it('caches per spec and recomputes when the design changes', () => {
    const s = specFromPlot(PLOT);
    const a = pavilionPlan(s);
    expect(pavilionPlan(s)).toBe(a);
    s.floors = 5;
    const b = pavilionPlan(s);
    expect(b).not.toBe(a);
    expect(b.floors.length).toBe(5);
  });

  it('picks the programme from the building type and service name', () => {
    expect(program({ btype: 'service', name: 'North-east food court' })).toBe('food_b');
    expect(program({ btype: 'service', name: 'Something else' })).toBe('pavilion');
    expect(program({ btype: 'national', name: 'x' })).toBe('pavilion');
    expect(program({ btype: 'metro', name: 'x' })).toBe('metro');
  });

  it('builds plot specs with the saved design', () => {
    const s = specFromPlot(PLOT, { style: 'dome', palette: 0, floors: 5, name: 'My pavilion' });
    expect(s).toMatchObject({ id: 'T-01', kind: 'plot', name: 'My pavilion', label: 'T-01', W: 30, D: 28, oy: -3, base: 0.3, H: 5, floors: 5, style: 'dome', palette: 0, side: 1, rot: 22.7 });
    expect(specFromPlot(PLOT)).toMatchObject({ name: 'Concept pavilion', floors: 3, style: 'twist', palette: 1 });
  });
});
