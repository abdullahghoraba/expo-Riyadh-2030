import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlotSelectionService } from '../plot-selection.service';

/** Info card shown when clicking anything on the map (reference app.js `card`). */
@Component({
  selector: 'app-info-card',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './info-card.component.html',
  styleUrl: './info-card.component.scss'
})
export class InfoCardComponent {
  protected readonly plots = inject(PlotSelectionService);
}
