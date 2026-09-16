import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { X } from 'lucide';
import type { PromptChoice } from '../../../core/protocol';
import { SheetComponent } from '../../../ui/sheet.component';
import { ManaTextComponent } from '../../../ui/mana-symbol.component';
import { IconComponent } from '../../../ui/icon.component';
import { stripTags } from '../../../rules/text-format';

@Component({
  selector: 'app-choice-list-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SheetComponent, ManaTextComponent, IconComponent],
  template: `
    <app-sheet [ariaLabel]="heading()" [width]="24" (close)="close.emit()">
      <header class="head">
        <h2>{{ heading() }}</h2>
        <button
          type="button"
          class="icon-btn"
          aria-label="close"
          title="close"
          (click)="close.emit()"
        >
          <app-icon [icon]="closeIcon" />
        </button>
      </header>
      <input
        type="text"
        class="search"
        placeholder="Search…"
        autofocus
        [value]="search()"
        (input)="search.set($any($event.target).value)"
      />
      <div class="list">
        @for (choice of filtered(); track choice.key) {
          <button type="button" class="row" (click)="pick.emit(choice.key)">
            <app-mana-text [text]="clean(choice.label)" />
          </button>
        } @empty {
          <p class="empty">Nothing matches "{{ search() }}".</p>
        }
      </div>
    </app-sheet>
  `,
  styles: `
    .head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    h2 {
      margin: 0;
      font-size: 0.95rem;
    }

    .icon-btn {
      display: flex;
      align-items: center;
      border: none;
      background: none;
      color: var(--muted);
      font: inherit;
      cursor: pointer;
      padding: 0.15rem 0.35rem;
    }

    .icon-btn:hover {
      color: var(--fg);
    }

    .search {
      padding: 0.4rem 0.6rem;
      border: 1px solid var(--line-input);
      border-radius: var(--radius-small);
      background: var(--glass-control);
      color: var(--fg);
      font: inherit;
      font-size: 0.8rem;
    }

    .search:focus {
      outline: none;
      border-color: var(--accent);
    }

    .list {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      overflow-y: auto;
      min-height: 0;
    }

    .row {
      padding: 0.4rem 0.6rem;
      border: 1px solid var(--line-strong);
      border-radius: var(--radius-small);
      background: var(--glass-control);
      color: var(--fg);
      font: inherit;
      font-size: 0.8rem;
      text-align: left;
      cursor: pointer;
      transition:
        border-color 150ms ease,
        background 150ms ease;
    }

    .row:hover {
      border-color: var(--accent);
      background: var(--glass-hover);
    }

    .empty {
      margin: 0.5rem 0;
      color: var(--muted);
      font-size: 0.78rem;
      text-align: center;
    }
  `,
})
export class ChoiceListPanelComponent {
  readonly heading = input.required<string>();
  readonly choices = input.required<readonly PromptChoice[]>();

  readonly close = output<void>();
  readonly pick = output<string>();

  protected readonly closeIcon = X;

  protected readonly search = signal('');

  protected readonly filtered = computed(() => {
    const needle = this.search().trim().toLowerCase();
    const all = this.choices();
    if (!needle) return all;
    return all.filter((choice) => this.clean(choice.label).toLowerCase().includes(needle));
  });

  protected clean(text: string): string {
    return stripTags(text);
  }
}
