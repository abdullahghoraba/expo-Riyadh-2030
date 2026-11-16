import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, viewChild } from '@angular/core';
import { DataService } from '../../core/data.service';
import { fmt } from '../../core/geo';
import { ServiceType, SiteData } from '../../core/models';
import { SERVICE } from '../../core/service-catalog';
import { StateService } from '../../core/state.service';
import { I18nService } from '../../core/i18n.service';

type Ctx = { g: CanvasRenderingContext2D; w: number; h: number };
const ST = ['available', 'pending', 'taken'] as const;
const COL: Record<(typeof ST)[number], string> = { available: '#2eb872', pending: '#e8912d', taken: '#9aa0a6' };

/** "Insights" tab: key facts + canvas charts computed from the site database (port of reference js/insights.js). */
@Component({
  selector: 'app-insights-tab',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './insights-tab.component.html',
  host: { '(window:resize)': 'onResize()' },
  styleUrl: './insights-tab.component.scss'
})
export class InsightsTabComponent {
  private readonly i18n = inject(I18nService);
  private readonly data = inject(DataService);
  private readonly state = inject(StateService);
  private readonly cPlots = viewChild.required<ElementRef<HTMLCanvasElement>>('chartPlots');
  private readonly cCrowd = viewChild.required<ElementRef<HTMLCanvasElement>>('chartCrowd');
  private readonly cServices = viewChild.required<ElementRef<HTMLCanvasElement>>('chartServices');
  private readonly cBuild = viewChild.required<ElementRef<HTMLCanvasElement>>('chartBuild');
  /** Native aspect ratio of each canvas (height / width), read before the first resize. */
  private readonly aspect = new Map<HTMLCanvasElement, number>();

  protected readonly tiles = computed(() => {
    const D = this.data.data();
    if (!D) return [];
    this.state.submitted();
    this.state.selected();
    const km = D.streets.features.reduce((s, f) => s + (f.properties.length || 0), 0) / 1000;
    const avail = D.plots.features.filter(f => this.state.plotStatus(f.properties.pid) !== 'taken').length;
    return D.site.facts.slice(0, 3).concat([
      { label: 'Plots open for allocation', value: `${avail} / ${D.plots.features.length}` },
      { label: 'Buildings in the model', value: fmt(D.buildings.features.length) },
      { label: 'Walkways & streets', value: fmt(km, 1) + ' km' },
      { label: 'Date palms', value: fmt(D.trees.features.length) },
      { label: 'Visitor services', value: String(D.services.features.length) },
      { label: 'Parking spaces', value: fmt(D.parking.features.reduce((s, f) => s + f.properties.capacity, 0)) }
    ]);
  });

  constructor() {
    // redraw when the tab becomes visible or plot statuses change
    afterRenderEffect(() => {
      this.state.lang();
      const on = this.state.tab() === 'insights', D = this.data.data();
      this.state.submitted();
      this.state.selected();
      if (on && D) this.render(D);
    });
  }

  /**
   * Handles window resize events by re-rendering all charts if the insights tab is active.
   */
  protected onResize(): void {
    const D = this.data.data();
    if (this.state.tab() === 'insights' && D) this.render(D);
  }

  /**
   * Orchestrates rendering of all 4 analytical canvas charts from site dataset.
   *
   * @param D The loaded site GeoJSON dataset
   */
  private render(D: Readonly<SiteData>): void {
    const charts: [() => void, string][] = [
      [() => this.renderPlotsChart(D), 'plots'],
      [() => this.renderCrowdChart(D), 'crowd'],
      [() => this.renderServicesChart(D), 'services'],
      [() => this.renderBuildChart(D), 'build']
    ];
    charts.forEach(([f, n]) => {
      try { f(); } catch (e) { console.warn('chart ' + n, e); }
    });
  }

  /**
   * Draws translated text on the canvas context at coordinates (x, y).
   *
   * @param g Canvas 2D rendering context
   * @param value Text string or translation key
   * @param x X-coordinate on the canvas
   * @param y Y-coordinate on the canvas
   */
  private text(g: CanvasRenderingContext2D, value: string, x: number, y: number): void {
    g.fillText(this.i18n.text(value), x, y);
  }

  /**
   * Initializes high-DPI scaling, CSS dimensions, and font settings for a target canvas element.
   *
   * @param ref Element reference to the canvas
   * @returns Context object containing 2D context, display width, and display height
   */
  private setup(ref: ElementRef<HTMLCanvasElement>): Ctx {
    const cv = ref.nativeElement;
    if (!this.aspect.has(cv)) this.aspect.set(cv, cv.height / cv.width);
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, w = Math.max(300, r.width || 380), h = w * this.aspect.get(cv)!;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.height = h + 'px';
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = '11px Segoe UI';
    return { g, w, h };
  }

