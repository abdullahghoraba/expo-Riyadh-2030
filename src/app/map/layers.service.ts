import { Injectable, Injector, inject, signal } from '@angular/core';
import Graphic from '@arcgis/core/Graphic';
import type EsriMap from '@arcgis/core/Map';
import Mesh from '@arcgis/core/geometry/Mesh';
import MeshMaterial from '@arcgis/core/geometry/support/MeshMaterial';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import Polyline from '@arcgis/core/geometry/Polyline';
import * as geodesicBufferOperator from '@arcgis/core/geometry/operators/geodesicBufferOperator';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import GeoJSONLayer from '@arcgis/core/layers/GeoJSONLayer';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import PointSymbol3D from '@arcgis/core/symbols/PointSymbol3D';
import PolygonSymbol3D from '@arcgis/core/symbols/PolygonSymbol3D';
import WebStyleSymbol from '@arcgis/core/symbols/WebStyleSymbol';
import type ObjectSymbol3DLayer from '@arcgis/core/symbols/ObjectSymbol3DLayer';
import { ApiService } from '../core/api.service';
import { DEG, Color, along, clamp, ease, mix, offset, pathLength, rgb } from '../core/geo';
import { GeoJsonName, LonLat, PavilionSpec, PlotStatus, RenderMode, SiteData } from '../core/models';
import { SERVICE, icon } from '../core/service-catalog';
import { StateService } from '../core/state.service';
import { PAVILION_RENDERER, PavilionRenderer } from './pavilion-renderer';

const SR = { wkid: 4326 };

type PolygonSymbolProps = __esri.PolygonSymbol3DProperties & { type: 'polygon-3d' };
type EdgesProps = (__esri.SolidEdges3DProperties & { type: 'solid' }) | (__esri.SketchEdges3DProperties & { type: 'sketch' });
type GeoJSONLayerOptions = Omit<__esri.GeoJSONLayerProperties, 'url'>;
type VisualVariable = (__esri.SizeVariableProperties & { type: 'size' }) | (__esri.ColorVariableProperties & { type: 'color' })
  | (__esri.RotationVariableProperties & { type: 'rotation' });

/** The 4.x typings declare `visualVariables` / `edges` without their autocast `type` discriminator. */
const vvs = (...v: VisualVariable[]): __esri.VisualVariableProperties[] => v;
const edges = (e: EdgesProps): EdgesProps => e;

const fill = (color: Color, outline?: Color, osize?: number): PolygonSymbolProps => ({
  type: 'polygon-3d',
  symbolLayers: [{ type: 'fill', material: { color }, outline: outline ? { color: outline, size: osize || 1 } : undefined }]
});
const extr = (color: Color, edges?: EdgesProps): PolygonSymbolProps => ({
  type: 'polygon-3d',
  symbolLayers: [{ type: 'extrude', material: { color }, edges }]
});

/** Plot status colours (reference `L.plotColor`). */
export const PLOT_COLOR: Record<PlotStatus, string> = { available: '#2eb872', taken: '#9aa0a6', selected: '#f0be28', pending: '#e8912d' };

export interface BuildingFilter {
  hideBid?: string | null;
  year?: number | null;
}

/** Every map layer built from the JSON / GeoJSON site database (port of reference js/layers.js). */
@Injectable({ providedIn: 'root' })
export class LayersService {
  private readonly api = inject(ApiService);
  private readonly state = inject(StateService);
  private readonly injector = inject(Injector);

  readonly plotColor = PLOT_COLOR;
  readonly mode = signal<RenderMode>('realistic');
  readonly night = signal(false);
  readonly crowdHour = signal(18);
  hideBid: string | null = null;
  year: number | null = null;

