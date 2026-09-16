import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { IconNode } from 'lucide';

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="strokeWidth()"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      [innerHTML]="markup()"
    ></svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-shrink: 0;

      vertical-align: -0.125em;
    }

    svg {
      width: 1em;
      height: 1em;
    }
  `,
})
export class IconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  readonly icon = input.required<IconNode>();
  readonly strokeWidth = input(2);

  protected readonly markup = computed(() => {
    const html = this.icon()
      .map(
        ([tag, attrs]) =>
          `<${tag} ${Object.entries(attrs)
            .map(([key, value]) => `${key}="${value}"`)
            .join(' ')}></${tag}>`,
      )
      .join('');
    return this.sanitizer.bypassSecurityTrustHtml(html);
  });
}
