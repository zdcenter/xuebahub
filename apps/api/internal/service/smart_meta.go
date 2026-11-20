package service

import (
	"fmt"
	"regexp"
	"strings"
)

// InferredResourceMeta 智能推断提取的教育元数据
type InferredResourceMeta struct {
	PolishedTitle string   `json:"polished_title"`
	Stage         string   `json:"stage"` // primary, junior, senior, cert, exam, kindergarten
	Grade         string   `json:"grade"`
	Term          string   `json:"term"`
	Subject       string   `json:"subject"`
	Edition       string   `json:"edition"`
	ChannelSlug   string   `json:"channel_slug"`
	HasVideo      bool     `json:"has_video"`
	Subtitle      string   `json:"subtitle"`
	Description   string   `json:"description"`
	Keywords      []string `json:"keywords"`
}

// SmartMetaService 启发式智能教育资料元数据推断服务
type SmartMetaService struct{}

func NewSmartMetaService() *SmartMetaService {
	return &SmartMetaService{}
}

// InferMeta 核心：根据标题自动推断学段、年级、学科、版本、学期与通俗副标题
func (s *SmartMetaService) InferMeta(title string) InferredResourceMeta {
	cleanTitle := strings.TrimSpace(title)
	stage := s.DetectStage(cleanTitle)
	grade := s.DetectGrade(cleanTitle, stage)
	term := s.DetectTerm(cleanTitle)
	subject := s.DetectSubject(cleanTitle, stage)
	edition := s.DetectEdition(cleanTitle)
	hasVideo := s.DetectHasVideo(cleanTitle)

	channelSlug := "edu"
	if stage == "book" || strings.Contains(cleanTitle, "电子课本") || strings.Contains(cleanTitle, "电子教材") {
		channelSlug = "book"
	}

	polishedTitle := s.CleanTitle(cleanTitle)
	subtitle := s.GenerateSubtitle(polishedTitle, subject, stage, hasVideo)
	desc := s.GenerateDescription(polishedTitle, stage, grade, subject, edition, hasVideo)

	keywords := []string{polishedTitle, subject, grade, edition, "试卷真题", "高清PDF下载", "夸克网盘免密直存"}
	if stageLabel := s.GetStageLabel(stage); stageLabel != "" {
		keywords = append(keywords, stageLabel)
	}

	return InferredResourceMeta{
		PolishedTitle: polishedTitle,
		Stage:         stage,
		Grade:         grade,
		Term:          term,
		Subject:       subject,
		Edition:       edition,
		ChannelSlug:   channelSlug,
		HasVideo:      hasVideo,
		Subtitle:      subtitle,
		Description:   desc,
		Keywords:      keywords,
	}
}

// CleanTitle 清洗标题噪声（去除提取码、格式后缀、广告语等）
func (s *SmartMetaService) CleanTitle(title string) string {
	t := strings.TrimSpace(title)
	if t == "" {
		return ""
	}

	// 去除多余营销前缀
	reAd1 := regexp.MustCompile(`【(?:全网首发|独家|精选|完整版|最新|免费|无水印|高清|秒发|秒下|提取码[^】]*|网盘[^】]*|备用[^】]*)】`)
	t = reAd1.ReplaceAllString(t, "")
	reAd2 := regexp.MustCompile(`\[(?:全网首发|独家|精选|完整版|最新|免费|无水印|高清|秒发|提取码[^\]]*)\]`)
	t = reAd2.ReplaceAllString(t, "")

	// 去除文件后缀
	reExt := regexp.MustCompile(`(?i)\.(pdf|zip|rar|7z|mp4|doc|docx|ppt|pptx|xlsx|xls|epub|mobi|azw3)$`)
	t = reExt.ReplaceAllString(t, "")

	// 去除提取码说明
	rePwd := regexp.MustCompile(`(?i)[(（]?(?:提取码|密码|pwd|code)[:：\s]*[a-zA-Z0-9]{4,8}[)）]?`)
	t = rePwd.ReplaceAllString(t, "")

	// 去除首尾杂字符与多余空格
	t = strings.Trim(t, " _-—#[]【】()")
	reSpaces := regexp.MustCompile(`[\s_]{2,}`)
	t = reSpaces.ReplaceAllString(t, " ")

	return strings.TrimSpace(t)
}