  site!: GeoJSONLayer;
  districts!: GeoJSONLayer;
  parking!: GeoJSONLayer;
  streets!: FeatureLayer;
  streetLines!: GeoJSONLayer;
  green!: GeoJSONLayer;
  water!: GeoJSONLayer;
  plots!: GraphicsLayer;
  buildings!: GeoJSONLayer;
  pav!: GraphicsLayer;
  pavLite!: GraphicsLayer;
  landmarks!: GraphicsLayer;
  trees!: GeoJSONLayer;
  lights!: GeoJSONLayer;
  glow!: GeoJSONLayer;
  vehicles!: GeoJSONLayer;
  people!: GraphicsLayer;
  metro!: GraphicsLayer;
  services!: GeoJSONLayer;
  utilities!: GeoJSONLayer;
  crowd!: GeoJSONLayer;
  construction!: GraphicsLayer;
  analysis!: GraphicsLayer;
  analysis3d!: GraphicsLayer;
  routes!: GraphicsLayer;
  labels!: GraphicsLayer;
  sketch!: GraphicsLayer;

  /** Plot pad graphics by plot id. */
  plotGraphics: Record<string, Graphic> | null = null;
  /** Specs of the landmark + taken-plot pavilions currently in `pavLite`. */
  liteSpecs: PavilionSpec[] = [];
  globeZ = 0;
  metroPath: LonLat[] = [];
  metroDeck = 0;
  train: Graphic | null = null;
  private trainSym: PointSymbol3D | null = null;
  private trainLen = 0;
  private trainRaf = 0;
  private litNight: boolean | undefined;
  private D!: Readonly<SiteData>;
  private initialised = false;

  private get pavilion(): PavilionRenderer {
    return this.injector.get(PAVILION_RENDERER);
  }

  get ready(): boolean {
    return this.initialised;
  }

