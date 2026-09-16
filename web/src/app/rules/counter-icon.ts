const COUNTER_ICON_CLASSES: Record<string, string> = {
  '+1/+1': 'ms-counter-plus',
  '-1/-1': 'ms-counter-minus',
  loyalty: 'ms-counter-loyalty',
  charge: 'ms-counter-charge',
  gold: 'ms-counter-gold',
  ki: 'ms-counter-ki',
  lore: 'ms-counter-lore',
  time: 'ms-counter-time',
  doom: 'ms-counter-doom',
  echo: 'ms-counter-echo',
  finality: 'ms-counter-finality',
  deathtouch: 'ms-counter-deathtouch',
  rad: 'ms-counter-rad',
  flame: 'ms-counter-flame',
  flood: 'ms-counter-flood',
  fungus: 'ms-counter-fungus',
  mining: 'ms-counter-mining',
  muster: 'ms-counter-muster',
  pin: 'ms-counter-pin',
  scream: 'ms-counter-scream',
  slime: 'ms-counter-slime',
  verse: 'ms-counter-verse',
  void: 'ms-counter-void',
  vortex: 'ms-counter-vortex',
  shield: 'ms-counter-shield',
  stun: 'ms-counter-stun',
  brick: 'ms-counter-brick',
  arrow: 'ms-counter-arrow',
  devotion: 'ms-counter-devotion',
  energy: 'ms-energy',
};

const UNEVEN_PLUS = /^\+\d+\/\+\d+$/;
const UNEVEN_MINUS = /^-\d+\/-\d+$/;

export function counterIconClass(name: string): string | null {
  const lower = name.toLowerCase();
  const exact = COUNTER_ICON_CLASSES[lower];
  if (exact) return exact;
  if (UNEVEN_PLUS.test(lower)) return 'ms-counter-plus-uneven';
  if (UNEVEN_MINUS.test(lower)) return 'ms-counter-minus-uneven';
  return null;
}
