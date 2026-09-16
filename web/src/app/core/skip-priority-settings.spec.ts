import { TestBed } from '@angular/core/testing';
import { BRIDGE_SOCKET_FACTORY } from './bridge-socket';
import { GameStore } from './game-store';
import { DEFAULT_SKIP_PRIORITY_SETTINGS } from './skip-priority-settings';
import { FakeSocket, fakeSocketFactory } from '../testing/fake-socket';
import { setUp } from './testing-support';

describe('priority skip-step settings', () => {
  it("starts at XMage's own defaults before anything is sent", () => {
    const { store } = setUp();
    expect(store.skipPrioritySettings()).toEqual(DEFAULT_SKIP_PRIORITY_SETTINGS);
  });

  it('sends the full settings object and updates the local signal to match', () => {
    const { socket, store } = setUp();
    const settings = {
      ...DEFAULT_SKIP_PRIORITY_SETTINGS,
      yourTurn: { ...DEFAULT_SKIP_PRIORITY_SETTINGS.yourTurn, upkeep: true },
      stopOnStackNewObjects: false,
    };

    store.setSkipPrioritySteps(settings);

    expect(store.skipPrioritySettings()).toEqual(settings);
    const sent = socket.lastSentOfType<{
      yourTurn: { upkeep: boolean };
      stopOnStackNewObjects: boolean;
    }>('setSkipPrioritySteps');
    expect(sent?.yourTurn.upkeep).toBe(true);
    expect(sent?.stopOnStackNewObjects).toBe(false);
  });

  it('survives a fresh session the way a browser reload would, since nothing else remembers it', () => {
    const { store: first } = setUp();
    const settings = { ...DEFAULT_SKIP_PRIORITY_SETTINGS, stopOnStackNewObjects: false };
    first.setSkipPrioritySteps(settings);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(new FakeSocket()) },
      ],
    });
    const second = TestBed.inject(GameStore);

    expect(second.skipPrioritySettings()).toEqual(settings);
  });

  it('does not resend on login when nothing was ever applied, since XMage already assumes the defaults', () => {
    const { socket } = setUp();
    socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });

    expect(socket.lastSentOfType('setSkipPrioritySteps')).toBeUndefined();
  });

  it('resends a previously-applied setting on login, since a fresh XMage session never heard it', () => {
    const { socket, store } = setUp();
    const settings = { ...DEFAULT_SKIP_PRIORITY_SETTINGS, passPriorityCast: false };
    store.setSkipPrioritySteps(settings);

    socket.emit({ type: 'loggedIn', userName: 'web-1', serverVersion: 'v', mainRoomId: 'room' });

    const sent = socket
      .sentFrames<{ type: string }>()
      .filter((frame) => frame.type === 'setSkipPrioritySteps');
    expect(sent).toHaveLength(2);
  });
});
