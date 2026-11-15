import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Lang } from '../core/models';
import { StateService } from '../core/state.service';
import { ImagineService } from './imagine.service';

/** Cinematic overlay (letterbox bars, progress dots, subtitles) + closing call-to-action. Filled by the imagine feature. */
@Component({
  selector: 'app-cinema-overlay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div id="cinema" [class.hidden]="!state.cinema()">
      <div class="cin-top">
        <div class="cin-brand"><span class="mark">✕✕</span> EXPO 2030 RIYADH <em id="cinMode">· IMAGINE</em></div>
        <div class="cin-dots" id="cinDots"></div>
        <div class="cin-ctrl">
          <div class="seg small dark" id="cinLang">
            <button type="button" [class.on]="state.lang() === 'en'" (click)="setLang('en')">EN</button><button type="button" [class.on]="state.lang() === 'ar'" (click)="setLang('ar')">ع</button>
          </div>
          <button type="button" id="cinMute" title="Mute voice">🔊</button>
          <button type="button" id="cinStop" (click)="imagine.stop()">✕ Exit</button>
        </div>
      </div>
      <div class="cin-bottom"><div id="subtitle"></div></div>
    </div>
    <div id="cta" class="hidden">
      <div class="cta-box">
        <div class="cta-kicker">YOUR PLACE AT EXPO 2030</div>
        <h2 id="ctaTitle">Plot SE-03</h2>
        <p id="ctaSub"></p>
        <div class="row-btns center">
          <button type="button" class="btn primary" id="ctaSubmit">Submit this plot</button>
          <button type="button" class="btn" id="ctaReplay">↻ Replay</button>
          <button type="button" class="btn ghost" id="ctaClose">Explore</button>
        </div>
      </div>
    </div>
  `
})
export class CinemaOverlayComponent {
  protected readonly state = inject(StateService);
  protected readonly imagine = inject(ImagineService);

  protected setLang(l: Lang): void {
    this.state.lang.set(l);
  }
}
