import { Injectable } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';

export interface SeoConfig {
  title: string;
  description: string;
  keywords?: string;
  ogImage?: string;
  canonicalUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SeoService {
  private defaultTitle = '学霸网 - 中小学期中期末真题密卷与统编电子课本高清网盘一键转存';
  private defaultDesc = '学霸网精选全国小学、初中、高中期中期末名校真题密卷，考点精讲视频课与正版统编电子课本。支持夸克网盘与百度网盘高速转存，原版A4无损高清打印，助力提分冲刺。';

  constructor(
    private title: Title,
    private meta: Meta
  ) {}

  update(config: Partial<SeoConfig>) {
    const finalTitle = config.title ? `${config.title} - 学霸网` : this.defaultTitle;
    const finalDesc = config.description || this.defaultDesc;

    this.title.setTitle(finalTitle);
    this.meta.updateTag({ name: 'description', content: finalDesc });
    if (config.keywords) {
      this.meta.updateTag({ name: 'keywords', content: config.keywords });
    }

    // OpenGraph
    this.meta.updateTag({ property: 'og:title', content: finalTitle });
    this.meta.updateTag({ property: 'og:description', content: finalDesc });
    this.meta.updateTag({ property: 'og:image', content: config.ogImage || '/og-cover.png' });
    this.meta.updateTag({ property: 'og:type', content: 'website' });

    // Canonical link
    if (typeof document !== 'undefined') {
      let link: HTMLLinkElement | null = document.querySelector('link[rel="canonical"]');
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', 'canonical');
        document.head.appendChild(link);
      }
      const canonical = config.canonicalUrl || (typeof window !== 'undefined' ? `https://www.xuebaw.com${window.location.pathname}` : 'https://www.xuebaw.com/');
      link.setAttribute('href', canonical);
    }
  }

  reset() {
    this.title.setTitle(this.defaultTitle);
    this.meta.updateTag({ name: 'description', content: this.defaultDesc });
    if (typeof document !== 'undefined') {
      const script = document.getElementById('app-structured-data');
      if (script) script.remove();
    }
  }

  setJsonLd(schema: object | object[]) {
    if (typeof document === 'undefined') return;
    let script = document.getElementById('app-structured-data') as HTMLScriptElement;
    if (!script) {
      script = document.createElement('script');
      script.id = 'app-structured-data';
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.text = JSON.stringify(schema);
  }
}