// DetectStage 智能识别学段
func (s *SmartMetaService) DetectStage(title string) string {
	t := strings.ToLower(title)

	// 1. 幼小衔接
	if strings.Contains(t, "幼小衔接") || strings.Contains(t, "幼儿园") || strings.Contains(t, "学前") || strings.Contains(t, "早教") {
		return "kindergarten"
	}

	// 2. 教师资格证
	if strings.Contains(t, "教资") || strings.Contains(t, "教师资格") || strings.Contains(t, "科一") || strings.Contains(t, "科二") || strings.Contains(t, "科三") || strings.Contains(t, "综合素质") || strings.Contains(t, "教育教学知识") {
		return "cert"
	}

	// 3. 公考与考研
	if strings.Contains(t, "考研") || strings.Contains(t, "公考") || strings.Contains(t, "国考") || strings.Contains(t, "省考") || strings.Contains(t, "行测") || strings.Contains(t, "申论") || strings.Contains(t, "事业单位") {
		return "exam"
	}

	// 4. 高中 (优先级高于初中，避免“中高考”误判)
	if strings.Contains(t, "高中") || strings.Contains(t, "高考") || strings.Contains(t, "高一") || strings.Contains(t, "高二") || strings.Contains(t, "高三") ||
		strings.Contains(t, "高三一模") || strings.Contains(t, "高三二模") || strings.Contains(t, "必修一") || strings.Contains(t, "选择性必修") {
		return "senior"
	}

	// 5. 初中
	if strings.Contains(t, "初中") || strings.Contains(t, "中考") || strings.Contains(t, "初一") || strings.Contains(t, "初二") || strings.Contains(t, "初三") ||
		strings.Contains(t, "七年级") || strings.Contains(t, "八年级") || strings.Contains(t, "九年级") {
		return "junior"
	}

	// 6. 小学
	if strings.Contains(t, "小学") || strings.Contains(t, "小升初") || strings.Contains(t, "一年级") || strings.Contains(t, "二年级") ||
		strings.Contains(t, "三年级") || strings.Contains(t, "四年级") || strings.Contains(t, "五年级") || strings.Contains(t, "六年级") {
		return "primary"
	}

	return "primary" // 默认以小学中小学兜底
}

// DetectGrade 智能推断年级
func (s *SmartMetaService) DetectGrade(title string, stage string) string {
	t := title
	grades := []string{
		"一年级", "二年级", "三年级", "四年级", "五年级", "六年级",
		"七年级", "八年级", "九年级",
		"初一", "初二", "初三",
		"高一", "高二", "高三",
	}

	for _, g := range grades {
		if strings.Contains(t, g) {
			// 归一化规范别名
			if g == "初一" {
				return "七年级"
			}
			if g == "初二" {
				return "八年级"
			}
			if g == "初三" {
				return "九年级"
			}
			return g
		}
	}

	// 依据学段推荐通用级
	if stage == "senior" {
		if strings.Contains(t, "高考") {
			return "高三"
		}
		return "高中通用"
	}
	if stage == "junior" {
		if strings.Contains(t, "中考") {
			return "九年级"
		}
		return "初中通用"
	}
	if stage == "primary" {
		if strings.Contains(t, "小升初") {
			return "六年级"
		}
		return "1-6年级通用"
	}
	return "全阶段通用"
}

