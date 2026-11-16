import { Injectable, Injector, inject, signal } from '@angular/core';
import esriConfig from '@arcgis/core/config';
import Ground from '@arcgis/core/Ground';
import EsriMap from '@arcgis/core/Map';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import Point from '@arcgis/core/geometry/Point';
import SceneView from '@arcgis/core/views/SceneView';
import { environment } from '../../environments/environment';
import { DataService } from '../core/data.service';
import { sleep } from '../core/geo';
import { LightMode, LonLat, RenderMode, WeatherMode } from '../core/models';
import { StateService } from '../core/state.service';
import { ToastService } from '../core/toast.service';
import { LayersService } from './layers.service';
import { PAVILION_RENDERER } from './pavilion-renderer';
import { SCENE_HOOKS } from './scene-hooks';

const SR = { wkid: 4326 };

/** Basemaps offered in the Layers tab (reference app.js BASEMAPS). */
export const BASEMAPS: readonly [id: string, label: string][] = [
  ['satellite', 'Satellite'], ['hybrid', 'Satellite + labels'], ['topo-vector', 'Topographic'],
  ['streets-night-vector', 'Night streets'], ['dark-gray-vector', 'Dark canvas'], ['osm', 'OpenStreetMap']
];
/** Fallback chain when a basemap layer fails to load. */
const BASEMAP_FALLBACK = ['satellite', 'hybrid', 'topo-vector', 'osm'];
/** Sun time (minutes after local midnight) per light mode. */
const SUN_MINUTES: Record<LightMode, number> = { day: 630, sunset: 1012, night: 1230 };

type WeatherProps = NonNullable<__esri.EnvironmentProperties['weather']>;
const WEATHER: Record<WeatherMode, WeatherProps> = {
  sunny: { type: 'sunny', cloudCover: 0.1 },
  cloudy: { type: 'cloudy', cloudCover: 0.75 },
  rainy: { type: 'rainy', cloudCover: 0.8, precipitation: 0.35 },
  foggy: { type: 'foggy', fogStrength: 0.35 }
};

export interface LoaderState {
  text: string;
  spinner: boolean;
  /** 'show' → 'fade' (CSS opacity transition) → 'gone' (removed). */
  phase: 'show' | 'fade' | 'gone';
}

/** Owns the ArcGIS Map + SceneView and the site-level view operations (reference app.js boot & header controls). */
@Injectable({ providedIn: 'root' })
export class SceneService {
  private readonly data = inject(DataService);
  private readonly state = inject(StateService);
  private readonly layers = inject(LayersService);
  private readonly toast = inject(ToastService);
  private readonly injector = inject(Injector);

  map: EsriMap | null = null;
  view: SceneView | null = null;

  readonly loader = signal<LoaderState>({ text: 'Loading the Expo 2030 digital twin…', spinner: true, phase: 'show' });
  /** True once the view is ready and the initial layers finished updating (or 12 s passed). */
  readonly isReady = signal(false);
  readonly mode = this.layers.mode;

  private readyResolve!: (v: SceneView) => void;
  /** Resolves with the SceneView once {@link boot} created it and it is ready. */
  readonly ready: Promise<SceneView> = new Promise(r => (this.readyResolve = r));

  private handles: IHandle[] = [];
  private timers: ReturnType<typeof setTimeout>[] = [];
  private hovering = false;

  /**
   * Updates the loader text and spinner state.
   *
   * @param text Message to display on the loading overlay.
   * @param spinner Whether to show the spinning indicator.
   */
  private setLoader(text: string, spinner = true): void {
    this.loader.update(l => ({ ...l, text, spinner }));
  }

