import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

export interface MenuAction {
  id: string;
  label: string;
  hint?: string;
}

@Component({
  selector: 'app-context-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './context-menu.component.html',
  styleUrl: './context-menu.component.css',
})
export class ContextMenuComponent {
  readonly title = input.required<string>();
  readonly actions = input.required<readonly MenuAction[]>();
  readonly x = input.required<number>();
  readonly y = input.required<number>();

  readonly select = output<string>();
  readonly close = output<void>();

  protected armed = false;

  protected onScrimClick(): void {
    if (this.armed) this.close.emit();
  }

  protected onScrimContext(event: Event): void {
    event.preventDefault();
    this.close.emit();
  }
}
