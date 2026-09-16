import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import type { LogLine } from '../../core/game-log';
import { ManaTextComponent } from '../../ui/mana-symbol.component';
import { SheetComponent } from '../../ui/sheet.component';
import { SheetHeaderComponent } from '../../ui/sheet-header.component';

@Component({
  selector: 'app-game-log',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaTextComponent, SheetComponent, SheetHeaderComponent],
  templateUrl: './game-log.component.html',
  styleUrl: './game-log.component.css',
})
export class GameLogComponent implements AfterViewInit {
  readonly lines = input.required<readonly LogLine[]>();
  readonly close = output<void>();

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  readonly paused = signal(false);
  protected readonly count = computed(
    () => `${this.lines().length} ${this.lines().length === 1 ? 'line' : 'lines'}`,
  );

  constructor() {
    effect(() => {
      this.lines();
      if (this.paused()) return;
      queueMicrotask(() => this.scrollToBottom());
    });
  }

  ngAfterViewInit(): void {
    this.scrollToBottom();
  }

  onScroll(): void {
    const element = this.scroller().nativeElement;

    this.paused.set(element.scrollHeight - element.scrollTop - element.clientHeight >= 24);
  }

  resume(): void {
    this.paused.set(false);
    this.scrollToBottom();
  }

  private scrollToBottom(): void {
    const element = this.scroller().nativeElement;
    element.scrollTop = element.scrollHeight;
  }
}
