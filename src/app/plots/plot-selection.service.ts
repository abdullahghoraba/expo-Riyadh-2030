import { Injectable, computed, inject, signal } from '@angular/core';
import Graphic from '@arcgis/core/Graphic';
import Polyline from '@arcgis/core/geometry/Polyline';
import { AnalysisService } from '../analysis/analysis.service';
import { CadService } from '../cad/cad.service';
import { DataService } from '../core/data.service';
import { Color, fmt, hash, rgb } from '../core/geo';
import { BuildingProps, NearEntry, PlotProps, ServiceType, Submission } from '../core/models';
import { NEAR_TYPES, SERVICE } from '../core/service-catalog';
import { StateService } from '../core/state.service';
import { ToastService } from '../core/toast.service';
import { ShortestPathTree, WalkRoute } from '../core/walk-router';
import { LayersService } from '../map/layers.service';
import { SceneService } from '../map/scene.service';
import { PavilionService } from '../pavilion/pavilion.service';
import { PAL, STYLES, pavilionPlan } from '../pavilion/pavilion-plan';

const SR = { wkid: 4326 };

export interface CardButton {
  label: string;
  /** Extra button class (primary / ghost). */
  cls?: string;
  action: () => void;
}

/** Content of the map info card (reference app.js `card`). */
export interface InfoCardData {
  title: string;
  sub?: string;
  /** [label, value] rows; rows with empty values are dropped. */
  rows: [string, string | number][];
  buttons: CardButton[];
}

/** Content of the "what's near" route popup. */
export interface RoutePopInfo {
  glyph: string;
  label: string;
  place: string;
  len: number;
  min: number;
  open?: string;
  accessible: boolean;
}

/** Snapshot shown in the submit dialog (reference E.openSubmit). */
export interface SubmitView {
  pid: string;
  participant: string;
  plot: string;
  size: string;
  design: string;
  floors: string;
  metroMin: number | null;
}

/** Walking route from the selected plot entrance. */
export interface PlotWalk { route: WalkRoute; text: string }

/**
 * Formats a fractional year value into standard quarter notation (e.g. 2029.5 -> "2029 Q3").
 *
 * @param v Fractional year.
 * @returns Formatted quarter string.
 */
export const quarter = (v: number): string => `${Math.floor(v)} Q${Math.min(4, Math.floor((v % 1) * 4) + 1)}`;

/**
 * Plot selection and everything around it (reference app.js: selectPlot, computeNear, drawNearRoutes, showNear,
 * submit flow, info cards). Exposes `currentPlot()` through StateService and the walking router via DataService.
 */
/** Runs heavy scene work after the browser has painted the pending UI update (e.g. an info card). */
export const afterPaint = (fn: () => void): void => {
  if (typeof requestAnimationFrame === 'undefined') { fn(); return; }
  requestAnimationFrame(() => setTimeout(fn, 0));
};

@Injectable({ providedIn: 'root' })
export class PlotSelectionService {
  private readonly data = inject(DataService);
  private readonly state = inject(StateService);
  private readonly layers = inject(LayersService);
  private readonly scene = inject(SceneService);
  private readonly pavilion = inject(PavilionService);
  private readonly analysis = inject(AnalysisService);
  private readonly toast = inject(ToastService);
  private readonly cad = inject(CadService);
  private cachedSpt: ShortestPathTree | null = null;

  /** Visibility of the "Submit plot request" dialog. */
  readonly submitOpen = signal(false);
  readonly submitView = signal<SubmitView | null>(null);
  /** Info card on the map (null = hidden). */
  readonly card = signal<InfoCardData | null>(null);
  /** "What's near" route popup (null = hidden). */
  readonly routePop = signal<RoutePopInfo | null>(null);

  /** Submission of the plot shown in the submit dialog. */
  readonly submitSub = computed<Submission | null>(() => {
    const v = this.submitView();
    return v ? this.state.submitted()[v.pid] ?? null : null;
  });

  // ---------------- selection ----------------
  /**
   * Initializes default selection at application startup: selects the first available
   * plot in the default district and draws nearby amenity routes.
   */
  initDefault(): void {
    const D = this.data.d;
    const district = D.site.districts[0].id;
    this.state.district.set(district);
    const first = D.plots.features.find(f => f.properties.district === district && this.state.plotStatus(f.properties.pid) !== 'taken');
    if (!first) return;
    this.state.selected.set(first.properties.pid);
    this.layers.refreshPlots();
    this.pavilion.openDetail(this.pavilion.plotSpec(first.properties.pid), { fly: false });
    this.computeNear();
    this.drawNearRoutes();
  }

  /**
   * Finds the first available (non-taken) plot within a specific district.
   *
   * @param districtId District identifier code.
   * @returns Plot identifier, or null if none available.
   */
  firstFreePlot(districtId: string): string | null {
    const f = this.data.d.plots.features.find(x => x.properties.district === districtId && this.state.plotStatus(x.properties.pid) !== 'taken');
    return f ? f.properties.pid : null;
  }

