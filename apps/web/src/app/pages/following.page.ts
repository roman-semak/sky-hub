import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder screen; built in a later phase. */
@Component({
  selector: 'st-following-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="page">
    <h1>{{ title }}</h1>
    <p>Coming in the next phase.</p>
  </section>`,
  styles: `
    .page {
      padding: 22px;
    }
    h1 {
      font-family: var(--font-heading);
      font-weight: 500;
      font-size: 28px;
      margin: 0 0 8px;
    }
    p {
      color: var(--color-neutral-400);
    }
  `,
})
export class FollowingPage {
  protected readonly title = 'Following';
}
