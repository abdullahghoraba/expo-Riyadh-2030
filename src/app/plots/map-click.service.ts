import { Injectable, inject } from '@angular/core';
import type Graphic from '@arcgis/core/Graphic';
import type Point from '@arcgis/core/geometry/Point';
import { AnalysisService } from '../analysis/analysis.service';
import { CadService } from '../cad/cad.service';
import { DataService } from '../core/data.service';
import { dist, fmt, rgb } from '../core/geo';
import { BuildingProps, ServiceType } from '../core/models';
import { SERVICE } from '../core/service-catalog';
import { StateService } from '../core/state.service';
import { LayersService } from '../map/layers.service';
import { SceneHooks } from '../map/scene-hooks';
import { SceneService } from '../map/scene.service';
import { PavilionGraphicAttrs } from '../pavilion/pavilion-3d.service';
import { PavilionService } from '../pavilion/pavilion.service';
import { PlotSelectionService, afterPaint, quarter } from './plot-selection.service';

type Attrs = Record<string, unknown>;

const CARD_SKIP = /^(OBJECTID|oid|__|kind$|uid$)/;
const str = (v: unknown): string | undefined => (v === undefined || v === null ? undefined : String(v));

/**
 * Click on anything in the 3D view → select a plot, open a building / pavilion in detail or show an info
 * card (reference app.js onClick). Also runs the default plot selection after the layers are built.
 */
@Injectable({ providedIn: 'root' })
export class MapClickService implements SceneHooks {
  private readonly data = inject(DataService);
  private readonly state = inject(StateService);
  private readonly layers = inject(LayersService);
  private readonly scene = inject(SceneService);
  private readonly analysis = inject(AnalysisService);
  private readonly cad = inject(CadService);
  private readonly pavilion = inject(PavilionService);
  private readonly plots = inject(PlotSelectionService);

  /**
   * Scene hook triggered once all map layers have initialized: selects default plot.
   */
  afterLayers(): void {
    this.plots.initDefault();
  }

  /**
   * Hit tests the clicked point in the 3D SceneView and delegates to the appropriate entity handler.
   *
   * @param ev ArcGIS ViewImmediateClickEvent (no double-click delay).
   */
  async click(ev: __esri.ViewImmediateClickEvent): Promise<void> {
    const view = this.scene.view, L = this.layers;
    if (!view || this.state.cinema() || ['measure', 'zone'].includes(this.analysis.active() ?? '')) return;
    const clickableLayers = [
      L.plots, L.buildings, L.pavLite, L.services, L.pav, L.streets, L.streetLines,
      L.districts, L.parking, L.utilities, L.crowd, L.vehicles, L.labels
    ].filter(Boolean);
    const hit = await view.hitTest(ev, { include: clickableLayers });
    let g: Graphic | null = null;
    for (const r of hit.results) {
      if (r.type === 'graphic' && r.graphic.layer && r.graphic.layer !== L.people && r.graphic.layer !== L.analysis) {
        g = r.graphic;
        break;
      }
    }
    if (!g) {
      this.plots.closeCards();
      return;
    }
    this.handle(g, (g.attributes ?? {}) as Attrs);
  }

