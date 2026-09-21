import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { IconComponent } from '../ui/icon/icon.component';
import { PlaybackService, type PlaybackSpeed } from './playback.service';

const clockTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/** Time scrubber and transport controls for history playback (SPEC § 5.3 screen 6). */
@Component({
  selector: 'st-playback-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="bar glass" role="region" aria-label="History playback" data-testid="playback-bar">
      @switch (pb.state()) {
        @case ('loading') {
          <span class="status" role="status">Loading the last hour…</span>
        }
        @case ('error') {
          <span class="status" role="status">History is unavailable right now.</span>
        }
        @default {
          <button
            type="button"
            class="play"
            [attr.aria-label]="pb.playing() ? 'Pause' : 'Play'"
            data-testid="playback-toggle"
            (click)="pb.playing() ? pb.pause() : pb.play()"
          >
            <st-icon [name]="pb.playing() ? 'pause' : 'play'" />
          </button>
          <span class="time tabular" data-testid="playback-time">{{ label() }}</span>
          <input
            class="scrub"
            type="range"
            aria-label="Playback time"
            [min]="pb.start()"
            [max]="pb.end()"
            [step]="1000"
            [value]="pb.time()"
            (input)="seek($event)"
          />
          <div class="speeds" role="group" aria-label="Playback speed">
            @for (s of speeds; track s) {
              <button type="button" [attr.aria-pressed]="pb.speed() === s" (click)="pb.setSpeed(s)">
                ×{{ s }}
              </button>
            }
          </div>
          <span class="count tabular">{{ pb.aircraft() }} aircraft</span>
        }
      }
      <button type="button" class="close" aria-label="Back to live" (click)="pb.close()">
        Live
      </button>
    </div>
  `,
  styles: `
    .bar {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 10px 14px;
      border-radius: 18px;
      min-width: min(720px, calc(100vw - 28px));
    }
    .play {
      width: 40px;
      height: 40px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      font-size: 18px;
      color: var(--color-accent-200);
      background: rgba(var(--acc), 0.16);
      border: 1px solid var(--color-accent-700);
    }
    .time {
      font-family: var(--font-heading);
      font-size: 15px;
      min-width: 72px;
    }
    .scrub {
      flex: 1;
      accent-color: var(--color-accent-500);
      min-width: 80px;
    }
    .speeds {
      display: flex;
      padding: 3px;
      border-radius: 12px;
      background: rgba(var(--ink), 0.07);
    }
    .speeds button {
      padding: 5px 9px;
      border-radius: 9px;
      font-size: 12px;
      color: var(--color-neutral-400);
    }
    .speeds button[aria-pressed='true'] {
      background: rgba(var(--acc), 0.28);
      color: var(--color-accent-100);
    }
    .count,
    .status {
      font-size: 12px;
      color: var(--color-neutral-400);
      white-space: nowrap;
    }
    .status {
      flex: 1;
    }
    .close {
      padding: 8px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      color: var(--color-neutral-200);
      background: rgba(var(--ink), 0.08);
      border: 1px solid rgba(var(--ink), 0.12);
    }
    @media (max-width: 767px) {
      .count {
        display: none;
      }
    }
  `,
})
export class PlaybackBarComponent {
  protected readonly pb = inject(PlaybackService);
  protected readonly speeds: readonly PlaybackSpeed[] = [1, 10, 60];
  protected readonly label = computed(() => clockTime(this.pb.time()));

  protected seek(e: Event): void {
    this.pb.seek((e.target as HTMLInputElement).valueAsNumber);
  }
}
