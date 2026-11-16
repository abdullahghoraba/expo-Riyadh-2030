import { TestBed } from '@angular/core/testing';
import buildingsJson from '../../../public/data/buildings.geojson';
import plotsJson from '../../../public/data/plots.geojson';
import servicesJson from '../../../public/data/services.geojson';
import streetsJson from '../../../public/data/streets.geojson';
import narrationJson from '../../../public/data/narration.json';
import siteJson from '../../../public/data/site.json';
import { ApiService } from '../core/api.service';
import { DataService } from '../core/data.service';
import { GeoJsonName } from '../core/models';
import { StateService } from '../core/state.service';
import { frontHeading } from '../pavilion/pavilion-frame';
import { PavilionService } from '../pavilion/pavilion.service';
import { PlotSelectionService } from './plot-selection.service';

const GEOJSON: Partial<Record<GeoJsonName, string>> = { buildings: buildingsJson, plots: plotsJson, services: servicesJson, streets: streetsJson };

const fakeApi: Partial<ApiService> = {
  getSite: () => Promise.resolve(JSON.parse(JSON.stringify(siteJson))),
  getNarration: () => Promise.resolve(JSON.parse(JSON.stringify(narrationJson))),
  getGeojson: <T>(name: GeoJsonName) => Promise.resolve(JSON.parse(GEOJSON[name] ?? '{"type":"FeatureCollection","features":[]}') as T),
  geojsonUrl: (name: GeoJsonName) => `data/${name}.geojson`
};

describe('PlotSelectionService + PavilionService (no 3D view)', () => {
  let plots: PlotSelectionService, pav: PavilionService, state: StateService;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: ApiService, useValue: fakeApi }] });
    await TestBed.inject(DataService).load();
    plots = TestBed.inject(PlotSelectionService);
    pav = TestBed.inject(PavilionService);
    state = TestBed.inject(StateService);
    plots.initDefault();
  });

  it('selects the first available plot and opens its detail pavilion', () => {
    expect(state.district()).toBe('NE');
    expect(state.selected()).toBe('NE-01');
    expect(state.plotStatus('NE-01')).toBe('selected');
    const spec = state.detailSpec()!, det = pav.detail()!;
    expect(spec).toMatchObject({ id: 'NE-01', kind: 'plot', style: 'twist', floors: 3 });
    expect(det.plan.floors.length).toBe(3);
    expect(det.meta.frontHeading).toBeCloseTo(frontHeading(spec), 9);
    expect(det.graphics.length).toBeGreaterThan(100);
  });

  it('lists the nearest services by walking distance', () => {
    const near = state.near();
    expect(near.map(n => n.type)).toEqual(['restroom', 'prayer', 'aid', 'food', 'visitor', 'metro']);
    near.forEach(n => {
      expect(n.len % 10).toBe(0);
      expect(n.min).toBeGreaterThanOrEqual(1);
      expect(n.route.coords.length).toBeGreaterThan(1);
    });
    plots.showNear('metro');
    expect(state.nearSel()).toBe('metro');
    expect(plots.routePop()?.label).toBe('Metro station');
    plots.showNear('metro');
    expect(state.nearSel()).toBeNull();
    expect(plots.routePop()).toBeNull();
  });

  it('shows a card instead of selecting a taken plot', () => {
    plots.selectPlot('NE-03');
    expect(state.selected()).toBe('NE-01');
    expect(plots.card()?.title).toBe('Plot NE-03 · allocated');
    expect(plots.card()?.rows[0]).toEqual(['Participant', 'Participant P-103']);
  });

  it('submits, persists and withdraws a plot request', () => {
    plots.openSubmit();
    expect(plots.submitOpen()).toBe(true);
    expect(plots.submitView()).toMatchObject({ pid: 'NE-01', participant: 'UK delegation', design: 'Twisting tower · Pearl white', floors: '3 · 2,520 m²' });
    plots.confirmSubmit('hello');
    expect(plots.submitOpen()).toBe(false);
    expect(state.plotStatus('NE-01')).toBe('pending');
    const saved = JSON.parse(localStorage.getItem('expo.submitted')!);
    expect(saved['NE-01'].ref).toMatch(/^EXPO-\d{6}$/);
    expect(saved['NE-01'].note).toBe('hello');
    plots.openSubmit();
    expect(plots.submitSub()?.ref).toBe(saved['NE-01'].ref);
    plots.withdrawSubmit();
    expect(state.plotStatus('NE-01')).toBe('selected');
    expect(JSON.parse(localStorage.getItem('expo.submitted')!)).toEqual({});
  });

  it('persists design changes and keeps the floor selection valid', () => {
    pav.setFloor(2);
    pav.design({ floors: 2 });
    expect(state.detailSpec()?.floors).toBe(2);
    expect(state.floor()).toBe(-1);
    expect(pav.detail()?.plan.floors.length).toBe(2);
    pav.design({ style: 'cantilever', palette: 3 });
    expect(JSON.parse(localStorage.getItem('expo.design')!)['NE-01']).toEqual({ style: 'cantilever', palette: 3, floors: 2 });
    expect(pav.plotSpec('NE-01')).toMatchObject({ style: 'cantilever', palette: 3, floors: 2 });
  });

  it('shows room labels only when a floor is isolated or the floors are exploded', () => {
    const roomLabels = () => pav.detail()!.graphics.filter(g => g.attributes['room'] === 1 && g.geometry?.type === 'point').length;
    expect(roomLabels()).toBe(0);
    pav.setFloor(1);
    expect(roomLabels()).toBe(6);
    pav.setExplode(true);
    expect(state.floor()).toBe(-1);
    expect(roomLabels()).toBe(7 + 6 + 6);
    pav.setLabels(false);
    expect(roomLabels()).toBe(0);
  });

  it('opens a site building in detail with its card (card first, 3D model after the next paint)', async () => {
    const b = JSON.parse(buildingsJson).features.find((f: { properties: { bid: string } }) => f.properties.bid === 'B-021').properties;
    plots.openBuilding(b);
    expect(plots.card()?.title).toBe('East gate');
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 5)));
    expect(state.detailSpec()).toMatchObject({ id: 'B-021', kind: 'building' });
    expect(state.tab()).toBe('pavilion');
    expect(plots.card()?.title).toBe('East gate');
    expect(plots.card()?.rows.find(r => r[0] === 'Walk')?.[1]).toMatch(/min from NE-01$/);
  });

  it('detects points inside building footprints', () => {
    const b = JSON.parse(buildingsJson).features[0].properties;
    expect(pav.insideBuilding([b.cx, b.cy])).toBe(true);
    expect(pav.insideBuilding([0, 0])).toBe(false);
  });
});
