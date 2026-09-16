import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { CardArtService } from '../../core/card-art';
import type { CardView, PermanentStateView } from '../../core/protocol';
import { cardDisplayName, statLine } from '../../rules/card-text';
import { counterIconClass } from '../../rules/counter-icon';
import { counterLabel } from '../../rules/counter-label';
import { ManaCostComponent, ManaTextComponent } from '../../ui/mana-symbol.component';
import { frameTint, stripTags } from '../../rules/text-format';

@Component({
  selector: 'app-card-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ManaCostComponent, ManaTextComponent],
  templateUrl: './card-tile.component.html',
  styleUrl: './card-tile.component.css',
})
export class CardTileComponent {
  private readonly art = inject(CardArtService);

  protected readonly counterLabel = counterLabel;
  protected readonly counterIconClass = counterIconClass;

  readonly card = input.required<CardView>();

  readonly permanent = input<PermanentStateView | null>(null);
  readonly playable = input(false);

  readonly compact = input(false);

  readonly upright = input(false);

  private readonly expandedRules = signal(false);
  readonly expanded = this.expandedRules.asReadonly();

  readonly displayName = computed(() => cardDisplayName(this.card()));
  readonly statLine = computed(() => statLine(this.card()));

  readonly tint = computed(() => frameTint(this.card()));

  readonly artUrl = computed(() =>
    this.art.artFor(this.card(), this.compact() ? 'crop' : 'full')(),
  );

  readonly tooltip = computed(() => {
    const card = this.card();
    const parts = [
      card.name,
      card.typeLine,
      ...card.rules.map((rule) => stripTags(rule, card.name)),
    ];
    if (card.setCode) parts.push(`${card.setCode} ${card.cardNumber ?? ''}`.trim());
    return parts.filter(Boolean).join('\n');
  });

  toggleRules(event: Event): void {
    event.stopPropagation();
    this.expandedRules.update((value) => !value);
  }

  stripTags(text: string): string {
    return stripTags(text, this.card().name);
  }

  iconClass(type: string): string | null {
    return ICON_CLASSES[type] ?? null;
  }

  iconGlyph(type: string): string {
    return ICON_GLYPHS[type] ?? '•';
  }
}

const ICON_CLASSES: Record<string, string> = {
  RINGBEARER: 'ms-ability-ring-bearer',
  ABILITY_FLYING: 'ms-ability-flying',
  ABILITY_REACH: 'ms-ability-reach',
  ABILITY_DEATHTOUCH: 'ms-ability-deathtouch',
  ABILITY_LIFELINK: 'ms-ability-lifelink',
  ABILITY_FIRST_STRIKE: 'ms-ability-first-strike',
  ABILITY_DOUBLE_STRIKE: 'ms-ability-double-strike',
  ABILITY_TRAMPLE: 'ms-ability-trample',
  ABILITY_VIGILANCE: 'ms-ability-vigilance',
  ABILITY_HEXPROOF: 'ms-ability-hexproof',
  ABILITY_INDESTRUCTIBLE: 'ms-ability-indestructible',
  ABILITY_DEFENDER: 'ms-ability-defender',
  ABILITY_INFECT: 'ms-ability-infect',
  ABILITY_CREW: 'ms-ability-crew',

  ABILITY_CLASS_LEVEL: 'ms-level',
};

const ICON_GLYPHS: Record<string, string> = {
  COMMANDER: '♛',
  OTHER_FACEDOWN: '⌵',
  OTHER_COST_X: 'X',
  OTHER_HAS_RESTRICTIONS: '!',
  OTHER_HAS_TARGETS: '➤',
  PLAYABLE_COUNT: '⚙',
};
