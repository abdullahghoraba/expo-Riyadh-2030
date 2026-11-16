import { TranslatePipe } from '../../core/translate.pipe';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AnalysisService } from '../analysis.service';

/** "GIS analysis" tab: the list of the 14 tools (reference analysis.js renderList). */
@Component({
  selector: 'app-analysis-tab',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analysis-tab.component.html',
  styleUrl: './analysis-tab.component.scss'
})
export class AnalysisTabComponent {
  protected readonly analysis = inject(AnalysisService);
}