// DetectTerm 智能推断学期/分册
func (s *SmartMetaService) DetectTerm(title string) string {
	t := strings.ToLower(title)
	if strings.Contains(t, "上册") || strings.Contains(t, "第一学期") || strings.Contains(t, "秋季") {
		return "上册"
	}
	if strings.Contains(t, "下册") || strings.Contains(t, "第二学期") || strings.Contains(t, "春季") {
		return "下册"
	}
	if strings.Contains(t, "全一册") || strings.Contains(t, "全册") {
		return "全一册"
	}
	if strings.Contains(t, "必修一") || strings.Contains(t, "必修第一册") || strings.Contains(t, "必修1") {
		return "必修第一册"
	}
	if strings.Contains(t, "必修二") || strings.Contains(t, "必修第二册") || strings.Contains(t, "必修2") {
		return "必修第二册"
	}
	if strings.Contains(t, "必修三") || strings.Contains(t, "必修第三册") || strings.Contains(t, "必修3") {
		return "必修第三册"
	}
	if strings.Contains(t, "选择性必修一") || strings.Contains(t, "选修一") {
		return "选择性必修第一册"
	}
	if strings.Contains(t, "选择性必修二") || strings.Contains(t, "选修二") {
		return "选择性必修第二册"
	}
	if strings.Contains(t, "总复习") || strings.Contains(t, "一轮复习") || strings.Contains(t, "二轮复习") || strings.Contains(t, "高考冲刺") || strings.Contains(t, "中考冲刺") {
		return "总复习"
	}
	return ""
}

// DetectSubject 智能推断学科
func (s *SmartMetaService) DetectSubject(title string, stage string) string {
	t := strings.ToLower(title)

	// 英语
	if strings.Contains(t, "英语") || strings.Contains(t, "新概念") || strings.Contains(t, "自然拼读") || strings.Contains(t, "单词") || strings.Contains(t, "完形填空") || strings.Contains(t, "阅读理解") || strings.Contains(t, "english") {
		return "英语"
	}

	// 数学
	if strings.Contains(t, "数学") || strings.Contains(t, "奥数") || strings.Contains(t, "高斯") || strings.Contains(t, "思维训练") || strings.Contains(t, "几何") || strings.Contains(t, "代数") || strings.Contains(t, "口算") || strings.Contains(t, "应用题") {
		return "数学"
	}

	// 语文
	if strings.Contains(t, "语文") || strings.Contains(t, "作文") || strings.Contains(t, "满分作文") || strings.Contains(t, "古诗") || strings.Contains(t, "文言文") || strings.Contains(t, "生字") || strings.Contains(t, "阅读写作") {
		return "语文"
	}

	// 物理
	if strings.Contains(t, "物理") || strings.Contains(t, "电学") || strings.Contains(t, "力学") {
		return "物理"
	}

	// 化学
	if strings.Contains(t, "化学") || strings.Contains(t, "方程式") {
		return "化学"
	}

	// 生物
	if strings.Contains(t, "生物") || strings.Contains(t, "遗传") || strings.Contains(t, "细胞") {
		return "生物"
	}

	// 历史
	if strings.Contains(t, "历史") || strings.Contains(t, "中国史") || strings.Contains(t, "世界史") {
		return "历史"
	}

	// 地理
	if strings.Contains(t, "地理") || strings.Contains(t, "地图") || strings.Contains(t, "经纬") {
		return "地理"
	}

	// 道德与法治/政治
	if strings.Contains(t, "道德与法治") || strings.Contains(t, "道法") || strings.Contains(t, "政治") || strings.Contains(t, "思想品德") {
		return "道德与法治"
	}

	// 科学 (小学特有)
	if strings.Contains(t, "科学") {
		return "科学"
	}

	// 公考/教资等特定科目
	if stage == "cert" {
		if strings.Contains(t, "综合素质") || strings.Contains(t, "科一") {
			return "综合素质"
		}
		if strings.Contains(t, "教育教学知识") || strings.Contains(t, "科二") {
			return "教育教学知识与能力"
		}
		return "教师资格综合"
	}

	if stage == "exam" {
		if strings.Contains(t, "行测") {
			return "行政职业能力测验"
		}
		if strings.Contains(t, "申论") {
			return "申论"
		}
		return "公共基础知识"
	}

	return "全科综合"
}

