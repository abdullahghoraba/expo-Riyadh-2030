import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { setLocale } from '@arcgis/core/intl';
import { SliderBarComponent } from './analysis/slider-bar/slider-bar.component';
import { ToolPanelComponent } from './analysis/tool-panel/tool-panel.component';
import { CadModalComponent } from './cad/cad-modal/cad-modal.component';
import { CadService } from './cad/cad.service';
import { StateService } from './core/state.service';
import { CinemaOverlayComponent } from './imagine/cinema-overlay/cinema-overlay.component';
import { MapComponent } from './map/map-view/map.component';
import { InfoCardComponent } from './plots/info-card/info-card.component';
import { PlotSelectionService } from './plots/plot-selection.service';
import { RoutePopComponent } from './plots/route-pop/route-pop.component';
import { SubmitModalComponent } from './plots/submit-modal/submit-modal.component';
import { HeaderComponent } from './shell/header/header.component';
import { LoaderComponent } from './shell/loader/loader.component';
import { MapOverlaysComponent } from './shell/map-overlays/map-overlays.component';
import { SidePanelComponent } from './shell/side-panel/side-panel.component';
import { ToastHostComponent } from './shell/toast-host/toast-host.component';

/** Root application shell component managing global layout, overlays, and hotkeys. */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoaderComponent, HeaderComponent, MapComponent, MapOverlaysComponent, RoutePopComponent, InfoCardComponent, ToolPanelComponent,
    SliderBarComponent, SidePanelComponent, CinemaOverlayComponent, CadModalComponent, SubmitModalComponent, ToastHostComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '(window:keydown.escape)': 'onEscape()' }
})
export class App {
  private readonly state = inject(StateService);
  private readonly plots = inject(PlotSelectionService);
  private readonly cad = inject(CadService);

  constructor() {
    effect(() => document.body.classList.toggle('cinema-on', this.state.cinema()));
    effect(() => {
      const lang = this.state.lang();
      document.documentElement.lang = lang;
      document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
      setLocale(lang);
    });
  }

  /**
   * Handles Escape key press to dismiss active modal dialogues, CAD viewer, and floating cards.
   */
  protected onEscape(): void {
    this.cad.close();
    this.plots.submitOpen.set(false);
    this.plots.closeCards();
  }
}

