import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { setCenter } from './geo';
import { GEOJSON_FILES, GeoJsonName, SiteData } from './models';
import { WalkRouter } from './walk-router';

/**
 * Loads the whole site database once (Promise.all) and exposes it read-only.
 * After loading it sets the local metric frame centre and builds the walking network (reference boot()).
 */
@Injectable({ providedIn: 'root' })
export class DataService {
  private readonly api = inject(ApiService);
  private loading: Promise<Readonly<SiteData>> | null = null;
  private readonly _data = signal<Readonly<SiteData> | null>(null);
  private _router: WalkRouter | null = null;

  /** The loaded database, or null before {@link load} resolves. */
  readonly data = this._data.asReadonly();

  readonly files: readonly GeoJsonName[] = GEOJSON_FILES;

  /**
   * Asynchronously loads the entire site database (all GeoJSON layers, site metadata, and narration scripts)
   * in parallel, initializes the local metric center coordinate, and constructs the walking route graph.
   * Caches the loading promise to guarantee a single network fetch.
   *
   * @returns Promise resolving to the frozen {@link SiteData} object.
   */
  load(): Promise<Readonly<SiteData>> {
    if (!this.loading) {
      this.loading = (async () => {
        const parts: Partial<Record<keyof SiteData, unknown>> = {};
        await Promise.all([
          ...GEOJSON_FILES.map(n => this.api.getGeojson<unknown>(n).then(j => (parts[n] = j))),
          this.api.getSite().then(j => (parts.site = j)),
          this.api.getNarration().then(j => (parts.narration = j))
        ]);
        const d = Object.freeze(parts as SiteData);
        setCenter(d.site.center);
        this._router = new WalkRouter(d.streets);
        this._data.set(d);
        return d;
      })();
      this.loading.catch(() => (this.loading = null));
    }
    return this.loading;
  }

  /**
   * Synchronously returns the loaded site database; throws if accessed prior to {@link load} resolution.
   *
   * @throws Error if site data has not yet finished loading.
   */
  get d(): Readonly<SiteData> {
    const d = this._data();
    if (!d) throw new Error('Site data not loaded yet');
    return d;
  }

  /**
   * Descriptive alias for {@link d}: returns the loaded site database.
   *
   * @throws Error if site data has not yet finished loading.
   */
  get siteData(): Readonly<SiteData> {
    return this.d;
  }

  /**
   * Checks whether the site database has successfully finished loading.
   */
  get loaded(): boolean {
    return this._data() !== null;
  }

  /**
   * Boolean property indicating whether the database is loaded (alias for {@link loaded}).
   */
  get isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Walking network router constructed from the streets layer (reference `E.router`).
   *
   * @throws Error if site data has not yet finished loading.
   */
  get router(): WalkRouter {
    if (!this._router) throw new Error('Site data not loaded yet');
    return this._router;
  }
}
