import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { IconComponent } from '../../ui/icon/icon.component';

/** Layer / locate / zoom column (design 1a, 2a). */
@Component({
  selector: 'st-map-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="controls">
      <button
        type="button"
        class="icon-btn"
        title="Layers"
        aria-label="Layers"
        (click)="layers.emit()"
      >
        <st-icon name="stack-simple" />
      </button>
      <button
        type="button"
        class="icon-btn"
        title="Replay the last hour"
        aria-label="Replay the last hour"
        data-testid="open-playback"
        (click)="history.emit()"
      >
        <st-icon name="clock-counter-clockwise" />
      </button>
      <button
        type="button"
        class="icon-btn"
        title="My location"
        aria-label="My location"
        (click)="locate.emit()"
      >
        <st-icon name="crosshair" />
      </button>
      <button
        type="button"
        class="icon-btn zoom"
        title="Zoom in"
        aria-label="Zoom in"
        (click)="zoom.emit(1)"
      >
        <st-icon name="plus" />
      </button>
      <button
        type="button"
        class="icon-btn zoom"
        title="Zoom out"
        aria-label="Zoom out"
        (click)="zoom.emit(-1)"
      >
        <st-icon name="minus" />
      </button>
    </div>
  `,
  styles: `
    .controls {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    button {
      min-width: 40px;
      min-height: 40px;
    }
    @media (max-width: 767px) {
      .zoom {
        display: none;
      }
    }
  `,
})
export class MapControlsComponent {
  readonly zoom = output<number>();
  readonly locate = output();
  readonly layers = output();
  readonly history = output();
}
