import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MapUiStore, type SheetStop } from '../core/state/map-ui.store';

/** Fraction of the viewport height each stop occupies (design 1a / 1b). */
const STOP_HEIGHT: Readonly<Record<SheetStop, number>> = {
  collapsed: 0.09,
  peek: 0.46,
  full: 0.73,
};

const ORDER: readonly SheetStop[] = ['collapsed', 'peek', 'full'];

/**
 * Mobile drag sheet with three stops. Dragging moves it freely; on release it
 * settles to the nearest stop.
 */
@Component({
  selector: 'st-bottom-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="sheet glass-strong"
      [style.height.%]="heightPct()"
      [style.transition]="dragging() ? 'none' : 'height 260ms cubic-bezier(.22,1,.36,1)'"
    >
      <button
        type="button"
        class="grabber-hit"
        [attr.aria-label]="sheetLabel()"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp()"
        (pointercancel)="onUp()"
        (keydown.arrowUp)="step(1)"
        (keydown.arrowDown)="step(-1)"
      >
        <span class="grabber"></span>
      </button>
      <div class="content">
        <ng-content />
      </div>
    </section>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0 0 var(--tabbar-h, 0px) 0;
      pointer-events: none;
    }
    .sheet {
      pointer-events: auto;
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      border-radius: 30px 30px 0 0;
      padding-top: 10px;
      display: flex;
      flex-direction: column;
      min-height: 0;
      touch-action: none;
    }
    .grabber-hit {
      display: grid;
      place-items: center;
      height: 24px;
      width: 100%;
      cursor: grab;
    }
    .grabber {
      width: 38px;
      height: 4px;
      border-radius: 999px;
      background: rgba(var(--ink), 0.26);
    }
    .content {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
  `,
})
export class BottomSheetComponent {
  private readonly store = inject(MapUiStore);
  protected readonly stop = this.store.sheetStop;
  protected readonly dragging = signal(false);
  private readonly dragPct = signal<number | null>(null);
  private startY = 0;
  private startPct = 0;

  protected readonly sheetLabel = computed(() => {
    const labels: Record<SheetStop, string> = {
      collapsed: $localize`:@@sheet.collapsed:Sheet collapsed, press arrow up to expand`,
      peek: $localize`:@@sheet.peek:Sheet half open`,
      full: $localize`:@@sheet.full:Sheet fully open, press arrow down to shrink`,
    };
    return labels[this.stop()];
  });

  protected readonly heightPct = computed(() => this.dragPct() ?? STOP_HEIGHT[this.stop()] * 100);

  protected onDown(e: PointerEvent): void {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    this.startY = e.clientY;
    this.startPct = STOP_HEIGHT[this.stop()] * 100;
    this.dragging.set(true);
  }

  protected onMove(e: PointerEvent): void {
    if (!this.dragging()) return;
    const deltaPct = ((this.startY - e.clientY) / globalThis.innerHeight) * 100;
    this.dragPct.set(Math.min(85, Math.max(6, this.startPct + deltaPct)));
  }

  protected onUp(): void {
    if (!this.dragging()) return;
    const current = (this.dragPct() ?? this.startPct) / 100;
    let best: SheetStop = 'peek';
    let bestDist = Infinity;
    for (const s of ORDER) {
      const d = Math.abs(STOP_HEIGHT[s] - current);
      if (d < bestDist) {
        bestDist = d;
        best = s;
      }
    }
    this.dragging.set(false);
    this.dragPct.set(null);
    this.store.sheetStop.set(best);
  }

  /** Keyboard equivalent of dragging (SPEC § 5.4 keyboard navigation). */
  protected step(direction: number): void {
    const i = ORDER.indexOf(this.stop());
    const next = ORDER[Math.min(ORDER.length - 1, Math.max(0, i + direction))];
    if (next !== undefined) this.store.sheetStop.set(next);
  }
}
