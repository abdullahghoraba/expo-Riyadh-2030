import { TranslatePipe } from '../../core/translate.pipe';
import { TranslateHtmlPipe } from '../../core/translate-html.pipe';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, viewChild } from '@angular/core';
import { AnalysisService } from '../analysis.service';

/** Floating panel of the active analysis tool: results, actions and ArcGIS widgets (reference #toolPanel). */
@Component({
  selector: 'app-tool-panel',
  imports: [TranslatePipe, TranslateHtmlPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tool-panel.component.html',
  styleUrl: './tool-panel.component.scss'
})
export class ToolPanelComponent {
  protected readonly analysis = inject(AnalysisService);
  /** Indicates whether an analysis tool is currently active and the panel should be visible. */
  protected readonly open = computed(() => this.analysis.active() !== null);
  private readonly widget = viewChild.required<ElementRef<HTMLDivElement>>('widget');

  /**
   * Registers the DOM container host for ArcGIS widgets with AnalysisService,
   * and unregisters it when the component is destroyed.
   */
  constructor() {
    afterNextRender(() => (this.analysis.widgetHost = this.widget().nativeElement));
    inject(DestroyRef).onDestroy(() => (this.analysis.widgetHost = null));
  }
}
