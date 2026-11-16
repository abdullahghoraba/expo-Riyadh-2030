import { Injectable, inject, signal } from '@angular/core';
import { DataService } from './data.service';
import {
  CadTheme, Lang, LightMode, NearEntry, PanelTab, PavilionDetail, PavilionSpec, PlotDesign, PlotProps, PlotStatus,
  ServiceType, Submission, WeatherMode
} from './models';

const PREFIX = 'expo.';

/** localStorage wrapper with the reference `expo.` key prefix. */
export const store = {
  /**
   * Retrieves and deserializes a JSON value from window.localStorage.
   *
   * @param k Key suffix appended to `expo.`.
   * @param d Default fallback value if key does not exist or JSON parsing fails.
   * @returns Retrieved typed value or fallback.
   */
  get<T>(k: string, d: T): T {
    try {
      const v = JSON.parse(localStorage.getItem(PREFIX + k) ?? 'null') as T | null;
      return v || d;
    } catch {
      return d;
    }
  },

  /**
   * Serializes and writes a value to window.localStorage under `expo.<k>`.
   *
   * @param k Key suffix.
   * @param v Value to serialize as JSON.
   */
  set(k: string, v: unknown): void {
    try {
      localStorage.setItem(PREFIX + k, JSON.stringify(v));
    } catch {
      /* storage unavailable (private mode / quota) */
    }
  }
};

/** Application state – mirrors the reference `E.state` object as signals. */
@Injectable({ providedIn: 'root' })
export class StateService {
  private readonly data = inject(DataService);

  readonly district = signal<string | null>(null);
  readonly selected = signal<string | null>(null);
  readonly detailId = signal<string | null>(null);
  readonly detailSpec = signal<PavilionSpec | null>(null);
  readonly detail = signal<PavilionDetail | null>(null);
  readonly design = signal<Record<string, PlotDesign>>(store.get('design', {}));
  readonly submitted = signal<Record<string, Submission>>(store.get('submitted', {}));
  readonly floor = signal(-1);
  readonly explode = signal(false);
  readonly labels = signal(true);
  readonly furniture = signal(true);
  readonly slice = signal(false);
  readonly light = signal<LightMode>('day');
  readonly basemap = signal('satellite');
  readonly cadTheme = signal<CadTheme>('blueprint');
  readonly near = signal<NearEntry[]>([]);
  readonly nearSel = signal<ServiceType | null>(null);

  /** Shared interface and narration language, restored across page reloads. */
  readonly lang = signal<Lang>(store.get<string>('lang', 'en') === 'ar' ? 'ar' : 'en');
  readonly weather = signal<WeatherMode>('sunny');
  readonly tab = signal<PanelTab>('plot');
  /** True while the imagine / tour cinematic runs (reference `body.cinema-on`). */
  readonly cinema = signal(false);

  /**
   * Updates and persists custom pavilion design configuration for a plot.
   *
   * @param pid Plot identifier.
   * @param design Updated plot design options (style, palette, floors).
   */
  setDesign(pid: string, design: PlotDesign): void {
    this.design.update(d => ({ ...d, [pid]: design }));
    store.set('design', this.design());
  }

  /**
   * Updates or removes the submission record for a plot and persists to localStorage.
   *
   * @param pid Plot identifier.
   * @param sub Submission record, or null to withdraw/delete.
   */
  setSubmitted(pid: string, sub: Submission | null): void {
    this.submitted.update(s => {
      const next = { ...s };
      if (sub) next[pid] = sub;
      else delete next[pid];
      return next;
    });
    store.set('submitted', this.submitted());
  }

  /**
   * Finds and returns the plot properties for a given plot identifier from the dataset.
   *
   * @param pid Plot identifier code.
   * @returns Plot properties object.
   * @throws Error if the plot ID does not exist in the database.
   */
  plotById(pid: string): PlotProps {
    const f = this.data.d.plots.features.find(x => x.properties.pid === pid);
    if (!f) throw new Error('Unknown plot ' + pid);
    return f.properties;
  }

  /**
   * Alias for {@link plotById} adhering to getter naming conventions.
   *
   * @param pid Plot identifier code.
   * @returns Plot properties object.
   */
  getPlotById(pid: string): PlotProps {
    return this.plotById(pid);
  }

  /**
   * Returns properties of the currently selected plot, or null if no plot is selected.
   *
   * @returns Currently selected plot properties or null.
   */
  currentPlot(): PlotProps | null {
    const pid = this.selected();
    return pid ? this.plotById(pid) : null;
  }

  /**
   * Alias for {@link currentPlot} adhering to getter naming conventions.
   *
   * @returns Current plot properties or null.
   */
  getCurrentPlot(): PlotProps | null {
    return this.currentPlot();
  }

  /**
   * Computes the display status for a plot combining submitted requests, dataset status, and active selection.
   * Priority: submitted → 'pending', dataset taken → 'taken', currently selected → 'selected', else 'available'.
   *
   * @param pid Plot identifier code.
   * @returns Computed plot UI status.
   */
  plotStatus(pid: string): PlotStatus {
    if (this.submitted()[pid]) return 'pending';
    const p = this.plotById(pid);
    if (p.status === 'taken') return 'taken';
    return this.selected() === pid ? 'selected' : 'available';
  }

  /**
   * Alias for {@link plotStatus} adhering to getter naming conventions.
   *
   * @param pid Plot identifier code.
   * @returns Computed plot status.
   */
  getPlotStatus(pid: string): PlotStatus {
    return this.plotStatus(pid);
  }
}
