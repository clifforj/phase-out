import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ShellComponent } from './shell.component';
import { BRIDGE_SOCKET_FACTORY } from '../core/bridge-socket';
import { AuthStore } from '../core/auth-store';
import { GameStore } from '../core/game-store';
import { FakeSocket, fakeSocketFactory } from '../testing/fake-socket';

describe('ShellComponent', () => {
  function render() {
    localStorage.clear();
    const socket = new FakeSocket();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', children: [] },
          { path: 'decks', children: [] },
          { path: 'settings', children: [] },
        ]),
        { provide: BRIDGE_SOCKET_FACTORY, useValue: fakeSocketFactory(socket) },
      ],
    });
    TestBed.inject(GameStore).connect();
    socket.open();
    return {
      socket,
      router: TestBed.inject(Router),
      auth: TestBed.inject(AuthStore),
      mount: () => {
        const fixture = TestBed.createComponent(ShellComponent);
        fixture.detectChanges();
        const element = fixture.nativeElement as HTMLElement;
        const sync = () => fixture.detectChanges();
        return {
          element,
          sync,
          openMenu: () => {
            (element.querySelector('.player-card') as HTMLButtonElement).click();
            sync();
          },
        };
      },
    };
  }

  function labels(element: HTMLElement): string[] {
    return [...element.querySelectorAll('.links a')].map((a) => a.textContent?.trim() ?? '');
  }

  function menuLabels(element: HTMLElement): string[] {
    return [...element.querySelectorAll('.menu a, .menu button, .menu .guest')].map(
      (item) => item.textContent?.trim() ?? '',
    );
  }

  it('puts the two daily destinations in the bar', () => {
    const { mount } = render();
    expect(labels(mount().element)).toEqual(['Home', 'Decks']);
  });

  it('lights exactly one link, and Home only on the home route', async () => {
    const { router, mount } = render();
    const { element, sync } = mount();

    await router.navigateByUrl('/decks');
    sync();

    const active = [...element.querySelectorAll('.links a.active')].map((a) =>
      a.textContent?.trim(),
    );
    expect(active).toEqual(['Decks']);
  });

  it('keeps Settings and Log out behind the player card', () => {
    const { auth, mount } = render();
    auth.authMode.set('required');
    const { element, openMenu } = mount();

    expect(element.querySelector('.menu')).toBeNull();
    openMenu();

    expect(menuLabels(element)).toEqual(['Settings', 'Log out']);
  });

  it('shuts the menu on a click anywhere else', () => {
    const { mount } = render();
    const { element, openMenu, sync } = mount();
    openMenu();
    expect(element.querySelector('.menu')).not.toBeNull();

    document.body.click();
    sync();

    expect(element.querySelector('.menu')).toBeNull();
  });

  it('offers no log out on a bridge that does not require signing in', () => {
    const { auth, mount } = render();
    auth.authMode.set('off');
    const { element, openMenu } = mount();
    openMenu();

    expect(menuLabels(element)).toEqual(['Settings', 'Guest session']);
  });

  it('narrows the column on Settings, and the footer with it', async () => {
    const { router, mount } = render();
    const { element, sync } = mount();

    const widths = () => [
      (element.querySelector('main') as HTMLElement).style.getPropertyValue('--page-width'),
      (element.querySelector('app-site-footer footer') as HTMLElement).style.getPropertyValue(
        '--footer-width',
      ),
    ];

    expect(widths()).toEqual(['1080px', '1080px']);

    await router.navigateByUrl('/settings');
    sync();

    expect(widths()).toEqual(['900px', '900px']);
  });
});
