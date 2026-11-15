import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CadTheme } from '../core/models';
import { StateService } from '../core/state.service';

/** Full-screen CAD viewer dialog. Filled by the CAD feature. */
@Component({
  selector: 'app-cad-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="cadModal" class="modal" [class.hidden]="!open()">
      <div class="modal-box wide">
        <div class="modal-head">
          <b>CAD viewer · <span id="cadModalTitle"></span></b>
          <div class="chips floors" id="cadFloorChips"></div>
          <div class="seg small" id="cadTheme">
            <button type="button" [class.on]="state.cadTheme() === 'blueprint'" (click)="setTheme('blueprint')">Blueprint</button><button type="button" [class.on]="state.cadTheme() === 'paper'" (click)="setTheme('paper')">Paper</button>
          </div>
          <button type="button" class="btn ghost small" id="cadDxf2">⬇ DXF</button>
          <button type="button" class="btn ghost small" id="cadPng2">⬇ PNG</button>
          <button type="button" class="x" id="cadClose" (click)="open.set(false)">✕</button>
        </div>
        <canvas id="cadBig"></canvas>
        <div class="modal-foot muted small">Scroll to zoom · drag to pan · double-click to reset</div>
      </div>
    </div>
  `
})
export class CadModalComponent {
  protected readonly state = inject(StateService);
  readonly open = signal(false);

  protected setTheme(t: CadTheme): void {
    this.state.cadTheme.set(t);
  }
}
