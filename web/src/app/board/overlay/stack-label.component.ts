import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ManaTextComponent } from '../../ui/mana-symbol.component';

@Component({
  selector: 'app-stack-label',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaTextComponent],
  host: {
    '[style.left.px]': 'left()',
    '[style.top.px]': 'top()',
  },
  template: `
    <strong><app-mana-text [text]="headline()" /></strong>
    @if (distinctDetail(); as detail) {
      <span class="detail"><app-mana-text [text]="detail" /></span>
    }
  `,
  styles: `
    @keyframes label-in {
      from {
        opacity: 0;
        transform: translate(-0.5rem, -50%);
      }
      to {
        opacity: 1;
        transform: translate(0, -50%);
      }
    }

    :host {
      position: absolute;
      transform: translate(0, -50%);
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      max-width: min(22rem, 30vw);
      padding: 0.45rem 0.7rem;
      border-left: 3px solid var(--accent);
      border-radius: 0 var(--radius-small) var(--radius-small) 0;
      background: var(--board-glass);
      backdrop-filter: var(--board-glass-filter);
      box-shadow: 0 0.3rem 0.9rem rgb(0 0 0 / 45%);
      font-size: 0.82rem;
      line-height: 1.35;
      animation: label-in 200ms ease-out;
    }

    .detail {
      color: var(--muted);
      font-size: 0.72rem;
    }
  `,
})
export class StackLabelComponent {
  readonly headline = input.required<string>();
  readonly detail = input('');
  readonly left = input.required<number>();
  readonly top = input.required<number>();

  protected readonly distinctDetail = computed(() => {
    const detail = this.detail().trim();
    if (!detail) return '';
    return this.headline().toLowerCase().includes(detail.toLowerCase()) ? '' : detail;
  });
}
