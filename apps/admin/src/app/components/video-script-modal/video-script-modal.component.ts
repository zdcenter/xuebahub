import { Component, effect, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { I18nService } from '../../services/i18n.service';

export interface StoryboardShot {
  shotNumber: number;
  timeRange: string;
  nameKey: string;
  visual: string;      // 画面构图与运镜机位 (真实网站实景/试卷特写/红笔批注/A4纸质感)
  voiceover: string;   // 大白话口播台词 (口语化、接地气、击中家长痛点)
  overlayText: string; // 屏幕花字字幕 (大字醒目)
}

@Component({
  selector: 'app-video-script-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './video-script-modal.component.html',
  styleUrls: ['./video-script-modal.component.css']
})
export class VideoScriptModalComponent {
  i18n = inject(I18nService);

  isOpen = input<boolean>(false);
  resource = input<any>(null);
  batchResources = input<any[]>([]);
  closed = output<void>();

  activeMode = signal<'voiceover' | 'slice' | 'carousel'>('voiceover');

  videoTitle = signal<string>('');
  geminiPrompt = signal<string>('');
  shots = signal<StoryboardShot[]>([]);
  pinnedComment = signal<string>('');
  tagsText = signal<string>('');

  // 真实网站实景参数 (全小写 xuebaw.com)
  realWebsiteUrl = signal<string>('https://xuebaw.com');
  resourceTitle = signal<string>('');
  resourceGrade = signal<string>('');
  resourceSubject = signal<string>('');
  resourceSlug = signal<string>('');

  feedbackMessage = signal<string | null>(null);

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        this.generateScripts();
        this.feedbackMessage.set(null);
      }
    });
  }

  setMode(mode: 'voiceover' | 'slice' | 'carousel') {
    this.activeMode.set(mode);
    this.generateScripts();
  }

  generateScripts() {
    const res = this.resource();
    const batch = this.batchResources();
    const isBatch = batch && batch.length > 1;

    const title = isBatch
      ? `【${batch[0]?.grade || '全阶段'}】${batch.length}套真题与密卷全套合辑`
      : (res?.title || '精选名校期末与中高考真题');
    const grade = isBatch ? (batch[0]?.grade || '全阶段') : (res?.grade || '全阶段');
    const subject = isBatch ? '全科' : (res?.subject || '精品科目');
    const size = isBatch ? `${batch.length} 套资料包` : (res?.file_size || '精选全套');
    const slug = res?.slug || res?.id || 'res-01';

    // 落地页全小写 xuebaw.com
    const targetUrl = isBatch ? 'https://xuebaw.com' : `https://xuebaw.com/resource/${slug}`;
    this.realWebsiteUrl.set(targetUrl);
    this.resourceTitle.set(title);
    this.resourceGrade.set(grade);
    this.resourceSubject.set(subject);
    this.resourceSlug.set(slug);

    if (this.activeMode() === 'voiceover') {
      // 模式 1：📚 试卷/教材 A4打印真题成片 (大白话痛点 + 试卷特写 + 真实网站实景)
      this.videoTitle.set(`刷完这套卷期末直接提20分！${grade}${subject}内部真题密卷曝光`);

      const shotList: StoryboardShot[] = [
        {
          shotNumber: 1,
          timeRange: '00:00 - 00:04',
          nameKey: 'videoScript.shot1',
          visual: '【运镜与构图】：俯拍实木书桌，桌面堆放厚重杂乱的教辅，红笔在写得满满当当的草稿纸上打大叉。镜头平滑俯冲推进，停留在正中央一本崭新平整的《' + title + '》试卷封面上，晨光斜射，纸面工整有质感。',
          voiceover: '家有' + grade + '学生的家长，先别划走！别再去花几百块到处买那些质量参差不齐的盗版教辅了。今天我把这套名校内部期末真题密卷全套整理出来了，原卷排版，直接拿去给孩子练！',
          overlayText: '期末少走弯路！名校真题密卷曝光 ⚡'
        },
        {
          shotNumber: 2,
          timeRange: '00:05 - 00:15',
          nameKey: 'videoScript.shot2',
          visual: '【运镜与构图】：45度微距斜角平移特写。镜头掠过试卷最后的两道压轴大题与核心公式，一支红色中性笔在关键得分步骤下画出波浪线重点批注，右侧整齐摆放着带详尽分步解析的官方参考答案与答题卡。',
          voiceover: '为什么一定要刷这套？大家看这最后两道压轴大题，全是今年重点校模拟考高频命中的新题型！不仅题型抓得准，最关键的是每道题都配了官方标准答题卡和名师解题思路，孩子哪一步卡壳了，看一眼就能彻底顿悟！',
          overlayText: '名校压轴原题 + 官方名师逐题精讲 🎯'
        },
        {
          shotNumber: 3,
          timeRange: '00:16 - 00:23',
          nameKey: 'videoScript.shot3',
          visual: '【运镜与构图】：中景切换双手特写。双手从家用激光打印机中取出刚刚打印好的试卷，迎着光线轻轻抖动展示。镜头极近微距特写试卷上的微小公式、函数坐标轴和几何图形，线条清晰锐利，无任何黑底重影与模糊噪点。',
          voiceover: '很多家长在网上找资料最怕什么？最怕下下来是模糊截图，一打印字迹全是虚的。这份是纯正 100% 矢量无损高清文件，用普通 A4 纸直接打，字迹和公式极其清晰锐利，整整 ' + size + '，完全够孩子刷透核心考点！',
          overlayText: '100% 矢量无损 · 普通 A4 纸打印极其清晰 ✨'
        },
        {
          shotNumber: 4,
          timeRange: '00:24 - 00:30',
          nameKey: 'videoScript.shot4',
          visual: '【运镜与构图 · 真实官网实景】：实景拍摄电脑/平板屏幕，打开浏览器在地址栏输入并访问全小写网址 xuebaw.com，展现真实的【学霸网】官网界面：顶部经典科技蓝品牌标识（云朵与金学士帽微标，右侧带“👑 官方真题精选”高光徽章），中央清晰展示本套试卷《' + title + '》的真实详情页，包含橙金色“转存享无损A4打印与原画”大白话引导横幅、清晰可见的真实文件树清单，以及醒目的【⚡ 夸克网盘（极速推荐）】与【百度网盘】双通道转存按钮。光标移动点击一键秒存，画面下方同步浮现置顶评论自取指引。',
          voiceover: '完整版真题和高清答题卡，已经全部打包放到网盘了。你在浏览器直接打开【学霸网 · xuebaw.com】，搜编号【#' + slug.slice(-6) + '】或者搜索这套资料名字就能免费转存！赶紧点赞收藏，免得期末复习时找不到了！',
          overlayText: '浏览器访问 xuebaw.com 免费转存 (见置顶评论) 🚀'
        }
      ];
      this.shots.set(shotList);

      // Google Gemini 专属视频生成提示词 Prompt
      this.geminiPrompt.set(
        `# Role: 资深教学教辅短视频编导 & AI 视频导演\n` +
        `# Task: 请根据以下《${title}》教材真题短视频分镜脚本，生成适合 AI 视频工具生成的高清视觉分镜指令、镜头机位细节与制作建议。\n\n` +
        `## 核心资料信息：\n` +
        `- 资料标题：${title}\n` +
        `- 年级学段：${grade}\n` +
        `- 学科版本：${subject}\n` +
        `- 资料规格：${size}（含 A4 矢量无损打印卷 + 官方答题卡 + 名师解析微课）\n` +
        `- 官网访问：xuebaw.com（全小写网址）\n` +
        `- 核心痛点：期末/中高考备考学生急需高质量原题、家长避坑劣质教辅、强调 A4 纸打印绝不发虚模糊\n\n` +
        `## 真实网站实景与界面特征（供 AI 生成真实还原画面）：\n` +
        `- 官网域名：xuebaw.com（纯小写）\n` +
        `- 品牌视觉：顶部白底科技蓝，徽标为深蓝超椭圆内嵌灵动白云与立体金黄色学霸帽、金星，搭配“学霸网 · xuebaw.com”及“👑 官方真题精选”金色徽章。\n` +
        `- 真实详情页布局：正中央显示《${title}》真实真题卡片，上方带有橙金色高光转化横幅【✨ 官方网盘极速直链 · 100% 矢量无损高清 A4 打印 · 配套名师微课原画】，下方并列展现大号绿色【⚡ 夸克网盘（极速推荐 · 免下载原画播放与打印）】与蓝色【百度网盘（备用通道）】转存按钮。\n` +
        `- 落地实操：观众在手机或电脑打开 xuebaw.com，看到的界面与视频里 100% 吻合，极大提升真实信任感。\n\n` +
        `## 分镜结构规划：\n` +
        `1. 镜头 1 (00:00-00:04, 痛点开场): 俯拍杂乱书桌对比工整试卷，运镜快速下推，台词直击避坑痛点。\n` +
        `2. 镜头 2 (00:05-00:15, 大题特写): 微距平移压轴题公式，红笔划线重点，展示官方答题卡与名师思路。\n` +
        `3. 镜头 3 (00:16-00:23, 打印品质): 打印机吐纸与双手展示 A4 试卷特写，极近微距展示矢量字体线条锐利无噪点。\n` +
        `4. 镜头 4 (00:24-00:30, 行动号召): 演示浏览器访问 xuebaw.com 输入编号转存网盘，展现上述真实官网界面，引导看置顶评论。\n\n` +
        `请为我润色输出一段可以直接交给视频生成模型（如 Google Veo / Sora / Gemini Video）的详细英文及中文提示词（Prompt），包含色彩氛围、景深、光影（明亮自然晨光）与帧率（4K 60FPS）。`
      );

    } else if (this.activeMode() === 'slice') {
      // 模式 2：✏️ 名师大题技巧解题微课切片 (B站/抖音解题视频引流)
      this.videoTitle.set(`【${grade}${subject}】老师压箱底的大题解题技巧微课精选（附全套真题打印卷）`);

      const shotList: StoryboardShot[] = [
        {
          shotNumber: 1,
          timeRange: '00:00 - 00:03',
          nameKey: 'videoScript.shot1',
          visual: '【运镜与构图】：黑板或数位板第一视角落笔，“压轴大题秒杀技巧”八个字快速书写完成，右上角带有常驻半透明徽标：“完整试卷与高清打印卷见置顶评论”。',
          voiceover: '考场上碰到这种' + subject + '压轴大题，按常规公式做至少要算半小时！今天教大家名师私藏的三步速解技巧，学会了直接套公式拿满分！',
          overlayText: '名师压箱底大招 · 压轴题三步秒杀技巧 💡'
        },
        {
          shotNumber: 2,
          timeRange: '00:04 - 00:20',
          nameKey: 'videoScript.shot2',
          visual: '【运镜与构图】：屏幕居中播放名师解题的核心切片演算过程，关键步骤与辅助线用黄色荧光笔着重亮起，公式推导严谨流畅，节奏紧凑无废话。',
          voiceover: '第一步先找隐藏条件，看题干里这个隐含参数；第二步套用变形式，直接把复杂二次方程降次；第三步代入极限值验算。整道题不需要草稿纸硬算，两分钟直接搞定！',
          overlayText: '核心踩分点拆解 · 避免失分陷阱 🎯'
        },
        {
          shotNumber: 3,
          timeRange: '00:21 - 00:26',
          nameKey: 'videoScript.shot3',
          visual: '【运镜与构图】：切回到书桌实景，展示包含本题在内的整套《' + title + '》高清纸质打印卷、详细分步答案和全套解题微课目录。',
          voiceover: '像这种高频考点大题，整套试卷里每一道都有对应的原画名师微课精讲和标准答题卡，全部是 A4 矢量无损高清版，自己打印就能直接刷。',
          overlayText: '整套试卷配套原画微课 + 标准答题卡 📚'
        },
        {
          shotNumber: 4,
          timeRange: '00:27 - 00:30',
          nameKey: 'videoScript.shot4',
          visual: '【运镜与构图 · 真实官网实景】：画面定格在 xuebaw.com 真实的学霸网搜索与转存界面，清晰可见真实的试卷详情与夸克/百度网盘转存按钮，底部出现“置顶评论区已整理好无损链接”动态指示箭头。',
          voiceover: '完整原版试卷和全套名师微课已经上传网盘，浏览器直接搜【学霸网 · xuebaw.com】输入编号【#' + slug.slice(-6) + '】即可免费保存，大家看第一条置顶评论！',
          overlayText: '完整版真题卷与微课已置顶 · xuebaw.com 🚀'
        }
      ];
      this.shots.set(shotList);

      this.geminiPrompt.set(
        `# Role: 教学微课切片导演\n` +
        `# Task: 请为《${title}》名师压轴大题解题技巧切片视频生成完整的 AI 视频 Prompt。\n` +
        `- 场景：黑板板书演算 + 试卷实物展示 + 真实学霸网（xuebaw.com 全小写）界面展示 + 4K 极清画质。\n` +
        `- 重点：前3秒快速给出技巧结论吸引完播，中段展示严谨逻辑步骤，尾段展示真实纸质试卷与 xuebaw.com 真实官网置顶评论引导。\n` +
        `请输出详细的分镜构图与画面光影描述。`
      );

    } else {
      // 模式 3：📸 小红书/抖音高赞图文轮播 (4张大图精细构图指引)
      this.videoTitle.set(`终于找到了！${grade}${subject}名校内部真题密卷（含答题卡/建议打印）`);

      const shotList: StoryboardShot[] = [
        {
          shotNumber: 1,
          timeRange: '图 1 · 封面爆款图',
          nameKey: 'videoScript.shot1',
          visual: '【图片构图】：实木书桌背景，试卷第一页正中拍摄，大标题用黄色荧光笔划过。封面上放一支红色中性笔，贴有一张便签纸写着：“期末重点！名校内部模拟密卷”。视觉焦点极为鲜明。',
          voiceover: '（小红书封面笔记文案）家人们谁懂啊！找了半天的' + grade + subject + '内部真题卷终于被我挖到了！赶紧码住！',
          overlayText: '内部密卷曝光 · 建议人手一份 📄'
        },
        {
          shotNumber: 2,
          timeRange: '图 2 · 核心压轴题排版',
          nameKey: 'videoScript.shot2',
          visual: '【图片构图】：翻到试卷最后两道大题页面，45度平铺拍摄，题目文字与几何/函数图表极度清晰，旁边摆放直尺与圆规，营造真实的浓厚备考学习氛围。',
          voiceover: '（笔记亮点 1）题目质量极高，全是今年各大重点中学的压轴真题，考点覆盖极其精准，完全贴合最新考纲要求！',
          overlayText: '题型精选 · 直击期末高频丢分大题 🎯'
        },
        {
          shotNumber: 3,
          timeRange: '图 3 · 官方答题卡与微课',
          nameKey: 'videoScript.shot3',
          visual: '【图片构图】：并列摆放官方详尽参考答案页面和平板电脑（平板屏幕上展示名师解题原画微课视频），展示详尽的得分步骤与踩分规则。',
          voiceover: '（笔记亮点 2）配套官方逐题答题卡，解题步骤精确到每一分，还附有名师微课原画精讲，孩子自己就能对照弄懂，根本不需要家长辅导！',
          overlayText: '官方详细答题卡 + 名师视频精析 💡'
        },
        {
          shotNumber: 4,
          timeRange: '图 4 · A4打印效果与官网实景',
          nameKey: 'videoScript.shot4',
          visual: '【图片构图 · 真实官网插图】：展示拿在手里的 A4 真实打印纸质卷，文字无虚化噪点；背景显示真实的学霸网（xuebaw.com）详情页面，清晰可见真实试卷标题、转存横幅与网盘按钮，贴有引导便签：“浏览器搜 xuebaw.com 自取”。',
          voiceover: '（笔记末尾引导）100% 矢量无损高清，普通 A4 纸直接打印。需要的宝子浏览器搜索【学霸网】或直接输入【xuebaw.com】，搜对应标题就能转存，赶紧收藏备用防丢失！',
          overlayText: '矢量无损打印 · 浏览器访问 xuebaw.com 自取 🚀'
        }
      ];
      this.shots.set(shotList);

      this.geminiPrompt.set(
        `# Role: 小红书高赞教育图文摄影师 & 提示词专家\n` +
        `# Task: 为《${title}》小红书/抖音四图流轮播生成极具吸引力的高清摄影 Prompt。\n` +
        `- 画面风格：温暖日系原木风学习书桌、自然柔和漫射光、4K 单反级景深、真题试卷质感平整细腻、结合真实的学霸网（xuebaw.com）官网插图。\n` +
        `请为 4 张图分别生成英文构图提示词，供图像生成或视频定格使用。`
      );
    }

    // 🔥 黄金置顶引流评论 (抗风控，全小写引导去 xuebaw.com)
    this.pinnedComment.set(
      `🎉 本期分享的《${title}》高清原版已经全部打包整理完毕！\n\n` +
      `包含全套 A4 矢量无损打印试卷 + 官方答题卡 + 名师解析微课原画，无任何水印删减。\n` +
      `👉 需要打印或转存的同学家长，请在浏览器直接访问【学霸网 · xuebaw.com】，搜索编号【#${slug.slice(-6)}】或输入【${subject}】即可一键免费保存到您的个人网盘备用~\n\n` +
      `💡 建议先【点赞 + 收藏】本视频，方便期末复习时随时回头查阅防走失！`
    );

    // 热门话题 Tags
    const tags = [
      `#${grade}`,
      `#${subject}真题`,
      `#期末复习`,
      `#中考备考`,
      `#名校密卷`,
      `#学霸网`,
      `#网盘资源自取`
    ];
    this.tagsText.set(tags.join(' '));
  }

  // 复制完整分镜剧本 (机位+台词+花字)
  getFullStoryboardText(): string {
    let text = `【视频标题】${this.videoTitle()}\n\n`;
    this.shots().forEach((shot) => {
      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `【${shot.timeRange}】\n`;
      text += `${shot.visual}\n`;
      text += `🗣️ 口播台词：${shot.voiceover}\n`;
      text += `📝 屏幕花字：${shot.overlayText}\n\n`;
    });
    text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `【官网真实落地页】${this.realWebsiteUrl()}\n\n`;
    text += `【置顶引流评论】\n${this.pinnedComment()}\n\n`;
    text += `【热门话题标签】\n${this.tagsText()}`;
    return text;
  }

  // 仅复制纯大白话口播台词 (方便配音录音)
  getVoiceoverOnlyText(): string {
    let text = `【${this.videoTitle()}】\n\n`;
    this.shots().forEach((shot) => {
      text += `(${shot.timeRange}) ${shot.voiceover}\n\n`;
    });
    return text.trim();
  }

  async copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.feedbackMessage.set(`✅ ${label} ${this.i18n.t('videoScript.copied')}`);
    } catch {
      this.feedbackMessage.set('请手动选中文字复制');
    }
  }

  openRealWebsite() {
    window.open(this.realWebsiteUrl(), '_blank');
  }

  close() {
    this.closed.emit();
  }
}
