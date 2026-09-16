import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { X, type IconNode } from 'lucide';
import { ManaTextComponent } from './mana-symbol.component';
import { IconComponent } from './icon.component';

@Component({
  selector: 'app-sheet-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaTextComponent, IconComponent],
  host: { '[class.centered]': 'centered()' },
  template: `
    @if (icon(); as node) {
      <app-icon class="glyph" [class.accent]="accentGlyph()" [icon]="node" />
    } @else if (glyph(); as glyph) {
      <span class="glyph" [class.accent]="accentGlyph()" aria-hidden="true">{{ glyph }}</span>
    }
    <ng-content select="[sheet-title]" />
    @if (heading(); as text) {
      <h2><app-mana-text [text]="text" /></h2>
    }
    @if (count(); as count) {
      <span class="count">{{ count }}</span>
    }
    <span class="spacer"></span>
    <ng-content />
    <button
      type="button"
      class="sheet-button close"
      aria-label="close"
      [title]="closeTitle()"
      (click)="close.emit()"
    >
      <app-icon [icon]="closeIcon" />
    </button>
  `,
  styles: `
    :host {
      display: flex;
      gap: 0.45rem;
      align-items: baseline;
      padding-bottom: 0.4rem;
      border-bottom: 1px solid var(--line);
    }

    :host(.centered) {
      gap: 0.6rem;
      align-items: center;
    }

    .glyph {
      font-size: 1rem;
    }

    .glyph.accent {
      color: var(--commander);
    }

    h2 {
      margin: 0;
      font-size: 0.95rem;
      font-weight: 600;
    }

    .count {
      color: var(--muted);
      font-size: 0.66rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .spacer {
      flex: 1;
    }

    .close {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      font-size: 0.8rem;
    }
  `,
})
export class SheetHeaderComponent {
  readonly icon = input<IconNode | null>(null);
  readonly glyph = input<string | null>(null);

  readonly accentGlyph = input(false);
  readonly heading = input<string | null>(null);
  readonly count = input<string | null>(null);
  readonly closeTitle = input('close (escape)');

  readonly centered = input(false);

  readonly close = output<void>();

  protected readonly closeIcon = X;
}
