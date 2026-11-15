import { InjectionToken } from '@angular/core';
import type Graphic from '@arcgis/core/Graphic';
import { BuildingProps, PavilionSpec, PlotDesign, PlotProps, RenderMode } from '../core/models';

export interface LitePavilionOptions {
  mode: RenderMode;
  labels: boolean;
}

/**
 * Hook between the map layers and the parametric pavilion module (reference pavilion.js + the
 * detail-pavilion parts of app.js). The default implementation renders nothing; the pavilion
 * feature provides the real one via `{ provide: PAVILION_RENDERER, useExisting: … }`.
 */
export interface PavilionRenderer {
  /** pavilion.js specFromBuilding – null when not available. */
  specFromBuilding(b: BuildingProps): PavilionSpec | null;
  /** pavilion.js specFromPlot – null when not available. */
  specFromPlot(p: PlotProps, design?: PlotDesign): PavilionSpec | null;
  /** pavilion.js build(spec, { mode, detail: 'lite', labels }).graphics */
  buildLite(spec: PavilionSpec, opts: LitePavilionOptions): Graphic[];
  /** app.js E.rebuildDetail – rebuild the detailed (BIM) pavilion in the `pav` layer. */
  rebuildDetail(): void;
  /** app.js E.focusDetail – fly the camera to the detailed pavilion (no-op when none is open). */
  focusDetail(): void;
}

export const NOOP_PAVILION_RENDERER: PavilionRenderer = {
  specFromBuilding: () => null,
  specFromPlot: () => null,
  buildLite: () => [],
  rebuildDetail: () => undefined,
  focusDetail: () => undefined
};

export const PAVILION_RENDERER = new InjectionToken<PavilionRenderer>('PavilionRenderer', {
  providedIn: 'root',
  factory: () => NOOP_PAVILION_RENDERER
});
