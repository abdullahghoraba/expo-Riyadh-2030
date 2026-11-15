import { ChangeDetectionStrategy, Component, signal } from '@angular/core';

/** Popup describing the selected "what's near" route. Filled by the plots feature. */
@Component({
  selector: 'app-route-pop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="routePop" class="pop" [class.hidden]="!open()">
      <button type="button" class="x" id="routePopX" (click)="open.set(false)">✕</button>
      <div id="routePopBody"></div>
    </div>
  `
})
export class RoutePopComponent {
  readonly open = signal(false);
}
