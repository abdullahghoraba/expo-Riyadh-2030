import { Injectable, Injector, effect, inject, signal, untracked } from '@angular/core';
import Camera from '@arcgis/core/Camera';
import { AnalysisService } from '../analysis/analysis.service';
import { beatText, fill, ltrIsolate } from '../core/arabic';
import { DataService } from '../core/data.service';
import { along, angLerp, clamp, ease, heading, lerp, move, offset, pathLength, sleep, smooth } from '../core/geo';
import { Lang, LightMode, LonLat, NarrationStep } from '../core/models';
import { StateService } from '../core/state.service';
import { LayersService } from '../map/layers.service';
import { SceneService } from '../map/scene.service';
import { PavilionService } from '../pavilion/pavilion.service';
import { PlotSelectionService } from '../plots/plot-selection.service';
import { AudioService } from './audio.service';
import { NarrationVars, narrationValues, spokenLine } from './narration-lines';

export type CinemaMode = 'imagine' | 'tour';

export interface SubtitleState { text: string; rtl: boolean; show: boolean }
export interface CtaState { title: string; sub: string; detail: string; submitLabel: string; lang: Lang }

/** Thrown (and swallowed) to abort a running cinematic. */
const CANCEL = { cancel: true } as const;
const UI_COMPONENTS = ['attribution', 'zoom', 'navigation-toggle', 'compass'];

interface Saved { light: LightMode; floor: number; explode: boolean; labels: boolean; camera: Camera }

/**
 * "Imagine you're here" first-person experience + guided aerial tour, with voice-over and subtitles
 * (port of reference js/imagine.js). While running it sets `StateService.cinema`.
 */
@Injectable({ providedIn: 'root' })
export class ImagineService {
  private readonly data = inject(DataService);
  private readonly state = inject(StateService);
  private readonly scene = inject(SceneService);
  private readonly layers = inject(LayersService);
  private readonly pavilion = inject(PavilionService);
  private readonly audio = inject(AudioService);
  private readonly analysis = inject(AnalysisService);
  private readonly injector = inject(Injector);

  readonly mode = signal<CinemaMode>('imagine');
  readonly dots = signal<{ n: number; i: number }>({ n: 0, i: 0 });
  readonly subtitle = signal<SubtitleState>({ text: '', rtl: false, show: false });
  readonly cta = signal<CtaState | null>(null);

