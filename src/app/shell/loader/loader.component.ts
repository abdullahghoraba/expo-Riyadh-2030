import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SceneService } from '../../map/scene.service';

@Component({
  selector: 'app-loader',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loader.component.html',
  styleUrl: './loader.component.scss'
})
export class LoaderComponent {
  protected readonly loader = inject(SceneService).loader;
}
