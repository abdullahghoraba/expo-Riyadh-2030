import { Injectable, signal } from '@angular/core';

/** Single transient message at the top of the page (reference `U.toast`). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly message = signal('');
  readonly visible = signal(false);

  show(msg: string, ms = 2600): void {
    this.message.set(msg);
    this.visible.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visible.set(false), ms);
  }
}
