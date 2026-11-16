import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { GeoJsonName, Narration, Site } from './models';

/**
 * Single entry point for site-data URLs. With an empty `environment.apiBaseUrl` it serves the
 * static files from /data/; otherwise it targets the .NET API (`{apiBaseUrl}/api/{name}`, see the reference
 * Data-and-NET-Implementation-Guide), which returns the same JSON / GeoJSON.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly base = (environment.apiBaseUrl ?? '').replace(/\/+$/, '');

  /**
   * Indicates whether the application is loading static local files rather than querying a backend API.
   */
  get usesStaticFiles(): boolean {
    return !this.base;
  }

  /**
   * Constructs the URL for a GeoJSON layer file or API endpoint.
   *
   * @param name GeoJSON feature collection identifier.
   * @returns Resolved URL string.
   */
  geojsonUrl(name: GeoJsonName): string {
    return this.base ? `${this.base}/api/${name}` : `data/${name}.geojson`;
  }

  /**
   * Returns the URL of the site configuration metadata (site.json or API endpoint).
   *
   * @returns URL string for site metadata.
   */
  siteUrl(): string {
    return this.base ? `${this.base}/api/site` : 'data/site.json';
  }

  /**
   * Returns the URL of the voice-over narration script (narration.json or API endpoint).
   *
   * @returns URL string for narration data.
   */
  narrationUrl(): string {
    return this.base ? `${this.base}/api/narration` : 'data/narration.json';
  }

  /**
   * Fetches JSON data from a remote endpoint or local path via HTTP GET.
   *
   * @param url Resource URL to fetch.
   * @returns Parsed JSON response payload typed as T.
   * @throws Error if the HTTP request status is not ok.
   */
  async getJson<T>(url: string): Promise<T> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return (await r.json()) as T;
  }

  /**
   * Loads the site configuration metadata.
   *
   * @returns Promise resolving to the {@link Site} metadata.
   */
  getSite(): Promise<Site> {
    return this.getJson<Site>(this.siteUrl());
  }

  /**
   * Loads the tour and experience narration scripts.
   *
   * @returns Promise resolving to the {@link Narration} steps.
   */
  getNarration(): Promise<Narration> {
    return this.getJson<Narration>(this.narrationUrl());
  }

  /**
   * Loads a specific GeoJSON dataset by name.
   *
   * @param name Name of the GeoJSON layer to load.
   * @returns Promise resolving to the parsed GeoJSON dataset typed as T.
   */
  getGeojson<T>(name: GeoJsonName): Promise<T> {
    return this.getJson<T>(this.geojsonUrl(name));
  }
}
