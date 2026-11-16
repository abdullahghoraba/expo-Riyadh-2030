import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DataService } from '../../core/data.service';
import { Lang } from '../../core/models';
import { StateService, store } from '../../core/state.service';

/** Portal top navigation + sub bar (delegation, page title, language). */
@Component({
  selector: 'app-header',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  private readonly data = inject(DataService);
  protected readonly state = inject(StateService);

  protected readonly delegName = computed(() => this.data.data()?.site.participant.name ?? 'UK delegation');
  protected readonly initials = computed(() => this.data.data()?.site.participant.initials ?? 'AY');

  /**
   * Switches the active UI language and saves the user preference to local storage.
   *
   * @param l The selected language code ('en' | 'ar')
   */
  protected setLang(l: Lang): void {
    this.state.lang.set(l);
    store.set('lang', l);
  }
}
