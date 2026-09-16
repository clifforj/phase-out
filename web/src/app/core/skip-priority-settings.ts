import { readJson, writeStorage } from './local-storage';
import { SkipPrioritySteps } from './protocol';

export const DEFAULT_SKIP_PRIORITY_STEPS: Required<SkipPrioritySteps> = {
  upkeep: false,
  draw: false,
  main1: true,
  beforeCombat: false,
  endOfCombat: false,
  main2: true,
  endOfTurn: false,
};

export interface SkipPrioritySettings {
  yourTurn: Required<SkipPrioritySteps>;
  opponentTurn: Required<SkipPrioritySteps>;
  stopOnDeclareAttackers: boolean;
  stopOnDeclareBlockersWithZeroPermanents: boolean;
  stopOnDeclareBlockersWithAnyPermanents: boolean;
  stopOnAllMainPhases: boolean;
  stopOnAllEndPhases: boolean;
  stopOnStackNewObjects: boolean;

  passPriorityCast: boolean;
  passPriorityActivation: boolean;
}

export const DEFAULT_SKIP_PRIORITY_SETTINGS: SkipPrioritySettings = {
  yourTurn: DEFAULT_SKIP_PRIORITY_STEPS,
  opponentTurn: DEFAULT_SKIP_PRIORITY_STEPS,
  stopOnDeclareAttackers: true,
  stopOnDeclareBlockersWithZeroPermanents: false,
  stopOnDeclareBlockersWithAnyPermanents: true,
  stopOnAllMainPhases: true,
  stopOnAllEndPhases: true,
  stopOnStackNewObjects: true,
  passPriorityCast: true,
  passPriorityActivation: true,
};

const SKIP_PRIORITY_KEY = 'co.skipPriority.v1';

export function readSkipPrioritySettings(): SkipPrioritySettings {
  return readJson(SKIP_PRIORITY_KEY, isSkipPrioritySettings, DEFAULT_SKIP_PRIORITY_SETTINGS);
}

export function writeSkipPrioritySettings(settings: SkipPrioritySettings): void {
  writeStorage(SKIP_PRIORITY_KEY, JSON.stringify(settings));
}

function isSkipPrioritySteps(value: unknown): value is Required<SkipPrioritySteps> {
  if (typeof value !== 'object' || value === null) return false;
  const steps = value as Record<string, unknown>;
  return Object.keys(DEFAULT_SKIP_PRIORITY_STEPS).every((key) => typeof steps[key] === 'boolean');
}

function isSkipPrioritySettings(value: unknown): value is SkipPrioritySettings {
  if (typeof value !== 'object' || value === null) return false;
  const settings = value as Record<string, unknown>;
  return (
    isSkipPrioritySteps(settings['yourTurn']) &&
    isSkipPrioritySteps(settings['opponentTurn']) &&
    Object.keys(DEFAULT_SKIP_PRIORITY_SETTINGS)
      .filter((key) => key !== 'yourTurn' && key !== 'opponentTurn')
      .every((key) => typeof settings[key] === 'boolean')
  );
}
