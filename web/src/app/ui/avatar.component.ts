import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { accentFor, avatarColor, initialsFor } from './accents';

@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="avatar"
      [class.empty]="empty()"
      [class.selectable]="selectable()"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="fontSize()"
      [style.background]="empty() ? null : color()"
      >{{ empty() ? '?' : initials() }}</span
    >
  `,
  styles: `
    :host {
      display: flex;
      flex: none;
    }

    .empty {
      background: none;
      box-shadow: inset 0 0 0 1px var(--line-strong);
      color: var(--faint);
    }

    .selectable {
      cursor: pointer;
    }
  `,
})
export class AvatarComponent {
  readonly name = input.required<string>();

  readonly hue = input<number | null>(null);
  readonly size = input(28);
  readonly fontSize = input(11);

  readonly empty = input(false);
  readonly selectable = input(false);

  protected readonly color = computed(() => {
    const hue = this.hue();
    return hue === null ? accentFor(this.name()) : avatarColor(hue);
  });
  protected readonly initials = computed(() => initialsFor(this.name()));
}
