import { Component, AfterViewInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`
})
export class App implements AfterViewInit {
  ngAfterViewInit() {
    // 当 Angular 视图挂载完成，平滑淡出原生启动闪屏 (握手时长 80ms)
    if (typeof window !== 'undefined' && (window as any).__hidePwaSplash) {
      setTimeout(() => {
        (window as any).__hidePwaSplash();
      }, 80);
    }
  }
}
