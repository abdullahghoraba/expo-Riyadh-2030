import { Injectable, signal } from '@angular/core';

/**
 * GIS analysis tools (reference js/analysis.js). Placeholder until the analysis feature is ported:
 * `active` mirrors `E.analysis.active`; start / stop are no-ops for now.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisService {
  readonly active = signal<string | null>(null);

  toggle(id: string): void {
    if (this.active() === id) this.stop();
    else this.start(id);
  }

  start(id: string): void {
    void id; /* implemented by the analysis feature */
  }

  stop(): void {
    this.active.set(null);
  }
}
