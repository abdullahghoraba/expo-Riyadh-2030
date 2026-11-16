import { Injectable, inject } from '@angular/core';
import { ltrIsolate } from './arabic';
import { DataService } from './data.service';
import { StateService } from './state.service';
import { AR } from './translations.ar';

const PHRASES = Object.keys(AR).sort((a, b) => b.length - a.length);

/**
 * Escapes special regular expression characters in a string.
 *
 * @param s String containing potential regex metacharacters.
 * @returns Escaped regex string.
 */
const escaped = (s: string): string => Array.from(s, c => [46,42,43,63,94,36,123,125,40,41,124,91,93,92].includes(c.charCodeAt(0)) ? String.fromCharCode(92) + c : c).join('');

/** Alias for {@link escaped} conforming to descriptive function naming. */
export const escapeRegex = escaped;

const RE = new RegExp('(?<![A-Za-z\\-])(' + PHRASES.map(escaped).join('|') + ')(?![A-Za-z\\-])', 'g');

/** Reactive display translation; application identifiers and database values remain unchanged. */
@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly state = inject(StateService);
  private readonly data = inject(DataService);

  /**
   * Translates a label or phrase into Arabic if the current application language is set to 'ar'.
   * Checks district names, building properties, phrase catalogs, and isolates Latin alphanumeric codes.
   *
   * @param value Text, identifier, or object to translate.
   * @returns Translated string if applicable, or original string representation.
   */
  text(value: unknown): string {
    const text = String(value ?? '');
    if (this.state.lang() !== 'ar' || !text) return text;
    const district = this.data.data()?.site.districts.find(d => d.name === text);
    if (district) return district.nameAr;
    const building = this.data.data()?.buildings.features.find(f => f.properties.name === text && f.properties.nameAr);
    if (building) return building.properties.nameAr!;
    const street = this.data.data()?.streets.features.find(f => f.properties.name === text && f.properties.nameAr);
    if (street) return street.properties.nameAr!;
    const serviceLoc = this.data.data()?.services.features.find(f => f.properties.location === text && f.properties.locationAr);
    if (serviceLoc) return serviceLoc.properties.locationAr!;
    const serviceName = this.data.data()?.services.features.find(f => f.properties.name === text && f.properties.nameAr);
    if (serviceName) return serviceName.properties.nameAr!;
    const parking = this.data.data()?.parking.features.find(f => f.properties.name === text && f.properties.nameAr);
    if (parking) return parking.properties.nameAr!;
    const translated = AR[text] ?? text.replace(RE, part => AR[part]);
    return translated.replace(/\b[A-Z]{2}-\d+\b/g, ltrIsolate);
  }
}