  /**
   * Renders horizontal grid lines, tick lines, and axis labels.
   *
   * @param g Canvas 2D context
   * @param x0 Left X coordinate
   * @param y0 Top Y coordinate
   * @param x1 Right X coordinate
   * @param y1 Bottom Y coordinate
   * @param max Maximum value represented by the top axis line
   * @param f Value formatting function
   */
  private axes(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, max: number, f: (v: number) => string): void {
    g.strokeStyle = '#e3e9e5'; g.fillStyle = '#7a8781'; g.lineWidth = 1; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const y = y1 - (y1 - y0) * i / 4;
      g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      this.text(g, f(max * i / 4), x0 - 6, y);
    }
  }

  /**
   * Renders an inline horizontal legend with colored square swatches.
   *
   * @param g Canvas 2D context
   * @param items Array of [colorHex, label] tuples
   * @param x Starting X coordinate
   * @param y Baseline Y coordinate
   */
  private legend(g: CanvasRenderingContext2D, items: [string, string][], x: number, y: number): void {
    g.textAlign = 'left'; g.textBaseline = 'middle';
    items.forEach(([c, l]) => {
      g.fillStyle = c; g.fillRect(x, y - 5, 10, 10);
      g.fillStyle = '#33403a'; this.text(g, l, x + 14, y);
      x += g.measureText(l).width + 30;
    });
  }

  /**
   * Renders the stacked bar chart showing plot availability (available, pending, taken) grouped by district.
   *
   * @param D The site dataset
   */
  private renderPlotsChart(D: Readonly<SiteData>): void {
    const { g, w, h } = this.setup(this.cPlots()), ds = D.site.districts;
    const cnt = ds.map(d => {
      const o = { available: 0, pending: 0, taken: 0 };
      D.plots.features.filter(f => f.properties.district === d.id).forEach(f => {
        const s = this.state.plotStatus(f.properties.pid);
        o[s === 'selected' ? 'available' : s]++;
      });
      return o;
    });
    const max = Math.max(...cnt.map(o => o.available + o.pending + o.taken)), x0 = 40, y0 = 30, y1 = h - 34, bw = (w - x0 - 20) / ds.length;
    this.axes(g, x0, y0, w - 10, y1, max, v => String(Math.round(v)));
    ds.forEach((d, i) => {
      let y = y1;
      const x = x0 + i * bw + bw * 0.2;
      ST.forEach(s => {
        const hh = (y1 - y0) * cnt[i][s] / max;
        g.fillStyle = COL[s]; g.fillRect(x, y - hh, bw * 0.6, hh);
        if (cnt[i][s]) { g.fillStyle = '#fff'; g.textAlign = 'center'; this.text(g, String(cnt[i][s]), x + bw * 0.3, y - hh / 2); }
        y -= hh;
      });
      g.fillStyle = '#33403a'; g.textAlign = 'center'; g.textBaseline = 'top'; this.text(g, d.name.replace(' district', ''), x + bw * 0.3, y1 + 6); g.textBaseline = 'middle';
    });
    this.legend(g, ST.map(s => [COL[s], s[0].toUpperCase() + s.slice(1)]), x0, 14);
  }

  /** Backward-compatible alias for {@link renderPlotsChart}. */
  private plots(D: Readonly<SiteData>): void {
    this.renderPlotsChart(D);
  }

  /**
   * Renders the 24-hour visitor flow area and line forecast chart with peak annotation.
   *
   * @param D The site dataset
   */
  private renderCrowdChart(D: Readonly<SiteData>): void {
    const { g, w, h } = this.setup(this.cCrowd()), F = D.crowd.features;
    const vals = Array.from({ length: 24 }, (_, i) => F.reduce((s, f) => s + f.properties[`h${i}`], 0) * 31);
    const max = Math.max(...vals) * 1.1, x0 = 46, y0 = 26, y1 = h - 26, x1 = w - 10;
    const X = (i: number) => x0 + (x1 - x0) * i / 23, Y = (v: number) => y1 - (y1 - y0) * v / max;
    this.axes(g, x0, y0, x1, y1, max, v => fmt(v / 1000) + 'k');
    const grad = g.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, 'rgba(201,162,75,0.55)'); grad.addColorStop(1, 'rgba(201,162,75,0.03)');
    g.beginPath(); g.moveTo(X(0), y1); vals.forEach((v, i) => g.lineTo(X(i), Y(v))); g.lineTo(X(23), y1); g.closePath(); g.fillStyle = grad; g.fill();
    g.beginPath(); vals.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.strokeStyle = '#b8862b'; g.lineWidth = 2.5; g.stroke();
    const pk = vals.indexOf(Math.max(...vals));
    g.fillStyle = '#0b3d2e'; g.beginPath(); g.arc(X(pk), Y(vals[pk]), 4, 0, 7); g.fill();
    g.textAlign = 'center';
    this.text(g, `Peak ${String(pk).padStart(2, '0')}:00 · ${fmt(vals[pk])} people`, Math.min(x1 - 80, Math.max(x0 + 80, X(pk))), Y(vals[pk]) - 12);
    g.fillStyle = '#7a8781'; g.textBaseline = 'top';
    [0, 6, 12, 18, 23].forEach(i => this.text(g, String(i).padStart(2, '0') + ':00', X(i), y1 + 6));
  }

  /** Backward-compatible alias for {@link renderCrowdChart}. */
  private crowd(D: Readonly<SiteData>): void {
    this.renderCrowdChart(D);
  }

  /**
   * Renders the horizontal bar chart showing distribution of visitor service facilities by category.
   *
   * @param D The site dataset
   */
  private renderServicesChart(D: Readonly<SiteData>): void {
    const { g, w, h } = this.setup(this.cServices()), by: Partial<Record<ServiceType, number>> = {};
    D.services.features.forEach(f => (by[f.properties.type] = (by[f.properties.type] || 0) + 1));
    const ent = (Object.entries(by) as [ServiceType, number][]).sort((a, b) => b[1] - a[1]);
    const max = Math.max(...ent.map(e => e[1])), x0 = 120, rh = (h - 20) / ent.length;
    ent.forEach(([t, n], i) => {
      const s = SERVICE[t], y = 10 + i * rh, bw = (w - x0 - 40) * n / max;
      g.fillStyle = '#33403a'; g.textAlign = 'right'; g.textBaseline = 'middle'; this.text(g, s.label, x0 - 10, y + rh / 2);
      g.fillStyle = s.color; g.beginPath();
      if (g.roundRect) g.roundRect(x0, y + rh * 0.2, bw, rh * 0.6, 5); else g.rect(x0, y + rh * 0.2, bw, rh * 0.6);
      g.fill();
      g.fillStyle = '#33403a'; g.textAlign = 'left'; this.text(g, String(n), x0 + bw + 6, y + rh / 2);
    });
  }

  /** Backward-compatible alias for {@link renderServicesChart}. */
  private services(D: Readonly<SiteData>): void {
    this.renderServicesChart(D);
  }

  /**
   * Renders the cumulative construction progress curve leading up to opening day in October 2030.
   *
   * @param D The site dataset
   */
  private renderBuildChart(D: Readonly<SiteData>): void {
    const { g, w, h } = this.setup(this.cBuild()), B = D.buildings.features.map(f => f.properties.phase), N = B.length;
    const x0 = 40, y0 = 20, y1 = h - 28, x1 = w - 12, t0 = 2026.5, t1 = 2030.75;
    const X = (t: number) => x0 + (x1 - x0) * (t - t0) / (t1 - t0), Y = (v: number) => y1 - (y1 - y0) * v / 100;
    this.axes(g, x0, y0, x1, y1, 100, v => v + '%');
    g.beginPath();
    for (let t = t0; t <= t1 + 1e-6; t += 0.05) {
      const v = B.filter(p => p <= t).length / N * 100;
      if (t === t0) g.moveTo(X(t), Y(v)); else g.lineTo(X(t), Y(v));
    }
    g.strokeStyle = '#0b3d2e'; g.lineWidth = 2.5; g.stroke();
    const xo = X(2030.75);
    g.strokeStyle = '#c9a24b'; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(xo, y0); g.lineTo(xo, y1); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#b8862b'; g.textAlign = 'right'; this.text(g, 'Opening 1 Oct 2030', xo - 4, y0 + 8);
    g.fillStyle = '#7a8781'; g.textAlign = 'center'; g.textBaseline = 'top';
    [2027, 2028, 2029, 2030].forEach(y => this.text(g, String(y), X(y), y1 + 6));
  }

  /** Backward-compatible alias for {@link renderBuildChart}. */
  private build(D: Readonly<SiteData>): void {
    this.renderBuildChart(D);
  }
}
