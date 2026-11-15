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

  get usesStaticFiles(): boolean {
    return !this.base;
  }

  /** URL of a GeoJSON layer (used directly by GeoJSONLayer). */
  geojsonUrl(name: GeoJsonName): string {
    return this.base ? `${this.base}/api/${name}` : `data/${name}.geojson`;
  }

  siteUrl(): string {
    return this.base ? `${this.base}/api/site` : 'data/site.json';
  }

  narrationUrl(): string {
    return this.base ? `${this.base}/api/narration` : 'data/narration.json';
  }

  async getJson<T>(url: string): Promise<T> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return (await r.json()) as T;
  }

  getSite(): Promise<Site> {
    return this.getJson<Site>(this.siteUrl());
  }

  getNarration(): Promise<Narration> {
    return this.getJson<Narration>(this.narrationUrl());
  }

  getGeojson<T>(name: GeoJsonName): Promise<T> {
    return this.getJson<T>(this.geojsonUrl(name));
  }
}