  async init(map: EsriMap, D: Readonly<SiteData>): Promise<void> {
    this.D = D;
    const gj = (name: GeoJsonName, o: GeoJSONLayerOptions): GeoJSONLayer =>
      new GeoJSONLayer({ url: this.api.geojsonUrl(name), outFields: ['*'], popupEnabled: false, copyright: 'Illustrative Expo 2030 site database', ...o });

    this.site = gj('landscape', { title: 'Expo site (gated area)', definitionExpression: "kind = 'site'" });
    this.districts = gj('districts', { title: 'Districts', opacity: 0.9 });
    this.parking = gj('parking', { title: 'Parking', labelingInfo: [this.labelClass('name', 10)] });

    // streets as true-width surfaces (geodesic buffer of centre lines)
    await geodesicBufferOperator.load();
    const sg = D.streets.features.map((f, i) => new Graphic({
      geometry: geodesicBufferOperator.execute(new Polyline({ paths: [f.geometry.coordinates], spatialReference: SR }), f.properties.width / 2, { unit: 'meters' }) ?? undefined,
      attributes: { oid: i + 1, ...f.properties }
    }));
    this.streets = new FeatureLayer({
      title: 'Streets & walkways', source: sg, objectIdField: 'oid', geometryType: 'polygon', spatialReference: SR, outFields: ['*'], popupEnabled: false,
      fields: [{ name: 'oid', type: 'oid' }, { name: 'sid', type: 'string' }, { name: 'name', type: 'string' }, { name: 'nameAr', type: 'string' }, { name: 'kind', type: 'string' }, { name: 'width', type: 'double' }, { name: 'length', type: 'double' }]
    });
    this.streetLines = gj('streets', { title: 'Street centre lines', minScale: 9000 });
    this.green = gj('landscape', { title: 'Gardens & plazas', definitionExpression: "kind IN ('plaza','garden','median','island')" });
    this.water = gj('landscape', { title: 'Water features', definitionExpression: "kind = 'water'" });

    this.plots = new GraphicsLayer({ title: 'Pavilion plots', elevationInfo: { mode: 'absolute-height' } });
    this.buildings = gj('buildings', { title: 'Buildings (massing)' });
    this.pav = new GraphicsLayer({ title: 'Pavilion model – BIM detail', elevationInfo: { mode: 'absolute-height' } });
    this.pavLite = new GraphicsLayer({ title: 'Landmark & participant pavilions', elevationInfo: { mode: 'absolute-height' } });
    this.landmarks = new GraphicsLayer({ title: 'Globe & fountains', elevationInfo: { mode: 'absolute-height' } });
    this.trees = gj('trees', { title: 'Date palms (954)' });
    this.lights = gj('lights', { title: 'Street lights' });
    this.glow = gj('lights', { title: 'Light glow', visible: false, listMode: 'hide', elevationInfo: { mode: 'relative-to-ground', offset: 7.5 } });
    this.vehicles = gj('vehicles', { title: 'Vehicles' });
    this.people = new GraphicsLayer({ title: 'Visitors', elevationInfo: { mode: 'on-the-ground' } });
    this.metro = new GraphicsLayer({ title: 'Metro viaduct & train', elevationInfo: { mode: 'absolute-height' } });
    this.services = gj('services', { title: 'Visitor services', elevationInfo: { mode: 'relative-to-ground', offset: 0 } });
    this.utilities = gj('utilities', { title: 'Underground utilities', visible: false, elevationInfo: { mode: 'relative-to-ground', featureExpressionInfo: { expression: '-$feature.depth' }, unit: 'meters' } });
    this.crowd = gj('crowd', { title: 'Visitor density forecast', visible: false, opacity: 0.88 });
    this.construction = new GraphicsLayer({ title: 'Construction (cranes)', visible: false, elevationInfo: { mode: 'absolute-height' } });
    this.analysis = new GraphicsLayer({ title: 'Analysis results', listMode: 'hide', elevationInfo: { mode: 'on-the-ground' } });
    this.analysis3d = new GraphicsLayer({ title: 'Analysis 3D', listMode: 'hide', elevationInfo: { mode: 'absolute-height' } });
    this.routes = new GraphicsLayer({ title: 'Routes', listMode: 'hide', elevationInfo: { mode: 'relative-to-ground', offset: 0.4 } });
    this.labels = new GraphicsLayer({ title: 'Plot labels', elevationInfo: { mode: 'absolute-height' } });
    this.sketch = new GraphicsLayer({ title: 'Sketch zones', listMode: 'hide', elevationInfo: { mode: 'on-the-ground' } });

    map.addMany([this.site, this.districts, this.parking, this.streets, this.green, this.water, this.analysis, this.sketch, this.streetLines, this.routes, this.plots, this.buildings, this.pavLite, this.pav,
      this.landmarks, this.trees, this.lights, this.glow, this.vehicles, this.people, this.metro, this.services, this.utilities, this.crowd, this.construction, this.analysis3d, this.labels]);

    this.services.renderer = {
      type: 'unique-value', field: 'type',
      uniqueValueInfos: Object.entries(SERVICE).map(([k, s]) => ({
        value: k, label: s.label,
        symbol: {
          type: 'point-3d', symbolLayers: [{ type: 'icon', resource: { href: icon(s.glyph, s.color) }, size: 22 }],
          verticalOffset: { screenLength: 34, maxWorldLength: 70, minWorldLength: 6 },
          callout: { type: 'line', size: 1.2, color: [255, 255, 255, 0.9], border: { color: [0, 0, 0, 0.3] } }
        }
      }))
    };
    const utilityTypes: [string, string, string][] = [['water', '#1f78ff', 'Water'], ['power', '#ff3b30', 'Power (MV)'], ['telecom', '#b45cff', 'Telecom fibre'], ['cooling', '#00d1c1', 'District cooling']];
    this.utilities.renderer = {
      type: 'unique-value', field: 'type',
      uniqueValueInfos: utilityTypes.map(([v, c, l]) => ({
        value: v, label: l, symbol: { type: 'line-3d', symbolLayers: [{ type: 'path', profile: 'circle', width: 1.1, height: 1.1, material: { color: c } }] }
      }))
    };
    this.glow.renderer = {
      type: 'simple',
      symbol: {
        type: 'point-3d', symbolLayers: [
          { type: 'icon', resource: { primitive: 'circle' }, size: 22, material: { color: [255, 196, 90, 0.18] } },
          { type: 'icon', resource: { primitive: 'circle' }, size: 7, material: { color: [255, 236, 180, 1] } }
        ]
      }
    };
    this.vehicles.renderer = {
      type: 'unique-value', field: 'model',
      uniqueValueInfos: [...new Set(D.vehicles.features.map(f => f.properties.model))].map(m => ({ value: m, symbol: { type: 'web-style', name: m, styleName: 'EsriRealisticTransportationStyle' } })),
      visualVariables: vvs({ type: 'rotation', field: 'heading', rotationType: 'geographic' })
    };
    this.initialised = true;
    this.setCrowdHour(18);
    this.buildPlots();
    this.buildLandmarks();
    this.buildMetro();
    this.buildPeople();
    this.buildLitePavilions();
    this.applyStyle('realistic');
    this.setBuildingFilter();
  }

