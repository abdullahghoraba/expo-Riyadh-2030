import { ChangeDetectionStrategy, Component } from '@angular/core';

/** "Insights" tab: facts + canvas charts. Filled by the insights feature. */
@Component({
  selector: 'app-insights-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Insights</h2>
    <div class="facts" id="facts"></div>
    <h4>Plot availability by district</h4><canvas id="chartPlots" width="760" height="300"></canvas>
    <h4>Visitor flow forecast (site total, by hour)</h4><canvas id="chartCrowd" width="760" height="300"></canvas>
    <h4>Services on site</h4><canvas id="chartServices" width="760" height="320"></canvas>
    <h4>Construction progress</h4><canvas id="chartBuild" width="760" height="300"></canvas>
  `
})
export class InsightsTabComponent {}
