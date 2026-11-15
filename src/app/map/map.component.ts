import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, viewChild } from '@angular/core';
import { SceneService } from './scene.service';

/** Owns the SceneView container; the view itself lives in {@link SceneService}. */
@Component({
  selector: 'app-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div id="view" #view></div>`,
  styles: `:host { display: contents }`
})
export class MapComponent {
  private readonly scene = inject(SceneService);
  private readonly container = viewChild.required<ElementRef<HTMLDivElement>>('view');

  constructor() {
    afterNextRender(() => void this.scene.boot(this.container().nativeElement));
    inject(DestroyRef).onDestroy(() => this.scene.destroy());
  }
}
