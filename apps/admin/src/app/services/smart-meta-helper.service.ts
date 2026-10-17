import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError, catchError, map } from 'rxjs';

export interface SmartInferredMeta {
  polished_title?: string;
  subject: string;
  stage: string;
  grade: string;
  edition: string;
  channel_slug: string;
  has_video: boolean;
  subtitles: string[];
  selectedSubtitle: string;
  description: string;
}

export interface AiConfig {
  provider: 'local' | 'gemini' | 'deepseek' | 'custom';
  geminiApiKey: string;
  geminiModel: string;
  deepseekApiKey: string;
  deepseekModel: string;
  customBaseUrl: string;
  customApiKey: string;
  customModel: string;
}

export interface AiGenerationResult {
  meta: SmartInferredMeta;
  providerUsed: string;
  isFallback: boolean;
}

const AI_CONFIG_KEY = 'xuebaw_ai_engine_config';

@Injectable({
  providedIn: 'root'
})
export class SmartMetaHelperService {
  private http = inject(HttpClient);

  /**
   * 动态解析后端 API 基地址（优先本地 4001 端口，线上环境走公网加速 API）
   */
  get baseUrl(): string {
    if (typeof window !== 'undefined') {
      const customApi = localStorage.getItem('API_BASE_URL');
      if (customApi) {
        return customApi.replace(/\/$/, '');
      }
      const host = window.location.hostname;
      if (host === 'localhost' || host === '127.0.0.1') {
        return `http://${host}:4001`;
      }
    }
    return 'https://api.xuebaw.com:8443';
  }

  /**
   * 读取大模型配置（优先读取本地存储）
   */
  getAiConfig(): AiConfig {
    const defaultConfig: AiConfig = {
      provider: 'gemini',
      geminiApiKey: '',
      geminiModel: 'gemini-3.5-flash-lite',
      deepseekApiKey: '',
      deepseekModel: 'deepseek-chat',
      customBaseUrl: 'https://api.openai.com/v1',
      customApiKey: '',
      customModel: 'gpt-4o-mini'
    };

    if (typeof window === 'undefined') return defaultConfig;

    try {
      const raw = localStorage.getItem(AI_CONFIG_KEY);
      if (raw) {
        const parsed = { ...defaultConfig, ...JSON.parse(raw) };
        if (!parsed.geminiModel || parsed.geminiModel === 'gemini-1.5-flash' || parsed.geminiModel === 'gemini-2.0-flash') {
          parsed.geminiModel = 'gemini-3.5-flash-lite';
        }
        return parsed;
      }
    } catch {}

    return defaultConfig;
  }

