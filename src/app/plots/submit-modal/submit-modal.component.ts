import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlotSelectionService } from '../plot-selection.service';

/** "Submit plot request" dialog (reference app.js E.openSubmit). */
@Component({
  selector: 'app-submit-modal',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './submit-modal.component.html',
  styleUrl: './submit-modal.component.scss'
})
export class SubmitModalComponent {
  protected readonly plots = inject(PlotSelectionService);

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