// DetectEdition 智能推断教材版本
func (s *SmartMetaService) DetectEdition(title string) string {
	t := title
	editions := []string{
		"人教版", "统编版", "部编版", "北师大版", "苏教版", "冀教版",
		"沪教版", "鲁教版", "外研版", "译林版", "仁爱版", "通用版",
	}

	for _, ed := range editions {
		if strings.Contains(t, ed) {
			if ed == "部编版" {
				return "统编版"
			}
			return ed
		}
	}
	return "通用版"
}

// DetectHasVideo 检测是否包含微课/视频
func (s *SmartMetaService) DetectHasVideo(title string) bool {
	t := strings.ToLower(title)
	return strings.Contains(t, "视频") || strings.Contains(t, "微课") || strings.Contains(t, "动画") || strings.Contains(t, "网课") || strings.Contains(t, "mp4") || strings.Contains(t, "讲解")
}

// GenerateSubtitle 生成通俗副标题
func (s *SmartMetaService) GenerateSubtitle(title string, subject string, stage string, hasVideo bool) string {
	if hasVideo {
		return fmt.Sprintf("名师考点精讲动画与高清视频微课 · 支持免密直存随时在线看")
	}
	if strings.Contains(title, "期末") || strings.Contains(title, "期中") {
		return fmt.Sprintf("名校期中期末全真模拟真题密卷 · 含名师详细解析与A4无损打印版")
	}
	if strings.Contains(title, "满分作文") || strings.Contains(title, "作文") {
		return fmt.Sprintf("历年中高考考场高分佳作合集 · 名师独家审题立意与提分技巧")
	}
	if subject != "" && subject != "全科综合" {
		return fmt.Sprintf("%s核心考点重难点精准突破复习讲义 · 高清PDF支持手机平板查阅", subject)
	}
	return "全国名校教学精编教辅资料合集 · 原版高清支持A4无损打印与极速转存"
}

// GenerateDescription 生成结构化详细介绍
func (s *SmartMetaService) GenerateDescription(title string, stage, grade, subject, edition string, hasVideo bool) string {
	var parts []string
	parts = append(parts, fmt.Sprintf("本套《%s》为精心整理的高清正版教学资源包。", title))

	info := []string{}
	if stageLabel := s.GetStageLabel(stage); stageLabel != "" {
		info = append(info, stageLabel)
	}
	if grade != "" {
		info = append(info, grade)
	}
	if subject != "" {
		info = append(info, subject)
	}
	if edition != "" {
		info = append(info, edition)
	}
	if len(info) > 0 {
		parts = append(parts, fmt.Sprintf("适用对象：%s。", strings.Join(info, " · ")))
	}

	if hasVideo {
		parts = append(parts, "包含高清动画讲解与考点视频课，内容生动通俗易懂，适合课前预习与考前针对性补差。")
	} else {
		parts = append(parts, "内含试卷正文与详细参考答案解析，版面清爽工整，完美兼容家庭/学校A4纸张无损双面打印。")
	}

	parts = append(parts, "全套资料无任何解压密码与门槛限制，支持一键免密转存至个人夸克网盘，手机、电脑、平板随时查阅复习。")
	return strings.Join(parts, " ")
}

func (s *SmartMetaService) GetStageLabel(stage string) string {
	switch stage {
	case "primary":
		return "小学专区"
	case "junior":
		return "初中专区"
	case "senior":
		return "高中专区"
	case "cert":
		return "教师资格证"
	case "exam":
		return "考公考研"
	case "kindergarten":
		return "幼小衔接"
	default:
		return "教育专区"
	}
}
