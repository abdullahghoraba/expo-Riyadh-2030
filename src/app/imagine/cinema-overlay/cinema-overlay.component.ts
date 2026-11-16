import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Lang } from '../../core/models';
import { StateService, store } from '../../core/state.service';
import { AudioService } from '../audio.service';
import { ImagineService } from '../imagine.service';

/** Cinematic overlay (letterbox bars, progress dots, subtitles) + closing call-to-action (reference index.html #cinema / #cta). */
@Component({
  selector: 'app-cinema-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cinema-overlay.component.html',
  styleUrl: './cinema-overlay.component.scss'
})
export class CinemaOverlayComponent {
  protected readonly state = inject(StateService);
  protected readonly imagine = inject(ImagineService);
  protected readonly audio = inject(AudioService);

  protected readonly modeLabel = computed(() => this.state.lang() === 'ar'
    ? (this.imagine.mode() === 'imagine' ? '· تخيّل أنك هنا' : '· جولة إرشادية')
    : (this.imagine.mode() === 'imagine' ? '· IMAGINE YOU\'RE HERE' : '· GUIDED TOUR'));
  protected readonly dots = computed(() => {
    const { n, i } = this.imagine.dots();
    return Array.from({ length: n }, (_, k) => (k < i ? 'done' : k === i ? 'now' : ''));
  });

  /**
   * Switches the active language between English and Arabic and persists the selection.
   *
   * @param l The chosen language code ('en' | 'ar')
   */
  protected setLang(l: Lang): void {
    this.state.lang.set(l);
    store.set('lang', l);
  }
}
