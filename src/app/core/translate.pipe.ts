import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from './i18n.service';

/** Impure so a language change also refreshes unchanged strings in OnPush views. */
@Pipe({ name: 't', pure: false })
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  /**
   * Transforms input text by looking up its Arabic translation via {@link I18nService}.
   *
   * @param value Text string, identifier, or value to translate.
   * @returns Translated string or original representation.
   */
  transform(value: unknown): string {
    return this.i18n.text(value);
  }
}
