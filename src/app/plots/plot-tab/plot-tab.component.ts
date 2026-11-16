import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DataService } from '../../core/data.service';
import { fmt } from '../../core/geo';
import { COMPASS, SERVICE } from '../../core/service-catalog';
import { SiteDistrict } from '../../core/models';
import { StateService } from '../../core/state.service';
import { SceneService } from '../../map/scene.service';
import { frontHeading } from '../../pavilion/pavilion-frame';
import { PavilionService } from '../../pavilion/pavilion.service';
import { PlotSelectionService } from '../plot-selection.service';

const STEPS = ['Plot selected', 'Request submitted', 'Organizer review', 'Plot allocated'];

/** "Plot allocation" tab: districts, plot cards, what's near, your plot + request status. */
@Component({
  selector: 'app-plot-tab',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plot-tab.component.html',
  styleUrl: './plot-tab.component.scss'
})
export class PlotTabComponent {
  private readonly data = inject(DataService);
  private readonly scene = inject(SceneService);
  private readonly pavilion = inject(PavilionService);
  protected readonly state = inject(StateService);
  protected readonly plots = inject(PlotSelectionService);
  protected readonly fmt = fmt;
  protected readonly SERVICE = SERVICE;
  protected readonly steps = STEPS;

  protected readonly districts = computed(() => this.data.data()?.site.districts ?? []);
  protected readonly districtNote = computed(() => this.districts().find(d => d.id === this.state.district())?.note ?? '');

  protected readonly cards = computed(() => {
    const D = this.data.data(), district = this.state.district();
    if (!D) return [];
    return D.plots.features
      .filter(f => f.properties.district === district)
      .map(f => {
        const p = f.properties, st = this.state.plotStatus(p.pid);
        return { p, st, cls: 'plot ' + (st === 'selected' ? 'sel' : st) };
      });
  });

  protected readonly current = computed(() => {
    if (!this.data.data()) return null;
    const p = this.state.currentPlot();
    if (!p) return null;
    const facing = COMPASS[Math.round(frontHeading(this.pavilion.plotSpec(p.pid)) / 45) % 8];
    return {
      p,
      title: `Plot ${p.pid} · ${p.districtName}`,
      sub: `40 × 40 m · ${fmt(p.area)} m² · entrance faces ${facing}`,
      pending: this.state.plotStatus(p.pid) === 'pending'
    };
  });

  protected readonly submission = computed(() => {
    const pid = this.state.selected();
    return pid ? this.state.submitted()[pid] ?? null : null;
  });

  protected readonly nearTitle = computed(() => {
    const pid = this.state.selected();
    return pid && this.state.near().length ? `What's near ${pid}` : "What's near";
  });

  /**
   * Switches the active district filter, animates camera to frame the district block,
   * and auto-selects its first available plot.
   *
   * @param d Selected district object.
   */
  protected pickDistrict(d: SiteDistrict): void {
    this.state.district.set(d.id);
    const pid = this.plots.firstFreePlot(d.id);
    void this.scene.flyToDistrict(d.block.center);
    if (pid) this.plots.selectPlot(pid, false);
  }

  /**
   * Formats a millisecond Unix timestamp into a localized human-readable date and time string.
   *
   * @param t Milliseconds since Unix epoch.
   * @returns Formatted locale date string.
   */
  protected dateTime(t: number): string {
    return new Date(t).toLocaleString();
  }
}
