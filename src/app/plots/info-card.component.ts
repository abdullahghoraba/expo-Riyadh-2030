import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/** Info card shown when clicking anything on the map. Filled by the plots feature. */
@Component({
  selector: 'app-info-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div id="infoCard" class="card" [class.hidden]="!open()"></div>`
})
export class InfoCardComponent {
  readonly open = signal(false);
}