  private token = 0;
  private saved: Saved | null = null;
  private subTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Warm the neural voice cache for the opening line of Imagine and of the tour (both have no per-plot values)
    // once the map is up, so the first narration starts immediately instead of after a few seconds of synthesis.
    let warm: ReturnType<typeof setTimeout> | undefined;
    effect(() => {
      const lang = this.state.lang();
      if (!this.scene.isReady() || !this.data.loaded) return;
      clearTimeout(warm);
      warm = setTimeout(() => untracked(() => {
        const N = this.data.d.narration, opening = [N.imagine[0], N.tour[0]].filter(Boolean);
        void this.audio.prefetch(opening.map(b => spokenLine(b, lang, {})), lang);
      }), 3000);
    });
    let previousLanguage = this.state.lang();
    let previousVoice = this.audio.selectedVoice();
    effect(() => {
      const lang = this.state.lang(), voice = this.audio.selectedVoice();
      if (lang !== previousLanguage || voice !== previousVoice) this.audio.stop();
      previousLanguage = lang;
      previousVoice = voice;
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', e => {
        if (e.key === 'Escape' && this.running) {
          this.cta.set(null);
          this.exit();
        }
      });
    }
  }

  get running(): boolean {
    return this.state.cinema();
  }

  private get plots(): PlotSelectionService {
    return this.injector.get(PlotSelectionService);
  }

  private get view() {
    const v = this.scene.view;
    if (!v) throw CANCEL;
    return v;
  }

  // ---------------- helpers ----------------
  /**
   * Constructs an ArcGIS Camera instance with position, heading, tilt, and field-of-view.
   *
   * @param p [lon, lat] coordinate pair.
   * @param z Altitude/elevation in meters.
   * @param hdg Camera compass heading in degrees.
   * @param tilt Camera tilt in degrees (0 = straight down, 90 = horizontal).
   * @param fov Field of view in degrees (default 62).
   */
  private cam(p: readonly number[], z: number, hdg: number, tilt: number, fov = 62): Camera {
    return new Camera({ position: this.scene.pt(p, z), heading: hdg, tilt, fov });
  }

  /**
   * Verifies that the current execution token matches the active session token; throws CANCEL if aborted.
   *
   * @param tok Session token to validate.
   */
  private check(tok: number): void {
    if (tok !== this.token) throw CANCEL;
  }

  /**
   * Executes an animated camera transition with token cancellation checking.
   *
   * @param tok Session token.
   * @param target Target camera or destination.
   * @param ms Transition duration in milliseconds.
   * @param easing Easing function name.
   */
  private async go(tok: number, target: __esri.GoToTarget3D, ms: number, easing: __esri.GoToOptions3D['easing'] = 'in-out-cubic'): Promise<void> {
    this.check(tok);
    await this.view.goTo(target, { duration: ms, easing, maxDuration: ms + 500 }).catch(() => undefined);
    this.check(tok);
  }

  /**
   * Waits for the specified milliseconds, throwing CANCEL if the session is aborted.
   *
   * @param tok Session token.
   * @param ms Milliseconds to wait.
   */
  private async wait(tok: number, ms: number): Promise<void> {
    await sleep(ms);
    this.check(tok);
  }

  /**
   * Runs an animation function on every requestAnimationFrame over the specified duration.
   *
   * @param tok Session token.
   * @param ms Total duration in milliseconds.
   * @param fn Callback called with progress factor t [0..1].
   */
  private animate(tok: number, ms: number, fn: (t: number) => void): Promise<void> {
    return new Promise((res, rej) => {
      const t0 = performance.now();
      const tick = (): void => {
        if (tok !== this.token) return rej(CANCEL);
        const t = Math.min(1, (performance.now() - t0) / ms);
        fn(t);
        if (t < 1) requestAnimationFrame(tick);
        else res();
      };
      tick();
    });
  }

  /**
   * Smoothly orbits the camera by a delta angle in degrees.
   *
   * @param tok Session token.
   * @param deg Degrees to rotate heading.
   * @param ms Duration in milliseconds.
   */
  private orbit(tok: number, deg: number, ms: number): Promise<void> {
    return this.go(tok, { heading: this.view.camera.heading + deg } as __esri.GoToTarget3D, ms, 'linear');
  }

  /**
   * Retrieves spatial navigation metadata for the currently inspected pavilion.
   */
  private meta() {
    const d = this.pavilion.detail();
    if (!d) throw CANCEL;
    return d.meta;
  }

  // ---------------- overlay ----------------
  /**
   * Displays subtitle overlay text with appropriate text direction (LTR or RTL).
   *
   * @param text Subtitle text to display.
   * @param lang Language ('en' or 'ar').
   */
  private showSubtitle(text: string, lang: Lang): void {
    this.subtitle.update(s => ({ ...s, show: false }));
    clearTimeout(this.subTimer);
    this.subTimer = setTimeout(() => this.subtitle.set({ text, rtl: lang === 'ar', show: true }), 250);
  }

  /**
   * Hides the subtitle overlay.
   */
  private hideSubtitle(): void {
    clearTimeout(this.subTimer);
    this.subtitle.update(s => ({ ...s, show: false }));
  }

  /**
   * Computes dynamic narration placeholders for the current plot (walk times, service distances, floors, GFA).
   */
  private vars(): NarrationVars {
    const p = this.state.currentPlot(), spec = this.state.detailSpec();
    if (!p || !spec) throw CANCEL;
    return narrationValues(this.data.d, this.data.router, p, this.pavilion.pavilionPlan(spec));
  }

  /**
   * Asks the neural narration server to synthesise every beat of this run up front, so each clip is cached
   * (instant playback) by the time the camera reaches it.
   */
  private prefetchNarration(list: NarrationStep[], v: NarrationVars): void {
    const lang = this.state.lang(), vals = v as unknown as Record<string, string | number>;
    void this.audio.prefetch(list.map(b => spokenLine(b, lang, vals)), lang);
  }

  /**
   * Executes a single narration beat, synchronizing spoken voice synthesis, subtitles,
   * progress indicator dots, and concurrent camera flight animation.
   *
   * @param tok Session token.
   * @param list Array of narration steps.
   * @param i Zero-based step index.
   * @param v Computed narration variables.
   * @param anim Optional camera animation callback.
   */
  private async beat(tok: number, list: NarrationStep[], i: number, v: NarrationVars, anim?: () => Promise<void>): Promise<void> {
    this.check(tok);
    this.dots.set({ n: list.length, i });
    const b = list[i];
    const vals = v as unknown as Record<string, string | number>;
    const narrate = async (): Promise<void> => {
      let lang: Lang, voice: string;
      do {
        this.check(tok);
        lang = this.state.lang();
        voice = this.audio.selectedVoice();
        const t = lang === 'ar' ? beatText(b, vals) : { shown: fill(b.en, vals), spoken: '' };
        this.showSubtitle(t.shown, lang);
        await this.audio.speak(t.spoken || t.shown, lang);
        this.check(tok);
      } while (lang !== this.state.lang() || voice !== this.audio.selectedVoice());
    };
    await Promise.all([
      narrate(),
      anim ? anim() : Promise.resolve()
    ]);
    await this.wait(tok, 350);
  }

  // ---------------- lifecycle ----------------
  /**
   * Initializes cinematic mode: snapshots camera and scene settings, hides UI chrome,
   * stops analysis tools, sets cinema flag, and returns a new session token.
   *
   * @param mode Selected cinematic mode ('imagine' or 'tour').
   * @returns Active session token (or -1 if unable to start).
   */
  private enter(mode: CinemaMode): number {
    const view = this.scene.view;
    if (!view || !this.data.loaded || !this.state.currentPlot()) return -1;
    this.token++;
    this.mode.set(mode);
    this.saved = { light: this.state.light(), floor: this.state.floor(), explode: this.state.explode(), labels: this.state.labels(), camera: view.camera.clone() };
    this.analysis.stop();
    this.plots.closeCards();
    this.cta.set(null);
    this.dots.set({ n: 0, i: 0 });
    this.state.cinema.set(true);
    void this.audio.init();
    view.ui.components = [];
    // make sure the plot's own concept pavilion is the detailed model
    const p = this.state.currentPlot()!;
    if (this.state.detailId() !== p.pid) this.pavilion.openDetail(this.pavilion.plotSpec(p.pid), { fly: false });
    return this.token;
  }

  /**
   * Toggles subsurface utility visibility and ground surface opacity during tour animations.
   *
   * @param on True to enable underground transparency.
   */
  private underground(on: boolean): void {
    const L = this.layers, ground = this.scene.map?.ground;
    L.utilities.visible = on;
    if (ground) {
      ground.opacity = on ? 0.3 : 1;
      ground.navigationConstraint = { type: on ? 'none' : 'stay-above' };
    }
    L.seeThrough(on, 0.35);
  }

  /**
   * Restores initial user configuration (lighting, floors, explosion, camera) captured at cinema entry.
   *
   * @param keepCamera Whether to preserve the current cinematic camera view instead of resetting.
   */
  private restore(keepCamera: boolean): void {
    const s = this.saved;
    if (!s) return;
    this.state.floor.set(s.floor);
    this.state.explode.set(s.explode);
    this.state.labels.set(s.labels);
    this.pavilion.rebuildDetail();
    this.scene.applyLight(s.light);
    this.underground(false);
    this.plots.drawNearRoutes();
    if (!keepCamera) void this.scene.view?.goTo(s.camera, { duration: 1500 }).catch(() => undefined);
  }

  /**
   * Exits cinematic mode, restores view UI controls, and stops narration audio.
   *
   * @param keepCamera Whether to preserve the camera viewpoint at the moment of exit.
   */
  exit(keepCamera = false): void {
    if (!this.running) return;
    this.token++;
    this.audio.stop();
    this.state.cinema.set(false);
    this.hideSubtitle();
    if (this.scene.view) this.scene.view.ui.components = UI_COMPONENTS;
    this.restore(keepCamera);
    this.saved = null;
  }

  /**
   * Handles user click on the cinema exit button or pressing Escape.
   */
  stop(): void {
    this.cta.set(null);
    this.exit();
  }

  /**
   * Displays the final call-to-action summary card on top of the 3D scene after narration finishes.
   *
   * @param v Computed plot narration variables.
   */
  private showCta(v: NarrationVars): void {
    const p = this.state.currentPlot();
    if (!p) return;
    const lang = this.state.lang();
    if (lang === 'ar') {
      this.cta.set({
        lang,
        title: `القطعة ${ltrIsolate(p.pid)}`,
        sub: `${v['districtAr']} · ${ltrIsolate('1,600')} متر مربع · ${v['floorsArTxt']} · مساحة إجمالية ${v['gfaArTxt']}`,
        detail: `على بُعد ${v['walkArTxt']} سيرًا من محطة إكسبو · الإسعافات الأولية على بُعد ${v['aidArTxt']}`,
        submitLabel: this.state.plotStatus(p.pid) === 'pending' ? 'عرض الطلب' : 'تقديم طلب لهذه القطعة'
      });
      return;
    }
    this.cta.set({
      lang,
      title: `Plot ${p.pid}`,
      sub: `${v.district} · 1,600 m² · ${v.floors} floors · ${v.gfa} m² GFA`,
      detail: `${v.walk}-minute walk from Expo Station · first aid ${v.aid} m away`,
      submitLabel: this.state.plotStatus(p.pid) === 'pending' ? 'View submission' : 'Submit this plot'
    });
  }

  /**
   * Handles user click on the CTA "Submit plot" action button.
   */
  ctaSubmit(): void {
    this.cta.set(null);
    this.exit(true);
    this.plots.openSubmit();
  }

  /**
   * Handles user click on the CTA "Replay" action button.
   */
  ctaReplay(): void {
    const m = this.mode();
    this.cta.set(null);
    this.exit(true);
    setTimeout(() => (m === 'tour' ? this.startTour() : this.startImagine()), 300);
  }

  /**
   * Closes the final CTA card while retaining current camera view.
   */
  ctaClose(): void {
    this.cta.set(null);
    this.exit(true);
  }

  /**
   * Completes a cinematic journey and displays the final call-to-action card.
   *
   * @param n Total number of narration beats.
   * @param v Narration variables.
   */
  private finish(n: number, v: NarrationVars): void {
    this.dots.set({ n, i: n });
    this.hideSubtitle();
    this.showCta(v);
  }

  /**
   * Handles errors or cancellations during cinematic playback.
   */
  private fail(e: unknown): void {
    if (e === CANCEL) return;
    console.error(e);
    this.exit();
  }

  // ---------------- IMAGINE ----------------
  /**
   * Starts the 7-beat immersive first-person "Imagine you're here" visitor journey:
   * arrival flight, pedestrian walk, façade approach, interior dollhouse,
   * district amenities, sunset rooftop view, and night lighting.
   */
  async startImagine(): Promise<void> {
    const tok = this.enter('imagine');
    if (tok < 0) return;
    try {
      const N = this.data.d.narration.imagine, v = this.vars(), m = () => this.meta(), globe = this.data.d.site.globe;
      this.prefetchNarration(N, v);
      this.scene.applyLight('day', true);
      // 1. arrival: drone drop from the sky onto the station forecourt
      const r = v.route.coords, len = pathLength(r);
      let d0 = 0;
      while (d0 < len * 0.5 && this.pavilion.insideBuilding(along(r, d0).p)) d0 += 4;
      d0 += 6;
      const a0 = along(r, d0), h0 = along(r, d0 + 25).h;
      this.view.camera = this.cam(move(a0.p, h0 + 180, 900), 650, h0, 55);
      await this.beat(tok, N, 0, v, async () => {
        await this.go(tok, this.cam(a0.p, 1.7, h0 - 70, 90), 5200);
        await this.animate(tok, 4200, t => { this.view.camera = this.cam(a0.p, 1.7, h0 - 70 + 70 * ease(t), 90 + 4 * Math.sin(t * Math.PI)); });
      });
      // 2. walk the real route (eye level → low drone → eye level)
      const dur = clamp((len - d0) / 32, 14, 26) * 1000;
      let hd = h0;
      await this.beat(tok, N, 1, v, () => this.animate(tok, dur, t => {
        const d = d0 + (len - d0) * smooth(t), a = along(r, d), ahead = along(r, Math.min(len, d + 30));
        const tgt = d > len - 25 ? heading(a.p, m().center) : heading(a.p, ahead.p);
        hd = angLerp(hd, tgt, 0.06);
        const lift = Math.pow(Math.sin(Math.PI * t), 1.6);
        this.view.camera = this.cam(a.p, 1.7 + 26 * lift, hd, 90 - 18 * lift);
      }));
      // 3. at the plot: look up at the façade, then walk to the door
      const fh = (m().frontHeading + 180) % 360;
      await this.beat(tok, N, 2, v, async () => {
        await this.go(tok, this.cam(m().approach, 1.7, fh, 84), 2500);
        await this.animate(tok, 4500, t => { this.view.camera = this.cam(m().approach, 1.7, fh, 84 + 22 * ease(t)); });
        await this.animate(tok, 3500, t => {
          const p: LonLat = [lerp(m().approach[0], m().door[0], ease(t)), lerp(m().approach[1], m().door[1], ease(t))];
          this.view.camera = this.cam(p, 1.7, fh, 106 - 14 * t);
        });
      });
      // 4. inside: ground floor open, then exploded dollhouse
      this.state.floor.set(0); this.state.explode.set(false); this.state.labels.set(true); this.pavilion.rebuildDetail();
      await this.beat(tok, N, 3, v, async () => {
        await this.animate(tok, 5200, t => {
          const p: LonLat = [lerp(m().door[0], m().lobby[0], ease(t)), lerp(m().door[1], m().lobby[1], ease(t))];
          this.view.camera = this.cam(p, 2, fh + 30 * Math.sin(t * Math.PI * 1.5), 88);
        });
        this.state.floor.set(-1); this.state.explode.set(true); this.pavilion.rebuildDetail();
        await this.go(tok, this.cam(move(m().center, m().frontHeading + 35, 85), 70, (m().frontHeading + 215) % 360, 58), 3200);
        await this.orbit(tok, -40, 4200);
      });
      // 5. services around the plot (network routes)
      this.state.explode.set(false); this.state.floor.set(-1); this.state.labels.set(false); this.pavilion.rebuildDetail(); this.plots.drawNearRoutes();
      await this.beat(tok, N, 4, v, async () => {
        await this.go(tok, { target: this.scene.pt(m().center), zoom: 17, tilt: 52, heading: m().frontHeading + 180 } as __esri.GoToTarget3D, 3200);
        await this.orbit(tok, 55, 8000);
      });
      // 6. rooftop terrace looking at the Globe
      const hr = heading(m().roofFront, globe);
      await this.beat(tok, N, 5, v, async () => {
        await this.go(tok, this.cam(m().roofFront, m().roofZ + 1.7, hr - 50, 88), 3000);
        await this.animate(tok, 7500, t => { this.view.camera = this.cam(m().roofFront, m().roofZ + 1.7, hr - 50 + 70 * ease(t), 88 + 2 * t); });
      });
      // 7. sunset → night, crane back
      await this.beat(tok, N, 6, v, async () => {
        const c = this.view.camera, start = c.position, back = move(m().center, hr + 180, 240);
        let night = false;
        await this.animate(tok, 10000, t => {
          this.scene.setSunTime(16 * 60 + 20 + 90 * t);
          if (!night && t > 0.55) {
            night = true;
            this.layers.setNight(true);
            this.view.environment.starsEnabled = true;
          }
          const e = ease(t), p: LonLat = [lerp(start.x, back[0], e), lerp(start.y, back[1], e)];
          this.view.camera = this.cam(p, lerp(start.z ?? 0, 150, e), angLerp(c.heading, hr, e), lerp(c.tilt, 62, e));
        });
      });
      this.state.light.set('night');
      this.finish(N.length, v);
    } catch (e) {
      this.fail(e);
    }
  }

  // ---------------- GUIDED TOUR ----------------
  /**
   * Starts the 7-beat guided aerial site tour across the Expo site:
   * grand site overview, The Globe centerpiece, national and theme pavilions,
   * thematic districts, Riyadh Metro terminus, underground infrastructure, and your pavilion.
   */
  async startTour(): Promise<void> {
    const tok = this.enter('tour');
    if (tok < 0) return;
    try {
      const D = this.data.d, N = D.narration.tour, v = this.vars(), globe = D.site.globe;
      this.prefetchNarration(N, v);
      const bp = (t: string) => D.buildings.features.find(f => f.properties.type === t)!.properties;
      const theme = D.buildings.features.filter(f => f.properties.type === 'theme').map(f => f.properties);
      const metro = bp('metro');
      const pt = (p: readonly number[], z = 0) => this.scene.pt(p, z);
      this.scene.applyLight('day', true);
      const steps: (() => Promise<void>)[] = [
        async () => {
          this.view.camera = this.cam(offset(globe, -2600, -3200), 2600, 38, 40);
          await this.go(tok, { target: pt(globe), zoom: 15, tilt: 50, heading: 25 } as __esri.GoToTarget3D, 6000);
          await this.orbit(tok, 25, 4000);
        },
        async () => {
          await this.go(tok, this.cam(move(globe, 200, 150), 70, 20, 72), 4000);
          await this.orbit(tok, 60, 6500);
        },
        async () => {
          const s = bp('saudi');
          await this.go(tok, { target: pt([s.cx, s.cy], 20), zoom: 17.2, tilt: 62, heading: 300 } as __esri.GoToTarget3D, 3500);
          for (const t of theme.slice(0, 2)) await this.go(tok, { target: pt([t.cx, t.cy], 10), zoom: 17.4, tilt: 60, heading: heading(globe, [t.cx, t.cy]) } as __esri.GoToTarget3D, 3200);
        },
        async () => {
          for (const d of D.site.districts) await this.go(tok, { target: pt(d.block.center), zoom: 16.6, tilt: 55, heading: (d.block.rotation + 360) % 360 } as __esri.GoToTarget3D, 2600);
        },
        async () => {
          await this.go(tok, { target: pt([metro.cx, metro.cy], 10), zoom: 17, tilt: 66, heading: 200 } as __esri.GoToTarget3D, 3500);
          await this.orbit(tok, -50, 6000);
        },
        async () => {
          this.underground(true);
          try {
            await this.go(tok, this.cam(offset(globe, -150, -260), 60, 25, 72), 3500);
            await this.orbit(tok, 30, 6000);
          } finally {
            this.underground(false);
          }
        },
        async () => {
          const m = this.meta(), s = this.state.detailSpec()!, h = (m.frontHeading + 160) % 360, d = Math.max(s.W, s.D, m.height) * 2.1 + 30;
          await this.go(tok, this.cam(move(m.center, h + 180, d * 0.9), m.height * 0.4 + d * 0.44, h, 64), 4000);
          await this.orbit(tok, 40, 5000);
        }
      ];
      for (let i = 0; i < steps.length; i++) await this.beat(tok, N, i, v, steps[i]);
      this.finish(N.length, v);
    } catch (e) {
      this.fail(e);
    }
  }
}
