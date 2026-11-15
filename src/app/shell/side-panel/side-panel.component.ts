import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnalysisTabComponent } from '../../analysis/analysis-tab.component';
import { PanelTab } from '../../core/models';
import { StateService } from '../../core/state.service';
import { InsightsTabComponent } from '../../insights/insights-tab.component';
import { PavilionTabComponent } from '../../pavilion/pavilion-tab.component';
import { PlotTabComponent } from '../../plots/plot-tab.component';
import { LayersTabComponent } from '../layers-tab/layers-tab.component';

/** Right-hand panel with its five tabs (all tabs stay in the DOM, as in the reference). */
@Component({
  selector: 'app-side-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlotTabComponent, PavilionTabComponent, AnalysisTabComponent, LayersTabComponent, InsightsTabComponent],
  template: `
    <aside id="panel">
      <nav class="ptabs" id="ptabs">
        @for (t of tabs; track t[0]) {
          <button type="button" [class.on]="state.tab() === t[0]" (click)="state.tab.set(t[0])">{{ t[1] }}</button>
        }
      </nav>
      <section class="tab" id="tab-plot" [class.on]="state.tab() === 'plot'"><app-plot-tab /></section>
      <section class="tab" id="tab-pavilion" [class.on]="state.tab() === 'pavilion'"><app-pavilion-tab /></section>
      <section class="tab" id="tab-analysis" [class.on]="state.tab() === 'analysis'"><app-analysis-tab /></section>
      <section class="tab" id="tab-layers" [class.on]="state.tab() === 'layers'"><app-layers-tab /></section>
      <section class="tab" id="tab-insights" [class.on]="state.tab() === 'insights'"><app-insights-tab /></section>
    </aside>
  `
})
export class SidePanelComponent {
  protected readonly state = inject(StateService);
  protected readonly tabs: [PanelTab, string][] = [
    ['plot', 'Plot allocation'], ['pavilion', 'Build your pavilion'], ['analysis', 'GIS analysis'], ['layers', 'Layers'], ['insights', 'Insights']
  ];
}
