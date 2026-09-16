import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="scrim" (click)="onScrimClick()"></div>
    <section
      class="sheet"
      role="dialog"
      aria-modal="true"
      [attr.aria-label]="ariaLabel()"
      [style.width]="widthCss()"
      [style.maxHeight]="maxHeight()"
      [style.gap]="gap()"
      [style.padding]="padding()"
    >
      <ng-content />
    </section>
  `,
  host: {
    '[style.z-index]': 'zIndex()',
  },
  styles: `
    :host {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;

      pointer-events: auto;
    }

    .scrim {
      position: absolute;
      inset: 0;
      background: rgb(8 8 10 / 30%);
      backdrop-filter: blur(5px);
    }

    .sheet {
      position: relative;
      display: flex;
      flex-direction: column;
      min-width: 0;
      max-width: calc(100vw - 2rem);
      border: 1px solid var(--line-input);
      border-radius: var(--radius-modal);

      background:
        linear-gradient(160deg, oklch(0.62 0.19 291 / 16%), transparent 60%), rgb(20 19 26 / 56%);
      backdrop-filter: blur(28px) saturate(170%);
      box-shadow: var(--shadow-modal);
    }
  `,
})
export class SheetComponent {
  readonly ariaLabel = input.required<string>();

  readonly width = input(54);
  readonly maxHeight = input('min(80vh, 40rem)');
  readonly gap = input('0.5rem');
  readonly padding = input('0.75rem 0.9rem 0.9rem');

  readonly zIndex = input(5);

  readonly dismissible = input(true);

  readonly close = output<void>();

  protected readonly widthCss = computed(() => `min(${this.width()}rem, calc(100vw - 2rem))`);

  protected onScrimClick(): void {
    if (this.dismissible()) this.close.emit();
  }
}
