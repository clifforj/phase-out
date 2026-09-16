import { TestBed } from '@angular/core/testing';
import { ManaCostComponent, ManaTextComponent } from '../ui/mana-symbol.component';
import { manaSymbol, manaSymbolSvgUrl, parseManaCost, splitManaText } from './mana-symbol';
import { FIXTURES } from '../testing/fixture';
import { loadFixture } from '../testing/fixture-loader';

describe('manaSymbol', () => {
  it('reads the five colours, colourless, and generic amounts', () => {
    expect(manaSymbol('B')?.label).toBe('black mana');
    expect(manaSymbol('g')?.label).toBe('green mana');
    expect(manaSymbol('C')?.label).toBe('colourless mana');
    expect(manaSymbol('3')?.label).toBe('three generic mana');
    expect(manaSymbol('12')?.label).toBe('12 generic mana');
    expect(manaSymbol('X')?.label).toBe('X generic mana');
  });

  it('reads tap, untap, snow, energy and Phyrexian', () => {
    expect(manaSymbol('T')?.label).toBe('tap');
    expect(manaSymbol('Q')?.label).toBe('untap');
    expect(manaSymbol('S')?.label).toBe('snow mana');
    expect(manaSymbol('E')?.label).toBe('energy');
    expect(manaSymbol('W/P')?.label).toBe('Phyrexian white mana');
    expect(manaSymbol('P')?.label).toBe('Phyrexian mana');
  });

  it('splits a hybrid both ways it is written, and picks the same picture either way', () => {
    const slashed = manaSymbol('W/B');
    const bare = manaSymbol('WB');
    expect(slashed?.label).toBe('white or black mana');
    expect(bare?.label).toBe(slashed?.label);
    expect(bare?.code).toBe(slashed?.code);
    expect(slashed?.code).toBe('WB');

    expect(manaSymbol('2/W')?.label).toBe('two generic or white mana');
    expect(manaSymbol('2/W')?.code).toBe('2W');
  });

  it('names a hybrid the way Scryfall files it, not alphabetically', () => {
    expect(manaSymbol('R/W')?.code).toBe('RW');
    expect(manaSymbol('W/R')?.code).toBe('RW');
    expect(manaSymbol('G/W')?.code).toBe('GW');
    expect(manaSymbol('W/G')?.code).toBe('GW');
  });

  it('gives every symbol the Scryfall SVG URL its code names', () => {
    expect(manaSymbolSvgUrl(manaSymbol('W/P')!.code)).toBe(
      'https://svgs.scryfall.io/card-symbols/WP.svg',
    );
  });

  it('does not recognise braces that are not symbols', () => {
    expect(manaSymbol('this')).toBeNull();
    expect(manaSymbol('hintstart')).toBeNull();
    expect(manaSymbol('')).toBeNull();
  });

  it('parses a cost in order, and an absent cost as nothing', () => {
    expect(parseManaCost('{3}{B}{B}').map((symbol) => symbol.raw)).toEqual(['3', 'B', 'B']);
    expect(parseManaCost('{X}{B/P}{W/U}').map((symbol) => symbol.raw)).toEqual(['X', 'B/P', 'W/U']);
    expect(parseManaCost(undefined)).toEqual([]);
  });

  it('splits prose into text and symbols without losing a character of the text', () => {
    const runs = splitManaText('{2}, {T}: Add {B} for each Swamp you control.');
    expect(runs.map((run) => run.symbol?.raw ?? run.text)).toEqual([
      '2',
      ', ',
      'T',
      ': Add ',
      'B',
      ' for each Swamp you control.',
    ]);

    expect(splitManaText('{this} enters tapped.')).toEqual([{ text: '{this} enters tapped.' }]);
  });

  it('recognises every mana token in the captures, and only those', () => {
    const tokens = new Set<string>();
    for (const name of [FIXTURES.playerVsAi, FIXTURES.spectatorDuel]) {
      for (const line of loadFixture(name)) {
        for (const match of JSON.stringify(line.frame).matchAll(/\{([^}"\\]+)\}/g))
          tokens.add(match[1]);
      }
    }
    expect(tokens.size).toBeGreaterThan(5);

    const unknown = [...tokens].filter((token) => !manaSymbol(token)).sort();

    expect(unknown).toEqual(['this']);
  });
});

describe('the mana symbol components', () => {
  it('draws a cost as one Scryfall image per symbol, each one labelled and sourced by its own code', () => {
    const fixture = TestBed.createComponent(ManaCostComponent);
    fixture.componentRef.setInput('cost', '{2}{W/U}{T}');
    fixture.detectChanges();
    const images = [...(fixture.nativeElement as HTMLElement).querySelectorAll('img')];
    expect(images.map((img) => img.getAttribute('alt'))).toEqual([
      'two generic mana',
      'white or blue mana',
      'tap',
    ]);
    expect(images.map((img) => img.getAttribute('src'))).toEqual([
      manaSymbolSvgUrl('2'),
      manaSymbolSvgUrl('WU'),
      manaSymbolSvgUrl('T'),
    ]);
  });

  it('keeps prose intact around the symbols it draws', () => {
    const fixture = TestBed.createComponent(ManaTextComponent);
    fixture.componentRef.setInput(
      'text',
      'Whenever you tap a Swamp for mana, add an additional {B}.',
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('img')).toHaveLength(1);

    expect([...element.querySelectorAll('span')].map((span) => span.textContent).join('|')).toBe(
      'Whenever you tap a Swamp for mana, add an additional |.',
    );
  });

  it('renders nothing at all for a card with no cost', () => {
    const fixture = TestBed.createComponent(ManaCostComponent);
    fixture.componentRef.setInput('cost', undefined);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('img')).toHaveLength(0);
  });
});
