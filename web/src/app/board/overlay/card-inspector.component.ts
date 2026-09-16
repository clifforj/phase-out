import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CardArtService } from '../../core/card-art';
import { cardDisplayName, isCommander, printingOf, statLine } from '../../rules/card-text';
import { ManaCostComponent, ManaTextComponent } from '../../ui/mana-symbol.component';
import { stripTags } from '../../rules/text-format';
import { ArtistCreditComponent } from '../../ui/artist-credit.component';
import { FanDisclaimerComponent } from '../../ui/fan-disclaimer.component';
import { SheetComponent } from '../../ui/sheet.component';
import { SheetHeaderComponent } from '../../ui/sheet-header.component';
import type { Placement } from '../scene/layout';
import { CardPreviewComponent } from './card-preview.component';

@Component({
  selector: 'app-card-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ArtistCreditComponent,
    CardPreviewComponent,
    FanDisclaimerComponent,
    ManaCostComponent,
    ManaTextComponent,
    SheetComponent,
    SheetHeaderComponent,
  ],
  templateUrl: './card-inspector.component.html',
  styleUrl: './card-inspector.component.css',
})
export class CardInspectorComponent {
  private readonly art = inject(CardArtService);

  readonly placement = input.required<Placement>();
  readonly ownerName = input<string | null>(null);
  readonly attachedToName = input<string | null>(null);
  readonly attachmentNames = input<readonly string[]>([]);

  readonly stackDepth = input<{ index: number; total: number } | null>(null);

  readonly close = output<void>();

  readonly name = computed(() => cardDisplayName(this.placement().card));
  readonly commander = computed(() => isCommander(this.placement().card));
  readonly stats = computed(() => statLine(this.placement().card));

  readonly artist = computed(() => {
    const card = this.placement().card;
    return card.faceDown ? null : this.art.artistFor(card)();
  });

  readonly rules = computed(() => {
    const card = this.placement().card;
    return card.rules.map((rule) => stripTags(rule, card.name)).filter(Boolean);
  });

  readonly facts = computed(() => {
    const placement = this.placement();
    const card = placement.card;
    const permanent = placement.permanent;
    const owner = this.ownerName();
    const facts: { label: string; value: string }[] = [];
    const add = (label: string, value: string | null | undefined) => {
      if (value) facts.push({ label, value });
    };

    add('zone', ZONE_NAMES[placement.kind] ?? placement.kind);

    add(permanent ? 'controlled by' : 'owner', owner);
    const controller = permanent?.controllerName;
    if (controller && owner && controller !== owner) add('controller', controller);

    const depth = this.stackDepth();
    if (depth) {
      add(
        'position',
        depth.index === 0
          ? `next to resolve${depth.total > 1 ? ` · ${depth.total - 1} below it` : ''}`
          : `${ordinal(depth.index + 1)} from the top of ${depth.total}`,
      );
    }

    if (permanent) add('state', permanent.tapped ? 'tapped' : 'untapped');
    if (permanent?.damage) add('damage', `${permanent.damage} marked this turn`);
    if (placement.kind === 'attacker') add('combat', 'attacking');
    if (placement.kind === 'blocker') add('combat', 'blocking');

    if (this.attachedToName()) add('attached to', this.attachedToName());
    else if (permanent?.attachedTo) add('attached to', 'something else on the board');
    const attachments = this.attachmentNames();
    if (attachments.length) add('attached', attachments.join(', '));
    else if (permanent?.attachments.length) add('attached', `${permanent.attachments.length}`);

    if (card.counters.length)
      add(
        'counters',
        card.counters.map((counter) => `${counter.count} ${counter.name}`).join(', '),
      );

    const marks: string[] = [];
    if (card.isToken) marks.push('token');
    if (permanent?.isCopy) marks.push('copy');
    if (card.faceDown) marks.push('face down');
    if (placement.faded) marks.push('phased out');
    if (marks.length) add('this copy', marks.join(' · '));

    if (card.manaValue !== undefined) add('mana value', String(card.manaValue));
    const printing = printingOf(card);
    if (printing)
      add('printing', card.rarity ? `${printing} · ${card.rarity.toLowerCase()}` : printing);

    return facts;
  });
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

const ZONE_NAMES: Record<string, string> = {
  land: 'battlefield',
  creature: 'battlefield',
  permanent: 'battlefield',
  attachment: 'battlefield',
  attacker: 'battlefield',
  blocker: 'battlefield',
  command: 'command zone',
  graveyard: 'graveyard',
  exile: 'exile',
  hand: 'hand',
  stack: 'the stack',
};
