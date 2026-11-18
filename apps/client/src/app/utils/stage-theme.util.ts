export type StageLevel = 'primary' | 'junior' | 'senior' | 'teacher' | 'civil';

export interface StageThemeInfo {
  level: StageLevel;
  shortLabel: string;
  badgeLabel: string;
  gradientClass: string;
  primaryColorHex: string;
}

/**
 * 根据资源的多维度信息（学段 stage、年级 grade、学科 subject、标题 title）
 * 精准智能识别出 5 大核心考学阶段，并赋予极高辨识度的专属视觉色彩体系：
 * 
 * 1. 小学 / 小升初：晴空湛蓝 (Sky Azure) - 代表启蒙纯净与基础智慧
 * 2. 初中 / 中考：翡翠青绿 (Teal Emerald) - 代表青春拔节与蓬勃朝气
 * 3. 高中 / 高考：深邃靛紫 (Indigo Violet) - 代表学霸进阶与沉稳厚重
 * 4. 教师资格 / 考编：知性琥珀橙 (Amber Gold) - 代表师道尊严与温润儒雅
 * 5. 公考 / 事业单位：庄严朱砂红 (Crimson Red) - 代表体制正统与仕途选拔
 */
export function detectStageLevel(resource?: {
  stage?: string;
  grade?: string;
  subject?: string;
  title?: string;
}): StageLevel {
  if (!resource) return 'primary';

  const s = (resource.stage || '').toLowerCase().trim();
  const g = (resource.grade || '').toLowerCase().trim();
  const sub = (resource.subject || '').toLowerCase().trim();
  const t = (resource.title || '').toLowerCase().trim();
  const combined = `${s} ${g} ${sub} ${t}`;

  // 1. 公考 / 事业单位 / 考研
  if (
    s === 'exam' ||
    combined.includes('公考') ||
    combined.includes('公务员') ||
    combined.includes('国考') ||
    combined.includes('省考') ||
    combined.includes('事业单位') ||
    combined.includes('事业编') ||
    combined.includes('行测') ||
    combined.includes('申论') ||
    combined.includes('考研')
  ) {
    return 'civil';
  }

  // 2. 教师资格证 / 招教特岗
  if (
    s === 'cert' ||
    combined.includes('教资') ||
    combined.includes('教师资格') ||
    combined.includes('招教') ||
    combined.includes('特岗') ||
    combined.includes('普通话')
  ) {
    return 'teacher';
  }

  // 3. 高中 / 高考
  if (
    s === 'senior' ||
    combined.includes('高考') ||
    combined.includes('高中') ||
    combined.includes('高一') ||
    combined.includes('高二') ||
    combined.includes('高三') ||
    combined.includes('理综') ||
    combined.includes('文综')
  ) {
    return 'senior';
  }

  // 4. 初中 / 中考
  if (
    s === 'junior' ||
    combined.includes('中考') ||
    combined.includes('初中') ||
    combined.includes('初一') ||
    combined.includes('初二') ||
    combined.includes('初三') ||
    combined.includes('七年级') ||
    combined.includes('八年级') ||
    combined.includes('九年级') ||
    combined.includes('7年级') ||
    combined.includes('8年级') ||
    combined.includes('9年级')
  ) {
    return 'junior';
  }

  // 5. 小学 / 小升初 / 幼小
  if (
    s === 'primary' ||
    s === 'kindergarten' ||
    combined.includes('小升初') ||
    combined.includes('小学') ||
    combined.includes('幼小') ||
    combined.includes('学前') ||
    combined.includes('一年级') ||
    combined.includes('二年级') ||
    combined.includes('三年级') ||
    combined.includes('四年级') ||
    combined.includes('五年级') ||
    combined.includes('六年级') ||
    combined.includes('1-6')
  ) {
    return 'primary';
  }

  return 'primary';
}

/**
 * 获取 5 阶段专属色彩与文案配置
 */
export function getStageTheme(resource?: {
  stage?: string;
  grade?: string;
  subject?: string;
  title?: string;
}): StageThemeInfo {
  const level = detectStageLevel(resource);

  switch (level) {
    // 1. 小学 / 小升初：晴空湛蓝
    case 'primary':
      return {
        level: 'primary',
        shortLabel: '小学',
        badgeLabel: '小学精选',
        gradientClass: 'from-sky-500 via-blue-600 to-indigo-600',
        primaryColorHex: '#2563eb'
      };

    // 2. 初中 / 中考：清新翡翠青绿 (与高中紫强烈对比)
    case 'junior':
      return {
        level: 'junior',
        shortLabel: '初中',
        badgeLabel: '初中精选',
        gradientClass: 'from-teal-600 via-emerald-600 to-cyan-800',
        primaryColorHex: '#059669'
      };

    // 3. 高中 / 高考：沉稳深邃紫/靛蓝 (高考沉稳进阶)
    case 'senior':
      return {
        level: 'senior',
        shortLabel: '高中',
        badgeLabel: '高中精选',
        gradientClass: 'from-indigo-600 via-purple-700 to-violet-900',
        primaryColorHex: '#6d28d9'
      };

    // 4. 教师资格 / 考编：知性暖阳金橙
    case 'teacher':
      return {
        level: 'teacher',
        shortLabel: '教资',
        badgeLabel: '教资精选',
        gradientClass: 'from-amber-500 via-orange-600 to-yellow-700',
        primaryColorHex: '#d97706'
      };

    // 5. 公考 / 事业单位：庄严正统朱砂红
    case 'civil':
      return {
        level: 'civil',
        shortLabel: '公考',
        badgeLabel: '公考精选',
        gradientClass: 'from-rose-600 via-red-600 to-rose-800',
        primaryColorHex: '#dc2626'
      };
  }
}
