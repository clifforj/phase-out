import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { sameTurnText, TURN_STOPS, turnProgress, turnStopIndex } from '../../rules/turn-timeline';

@Component({
  selector: 'app-turn-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './turn-timeline.component.html',
  styleUrl: './turn-timeline.component.css',
})
export class TurnTimelineComponent {
  readonly turn = input.required<number>();
  readonly round = input<number | null>(null);
  readonly phase = input<string | null>(null);
  readonly step = input<string | null>(null);
  readonly activeIsMe = input(false);

  protected readonly stops = TURN_STOPS;
  protected readonly index = computed(() => turnStopIndex(this.step()));
  protected readonly progress = computed(() => turnProgress(this.index()) * 100);

  protected readonly stepLabel = computed(() => this.step() ?? this.phase() ?? null);

  protected readonly phaseLabel = computed(() => {
    const phase = this.phase();
    const step = this.step();
    return phase && step && !sameTurnText(phase, step) ? phase : null;
  });
}
