import { TestBed } from '@angular/core/testing';
import { CardTileComponent } from './card-tile.component';
import { frameTint, stripTags } from '../../rules/text-format';
import type { CardView, PermanentStateView } from '../../core/protocol';
import { FIXTURES } from '../../testing/fixture';
import { loadFixture } from '../../testing/fixture-loader';

function card(overrides: Partial<CardView> = {}): CardView {
  return {
    objectId: 'c1',
    name: 'Bad Moon',
    rules: ['Black creatures get +1/+1.'],
    colors: ['B'],
    icons: [],
    counters: [],
    targets: [],
    faceDown: false,
    isToken: false,
    ...overrides,
  };
}

function render(inputs: {
  card: CardView;
  permanent?: PermanentStateView | null;
  playable?: boolean;
  compact?: boolean;
  upright?: boolean;
}) {
  const fixture = TestBed.createComponent(CardTileComponent);
  fixture.componentRef.setInput('card', inputs.card);
  if (inputs.permanent !== undefined) fixture.componentRef.setInput('permanent', inputs.permanent);
  if (inputs.playable !== undefined) fixture.componentRef.setInput('playable', inputs.playable);
  if (inputs.compact !== undefined) fixture.componentRef.setInput('compact', inputs.compact);
  if (inputs.upright !== undefined) fixture.componentRef.setInput('upright', inputs.upright);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { fixture, element, tile: element.querySelector('.tile')! };
}

describe('CardTileComponent', () => {
  it('rotates a tapped permanent and says so', () => {
    const permanent: PermanentStateView = {
      card: card({ typeLine: 'Land — Swamp', name: 'Swamp', colors: [], frameColor: 'B' }),
      tapped: true,
      flipped: false,
      phasedIn: true,
      isCopy: false,
      damage: 0,
      attachments: [],
      canAttack: false,
      canBlock: false,
    };
    const { tile, element } = render({ card: permanent.card, permanent });

    expect(tile.classList.contains('tapped')).toBe(true);
    expect(element.textContent).toContain('tapped');

    expect((tile as HTMLElement).style.background).toContain('color-mix');

    const preview = render({ card: permanent.card, permanent, upright: true });
    expect(preview.tile.classList.contains('tapped')).toBe(false);
    expect(preview.element.textContent).toContain('tapped');
  });

  it('shows damage on a permanent, not on a card', () => {
    const base = card({
      name: 'Vampire Hexmage',
      typeLine: 'Creature — Vampire Shaman',
      power: '2',
      toughness: '2',
    });
    const permanent: PermanentStateView = {
      card: base,
      tapped: false,
      flipped: false,
      phasedIn: true,
      isCopy: false,
      damage: 2,
      attachments: ['a1'],
      canAttack: true,
      canBlock: true,
    };
    const withPermanent = render({ card: base, permanent });
    expect(withPermanent.element.querySelector('.damage')?.textContent).toContain('2');
    expect(withPermanent.element.querySelector('.attached')?.textContent).toContain('1');
    expect(withPermanent.element.textContent).toContain('2/2');

    const asCard = render({ card: base });
    expect(asCard.element.querySelector('.damage')).toBeNull();
  });

  it('never prints the name of a face-down card', () => {
    const { element, tile } = render({ card: card({ faceDown: true, name: 'Bad Moon' }) });
    expect(tile.classList.contains('face-down')).toBe(true);
    expect(element.textContent).not.toContain('Bad Moon');
    expect(element.textContent).toContain('Face-down');
  });

  it('marks a token', () => {
    const { element, tile } = render({ card: card({ isToken: true, name: 'Demon Token' }) });
    expect(tile.classList.contains('token')).toBe(true);
    expect(element.textContent).toContain('token');
  });

  it('renders a counter Mana has a glyph for as just the icon and count', () => {
    const { element } = render({
      card: card({ counters: [{ name: 'loyalty', count: 5 }] }),
    });
    const counter = element.querySelector('.counter');
    expect(counter?.querySelector('i.ms-counter-loyalty')).toBeTruthy();
    expect(counter?.textContent?.trim()).toBe('5');
  });

  it('drops the count from a single counter', () => {
    const { element } = render({
      card: card({ counters: [{ name: '+1/+1', count: 1 }] }),
    });
    expect(element.querySelector('.counter')?.textContent?.trim()).toBe('');
  });

  it('falls back to the full label for a counter Mana has no glyph for', () => {
    const { element } = render({
      card: card({ counters: [{ name: 'vitality', count: 2 }] }),
    });
    expect(element.querySelector('.counter')?.textContent?.trim()).toBe('2 × vitality');
  });

  it('highlights what XMage says is playable', () => {
    const off = render({ card: card() });
    expect(off.tile.classList.contains('playable')).toBe(false);
    const on = render({ card: card(), playable: true });
    expect(on.tile.classList.contains('playable')).toBe(true);
  });

  it('renders the mana cost as drawn symbols, one per token', () => {
    const { element } = render({ card: card({ manaCost: '{3}{B}{B}' }) });
    const symbols = [...element.querySelectorAll('app-mana-cost img')].map((img) =>
      img.getAttribute('alt'),
    );
    expect(symbols).toEqual(['three generic mana', 'black mana', 'black mana']);
  });

  it('draws the symbols inside rules text instead of printing the braces', () => {
    const { element } = render({
      card: card({ rules: ['{2}, {T}: Add {B} for each Swamp you control.'] }),
    });
    const rules = element.querySelector('.rules')!;
    expect(rules.textContent).not.toContain('{');
    expect(rules.textContent).toContain('for each Swamp you control.');
    expect([...rules.querySelectorAll('img')].map((img) => img.getAttribute('alt'))).toEqual([
      'two generic mana',
      'tap',
      'black mana',
    ]);
  });

  it('draws the commander crown from the icons of a captured commander', () => {
    const commander = findPermanentWithIcon('COMMANDER');
    expect(commander, 'no permanent with a COMMANDER icon in the capture').toBeTruthy();

    const { element } = render({ card: commander!.card, permanent: commander! });
    const icon = element.querySelector('.icon-COMMANDER');
    expect(icon).not.toBeNull();
    expect(icon!.textContent).toContain('♛');
    expect(icon!.getAttribute('title')).toContain('commander');
  });

  it('renders a captured card without inventing or losing anything', () => {
    const permanent = findPermanentWithIcon('ABILITY_FLYING');
    expect(permanent).toBeTruthy();
    const { element } = render({ card: permanent!.card, permanent: permanent! });
    expect(element.textContent).toContain(permanent!.card.name);
    expect(element.querySelectorAll('.icon').length).toBe(permanent!.card.icons.length);
  });
});

