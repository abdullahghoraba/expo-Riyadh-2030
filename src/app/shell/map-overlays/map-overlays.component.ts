import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DataService } from '../../core/data.service';
import { LightMode, RenderMode, WeatherMode } from '../../core/models';
import { StateService } from '../../core/state.service';
import { ImagineService } from '../../imagine/imagine.service';
import { PLOT_COLOR } from '../../map/layers.service';
import { SceneService } from '../../map/scene.service';

/** Controls floating over the 3D view: style / light / weather segments, hero actions, legend, disclaimer. */
@Component({
  selector: 'app-map-overlays',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './map-overlays.component.html'
})
export class MapOverlaysComponent {
  protected readonly scene = inject(SceneService);
  protected readonly state = inject(StateService);
  protected readonly imagine = inject(ImagineService);
  private readonly data = inject(DataService);

  protected readonly styles: [RenderMode, string][] = [['realistic', 'Realistic'], ['blueprint', 'Blueprint'], ['sketch', 'Sketch model']];
  protected readonly lights: [LightMode, string][] = [['day', '☀ Day'], ['sunset', '🌇 Sunset'], ['night', '🌙 Night']];
  protected readonly weathers: [WeatherMode, string][] = [['sunny', 'Clear'], ['cloudy', 'Cloudy'], ['rainy', 'Rain'], ['foggy', 'Dust']];
  protected readonly legend: [string, string][] = [
    [PLOT_COLOR.available, 'Available'], [PLOT_COLOR.taken, 'Taken'], [PLOT_COLOR.selected, 'Selected'], [PLOT_COLOR.pending, 'Submitted']
  ];
  protected readonly disclaimer = computed(() => this.data.data()?.site.disclaimer ?? '');
}
