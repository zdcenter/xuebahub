import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PortalService } from '../../../core/services/portal.service';
import { ResourceItemDto, ResourceLinkDto } from '../../../services/resource.service';
import { getStageTheme } from '../../../utils/stage-theme.util';

@Component({
  selector: 'app-book-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './book-card.component.html'
})
export class BookCardComponent {
  private portalService = inject(PortalService);
  @Input({ required: true }) resource!: ResourceItemDto;

  get primaryLink(): ResourceLinkDto | null {
    if (!this.resource.links || this.resource.links.length === 0) return null;
    return this.resource.links.find(l => l.drive_type === 'quark') || this.resource.links[0];
  }

  get downloadUrl(): string {
    return this.primaryLink ? this.primaryLink.share_url : `/resource/${this.resource.slug || this.resource.id}`;
  }

  get subjectBgColor(): string {
    return getStageTheme(this.resource).gradientClass;
  }

  get isNew2024(): boolean {
    const t = (this.resource?.title || '');
    const d = (this.resource?.description || '');
    return t.includes('2024') || d.includes('2024');
  }

  onQuickSave() {
    const slug = this.resource?.slug || this.resource?.id;
    if (!slug) return;
    this.resource.save_count = (this.resource.save_count || 0) + 1;
    this.portalService.trackResourceSave(slug, this.primaryLink?.id).subscribe(data => {
      if (data && typeof data.save_count === 'number') {
        this.resource.save_count = data.save_count;
      }
    });
  }
}
