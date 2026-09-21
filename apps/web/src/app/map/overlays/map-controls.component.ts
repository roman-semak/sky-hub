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
        i18n-title="@@controls.layers"
        aria-label="Layers"
        i18n-aria-label="@@controls.layers"
        (click)="layers.emit()"
      >
        <st-icon name="stack-simple" />
      </button>
      <button
        type="button"
        class="icon-btn"
        title="Replay the last hour"
        i18n-title="@@controls.replay"
        aria-label="Replay the last hour"
        i18n-aria-label="@@controls.replay"
        data-testid="open-playback"
        (click)="history.emit()"
      >
        <st-icon name="clock-counter-clockwise" />
      </button>
      <button
        type="button"
        class="icon-btn"
        title="My location"
        i18n-title="@@controls.locate"
        aria-label="My location"
        i18n-aria-label="@@controls.locate"
        (click)="locate.emit()"
      >
        <st-icon name="crosshair" />
      </button>
      <button
        type="button"
        class="icon-btn zoom"
        title="Zoom in"
        i18n-title="@@controls.zoomIn"
        aria-label="Zoom in"
        i18n-aria-label="@@controls.zoomIn"
        (click)="zoom.emit(1)"
      >
        <st-icon name="plus" />
      </button>
      <button
        type="button"
        class="icon-btn zoom"
        title="Zoom out"
        i18n-title="@@controls.zoomOut"
        aria-label="Zoom out"
        i18n-aria-label="@@controls.zoomOut"
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
