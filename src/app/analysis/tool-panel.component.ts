import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AnalysisService } from './analysis.service';

/** Floating panel of the active analysis tool. Filled by the analysis feature. */
@Component({
  selector: 'app-tool-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="toolPanel" [class.hidden]="!open()">
      <div class="tp-head"><b id="toolTitle">Tool</b><button type="button" class="x" id="toolClose" (click)="analysis.stop()">✕</button></div>
      <div id="toolBody"></div>
      <div id="toolWidget"></div>
    </div>
  `
})
export class ToolPanelComponent {
  protected readonly analysis = inject(AnalysisService);
  protected readonly open = computed(() => this.analysis.active() !== null);
}
