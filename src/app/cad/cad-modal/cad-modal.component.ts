import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, viewChild } from '@angular/core';
import { clamp } from '../../core/geo';
import { CadTheme } from '../../core/models';
import { StateService } from '../../core/state.service';
import { PavilionService } from '../../pavilion/pavilion.service';
import { pavilionPlan } from '../../pavilion/pavilion-plan';
import { drawPlan } from '../cad-drawing';
import { CadService } from '../cad.service';

/** Full-screen CAD viewer with floor chips, themes, pan / zoom and exports (reference index.html #cadModal + cad.js viewer). */
@Component({
  selector: 'app-cad-modal',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cad-modal.component.html',
  host: {
    '(window:mouseup)': 'onUp()',
    '(window:mousemove)': 'onMove($event)',
    '(window:resize)': 'resize()'
  },
  styleUrl: './cad-modal.component.scss'
})
export class CadModalComponent {
  protected readonly state = inject(StateService);
  protected readonly cad = inject(CadService);
  private readonly pavilion = inject(PavilionService);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private readonly view = { zoom: 1, px: 0, py: 0 };
  private drag: [number, number] | null = null;
  private wasOpen = false;

  protected readonly title = computed(() => {
    const s = this.state.detailSpec();
    return s ? (s.kind === 'plot' ? `${s.label} · ${s.name}` : s.name) : '';
  });
  protected readonly floors = computed(() => {
    const s = this.state.detailSpec();
    return s ? pavilionPlan(s).floors.map(f => f.name) : [];
  });

  constructor() {
    // (re)draw when opened, or when the floor / theme / pavilion changes while open
    afterRenderEffect(() => {
      const open = this.cad.open();
      this.cad.viewerFloor();
      this.state.cadTheme();
      this.state.detailSpec();
      this.pavilion.detail();
      if (!open) {
        this.wasOpen = false;
        return;
      }
      if (!this.wasOpen) {
        this.wasOpen = true;
        this.reset();
        this.resize();
      } else this.redraw();
    });
    inject(DestroyRef).onDestroy(() => (this.drag = null));
  }

  /**
   * Switches CAD drawing theme between 'blueprint' and 'paper'.
   *
   * @param t Target CAD theme mode.
   */
  protected setTheme(t: CadTheme): void {
    this.state.cadTheme.set(t);
  }

  /**
   * Switches active floor level displayed in the viewer and resets pan/zoom.
   *
   * @param i Zero-based floor index.
   */
  protected pickFloor(i: number): void {
    this.cad.viewerFloor.set(i);
    this.reset();
  }

  /**
   * Resets pan offset to center and zoom scale factor to 1.
   */
  protected reset(): void {
    this.view.zoom = 1;
    this.view.px = this.view.py = 0;
  }

  /**
   * Resizes internal canvas dimensions to match device pixel ratio and redraws.
   */
  protected resize(): void {
    if (!this.cad.open()) return;
    const cv = this.canvas().nativeElement, r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    if (!r.width || !r.height) return;
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    this.redraw();
  }

  /**
   * Re-renders the CAD floor plan onto the canvas using current zoom and pan parameters.
   */
  protected redraw(): void {
    const s = this.state.detailSpec(), cv = this.canvas().nativeElement;
    if (!s || !cv.width) return;
    drawPlan(cv, s, this.cad.viewerFloor(), { theme: this.state.cadTheme(), ...this.view });
  }

  /**
   * Handles mouse wheel zoom centered around current pointer position.
   */
  protected onWheel(e: WheelEvent): void {
    e.preventDefault();
    const cv = this.canvas().nativeElement, r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
    const mx = (e.clientX - r.left) * dpr, my = (e.clientY - r.top) * dpr;
    const z = clamp(this.view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.4, 12), kk = z / this.view.zoom;
    const cx = cv.width / 2, cy = cv.height / 2;
    this.view.px = mx - cx - (mx - cx - this.view.px) * kk;
    this.view.py = my - cy - (my - cy - this.view.py) * kk;
    this.view.zoom = z;
    this.redraw();
  }

  /**
   * Initiates canvas pan drag tracking.
   */
  protected onDown(e: MouseEvent): void {
    this.drag = [e.clientX, e.clientY];
    this.canvas().nativeElement.style.cursor = 'grabbing';
  }

  /**
   * Concludes canvas pan drag tracking.
   */
  protected onUp(): void {
    if (!this.drag) return;
    this.drag = null;
    this.canvas().nativeElement.style.cursor = 'grab';
  }

  /**
   * Updates canvas pan translation offset during drag.
   */
  protected onMove(e: MouseEvent): void {
    if (!this.drag) return;
    const cv = this.canvas().nativeElement, r = cv.getBoundingClientRect(), dpr = cv.width / r.width;
    this.view.px += (e.clientX - this.drag[0]) * dpr;
    this.view.py += (e.clientY - this.drag[1]) * dpr;
    this.drag = [e.clientX, e.clientY];
    this.redraw();
  }
}
