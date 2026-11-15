import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { AnalysisService } from '../analysis/analysis.service';
import { StateService } from '../core/state.service';
import { PAVILION_RENDERER } from '../map/pavilion-renderer';

/**
 * "Build your pavilion" tab: KPIs, design options, floors, toggles, CAD preview and area schedule.
 * Markup placeholder – the pavilion and CAD features fill the dynamic parts.
 */
@Component({
  selector: 'app-pavilion-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pavilion-tab.component.html'
})
export class PavilionTabComponent {
  private readonly injector = inject(Injector);
  protected readonly state = inject(StateService);
  protected readonly analysis = inject(AnalysisService);

  protected focus(): void {
    this.injector.get(PAVILION_RENDERER).focusDetail();
  }

  protected checked(ev: Event): boolean {
    return (ev.target as HTMLInputElement).checked;
  }

  protected setExplode(on: boolean): void {
    this.state.explode.set(on);
    if (on) this.state.floor.set(-1);
    this.injector.get(PAVILION_RENDERER).rebuildDetail();
  }

  protected setLabels(on: boolean): void {
    this.state.labels.set(on);
    this.injector.get(PAVILION_RENDERER).rebuildDetail();
  }

  protected setFurniture(on: boolean): void {
    this.state.furniture.set(on);
    this.injector.get(PAVILION_RENDERER).rebuildDetail();
  }

  protected setSection(on: boolean): void {
    if (on) this.analysis.start('slice');
    else this.analysis.stop();
  }
}
