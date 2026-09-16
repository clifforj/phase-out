import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () => import('./home/home.component').then((m) => m.HomeComponent),
        title: 'Home - Phase Out',
      },
      {
        path: 'decks',
        loadComponent: () => import('./decks/decks.component').then((m) => m.DecksComponent),
        title: 'Decks - Phase Out',
      },
      {
        path: 'decks/:deckId',
        loadComponent: () =>
          import('./decks/deck-detail.component').then((m) => m.DeckDetailComponent),
        title: 'Deck - Phase Out',
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/settings.component').then((m) => m.SettingsComponent),
        title: 'Settings - Phase Out',
      },
    ],
  },
  {
    path: 'table/:tableId',
    loadComponent: () => import('./lobby/table-lobby.component').then((m) => m.TableLobbyComponent),
    title: 'Waiting to start - Phase Out',
  },
  {
    path: 'game/:tableId',
    loadComponent: () => import('./board/board.component').then((m) => m.BoardComponent),
    title: 'Phase Out',
  },
  {
    path: 'privacy',
    loadComponent: () => import('./legal/privacy.component').then((m) => m.PrivacyComponent),
    title: 'Privacy Policy - Phase Out',
  },
  { path: '**', redirectTo: '' },
];
