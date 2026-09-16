import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-fan-disclaimer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="fan-disclaimer">
      Phase Out is unofficial Fan Content permitted under the Fan Content Policy. Not
      approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the
      Coast. &copy;Wizards of the Coast LLC.
    </p>
  `,
  styles: `
    .fan-disclaimer {
      margin: 0;
      color: var(--muted);
      font-size: 0.62rem;
      line-height: 1.3;
    }
  `,
})
export class FanDisclaimerComponent {}