  /**
   * Selects a plot by identifier, loads its 3D pavilion model, computes nearby service routes,
   * closes cards, and optionally flies the camera to frame it. If the plot is taken, shows its info card.
   *
   * @param pid Plot identifier.
   * @param fly Whether to smoothly fly the camera to the plot.
   */
  selectPlot(pid: string, fly = true): void {
    if (this.state.plotStatus(pid) === 'taken') {
      this.showTakenCard(this.state.plotById(pid));
      return;
    }
    this.state.selected.set(pid);
    this.state.district.set(this.state.plotById(pid).district);
    this.layers.refreshPlots();
    this.pavilion.openDetail(this.pavilion.plotSpec(pid), { fly: false });
    this.computeNear();
    this.drawNearRoutes();
    this.closeCards();
    if (fly) this.pavilion.focusDetail();
    const active = this.analysis.active();
    if (active) this.analysis.start(active);
  }

  // ---------------- what's near (network distances) ----------------
  /**
   * Computes walking network paths, distances, and travel times from the selected plot entrance
   * to the closest amenity of each service category.
   */
  computeNear(): void {
    const p = this.state.currentPlot();
    if (!p) return;
    const D = this.data.d, router = this.data.router, spt = router.from([p.ex, p.ey]), mpm = D.site.walkingSpeedMpm;
    this.cachedSpt = spt;
    const near: NearEntry[] = [];
    NEAR_TYPES.forEach(t => {
      const best = D.services.features.filter(f => f.properties.type === t)
        .map(f => ({ f, r: router.to(spt, f.geometry.coordinates) }))
        .sort((a, b) => a.r.length - b.r.length)[0];
      if (best) near.push({ type: t, feature: best.f, route: best.r, len: Math.round(best.r.length / 10) * 10, min: Math.max(1, Math.round(best.r.length / mpm)) });
    });
    this.state.near.set(near);
  }

  /**
   * Renders 3D colored polylines for walking routes to nearby amenities on the map.
   */
  drawNearRoutes(): void {
    if (!this.layers.ready) return;
    const routes = this.layers.routes;
    routes.removeAll();
    const sel = this.state.nearSel();
    this.state.near().forEach(n => {
      const on = sel === n.type, c = rgb(SERVICE[n.type].color, on ? 1 : 0.75);
      routes.add(new Graphic({
        geometry: new Polyline({ paths: [n.route.coords], spatialReference: SR }),
        attributes: { kind: 'route', name: `Walking route to ${SERVICE[n.type].label}` },
        symbol: { type: 'line-3d', symbolLayers: [{ type: 'line', size: on ? 7 : 3.5, material: { color: c }, cap: 'round', join: 'round' }] }
      }));
    });
  }

  /**
   * Toggles focus on a specific nearby service category: highlights its route, displays its popup,
   * and animates the camera to frame the walking path.
   *
   * @param type Service type to highlight.
   */
  showNear(type: ServiceType): void {
    this.state.nearSel.set(this.state.nearSel() === type ? null : type);
    this.drawNearRoutes();
    if (!this.state.nearSel()) {
      this.routePop.set(null);
      return;
    }
    const n = this.state.near().find(x => x.type === type);
    if (!n) return;
    const s = SERVICE[type], f = n.feature.properties;
    this.routePop.set({ glyph: s.glyph, label: s.label, place: f.location || f.name, len: n.len, min: n.min, open: f.open || undefined, accessible: !!f.accessible });
    void this.scene.fly({ target: new Polyline({ paths: [n.route.coords], spatialReference: SR }), tilt: 45 }, 800);
  }

  /**
   * Closes the nearby route popup and resets route line highlights.
   */
  closeRoutePop(): void {
    this.routePop.set(null);
    this.state.nearSel.set(null);
    this.drawNearRoutes();
  }

  /**
   * Closes both the floating info card and the nearby route popup.
   */
  closeCards(): void {
    this.card.set(null);
    this.routePop.set(null);
  }

  // ---------------- submit ----------------
  /**
   * Opens the plot reservation submit dialog, gathering participant, architectural design,
   * dimensional KPIs, and metro transit walk times for the selected plot.
   */
  openSubmit(): void {
    const p = this.state.currentPlot();
    if (!p) return;
    const ds = this.state.detailSpec(), s = ds && ds.id === p.pid ? ds : this.pavilion.plotSpec(p.pid), P = pavilionPlan(s);
    const metro = this.state.near().find(n => n.type === 'metro');
    this.submitView.set({
      pid: p.pid,
      participant: this.data.d.site.participant.name,
      plot: `${p.pid} · ${p.districtName}`,
      size: `40 × 40 m · ${fmt(p.area)} m²`,
      design: `${STYLES[s.style] || s.style} · ${PAL[s.palette % 5].name}`,
      floors: `${P.floors.length} · ${fmt(P.gfa)} m²`,
      metroMin: metro ? metro.min : null
    });
    this.submitOpen.set(true);
  }

