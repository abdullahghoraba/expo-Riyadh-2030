import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, viewChild } from '@angular/core';
import { I18nService } from '../../core/i18n.service';
import type LayerList from '@arcgis/core/widgets/LayerList';
import { DataService } from '../../core/data.service';
import { fmt } from '../../core/geo';
import { GEOJSON_FILES } from '../../core/models';
import { StateService } from '../../core/state.service';
import { BASEMAPS, SceneService } from '../../map/scene.service';

/** "Layers" tab: basemap picker, ArcGIS LayerList and the site-database summary. */
@Component({
  selector: 'app-layers-tab',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './layers-tab.component.html',
  styleUrl: './layers-tab.component.scss'
})
export class LayersTabComponent {
  private readonly i18n = inject(I18nService);
  private readonly data = inject(DataService);
  protected readonly scene = inject(SceneService);
  protected readonly state = inject(StateService);
  protected readonly basemaps = BASEMAPS;
  private readonly layerListEl = viewChild.required<ElementRef<HTMLDivElement>>('layerList');
  private layerList: LayerList | null = null;
  private destroyed = false;

  protected readonly rows = computed(() => {
    const D = this.data.data();
    if (!D) return null;
    const files = GEOJSON_FILES.map(n => {
      const fc = D[n], f0 = fc.features[0];
      return {
        file: `${n}.geojson`,
        geom: f0 ? f0.geometry.type.replace('Multi', '') : '',
        records: fmt(fc.features.length),
        keys: f0 ? Object.keys(f0.properties).slice(0, 4).join(', ') : ''
      };
    });
    return { files, narration: D.narration.imagine.length + D.narration.tour.length };
  });

  constructor() {
    effect(() => {
      this.state.lang();
      this.layerList?.operationalItems.forEach(item => { item.title = this.i18n.text(item.layer?.title); });
    });
    this.scene.ready.then(async view => {
      const { default: LayerListWidget } = await import('@arcgis/core/widgets/LayerList');
      if (this.destroyed) return;
      this.layerList = new LayerListWidget({ view, container: this.layerListEl().nativeElement,
        listItemCreatedFunction: ({ item }) => { item.title = this.i18n.text(item.layer?.title); }
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.layerList?.destroy();
    });
  }
}
