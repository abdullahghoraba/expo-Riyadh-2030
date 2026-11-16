import { Pipe, PipeTransform, SecurityContext, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { I18nService } from './i18n.service';

/** Translate text nodes only; preserve existing trusted analysis markup and widget containers. */
@Pipe({ name: 'translateHtml', pure: false })
export class TranslateHtmlPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  private readonly sanitizer = inject(DomSanitizer);
  /**
   * Sanitizes and translates text nodes within an HTML snippet while preserving markup and container tags.
   *
   * @param value Raw HTML string or SafeHtml instance.
   * @returns Trusted SafeHtml with translated text nodes.
   */
  transform(value: string | SafeHtml): SafeHtml {
    const source = this.sanitizer.sanitize(SecurityContext.HTML, value) ?? '';
    const fragment = document.createElement('template');
    fragment.innerHTML = source;
    const walker = document.createTreeWalker(fragment.content, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) node.textContent = this.i18n.text(node.textContent);
    return this.sanitizer.bypassSecurityTrustHtml(fragment.innerHTML);
  }
}
