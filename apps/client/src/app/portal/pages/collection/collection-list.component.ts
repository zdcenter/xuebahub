import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PortalService } from '../../../core/services/portal.service';
import { SeoService } from '../../../core/services/seo.service';
import { CollectionDto } from '../../../services/resource.service';

@Component({
  selector: 'app-collection-list',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './collection-list.component.html'
})
export class CollectionListComponent implements OnInit {
  isLoading = signal<boolean>(true);
  collections = signal<CollectionDto[]>([]);

  constructor(
    private portalService: PortalService,
    private seoService: SeoService
  ) {}

  ngOnInit() {
    this.seoService.update({
      title: '精选系列专辑合集 - 成套教辅与丛书网盘打包下载 - 学霸网',
      description: '学霸网精选专辑与丛书合集专区，将同系列多册教辅、竞赛教材与配套解析打包归纳，支持按套浏览与夸克网盘免密直存。',
      keywords: '学习资料专辑, 丛书合集, 成套教辅下载, 竞赛系列PDF, 学霸网'
    });

    this.portalService.getPublicCollections().subscribe({
      next: (list) => {
        this.collections.set(list || []);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }
}
