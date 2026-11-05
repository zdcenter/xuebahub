import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ResourceItemDto, ResourceLinkDto } from '../../../services/resource.service';

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
    const sub = this.resource.subject || '';
    if (sub.includes('语')) return 'from-amber-600 via-orange-600 to-amber-700';
    if (sub.includes('数')) return 'from-blue-600 via-sky-600 to-cyan-700';
    if (sub.includes('英')) return 'from-emerald-600 via-teal-600 to-emerald-700';
    if (sub.includes('物理') || sub.includes('科学')) return 'from-purple-600 via-indigo-600 to-violet-700';
    return 'from-blue-600 to-indigo-700';
  }
}
