import { counterLabel } from './counter-label';

describe('counter label', () => {
  it('names a single counter without counting it', () => {
    expect(counterLabel(1, '+1/+1')).toBe('+1/+1');
    expect(counterLabel(1, 'loyalty')).toBe('loyalty');
  });

  it('multiplies the name once there is more than one', () => {
    expect(counterLabel(2, '+1/+1')).toBe('2 × +1/+1');
    expect(counterLabel(17, 'charge')).toBe('17 × charge');
  });

  it('says so if a counter is somehow at zero', () => {
    expect(counterLabel(0, 'charge')).toBe('0 × charge');
  });
});
