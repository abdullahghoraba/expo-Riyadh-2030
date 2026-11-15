import narrationJson from '../../../public/data/narration.json';
import plotsJson from '../../../public/data/plots.geojson';
import siteJson from '../../../public/data/site.json';
import { Narration, PlotCollection, Site } from './models';

describe('data models', () => {
  it('parses site.json', () => {
    const site: Site = JSON.parse(JSON.stringify(siteJson));
    expect(site.name).toBe('Expo 2030 Riyadh');
    expect(site.nameAr.length).toBeGreaterThan(0);
    expect(site.center).toEqual({ lon: 46.715, lat: 24.895 });
    expect(site.walkingSpeedMpm).toBe(80);
    expect(site.participant).toEqual({ name: 'UK delegation', initials: 'AY' });
    expect(site.station).toHaveLength(2);
    expect(site.globe).toEqual([46.715, 24.895]);
    expect(site.facts.length).toBe(6);
    expect(site.districts.map(d => d.id)).toEqual(['NE', 'NW', 'SW', 'SE']);
    for (const d of site.districts) {
      expect(d.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(d.block.center).toHaveLength(2);
      expect(typeof d.block.rotation).toBe('number');
    }
  });

  it('parses narration.json', () => {
    const n = narrationJson as Narration;
    expect(n.imagine.length).toBe(7);
    expect(n.tour.length).toBe(7);
    expect(n.imagine.every(s => s.id && s.en && s.ar && s.arSpeech)).toBe(true);
  });

  it('plots reference the site districts', () => {
    const plots = JSON.parse(plotsJson) as PlotCollection, site = siteJson as Site;
    const ids = new Set(site.districts.map(d => d.id));
    expect(plots.features.length).toBe(24);
    expect(plots.features.every(f => ids.has(f.properties.district))).toBe(true);
    expect(plots.features.every(f => f.properties.status === 'available' || f.properties.status === 'taken')).toBe(true);
  });
});