  /**
   * Initializes the 3D scene view inside the specified container element.
   * Catches and displays any fatal startup errors.
   *
   * @param container DOM div element hosting the ArcGIS SceneView.
   */
  async boot(container: HTMLDivElement): Promise<void> {
    try {
      await this.doBoot(container);
    } catch (e) {
      console.error(e);
      this.setLoader('Something went wrong while loading: ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  /**
   * Internal boot implementation: configures API key, loads site database, instantiates EsriMap,
   * creates SceneView, initializes layers, attaches hover/click listeners, and hides the loader.
   *
   * @param container DOM div element hosting the SceneView.
   */
  private async doBoot(container: HTMLDivElement): Promise<void> {
    if (environment.arcgisApiKey) esriConfig.apiKey = environment.arcgisApiKey;
    this.setLoader('Loading the site database…');
    const D = await this.data.load();

    this.setLoader('Building the 3D digital twin…');
    const map = (this.map = new EsriMap({ basemap: this.state.basemap(), ground: new Ground() }));
    const g = D.site.globe;
    const view = (this.view = new SceneView({
      container, map, qualityProfile: 'medium', viewingMode: 'global',
      camera: { position: { x: g[0] - 0.004, y: g[1] - 0.028, z: 2300, spatialReference: SR }, heading: 8, tilt: 52 },
      environment: { lighting: { type: 'sun', date: new Date(Date.UTC(2030, 10, 15, 7, 30)), directShadowsEnabled: true, displayUTCOffset: 3 }, atmosphereEnabled: true, starsEnabled: false },
      popupEnabled: false, ui: { components: ['attribution', 'zoom', 'navigation-toggle', 'compass'] }
    }));
    await this.layers.init(map, D);
    // network hiccup on the imagery service -> fall back to another basemap instead of a blank globe
    this.handles.push(view.on('layerview-create-error', ev => {
      if (!map.basemap || !map.basemap.baseLayers.includes(ev.layer)) return;
      const next = BASEMAP_FALLBACK[BASEMAP_FALLBACK.indexOf(map.basemap.id ?? '') + 1];
      if (next) {
        console.warn('Basemap failed, switching to', next);
        this.state.basemap.set(next);
        map.basemap = next;
      }
    }));
    this.handles.push(view.on('pointer-move', ev => this.hoverCursor(ev, container)));

    const hooks = this.injector.get(SCENE_HOOKS);
    hooks.afterLayers();
    // 'immediate-click': plain 'click' is held back ~250 ms by ArcGIS to rule out a double-click
    this.handles.push(view.on('immediate-click', ev => void hooks.click(ev).catch(e => console.warn(e))));

    await view.when();
    this.readyResolve(view);
    await Promise.race([reactiveUtils.whenOnce(() => !view.updating), sleep(12000)]);
    this.loader.update(l => ({ ...l, phase: 'fade' }));
    this.timers.push(setTimeout(() => this.loader.update(l => ({ ...l, phase: 'gone' })), 1000));
    this.isReady.set(true);
    this.injector.get(PAVILION_RENDERER).focusDetail();
    this.timers.push(setTimeout(() => this.toast.show('Tip: click any building to open it in 3D with its floor plans · try ✨ Imagine you\'re here'), 2500));
  }

  /**
   * Tests for graphics under the pointer and toggles the cursor between pointer and default.
   *
   * @param ev Pointer move event.
   * @param container DOM div element containing the SceneView.
   */
  private hoverCursor(ev: __esri.ViewPointerMoveEvent, container: HTMLDivElement): void {
    const view = this.view, L = this.layers;
    if (!view || this.state.cinema() || this.hovering) return;
    this.hovering = true;
    view.hitTest(ev, { include: [L.plots, L.buildings, L.pavLite, L.services, L.pav] })
      .then(h => { container.style.cursor = h.results.some(r => r.type === 'graphic') ? 'pointer' : ''; })
      .catch(() => undefined)
      .then(() => setTimeout(() => (this.hovering = false), 80));
  }

  /**
   * Animates the 3D scene camera to a target location, zoom, or camera configuration.
   *
   * @param target Target point, camera, or geometry.
   * @param ms Animation duration in milliseconds (default 1800ms).
   * @returns Promise resolving when flight completes.
   */
  fly(target: __esri.GoToTarget3D, ms?: number): Promise<void> {
    if (!this.view) return Promise.resolve();
    return this.view.goTo(target, { duration: ms || 900 }).catch(() => undefined);
  }

  /**
   * Creates an ArcGIS Point geometry from longitude, latitude, and optional elevation in meters.
   *
   * @param p [longitude, latitude] coordinate pair.
   * @param z Altitude/elevation in meters (default 0).
   * @returns Point geometry in WGS84 spatial reference.
   */
  pt(p: readonly number[], z = 0): Point {
    return new Point({ x: p[0], y: p[1], z, spatialReference: SR });
  }

  /** Descriptive alias for {@link pt}. */
  createPoint(p: readonly number[], z = 0): Point {
    return this.pt(p, z);
  }

  /**
   * Smoothly animates the camera to frame a specific district block.
   *
   * @param center [longitude, latitude] center of the district.
   * @returns Promise resolving when flight completes.
   */
  flyToDistrict(center: LonLat): Promise<void> {
    return this.fly({ target: this.pt(center), zoom: 16.8, tilt: 55, heading: 0 });
  }

  /**
   * Resets the camera back to the default high-angle site overview facing north.
   *
   * @returns Promise resolving when camera animation completes.
   */
  resetView(): Promise<void> {
    const g = this.data.d.site.globe;
    return this.fly({ position: { x: g[0] - 0.004, y: g[1] - 0.028, z: 2300, spatialReference: SR }, heading: 8, tilt: 52 } as __esri.GoToTarget3D, 2000);
  }

  /**
   * Adjusts the virtual sun position by minutes after midnight (UTC+3 Riyadh time).
   *
   * @param mins Number of minutes past midnight (e.g. 630 = 10:30 AM).
   */
  setSunTime(mins: number): void {
    const lighting = this.view?.environment.lighting;
    if (lighting && 'date' in lighting) lighting.date = new Date(Date.UTC(2030, 10, 15, 0, 0) + (mins - 180) * 60000);
  }

  /**
   * Applies lighting mode preset (day, sunset, or night) adjusting sun angle, stars, and night streetlights.
   *
   * @param mode Selected lighting mode.
   * @param silent Whether to suppress user toast notification.
   */
  applyLight(mode: LightMode, silent = false): void {
    this.state.light.set(mode);
    const view = this.view;
    if (!view) return;
    const env = view.environment;
    this.setSunTime(SUN_MINUTES[mode]);
    env.lighting.directShadowsEnabled = true;
    env.starsEnabled = mode === 'night';
    this.layers.setNight(mode === 'night');
    if (!silent && mode === 'night') this.toast.show('Night mode: street lights and pavilion lighting on');
  }

  /**
   * Sets the visual render mode across the digital twin (realistic, blueprint, or sketch).
   *
   * @param mode Render style mode.
   */
  setStyle(mode: RenderMode): void {
    if (!this.map || !this.view) return;
    this.layers.applyStyle(mode);
    this.layers.buildLitePavilions();
    this.injector.get(PAVILION_RENDERER).rebuildDetail();
    this.map.basemap = (mode === 'blueprint' ? 'dark-gray-vector' : mode === 'sketch' ? 'gray-vector' : this.state.basemap());
    this.view.environment.atmosphereEnabled = mode !== 'blueprint';
  }

  /**
   * Updates atmospheric weather conditions (sunny, cloudy, rainy, or foggy).
   *
   * @param w Weather mode preset.
   */
  setWeather(w: WeatherMode): void {
    this.state.weather.set(w);
    if (!this.view) return;
    try {
      this.view.environment.weather = WEATHER[w];
    } catch {
      this.toast.show('Weather effects need a newer browser/GPU');
    }
    if (w === 'foggy') this.toast.show('Dust haze – plan shaded routes and HVAC filters');
  }

  /**
   * Changes the active basemap layer on the 3D globe.
   *
   * @param id Basemap identifier (e.g. 'satellite', 'osm', 'dark-gray-vector').
   */
  setBasemap(id: string): void {
    this.state.basemap.set(id);
    if (this.map && this.layers.mode() === 'realistic') this.map.basemap = id;
  }

  /**
   * Captures a high-resolution 2400px PNG screenshot of the current SceneView and prompts download.
   */
  async screenshot(): Promise<void> {
    if (!this.view) return;
    try {
      const s = await this.view.takeScreenshot({ format: 'png', width: 2400 });
      const a = document.createElement('a');
      a.href = s.dataUrl;
      a.download = `expo2030-${this.state.selected() || 'view'}.png`;
      a.click();
      this.toast.show('Screenshot saved');
    } catch {
      this.toast.show('Screenshot failed');
    }
  }

  /**
   * Cleans up event listeners, active timers, layers, and destroys the SceneView.
   */
  destroy(): void {
    this.handles.forEach(h => h.remove());
    this.handles = [];
    this.timers.forEach(t => clearTimeout(t));
    this.timers = [];
    this.layers.destroy();
    this.view?.destroy();
    this.view = null;
    this.map = null;
    this.isReady.set(false);
  }
}
