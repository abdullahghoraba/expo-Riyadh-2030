import { Injectable } from '@angular/core';

/**
 * "Imagine you're here" experience + guided tour (reference js/imagine.js).
 * Placeholder until the imagine feature is ported: the entry points exist but do nothing yet.
 * While a cinematic runs the feature sets `StateService.cinema`.
 */
@Injectable({ providedIn: 'root' })
export class ImagineService {
  startImagine(): void {
    /* implemented by the imagine feature */
  }

  startTour(): void {
    /* implemented by the imagine feature */
  }

  stop(): void {
    /* implemented by the imagine feature */
  }
}
