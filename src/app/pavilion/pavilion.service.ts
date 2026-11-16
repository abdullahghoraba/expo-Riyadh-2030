import { Injectable, computed, inject } from '@angular/core';
import Camera from '@arcgis/core/Camera';
import type Graphic from '@arcgis/core/Graphic';
import { AnalysisService } from '../analysis/analysis.service';
import { DataService } from '../core/data.service';
import { DEG, XY, move, xy } from '../core/geo';
import { BuildingProps, PavilionSpec, PlotDesign, PlotProps } from '../core/models';
import { StateService } from '../core/state.service';
import { ToastService } from '../core/toast.service';
import { LayersService } from '../map/layers.service';
import { LitePavilionOptions, PavilionRenderer } from '../map/pavilion-renderer';
import { SceneService } from '../map/scene.service';
import { PavilionBuild, Pavilion3dService } from './pavilion-3d.service';
import { PavilionPlan, pavilionPlan, specFromBuilding, specFromPlot } from './pavilion-plan';

export interface OpenDetailOptions {
  /** Fly the camera to the pavilion (default true). */
  fly?: boolean;
}

/** Design changes accepted by {@link PavilionService.design} (your own plot only). */
export type DesignChange = Pick<PlotDesign, 'style' | 'palette' | 'floors'>;

/**
 * Detailed (BIM-like) pavilion shown in the 3D view – reference app.js openDetail / rebuildDetail /
 * focusDetail / design / setFloor, plus the lite shells on other plots via the {@link PavilionRenderer} hook.
 *
 * Public API for later features:
 * - `detail()` – current build (graphics, `plan`, `meta` with door / approach / lobby / roof points);
 * - `spec()` / `plan()` – current detail spec and its floor plans (`pavilionPlan(spec)` for any spec);
 * - `plotSpec(pid)` – spec of a plot's pavilion with the saved design;
 * - `openDetail`, `rebuildDetail`, `focusDetail`, `setFloor`, `setExplode`, `setLabels`, `setFurniture`;
 * - `hideBuilding(bid)`, `hideLite(id)`;
 * - `buildingPolygons()` / `insideBuilding(lonLat)` for camera collision (local metres).
 */
@Injectable({ providedIn: 'root' })
export class PavilionService implements PavilionRenderer {
  private readonly data = inject(DataService);
  private readonly state = inject(StateService);
  private readonly layers = inject(LayersService);
  private readonly scene = inject(SceneService);
  private readonly toast = inject(ToastService);
  private readonly analysis = inject(AnalysisService);
  private readonly builder = inject(Pavilion3dService);

  /** Current detail spec (reference `S.detailSpec`). */
  readonly spec = this.state.detailSpec.asReadonly();
  /** Current detail build (reference `S.detail`). Only this service writes `StateService.detail`. */
  readonly detail = computed(() => this.state.detail() as PavilionBuild | null);
  /** Floor plans of the current detail spec. */
  readonly plan = computed<PavilionPlan | null>(() => {
    const s = this.spec();
    return s ? pavilionPlan(s) : null;
  });

  private polys: XY[][] | null = null;

  /**
   * Computes or retrieves cached floor plans for any given pavilion specification.
   *
   * @param spec Target pavilion specification.
   * @returns Multi-floor architectural plan.
   */
  pavilionPlan(spec: PavilionSpec): PavilionPlan {
    return pavilionPlan(spec);
  }

  /**
   * Converts building feature properties into a detailed PavilionSpec.
   *
   * @param b Building GeoJSON properties.
   */
  specFromBuilding(b: BuildingProps): PavilionSpec {
    return specFromBuilding(b);
  }

  /**
   * Converts plot feature properties and optional user design into a PavilionSpec.
   *
   * @param p Plot GeoJSON properties.
   * @param design Optional custom design parameters.
   */
  specFromPlot(p: PlotProps, design?: PlotDesign): PavilionSpec {
    return specFromPlot(p, design);
  }

  /**
   * Generates the PavilionSpec for a plot incorporating its current customized design and owner information.
   *
   * @param pid Unique plot identifier.
   * @returns Pavilion specification.
   */
  plotSpec(pid: string): PavilionSpec {
    const p = this.state.plotById(pid), s = specFromPlot(p, this.state.design()[pid]);
    if (p.status === 'taken') s.name = p.owner || 'Participant pavilion';
    return s;
  }

  /**
   * Generates lightweight 3D exterior shell graphics for pavilions displayed across the site.
   *
   * @param spec Pavilion specification.
   * @param opts Display options including rendering mode and label visibility.
   * @returns Array of 3D Graphics.
   */
  buildLite(spec: PavilionSpec, opts: LitePavilionOptions): Graphic[] {
    return this.builder.build(spec, { mode: opts.mode, detail: 'lite', labels: opts.labels }).graphics;
  }

  /**
   * Opens a pavilion or landmark building in full BIM detail in the 3D scene.
   *
   * @param spec Pavilion specification to open.
   * @param o Optional configuration such as disabling camera flight.
   */
  openDetail(spec: PavilionSpec, o: OpenDetailOptions = {}): void {
    const prev = this.state.detailSpec();
    this.state.detailSpec.set(spec);
    this.state.detailId.set(spec.id);
    this.state.floor.set(-1);
    this.state.explode.set(false);
    if (this.analysis.active() === 'slice') this.analysis.stop();
    if (this.layers.ready) {
      this.hideBuilding(spec.kind === 'building' ? spec.id : null);
      if (!this.layers.liteSpecs.length) {
        this.layers.buildLitePavilions();
      } else if (!prev || prev.id !== spec.id) {
        if (prev) {
          const mode = this.layers.mode();
          this.layers.pavLite.addMany(this.buildLite(prev, { mode, labels: prev.kind === 'building' }));
        }
        this.layers.hideLite(spec.id);
      }
    }
    this.rebuildDetail();
    if (o.fly !== false) this.focusDetail();
  }

