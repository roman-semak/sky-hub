import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { formatBytesPerSec, formatCount } from '../../core/format/format';
import { StreamClient } from '../../core/live/stream-client.service';
import { MapUiStore } from '../../core/state/map-ui.store';

/**
 * Bottom-left feed strip (design 2a): surfaces the SPEC performance budgets
 * — aircraft in view, frame time, stream rate — in the UI itself.
 */
@Component({
  selector: 'st-feed-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="strip glass">
      <div class="stat">
        <span class="eyebrow">In view</span>
        <span class="value tabular" data-testid="in-view">{{ inView() }}</span>
      </div>
      <span class="divider"></span>
      <div class="stat">
        <span class="eyebrow">Frame</span>
        <span class="value tabular" data-testid="frame-ms">{{ frame() }}</span>
      </div>
      <span class="divider"></span>
      <div class="stat">
        <span class="eyebrow">Stream</span>
        <span class="value tabular">{{ stream() }}</span>
      </div>
    </div>
  `,
  styles: `
    .strip {
      display: flex;
      align-items: center;
      gap: 22px;
      padding: 13px 18px;
      border-radius: 18px;
    }
    .stat {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .value {
      font-family: var(--font-heading);
      font-size: 19px;
      font-weight: 500;
    }
    .divider {
      width: 1px;
      height: 30px;
      background: rgba(var(--ink), 0.14);
    }
  `,
})
export class FeedStripComponent {
  private readonly store = inject(MapUiStore);
  private readonly client = inject(StreamClient);
  protected readonly inView = () => formatCount(this.store.drawn());
  protected readonly frame = () => `${this.store.frameMs().toFixed(1)} ms`;
  protected readonly stream = () => formatBytesPerSec(this.client.bytesPerSec());
}
