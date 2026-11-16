import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';
import { SceneService } from '../scene.service';

/** Owns the SceneView container; the view itself lives in {@link SceneService}. */
@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss'
})
export class MapComponent {
  private readonly scene = inject(SceneService);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('view');

  /**
   * Initializes the 3D scene view container on render and hooks component teardown to scene destruction.
   */
  constructor() {
    afterNextRender(() => void this.scene.boot(this.container().nativeElement));
    inject(DestroyRef).onDestroy(() => this.scene.destroy());
  }
}
