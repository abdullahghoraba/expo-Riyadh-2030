import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { SliderBarComponent } from './analysis/slider-bar.component';
import { ToolPanelComponent } from './analysis/tool-panel.component';
import { CadModalComponent } from './cad/cad-modal.component';
import { StateService } from './core/state.service';
import { CinemaOverlayComponent } from './imagine/cinema-overlay.component';
import { MapComponent } from './map/map.component';
import { InfoCardComponent } from './plots/info-card.component';
import { RoutePopComponent } from './plots/route-pop.component';
import { SubmitModalComponent } from './plots/submit-modal.component';
import { HeaderComponent } from './shell/header/header.component';
import { LoaderComponent } from './shell/loader/loader.component';
import { MapOverlaysComponent } from './shell/map-overlays/map-overlays.component';
import { SidePanelComponent } from './shell/side-panel/side-panel.component';
import { ToastHostComponent } from './shell/toast-host/toast-host.component';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LoaderComponent, HeaderComponent, MapComponent, MapOverlaysComponent, RoutePopComponent, InfoCardComponent, ToolPanelComponent,
    SliderBarComponent, SidePanelComponent, CinemaOverlayComponent, CadModalComponent, SubmitModalComponent, ToastHostComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  private readonly state = inject(StateService);

  constructor() {
    effect(() => document.body.classList.toggle('cinema-on', this.state.cinema()));
  }
}