describe('card tile helpers', () => {
  it('prefers frameColor over colors, because that is where lands differ', () => {
    const swamp = card({ name: 'Swamp', colors: [], frameColor: 'B' });
    expect(frameTint(swamp)).toContain('#3b3542');

    expect(frameTint(card({ colors: ['B', 'G'], frameColor: 'BG' }))).toContain('linear-gradient');

    expect(frameTint(card({ colors: [], frameColor: '' }))).toBe('');
  });

  it('strips XMage markup out of rules text', () => {
    expect(stripTags('<i>Flying</i><br>Deathtouch')).toBe('Flying Deathtouch');
    expect(stripTags('<b>Commander</b>')).toBe('Commander');
  });

  it("decodes XMage's HTML entities, including &bull and &mdash written without a semicolon", () => {
    expect(stripTags('Choose one &mdash; &bull Gain 2 life. &bull Lose 2 life.')).toBe(
      'Choose one — • Gain 2 life. • Lose 2 life.',
    );
  });

  it("fills {this} in with the card's own name when given one", () => {
    expect(stripTags('Remove a counter from {this}.', "Umezawa's Jitte")).toBe(
      "Remove a counter from Umezawa's Jitte.",
    );
    expect(stripTags('Remove a counter from {this}.')).toBe('Remove a counter from this.');
  });

  it("separates a mana-payment message from the <div>-wrapped card name XMage appends to it, and drops the name's set-code suffix", () => {
    expect(stripTags("Pay {G}<div style='...'>Elvish Reclaimer [c5e]</div>")).toBe(
      'Pay {G} Elvish Reclaimer',
    );
  });
});

function findPermanentWithIcon(iconType: string): PermanentStateView | null {
  for (const name of [FIXTURES.playerVsAi, FIXTURES.spectatorDuel]) {
    for (const line of loadFixture(name)) {
      const game = (line.frame as { game?: { players: { battlefield: PermanentStateView[] }[] } })
        .game;
      if (!game) continue;
      for (const player of game.players) {
        for (const permanent of player.battlefield) {
          if (permanent.card.icons?.some((icon) => icon.type === iconType)) return permanent;
        }
      }
    }
  }
  return null;
}