  labelClass(field: string, size?: number, color?: Color | string): __esri.LabelClassProperties {
    return {
      labelExpressionInfo: { expression: `$feature.${field}` },
      symbol: { type: 'label-3d', symbolLayers: [{ type: 'text', material: { color: color || 'white' }, halo: { color: [0, 0, 0, 0.6], size: 1 }, size: size || 10 }] }
    };
  }

  // ---------------- per-style renderers ----------------
  applyStyle(mode: RenderMode): void {
    this.mode.set(mode);
    const D = this.D;
    const bp = mode === 'blueprint', sk = mode === 'sketch', night = this.night();
    const edgeB: EdgesProps = bp ? { type: 'solid', color: [170, 225, 255, 0.95], size: 1 }
      : sk ? { type: 'sketch', color: [30, 30, 30, 0.85], size: 1.2, extensionLength: 2 }
      : { type: 'solid', color: [60, 60, 60, 0.35], size: 0.6 };
    const c = (hex: string, a = 1): Color => bp ? [90, 170, 255, 0.18]
      : sk ? mix(rgb(hex), [255, 255, 255], 0.8).concat(a)
      : (night ? mix(rgb(hex), [255, 214, 150], 0.25) : rgb(hex)).concat(a);

    this.site.renderer = { type: 'simple', symbol: fill(bp ? [10, 40, 80, 0.6] : sk ? [248, 246, 240, 1] : [226, 207, 170, 1], bp ? [120, 200, 255] : [150, 120, 80], 1.5) };
    this.districts.renderer = {
      type: 'unique-value', field: 'did',
      uniqueValueInfos: D.site.districts.map(d => ({ value: d.id, label: d.name, symbol: fill(bp ? [0, 0, 0, 0] : rgb(d.color, sk ? 0.05 : 0.13), bp ? [120, 200, 255, 0.6] : rgb(d.color, 0.9), 2) }))
    };
    this.parking.renderer = { type: 'simple', symbol: fill(bp ? [40, 90, 160, 0.4] : sk ? [235, 235, 235, 1] : [95, 98, 102, 1], bp ? [150, 210, 255] : [240, 240, 240, 0.8], 1) };
    const st: Record<string, string> = { boulevard: '#3a3d40', avenue: '#43474a', street: '#4b4f53', lane: '#a4977f', promenade: '#cdbd9c', service: '#55595d' };
    this.streets.renderer = {
      type: 'unique-value', field: 'kind',
      uniqueValueInfos: Object.entries(st).map(([k, v]) => ({
        value: k,
        symbol: fill(bp ? [30, 80, 150, 0.55] : sk ? (k === 'promenade' || k === 'lane' ? [230, 230, 226, 1] : [210, 210, 206, 1]) : rgb(v), bp ? [140, 210, 255, 0.9] : sk ? [80, 80, 80, 0.8] : undefined, 1)
      }))
    };
    this.streetLines.renderer = {
      type: 'simple',
      symbol: { type: 'line-3d', symbolLayers: [{ type: 'line', size: 1.2, material: { color: bp ? [180, 230, 255, 0.6] : sk ? [120, 120, 120, 0.5] : [255, 255, 255, 0.75] }, pattern: { type: 'style', style: 'dash' } }] }
    };
    const gr: Record<string, string> = { plaza: '#e7dcc8', garden: '#5f9a4c', median: '#6fa35a', island: '#d9cdb4' };
    this.green.renderer = {
      type: 'unique-value', field: 'kind',
      uniqueValueInfos: Object.entries(gr).map(([k, v]) => ({
        value: k,
        symbol: fill(bp ? [60, 140, 220, 0.3] : sk ? (k === 'plaza' || k === 'island' ? [250, 250, 248, 1] : [225, 235, 222, 1]) : rgb(v), bp ? [150, 215, 255] : sk ? [70, 70, 70, 0.7] : undefined, 1)
      }))
    };
    this.water.renderer = bp || sk
      ? { type: 'simple', symbol: fill(bp ? [60, 160, 255, 0.5] : [200, 225, 240, 1], bp ? [180, 230, 255] : [60, 60, 60], 1) }
      : { type: 'simple', symbol: { type: 'polygon-3d', symbolLayers: [{ type: 'water', waveDirection: 260, color: '#25a5b8', waveStrength: 'slight', waterbodySize: 'small' }] } };

    const bc: Record<string, string> = { national: '#efe8da', corporate: '#dfe6ee', hospitality: '#f1d9bf', retail: '#e8d6ee', media: '#d4e3f0', service: '#e6eedf', gate: '#c9a24b', metro: '#0f7a52' };
    this.buildings.renderer = {
      type: 'unique-value', field: 'type', defaultSymbol: extr(c('#e8e1d3'), edgeB),
      uniqueValueInfos: Object.entries(bc).map(([k, v]) => ({ value: k, label: k, symbol: extr(c(v), edgeB) })),
      visualVariables: vvs({ type: 'size', field: 'height', valueUnit: 'meters' })
    };
    this.trees.renderer = bp || sk
      ? {
        type: 'simple',
        symbol: { type: 'point-3d', symbolLayers: [{ type: 'object', resource: { primitive: 'cone' }, width: 3.5, height: 7, material: { color: bp ? [120, 200, 255, 0.45] : [252, 252, 250, 1] } }] },
        visualVariables: vvs({ type: 'size', field: 'height', axis: 'height', valueUnit: 'meters' }, { type: 'size', axis: 'width-and-depth', useSymbolValue: true })
      }
      : {
        type: 'simple',
        symbol: { type: 'web-style', name: 'Phoenix', styleName: 'EsriRealisticTreesStyle' },
        visualVariables: vvs({ type: 'size', field: 'height', axis: 'height', valueUnit: 'meters' }, { type: 'rotation', field: 'rot' })
      };
    this.setNight(this.night());
    this.vehicles.visible = mode === 'realistic';
    this.people.visible = mode !== 'blueprint';
    this.refreshPlots();
  }

