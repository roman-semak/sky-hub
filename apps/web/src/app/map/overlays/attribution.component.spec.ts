import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FETCH_FN } from '../../core/live/aircraft-meta.service';
import { WeatherLayersService } from '../../weather/weather-layers.service';
import { AttributionComponent } from './attribution.component';

const render = (): { html: () => string; weather: WeatherLayersService } => {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: FETCH_FN, useValue: async () => new Response('{}', { status: 200 }) },
    ],
  });
  const fixture = TestBed.createComponent(AttributionComponent);
  fixture.detectChanges();
  return {
    html: () => {
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).innerHTML;
    },
    weather: TestBed.inject(WeatherLayersService),
  };
};

describe('AttributionComponent', () => {
  it('always credits the feeds, the basemap and the disclaimer', () => {
    const { html } = render();
    expect(html()).toContain('adsb.lol');
    expect(html()).toContain('CARTO');
    expect(html()).toContain('not for navigation');
  });

  it('credits an optional layer only while it is on', () => {
    const { html, weather } = render();
    expect(html()).not.toContain('RainViewer');

    weather.radarOn.set(true);
    expect(html()).toContain('RainViewer');

    weather.radarOn.set(false);
    expect(html()).not.toContain('RainViewer');
  });

  it('credits wind and terrain sources together', () => {
    const { html, weather } = render();
    weather.windOn.set(true);
    weather.threeD.set(true);
    const out = html();
    expect(out).toContain('Open-Meteo');
    expect(out).toContain('Mapzen / AWS Open Data');
  });
});
