import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PlotSelectionService } from './plot-selection.service';

/** "Submit plot request" dialog. Filled by the plots feature. */
@Component({
  selector: 'app-submit-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="submitModal" class="modal" [class.hidden]="!plots.submitOpen()">
      <div class="modal-box">
        <div class="modal-head"><b>Submit plot request</b><button type="button" class="x" id="submitClose" (click)="plots.submitOpen.set(false)">✕</button></div>
        <div id="submitBody"></div>
      </div>
    </div>
  `
})
export class SubmitModalComponent {
  protected readonly plots = inject(PlotSelectionService);
}
