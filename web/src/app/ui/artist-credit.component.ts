import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-artist-credit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <i class="ms ms-artist-nib nib" [style.font-size.px]="size()" aria-hidden="true"></i>
    <span class="name">{{ name() }}</span>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      overflow: hidden;
    }

    .nib {
      flex: none;
    }

    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class ArtistCreditComponent {
  readonly name = input.required<string>();
  readonly size = input(11);
}