  setNight(on: boolean): void {
    this.night.set(on);
    const mode = this.mode();
    this.lights.renderer = mode === 'realistic'
      ? {
        type: 'simple',
        symbol: { type: 'web-style', name: on ? 'Light_On_Post_-_Light_on' : 'Light_On_Post_-_Light_off', styleName: 'EsriRealisticStreetSceneStyle' },
        visualVariables: vvs({ type: 'rotation', field: 'heading', rotationType: 'geographic' })
      }
      : {
        type: 'simple',
        symbol: { type: 'point-3d', symbolLayers: [{ type: 'object', resource: { primitive: 'cylinder' }, width: 0.25, height: 8, material: { color: mode === 'blueprint' ? [150, 210, 255, 0.6] : [90, 90, 90, 1] } }] }
      };
    this.glow.visible = on;
    if (this.state.detailSpec() && on !== this.litNight) {
      this.litNight = on;
      this.pavilion.rebuildDetail();
      this.buildLitePavilions();
    }
  }

  /** Building definition expression: hides landmark shells, the opened building and (timeline) future phases. */
  setBuildingFilter(o?: BuildingFilter): void {
    if (o) {
      if (o.hideBid !== undefined) this.hideBid = o.hideBid;
      if (o.year !== undefined) this.year = o.year;
    }
    const parts = ["type NOT IN ('saudi','theme')"];
    if (this.hideBid) parts.push(`bid <> '${this.hideBid}'`);
    if (this.year) parts.push(`phase <= ${this.year}`);
    this.buildings.definitionExpression = parts.join(' AND ');
  }

  setCrowdHour(h: number): void {
    this.crowdHour.set(h);
    this.crowd.renderer = {
      type: 'simple',
      symbol: { type: 'polygon-3d', symbolLayers: [{ type: 'extrude', material: { color: [255, 255, 255] }, edges: edges({ type: 'solid', color: [0, 0, 0, 0.25], size: 0.5 }) }] },
      visualVariables: vvs(
        { type: 'size', field: 'h' + h, stops: [{ value: 0, size: 0.3 }, { value: 40, size: 90 }] },
        {
          type: 'color', field: 'h' + h,
          stops: [{ value: 0, color: [40, 180, 120, 0.25] }, { value: 8, color: [120, 210, 90, 0.85] }, { value: 18, color: [250, 210, 60, 0.9] }, { value: 28, color: [245, 120, 40, 0.92] }, { value: 38, color: [220, 40, 60, 0.95] }]
        }
      )
    };
  }

