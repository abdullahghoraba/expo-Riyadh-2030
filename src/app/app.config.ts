import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { AppErrorHandler } from './core/app-error-handler';
import { PAVILION_RENDERER } from './map/pavilion-renderer';
import { SCENE_HOOKS } from './map/scene-hooks';
import { PavilionService } from './pavilion/pavilion.service';
import { MapClickService } from './plots/map-click.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: AppErrorHandler },
    provideRouter(routes),
    { provide: PAVILION_RENDERER, useExisting: PavilionService },
    { provide: SCENE_HOOKS, useExisting: MapClickService }
  ]
};
