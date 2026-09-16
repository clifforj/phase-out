import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';
import { DeckCardEntry } from '../core/protocol';
import { DeckStore } from '../core/deck-store';
import { DialogComponent } from '../ui/dialog.component';

type Source = 'paste' | 'upload';

type Step = 'source' | 'commanders';

@Component({
  selector: 'app-import-deck',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent],
  templateUrl: './import-deck.component.html',
  styleUrl: './import-deck.component.css',
})
export class ImportDeckComponent {
  protected readonly decks = inject(DeckStore);

  readonly close = output<void>();

  protected readonly step = signal<Step>('source');

  protected readonly source = signal<Source>('paste');
  protected readonly text = signal('');
  protected readonly name = signal('');
  protected readonly fileName = signal<string | null>(null);
  protected readonly dragging = signal(false);

  protected readonly chosen = signal<Set<string>>(new Set());

  private awaitingPreview = false;
  private awaitingSave = false;

  constructor() {
    effect(() => {
      const result = this.decks.lastImport();
      if (!this.awaitingPreview || this.decks.importPending() || !result) return;
      this.awaitingPreview = false;
      if (result.ok) {
        this.chosen.set(new Set(result.commanders ?? []));
        this.step.set('commanders');
      }
    });

    effect(() => {
      const result = this.decks.lastImport();
      if (!this.awaitingSave || this.decks.importPending() || !result?.ok) return;
      this.awaitingSave = false;
      this.close.emit();
    });
  }

  protected lineCount(): number {
    return this.text().split('\n').length;
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.read(file);
  }

  protected onPick(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void this.read(file);
  }

  private async read(file: File): Promise<void> {
    this.text.set(await file.text());
    this.fileName.set(file.name);
    if (!this.name().trim()) this.name.set(file.name.replace(/\.[^.]+$/, ''));
  }

  protected submitSource(): void {
    const text = this.text();
    if (!text.trim()) return;
    this.awaitingPreview = true;
    this.decks.previewImport(text, this.name().trim() || undefined);
  }

  protected readonly entries = computed<DeckCardEntry[]>(() => {
    const list = this.decks.lastImport()?.entries ?? [];
    return [...list].sort((a, b) => Number(b.commander) - Number(a.commander));
  });

  protected readonly chosenCount = computed(() => this.chosen().size);

  protected toggleCommander(name: string): void {
    const next = new Set(this.chosen());
    if (next.has(name)) next.delete(name);
    else next.add(name);
    this.chosen.set(next);
  }

  protected backToSource(): void {
    this.step.set('source');
  }

  protected save(): void {
    if (this.chosen().size === 0) return;
    this.awaitingSave = true;
    this.decks.importDeck(this.text(), this.name().trim() || undefined, [...this.chosen()]);
  }
}
