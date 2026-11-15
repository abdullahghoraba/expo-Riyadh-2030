import { Injectable, inject, signal } from '@angular/core';
import { DataService } from './data.service';
import {
  CadTheme, Lang, LightMode, NearEntry, PanelTab, PavilionDetail, PavilionSpec, PlotDesign, PlotProps, PlotStatus,
  ServiceType, Submission, WeatherMode
} from './models';

const PREFIX = 'expo.';

/** localStorage wrapper with the reference `expo.` key prefix. */
export const store = {
  get<T>(k: string, d: T): T {
    try {
      const v = JSON.parse(localStorage.getItem(PREFIX + k) ?? 'null') as T | null;
      return v || d;
    } catch {
      return d;
    }
  },
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

  /** Narration language (reference `E.audio.lang`). */
  readonly lang = signal<Lang>('en');
  readonly weather = signal<WeatherMode>('sunny');
  readonly tab = signal<PanelTab>('plot');
  /** True while the imagine / tour cinematic runs (reference `body.cinema-on`). */
  readonly cinema = signal(false);

  setDesign(pid: string, design: PlotDesign): void {
    this.design.update(d => ({ ...d, [pid]: design }));
    store.set('design', this.design());
  }

  setSubmitted(pid: string, sub: Submission | null): void {
    this.submitted.update(s => {
      const next = { ...s };
      if (sub) next[pid] = sub;
      else delete next[pid];
      return next;
    });
    store.set('submitted', this.submitted());
  }

  plotById(pid: string): PlotProps {
    const f = this.data.d.plots.features.find(x => x.properties.pid === pid);
    if (!f) throw new Error('Unknown plot ' + pid);
    return f.properties;
  }

  currentPlot(): PlotProps | null {
    const pid = this.selected();
    return pid ? this.plotById(pid) : null;
  }

  /** Status shown for a plot: submitted → pending, data taken → taken, else selected / available. */
  plotStatus(pid: string): PlotStatus {
    if (this.submitted()[pid]) return 'pending';
    const p = this.plotById(pid);
    if (p.status === 'taken') return 'taken';
    return this.selected() === pid ? 'selected' : 'available';
  }
}
