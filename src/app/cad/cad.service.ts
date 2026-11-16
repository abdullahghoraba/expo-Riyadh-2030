import { Injectable, computed, inject, signal } from '@angular/core';
import { PavilionSpec } from '../core/models';
import { download } from '../core/service-catalog';
import { StateService } from '../core/state.service';
import { ToastService } from '../core/toast.service';
import { drawPlan, planDxf } from './cad-drawing';

/**
 * CAD viewer state + exports used by the pavilion tab, info cards and the submit dialog
 * (reference app.js openCad / exportDxf / exportPng, drawing in js/cad.js).
 */
@Injectable({ providedIn: 'root' })
export class CadService {
  private readonly state = inject(StateService);
  private readonly toast = inject(ToastService);

  /** Visibility of the full-screen CAD viewer. */
  readonly open = signal(false);
  /** Floor shown in the full-screen viewer. */
  readonly viewerFloor = signal(0);
  /** Floor shown in the side-panel preview: the isolated floor, or the ground floor (reference `cadLevel`). */
  readonly previewLevel = computed(() => Math.max(0, this.state.floor()));

  /**
   * Opens the full-screen interactive CAD modal viewer for the currently inspected pavilion.
   */
  openViewer(): void {
    if (!this.state.detailSpec()) return;
    this.viewerFloor.set(this.previewLevel());
    this.open.set(true);
  }

  /**
   * Closes the full-screen CAD modal viewer.
   */
  close(): void {
    this.open.set(false);
  }

  /**
   * Generates and triggers browser download of the multi-floor DXF CAD drawing package for a pavilion.
   *
   * @param spec Pavilion specification (defaults to currently open pavilion).
   * @param fileName Optional target filename.
   */
  downloadDxf(spec: PavilionSpec | null = this.state.detailSpec(), fileName?: string): void {
    if (!spec) return;
    download(fileName ?? `${spec.id}-plans.dxf`, planDxf(spec), 'application/dxf');
  }

  /**
   * Exports a high-resolution 2400x1700 PNG image of the specified floor plan in the active theme.
   *
   * @param level Floor level index to render and export.
   * @param spec Pavilion specification (defaults to currently open pavilion).
   */
  exportPng(level: number, spec: PavilionSpec | null = this.state.detailSpec()): void {
    if (!spec) return;
    const c = document.createElement('canvas');
    c.width = 2400;
    c.height = 1700;
    drawPlan(c, spec, level, { theme: this.state.cadTheme() });
    c.toBlob(b => {
      if (b) download(`${spec.id}-L${level}.png`, b);
      else this.toast.show('PNG export failed');
    });
  }
}