  /**
   * Re-builds 3D detailed graphics for the currently inspected pavilion reflecting updated state
   * (render mode, active isolated floor, exploded view, furniture, and room labels).
   */
  rebuildDetail(): void {
    const s = this.state.detailSpec();
    if (!s) return;
    const mode = this.layers.mode();
    const res = this.builder.build(s, { mode, isolate: this.state.floor(), explode: this.state.explode(), labels: this.state.labels(), furniture: this.state.furniture() });
    this.state.detail.set(res);
    if (!this.layers.ready) return;
    this.layers.pav.removeAll();
    this.layers.pav.addMany(res.graphics);
    const sel = this.state.selected();
    if (sel && s.id !== sel) this.layers.pav.addMany(this.builder.build(this.plotSpec(sel), { mode, detail: 'lite', labels: true }).graphics);
  }

  /**
   * Smoothly animates the camera to frame and orbit the pavilion currently inspected in detail.
   */
  focusDetail(): void {
    const det = this.detail(), s = this.state.detailSpec();
    if (!det || !s || !this.scene.view) return;
    const m = det.meta, size = Math.max(s.W, s.D, m.height);
    const h = (m.frontHeading + 180 - 35 + 360) % 360, tilt = 64, d = size * 2.1 + 30, tz = m.height * 0.4;
    void this.scene.fly(new Camera({ position: this.scene.pt(move(m.center, h + 180, d * Math.sin(tilt * DEG)), tz + d * Math.cos(tilt * DEG)), heading: h, tilt }), 2000);
  }

  /**
   * Modifies architectural design parameters (style, palette, floors) for the user's selected plot,
   * persists the design to state storage, and re-renders the 3D model.
   *
   * @param ch Design parameter changes.
   */
  design(ch: DesignChange): void {
    const s = this.state.detailSpec();
    if (!s) return;
    const pid = s.id;
    this.state.setDesign(pid, { style: s.style, palette: s.palette, floors: s.floors, ...this.state.design()[pid], ...ch });
    const next: PavilionSpec = { ...s, ...ch };
    this.state.detailSpec.set(next);
    if (this.state.floor() >= next.floors) this.state.floor.set(-1);
    this.rebuildDetail();
  }

  /**
   * Isolates display of a single floor level in dollhouse mode, or displays all floors.
   *
   * @param i Zero-based floor index, or -1 to show all floors.
   */
  setFloor(i: number): void {
    this.state.floor.set(i);
    this.rebuildDetail();
    if (i >= 0 && !this.state.labels()) this.toast.show('Tip: turn on room labels');
  }

  /**
   * Toggles exploded axonometric floor stacking in the 3D view.
   *
   * @param on True to explode floors vertically.
   */
  setExplode(on: boolean): void {
    this.state.explode.set(on);
    if (on) this.state.floor.set(-1);
    this.rebuildDetail();
  }

  /**
   * Toggles visibility of 3D floating room labels and square meter areas.
   *
   * @param on True to display room labels.
   */
  setLabels(on: boolean): void {
    this.state.labels.set(on);
    this.rebuildDetail();
  }

  /**
   * Toggles rendering of interior 3D furniture models.
   *
   * @param on True to display furniture.
   */
  setFurniture(on: boolean): void {
    this.state.furniture.set(on);
    this.rebuildDetail();
  }

  /**
   * Hides massing extrusion for a building when that building is being viewed in BIM detail.
   *
   * @param bid Building identifier to hide, or null to show all buildings.
   */
  hideBuilding(bid: string | null): void {
    if (this.layers.ready) this.layers.setBuildingFilter({ hideBid: bid });
  }

  /**
   * Removes lightweight exterior shell graphics for a pavilion.
   *
   * @param id Pavilion identifier.
   */
  hideLite(id: string): void {
    if (this.layers.ready) this.layers.hideLite(id);
  }

  /**
   * Returns cached 2D footprint polygons of all site buildings in local meters for collision testing.
   *
   * @returns Array of 2D vertex coordinate arrays.
   */
  buildingPolygons(): XY[][] {
    if (!this.polys) this.polys = this.data.d.buildings.features.map(f => f.geometry.coordinates[0].map(c => xy(c)));
    return this.polys;
  }

  /**
   * Tests whether a [longitude, latitude] point falls inside the footprint polygon of any site building.
   *
   * @param p Coordinate pair [lon, lat].
   * @returns True if point is inside a building footprint.
   */
  insideBuilding(p: readonly number[]): boolean {
    const q = xy(p);
    return this.buildingPolygons().some(poly => {
      let ins = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i], b = poly[j];
        if ((a[1] > q[1]) !== (b[1] > q[1]) && q[0] < (b[0] - a[0]) * (q[1] - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins;
      }
      return ins;
    });
  }

  /** Descriptive alias for {@link insideBuilding}. */
  isInsideBuilding(p: readonly number[]): boolean {
    return this.insideBuilding(p);
  }
}
