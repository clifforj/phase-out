import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { GameEvent } from '../../rules/game-events';
import {
  EVENT_DWELL_MS,
  EVENT_FADE_MS,
  EVENT_FEED_MAX,
  EventFeedComponent,
} from './event-feed.component';

describe('EventFeedComponent', () => {
  let fixture: ComponentFixture<EventFeedComponent>;

  function setUp(events: GameEvent[] = []) {
    TestBed.configureTestingModule({});
    fixture = TestBed.createComponent(EventFeedComponent);
    fixture.componentRef.setInput('events', events);
    fixture.detectChanges();
    return fixture;
  }

  function chips(): string[] {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('.event')].map(
      (chip) => chip.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    );
  }

  function send(events: GameEvent[]): void {
    fixture.componentRef.setInput('events', events);
    fixture.detectChanges();
  }

  let nextId = 1;
  function event(text: string, overrides: Partial<GameEvent> = {}): GameEvent {
    return { id: nextId++, kind: 'removal', text, repeats: 1, objectIds: [], ...overrides };
  }

  beforeEach(() => {
    nextId = 1;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('says nothing about the log it was born with', () => {
    setUp([event('Bad Moon was destroyed by Doom Blade'), event('Grave Titan died')]);
    expect(chips()).toEqual([]);
  });

  it('shows an event that arrives, and takes it away again by itself', () => {
    const log = [event('alice casts Grave Titan from hand')];
    setUp(log);

    const fresh = event('Bad Moon was destroyed by Doom Blade');
    send([...log, fresh]);
    expect(chips()[0]).toContain('Bad Moon was destroyed');

    vi.advanceTimersByTime(EVENT_DWELL_MS - 1);
    fixture.detectChanges();
    expect(chips()).toHaveLength(1);

    vi.advanceTimersByTime(EVENT_FADE_MS + 1);
    fixture.detectChanges();
    expect(chips()).toEqual([]);
  });

  it('puts the newest at the top', () => {
    setUp([]);
    const first = event('alice casts Grave Titan from hand');
    send([first]);
    const second = event('Bad Moon was destroyed by Doom Blade');
    send([first, second]);

    expect(chips()[0]).toContain('Bad Moon');
    expect(chips()[1]).toContain('Grave Titan');
  });

  it('never shows more than the cap, however many arrive at once', () => {
    setUp([]);
    const burst = Array.from({ length: EVENT_FEED_MAX + 4 }, (_, index) =>
      event(`event number ${index}`),
    );
    send(burst);

    expect(chips()).toHaveLength(EVENT_FEED_MAX);

    expect(chips()[0]).toContain(`event number ${burst.length - 1}`);
  });

  it('drops the oldest chip when a new one arrives at the cap', () => {
    setUp([]);
    const log: GameEvent[] = [];
    for (let index = 0; index < EVENT_FEED_MAX; index++) {
      log.push(event(`event number ${index}`));
      send([...log]);
    }
    expect(chips()).toHaveLength(EVENT_FEED_MAX);
    expect(chips().at(-1)).toContain('event number 0');

    log.push(event('the newest thing'));
    send([...log]);
    expect(chips()).toHaveLength(EVENT_FEED_MAX);
    expect(chips()[0]).toContain('the newest thing');
    expect(chips().some((chip) => chip.includes('event number 0'))).toBe(false);
  });

  it('follows a collapsed repeat instead of stacking up copies of it', () => {
    setUp([]);
    const line = event('bob lost the game due life is 0 or less', { kind: 'ending' });
    send([line]);
    expect(chips()).toHaveLength(1);
    expect(chips()[0]).not.toContain('×');

    send([{ ...line, repeats: 7 }]);
    expect(chips()).toHaveLength(1);
    expect(chips()[0]).toContain('×7');
  });

  it('stops the clock while it is pointed at, and gives back the whole wait', () => {
    setUp([]);
    send([event('Bad Moon was destroyed by Doom Blade')]);
    const host = fixture.nativeElement as HTMLElement;

    host.dispatchEvent(new Event('pointerenter'));
    fixture.detectChanges();
    expect(host.classList.contains('held')).toBe(true);

    vi.advanceTimersByTime((EVENT_DWELL_MS + EVENT_FADE_MS) * 3);
    fixture.detectChanges();
    expect(chips()).toHaveLength(1);

    host.dispatchEvent(new Event('pointerleave'));
    fixture.detectChanges();
    expect(host.classList.contains('held')).toBe(false);

    vi.advanceTimersByTime(EVENT_DWELL_MS + EVENT_FADE_MS - 1);
    fixture.detectChanges();
    expect(chips()).toHaveLength(1);
    vi.advanceTimersByTime(2);
    fixture.detectChanges();
    expect(chips()).toEqual([]);
  });

  it('stops the clock while focus is inside it', () => {
    setUp([]);
    send([event('Bad Moon was destroyed by Doom Blade')]);
    const host = fixture.nativeElement as HTMLElement;

    host.dispatchEvent(new Event('focusin'));
    fixture.detectChanges();
    vi.advanceTimersByTime((EVENT_DWELL_MS + EVENT_FADE_MS) * 2);
    fixture.detectChanges();
    expect(chips()).toHaveLength(1);
  });

  it('reports a clicked chip, so the board can show the card or the log', () => {
    setUp([]);
    const clicked = event('Bad Moon was destroyed by Doom Blade', { objectIds: ['card-1'] });
    send([clicked]);

    const picked: GameEvent[] = [];
    fixture.componentInstance.pick.subscribe((event) => picked.push(event));
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.event')!.click();

    expect(picked).toEqual([clicked]);
  });

  it('clears itself when the log does, which is a new game on the same table', () => {
    setUp([]);
    send([event('Bad Moon was destroyed by Doom Blade')]);
    expect(chips()).toHaveLength(1);

    send([]);
    expect(chips()).toEqual([]);
  });

  it('marks each chip with its kind', () => {
    setUp([]);
    send([
      event('Bad Moon was destroyed', { kind: 'removal' }),
      event('alice gains 3 life', { kind: 'life' }),
    ]);
    const kinds = [...(fixture.nativeElement as HTMLElement).querySelectorAll('.event')].map(
      (chip) => chip.getAttribute('data-kind'),
    );
    expect(kinds).toEqual(['life', 'removal']);
  });

  it('fades on the same clock it is removed on', () => {
    setUp([]);
    const styles = [...document.querySelectorAll('style')]
      .map((style) => style.textContent ?? '')
      .filter((text) => text.includes('event-out'));
    expect(styles.length, 'the feed emitted no styles to check').toBeGreaterThan(0);
    expect(styles.join('\n')).toContain(
      `event-out ${EVENT_FADE_MS}ms ease-in ${EVENT_DWELL_MS}ms forwards`,
    );
  });
});
