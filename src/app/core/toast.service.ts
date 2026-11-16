import { Injectable, signal } from '@angular/core';

/** Single transient message at the top of the page (reference `U.toast`). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private timer: ReturnType<typeof setTimeout> | undefined;
  readonly message = signal('');
  readonly visible = signal(false);

  /**
   * Displays a temporary toast notification banner at the top of the viewport.
   * Automatically dismisses itself after the specified timeout.
   *
   * @param msg Message string or translated phrase to display.
   * @param ms Visible duration in milliseconds (default is 2600 ms).
   */
  show(msg: string, ms = 2600): void {
    this.message.set(msg);
    this.visible.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visible.set(false), ms);
  }
}
