import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from './app.routes';

describe('routes', () => {
  function router(): Router {
    TestBed.configureTestingModule({ providers: [provideRouter(routes)] });
    return TestBed.inject(Router);
  }

  it(
    'opens the board for the table named in the URL',
    async () => {
      const r = router();
      await r.navigateByUrl('/game/8fb44e89');
      expect(r.url).toBe('/game/8fb44e89');
    },
    // This first navigation also loads the three.js board module.
    15_000,
  );

  it('opens the waiting room for the table named in the URL', async () => {
    const r = router();
    await r.navigateByUrl('/table/8fb44e89');
    expect(r.url).toBe('/table/8fb44e89');
  });

  it('sends anything else to the table list rather than to nothing', async () => {
    const r = router();
    await r.navigateByUrl('/no-such-page');
    expect(r.url).toBe('/');
  });
});
