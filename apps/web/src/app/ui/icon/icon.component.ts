import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { ICONS, type IconName } from './icons';

/** Inline SVG icon. The markup is a build-time constant, never user input. */
@Component({
  selector: 'st-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="icon" aria-hidden="true" [innerHTML]="svg()"></span>`,
  styles: `
    .icon {
      display: inline-flex;
      width: 1em;
      height: 1em;
    }
    .icon ::ng-deep svg {
      width: 100%;
      height: 100%;
      fill: currentColor;
    }
  `,
})
export class IconComponent {
  readonly name = input.required<IconName>();
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly svg = computed<SafeHtml>(() =>
    this.sanitizer.bypassSecurityTrustHtml(ICONS[this.name()]),
  );
}
