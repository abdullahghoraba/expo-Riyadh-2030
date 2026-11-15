import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/** Time slider shared by the time-based analysis tools. Filled by the analysis feature. */
@Component({
  selector: 'app-slider-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="sliderBar" [class.hidden]="!open()">
      <button type="button" id="sliderPlay" class="play">▶</button>
      <div class="sb-main">
        <div class="sb-top"><b id="sliderTitle"></b><span id="sliderValue"></span></div>
        <input type="range" id="slider">
        <div class="sb-ticks" id="sliderTicks"></div>
      </div>
      <div id="sliderLegend"></div>
    </div>
  `
})
export class SliderBarComponent {
  readonly open = signal(false);
}
