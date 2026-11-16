import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { MapComponent } from './map/map-view/map.component';
import { StateService } from './core/state.service';
import { ImagineService } from './imagine/imagine.service';

@Component({ selector: 'app-map', template: '<div id="view"></div>' })
class MapStubComponent {}

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
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

  it('uses RTL for Arabic narration and LTR for English, independently of the portal', async () => {
    const fixture = TestBed.createComponent(App);
    const state = TestBed.inject(StateService);
    const imagine = TestBed.inject(ImagineService);
    state.lang.set('ar');
    state.cinema.set(true);
    imagine.subtitle.set({ text: 'هذه قطعتك ⁦NE‑01⁩', rtl: true, show: true });
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('#cinema')?.getAttribute('dir')).toBe('rtl');
    expect(el.querySelector('#subtitle')?.getAttribute('lang')).toBe('ar');
    expect(el.querySelector('#subtitle')?.getAttribute('dir')).toBe('rtl');
    expect(el.querySelector('#cinLang')?.getAttribute('dir')).toBe('ltr');
    expect(el.querySelector('#cinStop')?.textContent).toContain('خروج');
    state.lang.set('en');
    imagine.subtitle.set({ text: 'This is your plot NE-01.', rtl: false, show: true });
    await fixture.whenStable();
    expect(el.querySelector('#cinema')?.getAttribute('dir')).toBe('ltr');
    expect(el.querySelector('#subtitle')?.getAttribute('lang')).toBe('en');
    expect(el.querySelector('#subtitle')?.getAttribute('dir')).toBe('ltr');
  });

  it('switches the actual portal to Arabic and restores English through the header buttons', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('#langSeg button[lang="ar"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(el.querySelector('.subbar h1')?.textContent).toBe('جناحك');
    expect(Array.from(el.querySelectorAll('#ptabs button')).map(b => b.textContent?.trim()))
      .toEqual(['تخصيص القطع', 'صمّم جناحك', 'التحليل المكاني', 'الطبقات', 'المؤشرات']);
    expect(el.querySelector('#tab-pavilion')?.textContent).toContain('فصل الطوابق');
    expect(el.querySelector('#tab-analysis')?.textContent).toContain('مناطق الوصول سيرًا');
    expect(el.querySelector('#tab-layers')?.textContent).toContain('خريطة الأساس');
    expect(el.querySelector('#submitModal')?.textContent).toContain('تقديم طلب تخصيص قطعة');
    expect(JSON.parse(localStorage.getItem('expo.lang')!)).toBe('ar');
    (el.querySelector('#langSeg button[lang="en"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(document.documentElement.dir).toBe('ltr');
    expect(el.querySelector('.subbar h1')?.textContent).toBe('Your pavilion');
    expect(el.querySelector('#tab-analysis')?.textContent).toContain('Walking time (isochrones)');
  });
});
