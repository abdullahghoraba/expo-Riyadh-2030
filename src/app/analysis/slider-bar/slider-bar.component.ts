import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AnalysisService } from '../analysis.service';

/** Time slider shared by the time-based analysis tools (reference #sliderBar). */
@Component({
  selector: 'app-slider-bar',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './slider-bar.component.html',
  styleUrl: './slider-bar.component.scss'
})
export class SliderBarComponent {
  protected readonly analysis = inject(AnalysisService);
  protected readonly cfg = this.analysis.slider;
  /** Formatted current timestamp or step label based on the slider configuration. */
  protected readonly label = computed(() => {
    const o = this.cfg();
    return o ? o.format(this.analysis.sliderValue()) : '';
  });
}
