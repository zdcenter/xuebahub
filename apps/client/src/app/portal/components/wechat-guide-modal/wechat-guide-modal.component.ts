import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-wechat-guide-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen) {
      <div 
        class="fixed inset-0 z-[999999] bg-slate-950/90 backdrop-blur-md flex flex-col justify-start items-center p-6 text-white select-none animate-fadeIn"
        (click)="onBackdropClick($event)">
        
        <!-- 1. 右上角发光指引弯箭头 (精准指向微信/QQ客户端右上角三个点 ···) -->
        <div class="absolute top-3 right-6 sm:right-12 flex flex-col items-end pointer-events-none animate-bounce" style="animation-duration: 1.5s;">
          <svg class="w-16 h-16 sm:w-20 sm:h-20 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]" viewBox="0 0 100 100" fill="none">
            <!-- 向上扬起弧度弯线 -->
            <path d="M 20 85 C 35 60 55 35 85 15" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-dasharray="6 4" />
            <!-- 箭头头部 -->
            <polygon points="85,15 70,16 83,28" fill="currentColor" />
          </svg>
          <div class="mt-1 bg-amber-400 text-slate-950 text-xs sm:text-sm font-black px-3 py-1 rounded-full shadow-lg">
            👆 点这里【···】
          </div>
        </div>

        <!-- 2. 中间卡片指引 (毛玻璃拟态质感) -->
        <div 
          class="mt-28 sm:mt-36 max-w-sm w-full bg-slate-900/90 border border-slate-700/80 rounded-3xl p-6 sm:p-7 shadow-2xl backdrop-blur-xl text-center space-y-5"
          (click)="$event.stopPropagation()">
          
          <div class="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-3xl shadow-lg shadow-blue-500/30">
            🚀
          </div>

          <div>
            <h3 class="text-lg sm:text-xl font-black text-white tracking-tight">
              请在系统浏览器中打开
            </h3>
            <p class="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
              微信 / QQ 限制直接唤起网盘应用，仅需简单两步即可极速转存：
            </p>
          </div>

          <!-- 步骤指引 -->
          <div class="bg-slate-800/80 rounded-2xl p-4 text-left space-y-3 border border-slate-700/60 text-xs sm:text-sm">
            <div class="flex items-center gap-3">
              <span class="w-6 h-6 rounded-full bg-amber-400 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">1</span>
              <span class="text-slate-200">点击右上角三个点 <strong class="text-amber-300 font-extrabold">【···】</strong></span>
            </div>
            <div class="flex items-center gap-3">
              <span class="w-6 h-6 rounded-full bg-emerald-400 text-slate-950 font-black flex items-center justify-center shrink-0 text-xs">2</span>
              <span class="text-slate-200">选择 <strong class="text-emerald-400 font-extrabold">【在浏览器中打开】</strong></span>
            </div>
          </div>

          <!-- 提取码复制提示 -->
          @if (extractCode) {
            <div class="bg-blue-950/60 border border-blue-500/40 rounded-xl p-3 flex items-center justify-between gap-2">
              <div class="text-left text-xs">
                <span class="text-slate-400 block">网盘提取码：</span>
                <span class="font-mono text-base font-black text-blue-400 tracking-wider">{{ extractCode }}</span>
              </div>
              <button 
                type="button"
                (click)="copyExtractCode()"
                class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer active:scale-95">
                {{ codeCopied() ? '✓ 已复制' : '复制密码' }}
              </button>
            </div>
          }

          <!-- 底部关闭与直接打开备选 -->
          <div class="space-y-2 pt-2">
            @if (targetUrl) {
              <a 
                [href]="targetUrl" 
                class="block w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition text-center active:scale-98">
                若已在外部浏览器，点此直接转存
              </a>
            }
            <button 
              type="button" 
              (click)="close.emit()" 
              class="block w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer">
              我知道了，返回浏览
            </button>
          </div>

        </div>

      </div>
    }
  `,
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
    .animate-fadeIn {
      animation: fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
  `]
})
export class WechatGuideModalComponent {
  @Input() isOpen = false;
  @Input() targetUrl?: string;
  @Input() extractCode?: string;
  @Output() close = new EventEmitter<void>();

  codeCopied = signal<boolean>(false);

  onBackdropClick(event: MouseEvent) {
    this.close.emit();
  }

  copyExtractCode() {
    if (!this.extractCode) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(this.extractCode).then(() => {
        this.codeCopied.set(true);
        setTimeout(() => this.codeCopied.set(false), 2000);
      }).catch(() => {});
    }
  }
}

