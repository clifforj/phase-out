import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { ArrowLeft, ChevronDown, ChevronUp, Video } from 'lucide';
import type { TurnState } from '../../rules/turn-state';
import type { CameraView } from '../scene-types';
import { IconComponent } from '../../ui/icon.component';
import { TurnTimelineComponent } from './turn-timeline.component';

@Component({
  selector: 'app-board-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TurnTimelineComponent, IconComponent],
  templateUrl: './board-header.component.html',
  styleUrl: './board-header.component.css',
})
export class BoardHeaderComponent {
  readonly turn = input.required<TurnState | null>();
  readonly logCount = input.required<number>();
  readonly views = input.required<readonly CameraView[]>();

  readonly logOpen = model.required<boolean>();
  readonly popoverOpen = model.required<boolean>();

  readonly leave = output<void>();
  readonly view = output<CameraView>();

  protected readonly leaveIcon = ArrowLeft;
  protected readonly camerasIcon = Video;
  protected readonly chevronUp = ChevronUp;
  protected readonly chevronDown = ChevronDown;
}
