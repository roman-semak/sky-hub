import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { IconComponent } from './icon.component';

describe('IconComponent', () => {
  it('inlines the Phosphor SVG', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(IconComponent);
    fixture.componentRef.setInput('name', 'crosshair');
    fixture.detectChanges();
    const html = (fixture.nativeElement as HTMLElement).innerHTML;
    expect(html).toContain('<svg');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[aria-hidden="true"]'),
    ).not.toBeNull();
  });
});
