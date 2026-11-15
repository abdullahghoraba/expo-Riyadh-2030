import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SceneService } from '../../map/scene.service';

@Component({
  selector: 'app-loader',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loader().phase !== 'gone') {
      <div id="loader" [class.fade]="loader().phase === 'fade'">
        <div class="loader-box">
          <div class="logo big"><span class="mark">✕✕</span><div><b>EXPO 2030</b><b>RIYADH</b><small>SAUDI ARABIA</small></div></div>
          <div class="spinner" [style.display]="loader().spinner ? null : 'none'"></div>
          <div id="loaderText">{{ loader().text }}</div>
        </div>
      </div>
    }
  `,
  styleUrl: './loader.component.scss'
})
export class LoaderComponent {
  protected readonly loader = inject(SceneService).loader;
}
