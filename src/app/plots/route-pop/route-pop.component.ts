import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { fmt } from '../../core/geo';
import { PlotSelectionService } from '../plot-selection.service';

/** Popup describing the selected "what's near" route. */
@Component({
  selector: 'app-route-pop',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './route-pop.component.html',
  styleUrl: './route-pop.component.scss'
})
export class RoutePopComponent {
  protected readonly plots = inject(PlotSelectionService);
  protected readonly fmt = fmt;
}
