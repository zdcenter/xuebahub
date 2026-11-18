import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ResourceItemDto, ResourceLinkDto } from '../../../services/resource.service';
import { getStageTheme } from '../../../utils/stage-theme.util';

@Component({
  selector: 'app-book-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './book-card.component.html'
})
export class BookCardComponent {
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
}