  /**
   * Confirms reservation request for the plot, generates a tracking reference code,
   * stores submission record in state, and refreshes plot 3D graphics.
   *
   * @param note Optional participant notes or requirements.
   */
  confirmSubmit(note: string): void {
    const v = this.submitView();
    if (v && !this.state.submitted()[v.pid]) {
      this.state.setSubmitted(v.pid, { t: Date.now(), ref: 'EXPO-' + (100000 + hash(v.pid + Date.now()) % 900000), note: note || '' });
      this.toast.show(`Plot ${v.pid} submitted for organizer review`);
    }
    this.submitOpen.set(false);
    this.layers.refreshPlots();
  }

  /**
   * Withdraws/cancels an existing plot reservation request and refreshes plot 3D graphics.
   */
  withdrawSubmit(): void {
    const v = this.submitView();
    if (v) this.state.setSubmitted(v.pid, null);
    this.submitOpen.set(false);
    this.layers.refreshPlots();
  }

  /**
   * Generates and downloads the concept DXF CAD file corresponding to the plot submission.
   */
  attachDxf(): void {
    const v = this.submitView();
    if (!v) return;
    const ds = this.state.detailSpec(), s = ds && ds.id === v.pid ? ds : this.pavilion.plotSpec(v.pid);
    this.cad.downloadDxf(s, `${v.pid}-concept.dxf`);
  }

  // ---------------- info cards ----------------
  /**
   * Displays an interactive info card on the map with formatted key-value metrics and action buttons.
   *
   * @param title Card header title.
   * @param sub Optional subtitle text.
   * @param rows Array of [label, value] tuples.
   * @param buttons Array of action button definitions.
   */
  showCard(title: string, sub: string | undefined, rows: [string, string | number | null | undefined][], buttons: CardButton[] = []): void {
    const kept = rows.filter((r): r is [string, string | number] => r[1] !== undefined && r[1] !== '' && r[1] !== null);
    this.card.set({ title, sub: sub || undefined, rows: kept, buttons });
  }

  /**
   * Closes and dismisses the currently active map info card.
   */
  closeCard(): void {
    this.card.set(null);
  }

  /**
   * Calculates the shortest network walking route and formatted distance/duration string
   * from the currently selected plot entrance to a destination coordinate.
   *
   * @param target Destination [lon, lat] coordinate pair.
   * @returns Route geometry and text description, or null if no plot selected.
   */
  walkFromPlot(target: readonly number[] | null): PlotWalk | null {
    const p = this.state.currentPlot();
    if (!p || !target) return null;
    const r = this.cachedSpt ? this.data.router.to(this.cachedSpt, target) : this.data.router.route([p.ex, p.ey], target);
    return { route: r, text: `${fmt(Math.round(r.length / 10) * 10)} m · ${Math.max(1, Math.round(r.length / this.data.d.site.walkingSpeedMpm))} min from ${p.pid}` };
  }

  /**
   * Replaces the routes graphics layer with a single highlighted 3D polyline path.
   *
   * @param r Calculated walk route.
   * @param color Line stroke color.
   */
  drawRoute(r: WalkRoute, color: Color): void {
    if (!this.layers.ready) return;
    this.layers.routes.removeAll();
    this.layers.routes.add(new Graphic({
      geometry: new Polyline({ paths: [r.coords], spatialReference: SR }),
      symbol: { type: 'line-3d', symbolLayers: [{ type: 'line', size: 6, material: { color }, cap: 'round' }] }
    }));
  }

  /**
   * Displays an info card for an occupied/allocated plot with participant details.
   *
   * @param p Plot properties.
   */
  showTakenCard(p: PlotProps): void {
    this.showCard(`Plot ${p.pid} · allocated`, p.districtName, [['Participant', p.owner || 'Allocated'], ['Size', '40 × 40 m'], ['Status', 'Design under review']], [
      { label: '🏛 Explore pavilion', cls: 'primary', action: () => { this.pavilion.openDetail(this.pavilion.plotSpec(p.pid)); this.state.tab.set('pavilion'); } }
    ]);
  }

  /**
   * Opens an existing site building in BIM detail and displays its properties and walk routes.
   *
   * @param b Building properties.
   */
  openBuilding(b: BuildingProps): void {
    // card first, then build the detailed 3D model on the next frame so the click feels instant
    afterPaint(() => { this.pavilion.openDetail(this.pavilion.specFromBuilding(b)); this.state.tab.set('pavilion'); });
    const w = this.walkFromPlot([b.cx, b.cy]);
    this.showCard(b.name, `${b.nameAr ? b.nameAr + ' · ' : ''}${b.type} building`, [
      ['ID', b.bid], ['Floors', b.floors], ['Height', b.height + ' m'], ['Footprint', `${b.d} × ${b.w} m`], ['Completion', b.phase ? quarter(b.phase) : ''], ['Walk', w?.text]
    ], [
      { label: 'Floor plan (CAD)', cls: 'primary', action: () => this.cad.openViewer() },
      { label: 'Walk here', action: () => { if (w) this.drawRoute(w.route, [123, 94, 167, 1]); } },
      { label: 'Back to my plot', cls: 'ghost', action: () => { const sel = this.state.selected(); if (sel) this.selectPlot(sel); this.closeCards(); } }
    ]);
  }
}
