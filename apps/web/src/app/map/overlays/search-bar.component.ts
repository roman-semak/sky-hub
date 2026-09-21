import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from '../../ui/icon/icon.component';

/** Glass search field over the map (design 1a / 2a). */
@Component({
  selector: 'st-search-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <form class="bar glass" (submit)="$event.preventDefault(); submitted.emit(field.value)">
      <st-icon name="magnifying-glass" class="lead" />
      <input
        #field
        type="search"
        name="q"
        [attr.placeholder]="placeholder()"
        aria-label="Search flights, airports or routes"
        (input)="queryChange.emit(field.value)"
      />
      @if (showHint()) {
        <span class="hint">⌘K</span>
      }
    </form>
  `,
  styles: `
    .bar {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 12px 14px;
      border-radius: 20px;
    }
    .lead {
      font-size: 18px;
      color: var(--color-neutral-300);
    }
    input {
      flex: 1;
      min-width: 0;
      border: 0;
      background: none;
      color: var(--color-text);
      font: inherit;
      font-size: 14px;
      outline: none;
    }
    input::placeholder {
      color: var(--color-neutral-400);
    }
    .hint {
      display: none;
      font-size: 11px;
      padding: 3px 7px;
      border-radius: 8px;
      color: var(--color-neutral-400);
      border: 1px solid rgba(var(--ink), 0.14);
    }
    @media (min-width: 768px) {
      .hint {
        display: inline;
      }
    }
    @media (min-width: 1200px) {
      .bar {
        width: 380px;
        border-radius: 18px;
      }
    }
  `,
})
export class SearchBarComponent {
  readonly placeholder = input('Flight, airport or route');
  readonly showHint = input(false);
  readonly queryChange = output<string>();
  readonly submitted = output<string>();
}
