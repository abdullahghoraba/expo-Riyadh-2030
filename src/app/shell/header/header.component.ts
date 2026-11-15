import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DataService } from '../../core/data.service';
import { Lang } from '../../core/models';
import { StateService } from '../../core/state.service';

/** Portal top navigation + sub bar (delegation, page title, language). */
@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss'
})
export class HeaderComponent {
  private readonly data = inject(DataService);
  protected readonly state = inject(StateService);

  protected readonly delegName = computed(() => this.data.data()?.site.participant.name ?? 'UK delegation');
  protected readonly initials = computed(() => this.data.data()?.site.participant.initials ?? 'AY');

  protected setLang(l: Lang): void {
    this.state.lang.set(l);
  }
}