  /**
   * 保存大模型配置
   */
  saveAiConfig(config: AiConfig): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config));
    }
  }

  /**
   * 测试指定 AI 大模型的连通性与 API Key 是否有效
   */
  testConnection(req: {
    provider: string;
    api_key: string;
    model: string;
    base_url?: string;
  }): Observable<{ code: number; message: string; data?: any }> {
    return this.http.post<{ code: number; message: string; data?: any }>(
      `${this.baseUrl}/api/v1/admin/ai/test-connection`,
      req
    );
  }

  /**
   * 明确调用云端 AI 大模型深度分析并原创（不进行暗中静默回退，失败或未填 Key 直接向上抛出错误，保证绝对透明）
   */
  generateWithAi(title: string): Observable<{ meta: SmartInferredMeta; providerUsed: string }> {
    const cleanTitle = (title || '').trim();
    const cfg = this.getAiConfig();
    const provider = cfg.provider;

    if (provider === 'local') {
      return throwError(() => new Error('当前选中的是【本地规则引擎】。如需使用云端大模型，请点击【⚙️ AI 模型配置】切换为 Gemini 或 DeepSeek！'));
    }

    let apiKey = '';
    let model = '';
    let baseUrl = '';

    if (provider === 'gemini') {
      apiKey = cfg.geminiApiKey?.trim();
      model = cfg.geminiModel || 'gemini-1.5-flash';
    } else if (provider === 'deepseek') {
      apiKey = cfg.deepseekApiKey?.trim();
      model = cfg.deepseekModel || 'deepseek-chat';
    } else if (provider === 'custom') {
      apiKey = cfg.customApiKey?.trim();
      model = cfg.customModel || 'gpt-4o-mini';
      baseUrl = cfg.customBaseUrl || 'https://api.openai.com/v1';
    }

    if (!apiKey) {
      const providerName = provider === 'gemini' ? 'Google Gemini' : (provider === 'deepseek' ? 'DeepSeek' : 'OpenAI');
      return throwError(() => new Error(`未检测到 ${providerName} API Key，请点击【⚙️ AI 模型配置】填写您的密钥！`));
    }

    const localMeta = this.inferMeta(cleanTitle);

    return this.http.post<{ code: number; data: any }>(
      `${this.baseUrl}/api/v1/admin/ai/generate-meta`,
      {
        provider,
        api_key: apiKey,
        model,
        base_url: baseUrl,
        title: cleanTitle
      }
    ).pipe(
      map(res => {
        const d = res.data;
        const meta: SmartInferredMeta = {
          polished_title: (d.polished_title || '').trim() || localMeta.polished_title,
          subject: d.subject || localMeta.subject,
          stage: d.stage || localMeta.stage,
          grade: d.grade || localMeta.grade,
          edition: d.edition || localMeta.edition,
          channel_slug: (d.stage === 'cert' || d.stage === 'exam') ? 'cert' : localMeta.channel_slug,
          has_video: typeof d.has_video === 'boolean' ? d.has_video : localMeta.has_video,
          subtitles: (d.subtitles && d.subtitles.length > 0) ? d.subtitles : localMeta.subtitles,
          selectedSubtitle: d.selected_subtitle || (d.subtitles?.[0]) || localMeta.selectedSubtitle,
          description: d.description || localMeta.description
        };
        return {
          meta,
          providerUsed: d.raw_provider || (provider === 'gemini' ? 'Google Gemini' : 'DeepSeek')
        };
      })
    );
  }

  /**
   * 双模混合智能生成（兼容原有调用）
   */
  generateWithAiOrLocal(title: string): Observable<AiGenerationResult> {
    const cleanTitle = (title || '').trim();
    const localMeta = this.inferMeta(cleanTitle);

    const cfg = this.getAiConfig();
    const provider = cfg.provider;

    // 纯本地引擎
    if (provider === 'local') {
      return of({
        meta: localMeta,
        providerUsed: '本地极速专家引擎',
        isFallback: false
      });
    }

    let apiKey = '';
    let model = '';
    let baseUrl = '';

    if (provider === 'gemini') {
      apiKey = cfg.geminiApiKey?.trim();
      model = cfg.geminiModel || 'gemini-1.5-flash';
    } else if (provider === 'deepseek') {
      apiKey = cfg.deepseekApiKey?.trim();
      model = cfg.deepseekModel || 'deepseek-chat';
    } else if (provider === 'custom') {
      apiKey = cfg.customApiKey?.trim();
      model = cfg.customModel || 'gpt-4o-mini';
      baseUrl = cfg.customBaseUrl || 'https://api.openai.com/v1';
    }

    if (!apiKey) {
      return of({
        meta: localMeta,
        providerUsed: '本地专家引擎 (未配置Key)',
        isFallback: true
      });
    }

    return this.http.post<{ code: number; data: any }>(
      `${this.baseUrl}/api/v1/admin/ai/generate-meta`,
      {
        provider,
        api_key: apiKey,
        model,
        base_url: baseUrl,
        title: cleanTitle
      }
    ).pipe(
      map(res => {
        const d = res.data;
        const meta: SmartInferredMeta = {
          subject: d.subject || localMeta.subject,
          stage: d.stage || localMeta.stage,
          grade: d.grade || localMeta.grade,
          edition: d.edition || localMeta.edition,
          channel_slug: (d.stage === 'cert' || d.stage === 'exam') ? 'cert' : localMeta.channel_slug,
          has_video: typeof d.has_video === 'boolean' ? d.has_video : localMeta.has_video,
          subtitles: (d.subtitles && d.subtitles.length > 0) ? d.subtitles : localMeta.subtitles,
          selectedSubtitle: d.selected_subtitle || (d.subtitles?.[0]) || localMeta.selectedSubtitle,
          description: d.description || localMeta.description
        };
        return {
          meta,
          providerUsed: d.raw_provider || provider,
          isFallback: false
        };
      }),
      catchError(err => {
        console.warn('AI 云端模型调用异常，已自动回退至本地专家引擎:', err);
        return of({
          meta: localMeta,
          providerUsed: '本地专家引擎 (云端API异常降级)',
          isFallback: true
        });
      })
    );
  }

  /**
   * 本地启发式智能推断（0 延迟、0 费用、100% 稳定保底）
   */
  inferMeta(title: string): SmartInferredMeta {
    const cleanTitle = (title || '').trim();
    const stage = this.detectStage(cleanTitle);
    const grade = this.detectGrade(cleanTitle, stage);
    const subject = this.detectSubject(cleanTitle, stage);
    const edition = this.detectEdition(cleanTitle);
    const has_video = this.detectHasVideo(cleanTitle);
    const channel_slug = (stage === 'cert' || stage === 'exam') ? 'cert' : 'edu';
    
    const subtitles = this.generateSubtitles(cleanTitle, subject, stage, has_video);
    const selectedSubtitle = subtitles[0] || '';
    const description = this.generateDescription(cleanTitle, {
      subject,
      stage,
      grade,
      edition,
      has_video
    });
    const polished_title = this.cleanTitleLocal(cleanTitle);

    return {
      polished_title,
      subject,
      stage,
      grade,
      edition,
      channel_slug,
      has_video,
      subtitles,
      selectedSubtitle,
      description
    };
  }

  /**
   * 启发式清洗并规范化标题（去除网盘广告、提取码、多余文件后缀与噪声）
   */
  cleanTitleLocal(title: string): string {
    if (!title) return '';
    let t = title.trim();
    // 去除常见的营销广告词与前缀
    t = t.replace(/【(?:全网首发|独家|精选|完整版|最新|免费|无水印|高清|秒发|秒下|提取码[^】]*|网盘[^】]*|备用[^】]*)】/gi, '');
    t = t.replace(/\[(?:全网首发|独家|精选|完整版|最新|免费|无水印|高清|秒发|提取码[^\]]*)\]/gi, '');
    // 去除多余的文件格式后缀
    t = t.replace(/\.(pdf|zip|rar|7z|mp4|doc|docx|ppt|pptx|xlsx|xls|epub|mobi|azw3)$/i, '');
    // 去除常见的提取码说明
    t = t.replace(/[(（]?(?:提取码|密码|pwd|code)[:：\s]*[a-zA-Z0-9]{4,6}[)）]?/gi, '');
    // 去除前后可能残留的括号、下划线、破折号
    t = t.replace(/^[_\s\-—#]+|[_\s\-—#]+$/g, '');
    t = t.replace(/[\s_]{2,}/g, ' ').trim();
    return t;
  }

  /**
   * 智能推断学科（支持海量教育场景专有名词与近义词）
   */
  detectSubject(title: string, stage: string): string {
    const t = title.toLowerCase();

    // 1. 英语专有词与核心特征（特别处理《新概念英语》等不带“英语”二字的情形）
    if (
      t.includes('新概念') ||
      t.includes('english') ||
      t.includes('英语') ||
      t.includes('语法') ||
      t.includes('音标') ||
      t.includes('自然拼读') ||
      t.includes('单词') ||
      t.includes('词汇') ||
      t.includes('完形填空') ||
      t.includes('完型') ||
      t.includes('阅读理解') ||
      t.includes('听力') ||
      t.includes('口语') ||
      t.includes('牛津') ||
      t.includes('朗文') ||
      t.includes('剑桥') ||
      t.includes('雅思') ||
      t.includes('托福') ||
      t.includes('四级') ||
      t.includes('六级') ||
      t.includes('专四') ||
      t.includes('专八') ||
      t.includes('ket') ||
      t.includes('pet') ||
      t.includes('fce')
    ) {
      return '英语';
    }

    // 2. 数学专有词与核心特征
    if (
      t.includes('数学') ||
      t.includes('奥数') ||
      t.includes('高数') ||
      t.includes('几何') ||
      t.includes('代数') ||
      t.includes('函数') ||
      t.includes('微积分') ||
      t.includes('线性代数') ||
      t.includes('立体几何') ||
      t.includes('解析几何') ||
      t.includes('导数') ||
      t.includes('圆锥曲线') ||
      t.includes('数列') ||
      t.includes('三角函数') ||
      t.includes('因式分解') ||
      t.includes('口算') ||
      t.includes('应用题') ||
      t.includes('竖式')
    ) {
      return '数学';
    }

    // 3. 语文专有词与核心特征
    if (
      t.includes('语文') ||
      t.includes('作文') ||
      t.includes('文言文') ||
      t.includes('古诗') ||
      t.includes('诗词') ||
      t.includes('拼音') ||
      t.includes('看拼音') ||
      t.includes('生字') ||
      t.includes('生词') ||
      t.includes('现代文') ||
      t.includes('名著') ||
      t.includes('修辞') ||
      t.includes('近义词') ||
      t.includes('反义词') ||
      t.includes('成语') ||
      t.includes('满分作文') ||
      t.includes('古文')
    ) {
      return '语文';
    }

    // 4. 物理专有词
    if (
      t.includes('物理') ||
      t.includes('力学') ||
      t.includes('电学') ||
      t.includes('热学') ||
      t.includes('光学') ||
      t.includes('电磁') ||
      t.includes('牛顿定律') ||
      t.includes('电路') ||
      t.includes('欧姆定律') ||
      t.includes('浮力') ||
      t.includes('压强') ||
      t.includes('动量')
    ) {
      return '物理';
    }

    // 5. 化学专有词
    if (
      t.includes('化学') ||
      t.includes('有机化学') ||
      t.includes('无机化学') ||
      t.includes('方程式') ||
      t.includes('酸碱盐') ||
      t.includes('元素周期') ||
      t.includes('氧化还原')
    ) {
      return '化学';
    }

    // 6. 生物专有词
    if (
      t.includes('生物') ||
      t.includes('细胞') ||
      t.includes('遗传') ||
      t.includes('光合作用') ||
      t.includes('生态系统') ||
      t.includes('减数分裂')
    ) {
      return '生物';
    }

    // 7. 历史专有词
    if (
      t.includes('历史') ||
      t.includes('古代史') ||
      t.includes('近代史') ||
      t.includes('世界史') ||
      t.includes('中外历史纲要') ||
      t.includes('通史')
    ) {
      return '历史';
    }

    // 8. 地理专有词
    if (
      t.includes('地理') ||
      t.includes('地球与地图') ||
      t.includes('洋流') ||
      t.includes('水文') ||
      t.includes('气候') ||
      t.includes('人文地理') ||
      t.includes('自然地理')
    ) {
      return '地理';
    }

    // 9. 道德与法治 / 政治
    if (
      t.includes('道德与法治') ||
      t.includes('道法') ||
      t.includes('思品') ||
      t.includes('思想政治') ||
      t.includes('政治') ||
      t.includes('马克思') ||
      t.includes('毛中特')
    ) {
      return '道德与法治';
    }

    // 10. 科学
    if (t.includes('科学')) {
      return '科学';
    }

    // 11. 教资/职考特有科目
    if (stage === 'cert') {
      if (t.includes('保教')) return '保教知识与能力';
      if (t.includes('综合素质') || t.includes('科一')) return '综合素质';
      if (t.includes('教育知识') || t.includes('科二')) return '教育教学知识与能力';
      if (t.includes('面试') || t.includes('试讲')) return '教资面试真题与教案';
      return '综合素质';
    }

    if (stage === 'exam') {
      if (t.includes('申论')) return '申论';
      if (t.includes('行测')) return '行测';
      if (t.includes('公基') || t.includes('公共基础')) return '公共基础知识';
      if (t.includes('面试')) return '结构化面试';
      return '行测';
    }

    return '数学'; // 默认回退
  }

  /**
   * 智能推断学段（小学、初中、高中、教资、职考）
   */
  detectStage(title: string): string {
    const t = title.toLowerCase();

    // 职考与教资
    if (t.includes('教资') || t.includes('教师资格') || t.includes('幼师证')) {
      return 'cert';
    }
    if (t.includes('公考') || t.includes('行测') || t.includes('申论') || t.includes('公务员') || t.includes('事业编') || t.includes('考研') || t.includes('国考') || t.includes('省考')) {
      return 'exam';
    }

    // 高中
    if (
      t.includes('高中') ||
      t.includes('高考') ||
      t.includes('高一') ||
      t.includes('高二') ||
      t.includes('高三') ||
      t.includes('必修一') ||
      t.includes('必修二') ||
      t.includes('必修三') ||
      t.includes('选择性必修')
    ) {
      return 'senior';
    }

    // 初中
    if (
      t.includes('初中') ||
      t.includes('中考') ||
      t.includes('初一') ||
      t.includes('初二') ||
      t.includes('初三') ||
      t.includes('七年级') ||
      t.includes('八年级') ||
      t.includes('九年级') ||
      /([789七八九])年级/.test(t)
    ) {
      return 'junior';
    }

    // 小学
    if (
      t.includes('小学') ||
      t.includes('小升初') ||
      t.includes('幼小衔接') ||
      /([123456一二三四五六])年级/.test(t)
    ) {
      return 'primary';
    }

    return 'primary';
  }

  /**
   * 智能推断年级
   */
  detectGrade(title: string, stage: string): string {
    const t = title.toLowerCase();

    if (stage === 'primary') {
      if (t.includes('一年级') || t.includes('1年级')) return '一年级';
      if (t.includes('二年级') || t.includes('2年级')) return '二年级';
      if (t.includes('三年级') || t.includes('3年级')) return '三年级';
      if (t.includes('四年级') || t.includes('4年级')) return '四年级';
      if (t.includes('五年级') || t.includes('5年级')) return '五年级';
      if (t.includes('六年级') || t.includes('6年级') || t.includes('小升初')) return '六年级';
      return '通用 (1-6年级通用)';
    }

    if (stage === 'junior') {
      if (t.includes('七年级') || t.includes('7年级') || t.includes('初一')) return '七年级 (初一)';
      if (t.includes('八年级') || t.includes('8年级') || t.includes('初二')) return '八年级 (初二)';
      if (t.includes('九年级') || t.includes('9年级') || t.includes('初三') || t.includes('中考')) return '九年级 (初三/中考)';
      return '初中通用';
    }

    if (stage === 'senior') {
      if (t.includes('高一')) return '高一';
      if (t.includes('高二')) return '高二';
      if (t.includes('高三') || t.includes('高考')) return '高三 (冲刺高考)';
      return '高中通用';
    }

    if (stage === 'cert') {
      if (t.includes('小学')) return '小学教师资格';
      if (t.includes('中学') || t.includes('初中') || t.includes('高中')) return '中学教师资格';
      if (t.includes('幼儿') || t.includes('幼师')) return '幼儿教师资格';
      return '教师资格统考通用';
    }

    if (stage === 'exam') {
      if (t.includes('国考')) return '国家公务员考试 (国考)';
      if (t.includes('省考')) return '地方公务员考试 (省考)';
      if (t.includes('事业')) return '事业单位招聘联考';
      if (t.includes('考研')) return '全国硕士研究生统一考试';
      return '公考/事业编通用';
    }

    return '通用 (1-6年级通用)';
  }

  /**
   * 智能推断教材版本
   */
  detectEdition(title: string): string {
    const t = title.toLowerCase();
    if (t.includes('人教') || t.includes('部编') || t.includes('统编')) return '人教版 (统编)';
    if (t.includes('苏教')) return '苏教版';
    if (t.includes('北师大')) return '北师大版';
    if (t.includes('外研')) return '外研版';
    if (t.includes('译林')) return '译林版';
    if (t.includes('沪教')) return '沪教版';
    if (t.includes('冀教')) return '冀教版';
    if (t.includes('鲁教')) return '鲁教版';
    if (t.includes('浙教')) return '浙教版';
    return '通用版本 (全通用)';
  }

  /**
   * 探测是否包含视频微课
   */
  detectHasVideo(title: string): boolean {
    const t = title.toLowerCase();
    return t.includes('视频') || t.includes('微课') || t.includes('网课') || t.includes('讲座') || t.includes('mp4') || t.includes('精讲视频') || t.includes('名师精讲');
  }

  /**
   * 生成通俗大白话、高转化、利于 SEO 搜索收录的副标题组 (4~5 种风格)
   */
  generateSubtitles(title: string, subject: string, stage: string, hasVideo: boolean): string[] {
    const isNewConcept = title.includes('新概念');
    const isTestPaper = title.includes('卷') || title.includes('期末') || title.includes('期中') || title.includes('模拟') || title.includes('真题') || title.includes('一模');
    const isVocabOrGrammar = title.includes('语法') || title.includes('单词') || title.includes('词汇') || title.includes('古诗') || title.includes('公式');

    // 场景 1：新概念英语专有定制
    if (isNewConcept) {
      return [
        '零基础自学英语语法全套微课，配套课后习题全彩精校版，网盘免解压无损打印',
        '名师手把手精讲全套课文与知识点，全彩高清矢量排版，手机电脑随时随地学',
        '从入门到精通英语听力口语速成宝典，含官方音频与课后答案，转存永久防丢',
        '课前预习与课后语法巩固首选教材，字迹超清无水印，支持直接A4双面打印'
      ];
    }

    // 场景 2：试卷真题类定制
    if (isTestPaper) {
      const videoHint = hasVideo ? '附名师压轴大题视频讲解，' : '';
      return [
        `名校重点班同步提分精卷，含手写步骤规范解析与技巧点拨，${videoHint}A4无损直接打印`,
        `2026最新考纲名校押题密卷，考点全覆盖与易错避坑指南，考前自测查漏补缺必备`,
        `官方标准评分细则与答题模板，排版干净工整无多余水印，转存网盘原画极速下载`,
        `期末中高考满分学霸答卷思路复盘，分类题型各个击破，手机平板直接在线刷题`
      ];
    }

    // 场景 3：语法/单词/核心考点归纳类定制
    if (isVocabOrGrammar) {
      return [
        `全套核心${subject}考点思维导图与速记口诀，全彩图解高频考点，告别死记硬背`,
        `名校名师体系化归纳总结，附赠同步配套巩固自测试卷与详尽解析，打印即背`,
        `零基础从入门到考前冲刺必备手册，网盘一键转存免解压，电脑手机随时随地复习`,
        `高分学霸私藏手写笔记精修版，重点考点彩色划线标红，支持A4高清无损输出`
      ];
    }

    // 场景 4：通用中小学/职考高转化大白话副标题
    const videoTag = hasVideo ? '含名师高清视频微课精讲，' : '';
    return [
      `名校体系化同步精讲讲义与全套配套练习，${videoTag}排版清晰无噪点，A4直接打印超清晰`,
      `零基础课前预习与课后查漏补缺宝典，配套官方标准详尽答案，网盘免解压一键转存`,
      `紧扣最新新课标命题方向，重难点题型分步拆解思路点拨，手机电脑随时在线学`,
      `家长课后辅导与学生自主提分首选，官方正版无水印精校版，转存个人网盘永久防丢`
    ];
  }

  /**
   * 自动生成结构极其专业严谨、高信任度的「内容介绍与使用指南」（Markdown 格式）
   */
  generateDescription(title: string, meta: {
    subject?: string;
    stage?: string;
    grade?: string;
    edition?: string;
    has_video?: boolean;
  }): string {
    const sub = meta.subject || '学科';
    const hasVideo = meta.has_video ?? false;
    const isPaper = title.includes('卷') || title.includes('期末') || title.includes('真题') || title.includes('模拟');
    const isNewConcept = title.includes('新概念');

    let highlightSection = '';
    if (isNewConcept) {
      highlightSection = `- **经典正版无损精校**：全套原版教材电子书全彩扫描，英音/美音双语原声配套音频，课文与习题排版纯净无广告。
- **名师手把手保姆级拆解**：语法规则、长难句剖析、核心单词搭配逐句精讲，零基础也能轻松跟学。
- **自学与考学兼备**：不仅适合成人职场口语与零基础自学，更契合中高考、四六级、PET/KET 语法考点体系。`;
    } else if (isPaper) {
      highlightSection = `- **100% 矢量无损高清**：名校真实统考真题精修排版，几何图形、函数图表与公式线条锐利无毛边，A4 打印绝不发虚模糊。
- **名师手写步骤与思维点拨**：所有压轴难题均附带详细解题步骤与官方标准评分细则，杜绝“只有答案没有过程”的痛点。
- **紧扣最新新课标与命题导向**：由一线骨干名师分类题型归纳整理，直击易错丢分点与高频必考题型。`;
    } else {
      highlightSection = `- **官方正版全彩矢量排版**：字体排版疏朗舒适，重点词汇与核心公式醒目标注，护眼防疲劳。
- **体系化进阶设计**：由浅入深循序渐进，从课前基础概念通读到重难点专项深挖，适合各阶段学生同步提升。
- **配套解析详尽完整**：题型均配有标准化参考答案与解题突破口指引，自学检测或家长辅助核对一目了然。`;
    }

    let checklistSection = '';
    if (isNewConcept) {
      checklistSection = `1. **全套全彩电子教材（PDF 高清版）**：排版纯净支持直接平板做笔记或 A4 纸张双面打印；
2. **课后同步巩固习题册与官方详细解答（PDF 格式）**：逐题配答案，课后自测无死角；
3. **原版外教朗读纯正听力音频（MP3 极清音质）**：支持慢速跟读与常速精听；
${hasVideo ? '4. **名师视频课程与语法专题精讲（MP4 高清原画）**：生动易懂，手机电脑直接在线流畅播放；' : ''}
5. **配套词汇掌中宝与重点句型默写纸（打印即测）**。`;
    } else if (isPaper) {
      checklistSection = `1. **名校完整试卷真题（空白学生测试版 PDF）**：排版严整带规范答题卡，适合限时全真模考；
2. **名师详尽解析与评分细则（教师详解版 PDF）**：全彩标注解题眼、规范手写推导步骤；
${hasVideo ? '3. **压轴难题真人出镜技巧精讲微课（MP4 原画视频）**：手把手拆解解题思维模型；' : ''}
4. **考点双向细目表与核心易错点汇总**：考前自查必不可少的知识点排查清单。`;
    } else {
      checklistSection = `1. **全套核心讲义与教材配套辅导资料（PDF 电子版）**：公式清晰、例题经典；
2. **课后强化拓展精炼题集与分层达标测试（PDF 格式）**：边学边练巩固新知；
3. **官方标准参考答案与名师解题锦囊**：标准推导步骤，方便随时对照自纠；
${hasVideo ? '4. **重难点配套微课讲解视频（MP4 高清原画）**：扫清疑难死角。' : ''}`;
    }

    return `### 📌 资料核心亮点
${highlightSection}

### 📦 资源包含清单
${checklistSection}

### 🎯 适用人群与自学建议
- **学生课前自学预习**：利用讲义通读核心章节，建立宏观知识树，扫清生词与基础概念障碍；
- **课后查漏补缺与刷题强化**：做完作业后针对薄弱考点专项训练，对照手写解析吃透规范推导步骤；
- **期中期末/考前模拟冲刺**：限时全真自测，严格根据官方评分标准打分，排查易错丢分盲区；
- **家长辅导与机构备课**：参考答案详尽规范，方便家长在家自测辅导或辅导教师精准选题。

### 💡 转存与打印使用指南
1. **网盘转存建议**：请务必先点击下方【保存到网盘 / 转存】按钮，存入您自己的网盘账号后再行下载或观看：
   - 手机/平板端可直接在线免解压流畅播放 1080P/4K 原画原声微课；
   - 永久转存可彻底避免网盘外链日后失效或被动删除！
2. **纸张打印建议**：建议使用电脑端下载 PDF 后，通过 PDF 阅读器（如 Edge、Chrome 或 Adobe Reader）选择【实际大小 / 适合页面】，勾选【高质量打印】，A4 纸张双面打印效果极佳，字迹线条清晰锐利。`;
  }
}
