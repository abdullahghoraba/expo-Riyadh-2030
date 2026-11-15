import { ChangeDetectionStrategy, Component } from '@angular/core';

/** "GIS analysis" tab. The tool list is filled by the analysis feature. */
@Component({
  selector: 'app-analysis-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>GIS analysis</h2>
    <p class="muted">Spatial tools running live on the digital twin. Pick a plot first; tools use it as the reference point.</p>
    <div id="toolList" class="tools"></div>
  `
})
export class AnalysisTabComponent {}
