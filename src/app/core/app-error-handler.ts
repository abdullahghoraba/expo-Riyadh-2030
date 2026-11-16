import { ErrorHandler, Injectable } from '@angular/core';

/**
 * Errors thrown inside ArcGIS's vector-tile worker pipeline when a vector basemap (topo, night streets, dark gray,
 * the hybrid labels, or the blueprint / sketch styles) is swapped out while its tiles are still being prepared:
 * the worker's reply reaches a tile handler that ArcGIS has already destroyed. The tiles belong to a basemap that
 * is no longer on the map, so nothing visible breaks – it is an ArcGIS race, not an application error.
 */
const ARCGIS_VECTOR_TILE_RACE = /reading '(getSprites|getGlyphs)'/;

/**
 * Angular error handler that reports every error as usual, except the known harmless ArcGIS vector-tile race above,
 * which is logged at debug level only.
 */
@Injectable()
export class AppErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error);
    if (ARCGIS_VECTOR_TILE_RACE.test(message)) {
      console.debug('[arcgis] ignored vector-tile race after a basemap change:', message);
      return;
    }
    super.handleError(error);
  }
}
