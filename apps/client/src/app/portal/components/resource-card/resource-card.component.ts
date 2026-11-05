import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ResourceItemDto, ResourceLinkDto } from '../../../services/resource.service';

@Component({
  selector: 'app-resource-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './resource-card.component.html'
})
export class ResourceCardComponent {
  @Input({ required: true }) resource!: ResourceItemDto;

  get primaryLink(): ResourceLinkDto | null {
    if (!this.resource.links || this.resource.links.length === 0) return null;
    return this.resource.links.find(l => l.drive_type === 'quark') || this.resource.links[0];
  }

  get hasBaidu(): boolean {
    return !!this.resource.links?.some(l => l.drive_type === 'baidu');
  }

  get isVideo(): boolean {
    const raw = (this.resource.file_type || '').toUpperCase();
    return raw.includes('视频') || raw.includes('MP4');
  }

  get isPdf(): boolean {
    const raw = (this.resource.file_type || '').toUpperCase();
    return raw.includes('PDF');
  }

  get formattedDate(): string {
    return '2026 最新收录';
  }
}
