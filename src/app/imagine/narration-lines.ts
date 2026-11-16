import { beatText, fill, narrationVars } from '../core/arabic';
import { fmt } from '../core/geo';
import { Lang, NarrationStep, PlotProps, SiteData } from '../core/models';
import { WalkRoute, WalkRouter } from '../core/walk-router';

/** Values filled into narration.json placeholders (English + Arabic forms). */
export type NarrationVars = Record<string, string | number> & {
  walk: number; route: WalkRoute; plot: string; district: string; floors: number; gfa: string; aid: number;
};

/**
 * Narration placeholders for a plot: walk from the metro station, nearest services, and the pavilion's floors / gross
 * floor area. Kept free of Angular so tools/tts-prerender.mjs can compute exactly the lines the app will speak.
 *
 * @param D Site data (site.json + services layer).
 * @param router Walking network built from the streets layer.
 * @param p The plot being narrated.
 * @param plan Floor plan of the plot's current pavilion design.
 */
export function narrationValues(
  D: Pick<SiteData, 'site' | 'services'>, router: WalkRouter, p: PlotProps, plan: { floors: readonly unknown[]; gfa: number }
): NarrationVars {
  const st = D.site, mpm = st.walkingSpeedMpm;
  const d = st.districts.find(x => x.id === p.district)!;
  const spt = router.from([p.ex, p.ey]);
  const near = (t: string): number =>
    Math.round(Math.min(...D.services.features.filter(f => f.properties.type === t).map(f => router.to(spt, f.geometry.coordinates).length)) / 10) * 10;
  const walk = router.route(st.station, [p.ex, p.ey]);
  const gfa = Math.round(plan.gfa / 10) * 10;
  const v = {
    walk: Math.max(1, Math.round(walk.length / mpm)), walkLen: walk.length, route: walk, plot: p.pid, district: d.name, districtAr: d.nameAr,
    floors: plan.floors.length, gfa: fmt(gfa), restroom: near('restroom'), prayer: near('prayer'), aid: near('aid')
  };
  // Arabic phrases with correct number–noun agreement: xxxAr (spoken, words) and xxxArTxt (subtitle, digits)
  return Object.assign(v, narrationVars({ ...v, route: undefined, gfa })) as unknown as NarrationVars;
}

/**
 * The text the voice-over reads for a beat (Arabic: the vocalized speech form, English: the filled template).
 */
export function spokenLine(b: NarrationStep, lang: Lang, v: Record<string, string | number>): string {
  if (lang !== 'ar') return fill(b.en, v);
  const t = beatText(b, v);
  return t.spoken || t.shown;
}

/** Whitespace-normalized narration text: the form sent to the narration server and the key of pre-recorded clips. */
export const speechKey = (text: string): string => text.replace(/\s+/g, ' ').trim();
