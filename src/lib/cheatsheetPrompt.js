import { knowledgeDistillationRules } from './knowledgeDistillation.js'

export const DEFAULT_CHEATSHEET_PROMPT = [
    '将以下已保存笔记整理为打印在A4纸上的高密度复习小抄。这是一次真正的提炼，不是复制排版。',
    '标题直接写知识点名称，不添加“AI速记”“AI精炼”“速记要点”等前缀，正文不重复这类标签。',
    '科目信息由页面统一放在页头。每条标题和正文不要重复科目几、第几章、章节名称等归属标签，只呈现知识点及内容。',
    '先通读全部资料，按知识关系重新组织整份小抄，而不是逐题逐条摘要。笔记数量不等于知识块数量；跨章节的同义概念、相互补充的条件和易混概念放在同一个完整知识块中。不同主题不强行合并。输出顺序按概念关系安排，与输入顺序无关。',
    '每个items条目是一个完整知识块：标题、定义、表格、公式与例外必须放在同一条markdown里，不拆成多个条目。不重复正文中的标题。',
    '同一考点或重复定义尽量合并，sourceIds列出所有对应笔记。每条原笔记至少被一个条目覆盖，不能漏掉独立考点。',
    '优先用关键词、分号短句、对照表、公式表达。删除套话、重复标题、做题选项字母、非必要案例年月和演示数字，不复述题目。',
    '参考密集手写复习页的组织：每条以短结论起头；分类用紧凑表格，数量关系用公式，流程用小型静态SVG。能用一行表达就不要分成多段，文字与图互补而不重复。可以将原文明确给出的关系绘成SVG，图中每个标签和箭头必须有资料支持。',
    '采用层级速记结构：概念→分类/条件→公式/关系→易错点。同章内容有层级时用最多两层列表或紧凑对照表，不机械地为每个考点填相同栏目。使用三色笔：核心结论<mark data-pen="key">短语</mark>，条件与适用范围<mark data-pen="condition">短语</mark>，易错与例外<mark data-pen="caution">短语</mark>。每条有意义时标1到3处，不为凑颜色编造条件，不标整段。不要装饰大图、封面、目录或复习建议。',
    ...knowledgeDistillationRules,
    '小抄比单条笔记更紧凑：跨笔记删除重复解释，将共用条件提到同一知识块只写一次，差异只列决定区分的部分。sourceIds覆盖表示保留该来源的核心知识，不表示逐句复刻来源。不要用缩小字号或增加装饰追求密度，优先减少冗余信息。',
    '保留有用的原有公式与关系。原笔记已有图片、静态SVG和公式必须保留，不得以精简、图文重复或空间不足为由删除、改写公式或替换为文字。主要蒸馏文字描述；同一图或公式重复出现可合并一次。保留图中标签、图例、公式符号含义与成立条件。旧formula和diagram字段也必须转入Markdown，保持含义完整。不画装饰图。公式用$或$$，重点用少量==短语==。正文不加一级标题，避免标题和正文重复。',
    '以上极简规则仅用于压缩文字，不覆盖已有图和公式的保留要求。三色笔保持蓝色结论、绿色条件、红色易错；原有标记若对应文字仍保留则沿用其语义。图尺寸由排版等比缩小，不通过删图、裁切或改动坐标实现压缩。',
    '新生成SVG默认带不透明浅色背景：在viewBox范围内先画覆盖全图的背景rect（必须先于文字和线条，禁止覆盖图形），配深色文字和清晰线条，不使用透明底；只用显式fill/stroke等属性，不用style、class或foreignObject。保留原图内容和三色语义。',
    '严格以资料为依据，不新增事实、公式、数值或外部图片，不纠正为无依据的新结论，不将单个例子泛化。矛盾处注明需核对。',
].join('\n')

const KEY = 'cheatsheet-generation-prompt-v1'
export function loadCheatsheetPrompt() {
  try { return localStorage.getItem(KEY)?.trim() || DEFAULT_CHEATSHEET_PROMPT } catch { return DEFAULT_CHEATSHEET_PROMPT }
}
export function saveCheatsheetPrompt(value) {
  const prompt = value.trim()
  if (!prompt || prompt.length > 20000) throw new Error('Prompt 不能为空，且不能超过 20000 字符')
  localStorage.setItem(KEY, prompt)
  return prompt
}
