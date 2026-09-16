import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GameStore } from '../core/game-store';
import {
  DEFAULT_SKIP_PRIORITY_SETTINGS,
  SkipPrioritySettings,
} from '../core/skip-priority-settings';
import type { SkipPrioritySteps } from '../core/protocol';

const STEPS: { label: string; key: keyof SkipPrioritySteps }[] = [
  { label: 'upkeep', key: 'upkeep' },
  { label: 'draw', key: 'draw' },
  { label: 'main 1', key: 'main1' },
  { label: 'before combat', key: 'beforeCombat' },
  { label: 'end of combat', key: 'endOfCombat' },
  { label: 'main 2', key: 'main2' },
  { label: 'end of turn', key: 'endOfTurn' },
];

type FlagKey = Exclude<keyof SkipPrioritySettings, 'yourTurn' | 'opponentTurn'>;

const FLAGS: { key: FlagKey; label: string; desc: string }[] = [
  {
    key: 'stopOnDeclareAttackers',
    label: 'Stop to declare attackers',
    desc: 'Only when you actually have a creature that could attack.',
  },
  {
    key: 'stopOnDeclareBlockersWithAnyPermanents',
    label: 'Stop to declare blockers',
    desc: 'Only when you have something that could block.',
  },
  {
    key: 'stopOnDeclareBlockersWithZeroPermanents',
    label: 'Stop to declare blockers regardless',
    desc: 'Even with nothing to block, for held tricks.',
  },
  {
    key: 'stopOnAllMainPhases',
    label: 'Always stop on main phases',
    desc: 'Overrides the main 1 and main 2 skips above.',
  },
  {
    key: 'stopOnAllEndPhases',
    label: 'Always stop on end phases',
    desc: 'Overrides the end-of-turn skips above.',
  },
  {
    key: 'stopOnStackNewObjects',
    label: 'Stop when the stack changes',
    desc: 'Anything new going on the stack gets you priority back.',
  },
  {
    key: 'passPriorityCast',
    label: "Don't ask again after I cast",
    desc: 'Pass straight through the window that follows your own spell.',
  },
  {
    key: 'passPriorityActivation',
    label: "Don't ask again after I activate",
    desc: 'The same, for your own activated abilities.',
  },
];

@Component({
  selector: 'app-skip-priority-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './skip-priority-settings.component.html',
  styleUrls: ['./settings-field.css', './skip-priority-settings.component.css'],
})
export class SkipPrioritySettingsComponent {
  protected readonly store = inject(GameStore);
  protected readonly steps = STEPS;
  protected readonly flags = FLAGS;

  protected readonly draft = signal<SkipPrioritySettings>(this.store.skipPrioritySettings());

  protected setStep(
    turn: 'yourTurn' | 'opponentTurn',
    key: keyof SkipPrioritySteps,
    event: Event,
  ): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.draft.update((current) => ({
      ...current,
      [turn]: { ...current[turn], [key]: checked },
    }));
  }

  protected toggle(key: FlagKey): void {
    this.draft.update((current) => ({ ...current, [key]: !current[key] }));
  }

  protected apply(): void {
    this.store.setSkipPrioritySteps(this.draft());
  }

  protected reset(): void {
    this.draft.set(DEFAULT_SKIP_PRIORITY_SETTINGS);
    this.store.setSkipPrioritySteps(DEFAULT_SKIP_PRIORITY_SETTINGS);
  }
}
