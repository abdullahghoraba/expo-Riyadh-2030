import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnalysisTabComponent } from '../../analysis/analysis-tab/analysis-tab.component';
import { PanelTab } from '../../core/models';
import { StateService } from '../../core/state.service';
import { InsightsTabComponent } from '../../insights/insights-tab/insights-tab.component';
import { PavilionTabComponent } from '../../pavilion/pavilion-tab/pavilion-tab.component';
import { PlotTabComponent } from '../../plots/plot-tab/plot-tab.component';
import { LayersTabComponent } from '../layers-tab/layers-tab.component';

/** Right-hand panel with its five tabs (all tabs stay in the DOM, as in the reference). */
@Component({
  selector: 'app-side-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, PlotTabComponent, PavilionTabComponent, AnalysisTabComponent, LayersTabComponent, InsightsTabComponent],
  templateUrl: './side-panel.component.html',
  styleUrl: './side-panel.component.scss'
})
export class SidePanelComponent {
  protected readonly state = inject(StateService);
  protected readonly tabs: [PanelTab, string][] = [
    ['plot', 'Plot allocation'], ['pavilion', 'Build your pavilion'], ['analysis', 'GIS analysis'], ['layers', 'Layers'], ['insights', 'Insights']
  ];
}
