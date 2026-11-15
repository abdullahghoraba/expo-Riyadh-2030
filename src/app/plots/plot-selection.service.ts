import { Injectable, Injector, inject, signal } from '@angular/core';
import { DataService } from '../core/data.service';
import { StateService } from '../core/state.service';
import { LayersService } from '../map/layers.service';
import { PAVILION_RENDERER } from '../map/pavilion-renderer';

/**
 * Plot selection (reference app.js E.selectPlot and the boot default).
 * Task 1 keeps the site-level part only (state + plot pads); the detail pavilion, "what's near",
 * routes and info cards are added by the plots feature (task 2).
 */
@Injectable({ providedIn: 'root' })
export class PlotSelectionService {
  private readonly data = inject(DataService);
  private readonly state = inject(StateService);
  private readonly layers = inject(LayersService);
  private readonly injector = inject(Injector);

  /** Visibility of the "Submit plot request" dialog. */
  readonly submitOpen = signal(false);

  /** Opens the submit dialog for the selected plot (reference E.openSubmit) – implemented by the plots feature. */
  openSubmit(): void {
    /* implemented by the plots feature */
  }

  /** Default plot = first available in the first district. */
  initDefault(): void {
    const D = this.data.d;
    const district = D.site.districts[0].id;
    this.state.district.set(district);
    const first = D.plots.features.find(f => f.properties.district === district && this.state.plotStatus(f.properties.pid) !== 'taken');
    if (first) this.state.selected.set(first.properties.pid);
    this.layers.refreshPlots();
  }

  /** First non-taken plot of a district (district chip behaviour). */
  firstFreePlot(districtId: string): string | null {
    const f = this.data.d.plots.features.find(x => x.properties.district === districtId && this.state.plotStatus(x.properties.pid) !== 'taken');
    return f ? f.properties.pid : null;
  }

  selectPlot(pid: string, fly = true): void {
    if (this.state.plotStatus(pid) === 'taken') return;
    this.state.selected.set(pid);
    this.state.district.set(this.state.plotById(pid).district);
    this.layers.refreshPlots();
    if (fly) this.injector.get(PAVILION_RENDERER).focusDetail();
  }
}
