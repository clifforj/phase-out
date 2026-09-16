import { Directive, ElementRef, HostListener, inject, input, output } from '@angular/core';

@Directive({
  selector: '[appPopover]',
})
export class PopoverDirective {
  private readonly el = inject(ElementRef<HTMLElement>);

  readonly appPopover = input(false);
  readonly appPopoverDismiss = output<void>();

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (this.appPopover() && !this.el.nativeElement.contains(event.target as Node)) {
      this.appPopoverDismiss.emit();
    }
  }
}
