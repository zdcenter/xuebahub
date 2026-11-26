import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PortalService } from '../../../core/services/portal.service';
import { SeoService } from '../../../core/services/seo.service';
import { ResourceItemDto, CollectionDto } from '../../../services/resource.service';
import { ResourceCardComponent } from '../../components/resource-card/resource-card.component';
import { BookCardComponent } from '../../components/book-card/book-card.component';

@Component({
  selector: 'app-collection-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ResourceCardComponent, BookCardComponent],
  templateUrl: './collection-detail.component.html'
})
export class CollectionDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private portalService = inject(PortalService);
  private seoService = inject(SeoService);

  collection = signal<CollectionDto | null>(null);
  items = signal<ResourceItemDto[]>([]);
  isLoading = signal<boolean>(true);
  notFound = signal<boolean>(false);

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const slug = params.get('slug') || '';
      if (!slug) {
        this.notFound.set(true);
        this.isLoading.set(false);
        return;
      }
      this.loadCollection(slug);
    });
  }

  loadCollection(slug: string) {
    this.isLoading.set(true);
    this.notFound.set(false);
    this.portalService.getPublicCollectionDetail(slug).subscribe(data => {
      this.isLoading.set(false);
      if (!data || !data.collection) {
        this.notFound.set(true);
        return;
      }
      this.collection.set(data.collection);
      this.items.set(data.items || []);

      const col = data.collection;
      const count = (data.items || []).length;
      const rawDesc = (col.description || '').trim();
      const seoDesc = rawDesc.length >= 70
        ? rawDesc
        : `${rawDesc ? rawDesc + '。' : ''}学霸网为您整理《${col.title}》全套共 ${count} 份精选高清PDF学习资料与配套解答，支持夸克网盘免密直存与A4清晰打印，一站集齐完整系列资源。`;

      this.seoService.update({
        title: `${col.title}（全${count}册合集）高清PDF网盘下载 - 学霸网`,
        description: seoDesc,
        keywords: `${col.title}, ${col.title}全套下载, ${col.title}PDF, 夸克网盘合集, 学霸网`,
        ogImage: col.cover_image || undefined,
        canonicalUrl: `https://www.xuebaw.com/collection/${col.slug}`
      });

      this.seoService.setJsonLd({
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        'name': col.title,
        'description': seoDesc,
        'url': `https://www.xuebaw.com/collection/${col.slug}`,
        'numberOfItems': count
      });
    });
  }

  isBookItem(item: ResourceItemDto): boolean {
    return item.channel_slug === 'book' || item.stage === 'book';
  }
}
