import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { arrowShape, type TargetArrow } from '../target-arrows';

@Component({
  selector: 'app-target-arrows',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './target-arrows.component.html',
  styleUrl: './target-arrows.component.css',
})
export class TargetArrowsComponent {
  readonly arrows = input.required<readonly TargetArrow[]>();

  protected readonly shapes = computed(() =>
    this.arrows().flatMap((arrow) => {
      const shape = arrowShape(arrow.from, arrow.to);
      return shape ? [{ id: arrow.id, kind: arrow.kind, ...shape }] : [];
    }),
  );
}