  // ---------------- plots (status pads + labels) ----------------
  buildPlots(): void {
    const graphics: Record<string, Graphic> = {};
    this.plotGraphics = graphics;
    this.D.plots.features.forEach(f => {
      const ring = f.geometry.coordinates[0].map(c => [c[0], c[1], 0]);
      const g = new Graphic({ geometry: new Polygon({ rings: [ring], spatialReference: SR, hasZ: true }), attributes: { kind: 'plot', ...f.properties } });
      graphics[f.properties.pid] = g;
      this.plots.add(g);
    });
    this.refreshPlots();
  }

  refreshPlots(): void {
    if (!this.plotGraphics || !this.initialised) return;
    const bp = this.mode() === 'blueprint', selected = this.state.selected();
    this.labels.removeAll();
    Object.values(this.plotGraphics).forEach(g => {
      const pid = g.attributes['pid'] as string;
      const status = this.state.plotStatus(pid);
      const col = rgb(PLOT_COLOR[status]);
      g.symbol = new PolygonSymbol3D({
        symbolLayers: [{
          type: 'extrude', size: 0.3, material: { color: bp ? [...col, 0.45] : [...col, 1] },
          edges: edges(bp ? { type: 'solid', color: [200, 240, 255], size: 1.2 } : { type: 'solid', color: [255, 255, 255, 0.9], size: 1.5 })
        }]
      });
      if (status === 'taken' || selected === pid) return;
      const txt = status === 'available' ? `${pid}\nAvailable` : status === 'pending' ? `${pid}\nSubmitted` : status === 'selected' ? `${pid}\nSelected` : pid;
      this.labels.add(new Graphic({
        geometry: new Point({ x: g.attributes['cx'], y: g.attributes['cy'], z: status === 'selected' || status === 'pending' ? 2 : 1.5, spatialReference: SR }),
        attributes: { kind: 'plot', pid },
        symbol: {
          type: 'point-3d',
          symbolLayers: [{ type: 'text', text: txt, size: 10, material: { color: 'white' }, halo: { color: col.map(v => v * 0.55).concat(0.95), size: 1.6 }, font: { weight: 'bold' } }],
          verticalOffset: { screenLength: status === 'selected' ? 90 : 46, maxWorldLength: 160, minWorldLength: 12 },
          callout: { type: 'line', size: 1.2, color: [255, 255, 255, 0.85] }
        }
      }));
    });
  }

