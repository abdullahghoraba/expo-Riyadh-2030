import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-toast-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div id="toast" [class.show]="toast.visible()">{{ toast.message() }}</div>`,
  styles: `
    #toast { position: fixed; z-index: 90; left: 50%; top: 84px; transform: translateX(-50%); background: var(--g); color: #fff; padding: 10px 18px; border-radius: 22px; font-size: 13px; opacity: 0; transition: .3s; pointer-events: none; box-shadow: 0 8px 24px rgba(0, 0, 0, .25) }
    #toast.show { opacity: 1; top: 94px }
  `
})
export class ToastHostComponent {
  protected readonly toast = inject(ToastService);
}