  /**
   * Inspects clicked graphic attributes and layer type, triggering plot selection,
   * building opening, pavilion exploration, or displaying relevant info cards.
   *
   * @param g Clicked Graphic.
   * @param a Graphic attribute dictionary.
   */
  private handle(g: Graphic, a: Attrs): void {
    const L = this.layers, lyr = g.layer, P = this.plots, card = P.showCard.bind(P);
    const pid = str(a['pid']);
    if (lyr === L.plots || (lyr === L.labels && pid) || (a['kind'] === 'plot' && pid)) {
      if (pid) P.selectPlot(pid);
      return;
    }
    if (lyr === L.buildings) {
      P.openBuilding(a as unknown as BuildingProps);
      return;
    }
    if (lyr === L.pavLite) {
      const pa = a as unknown as PavilionGraphicAttrs;
      if (pa.kindOf === 'plot') {
        P.showTakenCard(this.state.plotById(pa.sid));
        afterPaint(() => { this.pavilion.openDetail(this.pavilion.plotSpec(pa.sid)); this.state.tab.set('pavilion'); });
        return;
      }
      const b = this.data.d.buildings.features.find(f => f.properties.bid === pa.sid);
      if (b) P.openBuilding(b.properties);
      return;
    }
    if (lyr === L.pav) {
      this.pavilionCard(a as unknown as PavilionGraphicAttrs);
      return;
    }
    if (lyr === L.services) {
      const type = a['type'] as ServiceType, s = SERVICE[type];
      const gp = g.geometry as Point | null, ll = gp ? [gp.longitude ?? gp.x, gp.latitude ?? gp.y] : null;
      const w = P.walkFromPlot(ll);
      const bld = ll ? this.data.d.buildings.features.find(f => f.properties.type === 'service' && f.properties.name === a['name'] && dist([f.properties.cx, f.properties.cy], ll) < 40) : undefined;
      card(`${s?.glyph || ''} ${str(a['name']) ?? ''}`, str(a['location']), [['Opening hours', str(a['open'])], ['Capacity', str(a['capacity'])], ['Accessible', a['accessible'] ? 'Yes ♿' : ''], ['Walk', w?.text]], [
        { label: 'Walk here', cls: 'primary', action: () => { if (w) P.drawRoute(w.route, rgb(s?.color || '#0b3d2e', 1)); } },
        ...(bld ? [{ label: 'Look inside', action: () => P.openBuilding(bld.properties) }] : [])
      ]);
      return;
    }
    if (lyr === L.streets || lyr === L.streetLines) {
      card(str(a['name']) ?? '', str(a['nameAr']), [['Type', str(a['kind'])], ['Width', a['width'] + ' m'], ['Length', fmt(a['length'] as number) + ' m'], ['ID', str(a['sid'])]]);
      return;
    }
    if (lyr === L.utilities) {
      card(str(a['name']) ?? '', 'Underground utility', [['Network', str(a['type'])], ['Depth', a['depth'] + ' m'], ['Diameter', a['diameter'] + ' m'], ['Material', str(a['material'])], ['Under', str(a['street'])], ['Installed', a['installed'] ? quarter(a['installed'] as number) : undefined]]);
      return;
    }
    if (lyr === L.parking) {
      card(str(a['name']) ?? '', 'Visitor parking', [['Spaces', fmt(a['capacity'] as number)], ['EV chargers', str(a['evChargers'])]]);
      return;
    }
    if (lyr === L.crowd) {
      const h = L.crowdHour();
      card('Visitor density', str(a['hid']), [['At ' + String(h).padStart(2, '0') + ':00', a['h' + h] + ' people / 1,000 m²'], ['Daily peak', str(a['peak'])]]);
      return;
    }
    if (lyr === L.districts) {
      const did = str(a['did']);
      card(str(a['name']) ?? '', str(a['nameAr']), [['', str(a['note'])], ['Plots', this.data.d.plots.features.filter(f => f.properties.district === did).length]], [
        { label: 'Show plots', action: () => { this.state.district.set(did ?? null); this.state.tab.set('plot'); } }
      ]);
      return;
    }
    if (lyr === L.trees) {
      card('Date palm', str(a['species']), [['Height', a['height'] + ' m']]);
      return;
    }
    if (lyr === L.vehicles) {
      card('Vehicle', str(a['model'])?.replace(/_/g, ' '), []);
      return;
    }
    const title = lyr && 'title' in lyr ? str(lyr.title) : undefined;
    card(str(a['name']) || str(a['label']) || title || '', title,
      Object.entries(a).filter(([k, v]) => !CARD_SKIP.test(k) && k !== 'name' && typeof v !== 'object').slice(0, 7).map(([k, v]) => [k, str(v)]));
  }

  /**
   * Displays an interactive info card for a clicked room or floor of the detail pavilion.
   *
   * @param a Pavilion graphic attributes.
   */
  private pavilionCard(a: PavilionGraphicAttrs): void {
    const P = this.plots;
    if (a.sid !== this.state.detailId()) {
      if (a.kindOf === 'plot') P.selectPlot(a.sid);
      return;
    }
    const det = this.pavilion.detail(), spec = this.state.detailSpec();
    if (!det || !spec) return;
    const fl = typeof a.floor === 'number' ? det.plan.floors[a.floor] : null;
    const floorNo = typeof a.floor === 'number' ? a.floor : -1;
    P.showCard(a.label || 'Pavilion', `${spec.kind === 'plot' ? spec.label + ' · ' : ''}${spec.name}`, [
      ['Floor', fl ? fl.name : a.floor === 'roof' ? 'Roof' : ''], ['Area', a.area ? fmt(a.area, 1) + ' m²' : ''], ['Floor height', spec.H + ' m']
    ], fl ? [
      { label: 'Show this floor', cls: 'primary', action: () => { this.pavilion.setFloor(floorNo); this.state.tab.set('pavilion'); } },
      { label: 'CAD plan', action: () => { this.state.floor.set(floorNo); this.cad.openViewer(); } }
    ] : [
      { label: 'Explode floors', action: () => { this.state.explode.set(true); this.pavilion.rebuildDetail(); } }
    ]);
  }
}