  // ---------------- landmarks: Globe, rings, fountains ----------------
  buildLandmarks(): void {
    const c = this.D.site.globe, z0 = 0;
    this.landmarks.removeAll();
    const P = (p: readonly number[], z: number) => new Point({ x: p[0], y: p[1], z, spatialReference: SR });
    this.landmarks.add(new Graphic({
      geometry: P(c, z0), attributes: { kind: 'landmark', name: 'The Globe – Expo 2030 icon' },
      symbol: { type: 'point-3d', symbolLayers: [{ type: 'object', resource: { primitive: 'cylinder' }, width: 12, depth: 12, height: 6, anchor: 'bottom', material: { color: [214, 196, 160] } }] }
    }));
    const R = 17;
    const globe = Mesh.createSphere(P(c, 6), { size: 2 * R, densificationFactor: 3, material: new MeshMaterial({ color: [24, 120, 92, 0.92] }) });
    this.landmarks.add(new Graphic({
      geometry: globe, attributes: { kind: 'landmark', name: 'The Globe – Expo 2030 icon' },
      symbol: { type: 'mesh-3d', symbolLayers: [{ type: 'fill', castShadows: true }] }
    }));
    this.globeZ = 6 + R;
    ([[25, 0], [-25, 60], [68, 120]] as const).forEach(([tilt, rot], i) => {
      const pts: number[][] = [], rr = R + 4 + i * 1.5, t = tilt * DEG, r0 = rot * DEG;
      for (let k = 0; k <= 72; k++) {
        const a = k / 72 * 2 * Math.PI, x = rr * Math.cos(a), y = rr * Math.sin(a) * Math.cos(t), z = rr * Math.sin(a) * Math.sin(t);
        const xr = x * Math.cos(r0) - y * Math.sin(r0), yr = x * Math.sin(r0) + y * Math.cos(r0);
        const p = offset(c, xr, yr);
        pts.push([p[0], p[1], 6 + R + z]);
      }
      this.landmarks.add(new Graphic({
        geometry: new Polyline({ paths: [pts], spatialReference: SR, hasZ: true }), attributes: { kind: 'landmark', name: 'Golden orbit ring' },
        symbol: { type: 'line-3d', symbolLayers: [{ type: 'path', profile: 'circle', width: 0.9, height: 0.9, material: { color: [228, 190, 90] } }] }
      }));
    });
    // fountains in reflecting pools
    this.D.landscape.features.filter(f => f.properties.kind === 'water' && f.properties.name === 'Reflecting pool').forEach((f, i) => {
      const ring = f.geometry.coordinates[0];
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
      this.landmarks.add(new Graphic({
        geometry: P([cx, cy], 0), attributes: { kind: 'landmark', name: 'Fountain' },
        symbol: { type: 'web-style', name: 'Fountain_' + (1 + i % 4), styleName: 'EsriRealisticStreetSceneStyle' }
      }));
    });
  }

  // ---------------- metro viaduct + animated train ----------------
  buildMetro(): void {
    const f = this.D.metro.features[0], deck = f.properties.deck, cs = f.geometry.coordinates;
    this.metroPath = cs;
    this.metroDeck = deck;
    this.metro.add(new Graphic({
      geometry: new Polyline({ paths: [cs.map(c => [c[0], c[1], deck])], spatialReference: SR, hasZ: true }),
      attributes: Object.assign({ kind: 'metro' }, f.properties),
      symbol: { type: 'line-3d', symbolLayers: [{ type: 'path', profile: 'quad', width: 9, height: 1.6, anchor: 'top', profileRotation: 'heading', material: { color: [222, 220, 214] } }] }
    }));
    const len = pathLength(cs);
    const pil = new PointSymbol3D({ symbolLayers: [{ type: 'object', resource: { primitive: 'cylinder' }, width: 2.2, depth: 2.2, height: deck - 1.6, anchor: 'bottom', material: { color: [205, 203, 198] } }] });
    for (let d = 15; d < len; d += 32) {
      const a = along(cs, d);
      this.metro.add(new Graphic({ geometry: new Point({ x: a.p[0], y: a.p[1], z: 0, spatialReference: SR }), attributes: { kind: 'metro', name: f.properties.name }, symbol: pil }));
    }
    const ws = new WebStyleSymbol({ name: 'Train_Europe_With_Carriages', styleName: 'EsriRealisticTransportationStyle' });
    ws.fetchSymbol().then(sym => {
      if (!sym || sym.type !== 'point-3d') return;
      this.trainSym = sym;
      this.train = new Graphic({ geometry: new Point({ x: cs[0][0], y: cs[0][1], z: deck, spatialReference: SR }), symbol: sym, attributes: { kind: 'metro', name: 'Riyadh Metro train – Expo link' } });
      this.metro.add(this.train);
      this.trainLen = len;
      this.animateTrain();
    }).catch(() => undefined);
  }

  private animateTrain(): void {
    const cycle = 70000;
    let lastH = -999;
    const tick = () => {
      if (this.train && this.trainSym && this.metro.visible) {
        const t = (performance.now() % cycle) / cycle; // 0..1: in (0-.4), dwell(.4-.5), out(.5-.9), dwell
        let s: number;
        if (t < 0.4) s = ease(t / 0.4);
        else if (t < 0.5) s = 1;
        else if (t < 0.9) s = 1 - ease((t - 0.5) / 0.4);
        else s = 0;
        const a = along(this.metroPath, clamp(s * this.trainLen - 60, 20, this.trainLen - 60));
        this.train.geometry = new Point({ x: a.p[0], y: a.p[1], z: this.metroDeck, spatialReference: SR });
        if (Math.abs(a.h - lastH) > 1.5) {
          lastH = a.h;
          const sym = this.trainSym.clone();
          (sym.symbolLayers.getItemAt(0) as ObjectSymbol3DLayer).heading = a.h + 90;
          this.train.symbol = sym;
        }
      }
      this.trainRaf = requestAnimationFrame(tick);
    };
    tick();
  }

