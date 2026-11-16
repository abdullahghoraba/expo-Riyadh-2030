import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, viewChild } from '@angular/core';
import { drawPlan } from '../../cad/cad-drawing';
import { AnalysisService } from '../../analysis/analysis.service';
import { CadService } from '../../cad/cad.service';
import { fmt } from '../../core/geo';
import { StateService } from '../../core/state.service';
import { PAL, STYLES, pavilionPlan } from '../pavilion-plan';
import { PavilionService } from '../pavilion.service';

interface FloorChip { label: string; on: boolean; title: string; run: () => void }
interface ScheduleRow { floor: string; label: string; color: string; area: string }

/** "Build your pavilion" tab: KPIs, design options, floors, toggles, CAD preview and area schedule. */
@Component({
  selector: 'app-pavilion-tab',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pavilion-tab.component.html',
  styleUrl: './pavilion-tab.component.scss'
})
export class PavilionTabComponent {
  private readonly pavilion = inject(PavilionService);
  protected readonly state = inject(StateService);
  protected readonly analysis = inject(AnalysisService);
  protected readonly cad = inject(CadService);
  private readonly preview = viewChild.required<ElementRef<HTMLCanvasElement>>('cadPreview');

  protected readonly styles = Object.entries(STYLES);
  protected readonly palettes = PAL.map((p, i) => ({ i, name: p.name, bg: `linear-gradient(135deg,${p.fin} 55%,rgb(${p.glass}) 55%)` }));

  protected readonly view = computed(() => {
    const s = this.state.detailSpec(), det = this.pavilion.detail();
    if (!s || !det) return null;
    const P = pavilionPlan(s), isPlot = s.kind === 'plot', mine = isPlot && s.id === this.state.selected();
    const rooms = P.floors.reduce((a, f) => a + f.rooms.length, 0);
    const plot = isPlot ? this.state.plotById(s.id) : null;
    return {
      spec: s,
      mine,
      title: isPlot ? `${s.label} · ${s.name}` : s.name,
      sub: plot ? `${plot.districtName} · ${mine ? 'your concept – change it below' : 'participant pavilion'}` : `${s.btype} building · ${Math.round(s.W)} × ${Math.round(s.D)} m footprint`,
      kpis: [[P.floors.length, 'floors'], [fmt(P.gfa), 'm² GFA'], [fmt(det.meta.height, 1), 'm height'], [rooms, 'rooms']] as [string | number, string][]
    };
  });

  protected readonly floorChips = computed<FloorChip[]>(() => {
    const v = this.view();
    if (!v) return [];
    const s = v.spec, floor = this.state.floor(), P = pavilionPlan(s);
    const chips: FloorChip[] = [{ label: 'All', on: floor < 0, title: '', run: () => this.pavilion.setFloor(-1) }];
    P.floors.forEach((f, i) => chips.push({ label: i ? 'L' + i : 'G', on: floor === i, title: f.name, run: () => this.pavilion.setFloor(i) }));
    if (v.mine) {
      chips.push({ label: '−', on: false, title: 'Remove a floor', run: () => this.pavilion.design({ floors: Math.max(2, s.floors - 1) }) });
      chips.push({ label: '+', on: false, title: 'Add a floor', run: () => this.pavilion.design({ floors: Math.min(6, s.floors + 1) }) });
    }
    return chips;
  });

  protected readonly schedule = computed(() => {
    const s = this.state.detailSpec();
    if (!s) return null;
    const P = pavilionPlan(s), rows: ScheduleRow[] = [];
    P.floors.forEach(f => f.rooms.forEach((r, i) => rows.push({ floor: i ? '' : f.name, label: r.label, color: r.color, area: fmt(r.area, 1) })));
    return { rows, gfa: fmt(P.gfa) };
  });

  /** Floor shown in the CAD preview (reference `cadLevel`). */
  protected readonly cadFloorName = computed(() => {
    const s = this.state.detailSpec();
    if (!s) return '';
    const P = pavilionPlan(s), f = P.floors[Math.min(Math.max(0, this.state.floor()), P.floors.length - 1)];
    return `· ${f.name}`;
  });

  constructor() {
    // CAD preview of the isolated floor (or ground floor), redrawn whenever the model changes (reference drawCadPreview)
    afterRenderEffect(() => {
      const s = this.state.detailSpec(), level = this.cad.previewLevel();
      this.pavilion.detail();
      if (s) drawPlan(this.preview().nativeElement, s, level, { theme: 'blueprint' });
    });
  }

  /**
   * Focuses the 3D scene camera to frame the inspected pavilion.
   */
  protected focus(): void {
    this.pavilion.focusDetail();
  }

  /**
   * Applies an architectural style preset to the pavilion design.
   *
   * @param style Selected style identifier.
   */
  protected setStyle(style: string): void {
    this.pavilion.design({ style });
  }

  /**
   * Applies a façade material and color palette preset to the pavilion design.
   *
   * @param palette Index of the chosen palette.
   */
  protected setPalette(palette: number): void {
    this.pavilion.design({ palette });
  }

  /**
   * Extracts the boolean checked property from an input checkbox change event.
   *
   * @param ev DOM change event.
   * @returns Current checked boolean state.
   */
  protected checked(ev: Event): boolean {
    return (ev.target as HTMLInputElement).checked;
  }

  /**
   * Toggles exploded floor view in 3D.
   *
   * @param on True to explode floors.
   */
  protected setExplode(on: boolean): void {
    this.pavilion.setExplode(on);
  }

  /**
   * Toggles 3D room labels and area annotations.
   *
   * @param on True to show labels.
   */
  protected setLabels(on: boolean): void {
    this.pavilion.setLabels(on);
  }

  /**
   * Toggles interior 3D furniture models.
   *
   * @param on True to render furniture.
   */
  protected setFurniture(on: boolean): void {
    this.pavilion.setFurniture(on);
  }

  /**
   * Toggles the vertical section cut analysis plane tool.
   *
   * @param on True to activate slicing tool.
   */
  protected setSection(on: boolean): void {
    if (on) this.analysis.start('slice');
    else this.analysis.stop();
  }

  /**
   * Generates and downloads the full multi-floor DXF CAD package for this pavilion.
   */
  protected exportDxf(): void {
    const s = this.state.detailSpec();
    if (s) this.cad.downloadDxf(s);
  }
}
