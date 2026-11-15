import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { MapComponent } from './map/map.component';

@Component({ selector: 'app-map', template: '<div id="view"></div>' })
class MapStubComponent {}

describe('App', () => {
  beforeEach(async () => {
    TestBed.overrideComponent(App, { remove: { imports: [MapComponent] }, add: { imports: [MapStubComponent] } });
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the portal shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.subbar h1')?.textContent).toContain('Your pavilion');
    expect(el.querySelector('#loader')).not.toBeNull();
    expect(Array.from(el.querySelectorAll('#ptabs button')).map(b => b.textContent?.trim()))
      .toEqual(['Plot allocation', 'Build your pavilion', 'GIS analysis', 'Layers', 'Insights']);
    expect(el.querySelectorAll('#panel section.tab').length).toBe(5);
    expect(el.querySelector('#tab-plot')?.classList.contains('on')).toBe(true);
    expect(el.querySelector('#cinema')?.classList.contains('hidden')).toBe(true);
  });

  it('switches tabs', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelectorAll('#ptabs button')[3] as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(el.querySelector('#tab-layers')?.classList.contains('on')).toBe(true);
    expect(el.querySelector('#tab-plot')?.classList.contains('on')).toBe(false);
    expect(el.querySelectorAll('#basemapChips button').length).toBe(6);
  });
});