  // ---------------- visitors (simple figures) ----------------
  buildPeople(): void {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cols = [[245, 245, 240], [20, 20, 24], [240, 240, 236], [30, 30, 34], [58, 110, 165], [224, 123, 57], [42, 157, 143], [200, 60, 80]];
    const syms = cols.map(c => new PointSymbol3D({
      symbolLayers: [
        { type: 'object', resource: { primitive: 'cylinder' }, width: 0.5, depth: 0.5, height: 1.45, anchor: 'bottom', material: { color: c } },
        { type: 'object', resource: { primitive: 'sphere' }, width: 0.26, depth: 0.26, height: 0.28, anchor: 'relative', anchorPosition: { x: 0, y: 0, z: -0.5 - 1.5 / 0.28 }, material: { color: [140, 100, 70] } }
      ]
    }));
    const add = (p: readonly number[]) => this.people.add(new Graphic({
      geometry: new Point({ x: p[0], y: p[1], spatialReference: SR }), symbol: syms[Math.floor(rnd() * syms.length)], attributes: { kind: 'people', name: 'Visitor' }
    }));
    this.D.streets.features.forEach(f => {
      const k = f.properties.kind;
      if (k === 'service') return;
      const cs = f.geometry.coordinates, len = pathLength(cs), w = f.properties.width, dens = k === 'promenade' ? 9 : k === 'lane' ? 12 : 22;
      for (let d = 3; d < len; d += dens * (0.5 + rnd())) {
        const a = along(cs, d), side = rnd() < 0.5 ? -1 : 1, off = side * (w / 2 - 1.2 - rnd() * 2.5), h = (a.h + 90) * DEG;
        add(offset(a.p, Math.sin(h) * off, Math.cos(h) * off));
        if (rnd() < 0.35) add(offset(a.p, Math.sin(h) * off + 0.7, Math.cos(h) * off + 0.4));
      }
    });
    const c = this.D.site.globe;
    for (let i = 0; i < 160; i++) {
      const a = rnd() * 2 * Math.PI, r = 30 + rnd() * 75;
      if (r > 56 && r < 90) continue;
      add(offset(c, Math.cos(a) * r, Math.sin(a) * r));
    }
  }

  // ---------------- landmark + taken-plot pavilions (shell detail) ----------------
  buildLitePavilions(): void {
    if (!this.initialised) return;
    this.pavLite.removeAll();
    const pv = this.pavilion, mode = this.mode(), specs: PavilionSpec[] = [];
    this.D.buildings.features.filter(f => f.properties.type === 'saudi' || f.properties.type === 'theme').forEach(f => {
      const s = pv.specFromBuilding(f.properties);
      if (s) specs.push(s);
    });
    this.D.plots.features.filter(f => this.state.plotStatus(f.properties.pid) === 'taken').forEach(f => {
      const s = pv.specFromPlot(f.properties);
      if (!s) return;
      s.name = f.properties.owner || 'Participant pavilion';
      specs.push(s);
    });
    this.liteSpecs = specs;
    const detailId = this.state.detailId();
    specs.forEach(s => {
      if (detailId === s.id) return;
      this.pavLite.addMany(pv.buildLite(s, { mode, labels: s.kind === 'building' }));
    });
  }

  /** Remove the lite shell of a pavilion that is shown in detail (reference `E.hideLite`). */
  hideLite(id: string): void {
    this.pavLite.removeMany(this.pavLite.graphics.filter(g => g.attributes?.['sid'] === id).toArray());
  }

  destroy(): void {
    cancelAnimationFrame(this.trainRaf);
    this.train = null;
    this.trainSym = null;
    this.plotGraphics = null;
    this.initialised = false;
  }
}
