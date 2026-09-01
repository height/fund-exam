<div align="center">

# 考基宝

### 基金从业考试刷题宝

**按官方教材章节组织的基金从业资格考试题库与复习工具。**

收录 1673 道带解析题目，覆盖章节练习、模拟考试、错题复习和重点知识整理。
无需注册，不设会员功能，学习记录保存在本地浏览器中。

### [开始使用考基宝](https://height.github.io/fund-exam/)

<img src="docs/screenshots/01-home.png" width="32%" />
<img src="docs/screenshots/03-practice.png" width="32%" />
<img src="docs/screenshots/02-chapters.png" width="32%" />

</div>

---

## 产品定位

基金从业备考需要完成四项基本任务：按教材覆盖知识点、通过练习发现薄弱项、理解错题原因，
并在规定时间内检验掌握程度。考基宝将题库、练习记录、错题本和模拟成绩统一到教材章节，
作答后可以直接回到对应章节复习。

## 按教材章节练习

考基宝按照官方教材目录整理题库，覆盖科目一 8 章、科目二 18 章。
章节页展示题量、已练题数和正确率，便于定位尚未覆盖或正确率偏低的章节。

每章均支持练习和考试两种模式。章节考试随机抽取最多 30 题，
并按照正式考试的每题用时比例设置倒计时。

<div align="center">
<img src="docs/screenshots/02-chapters.png" width="32%" />
<img src="docs/screenshots/05-practice-setup.png" width="32%" />
<img src="docs/screenshots/10-map.png" width="32%" />
</div>

## 即时解析与错题管理

练习模式下，提交选项后立即显示正确答案和题目解析，无需等待整组练习结束。
可启用答对后自动进入下一题，答错时保留当前页面以便查看解析。

答错的题目会自动加入错题本；在后续练习中答对后，自动从错题本移除。

<div align="center">
<img src="docs/screenshots/03-practice.png" width="32%" />
<img src="docs/screenshots/07-wrong.png" width="32%" />
<img src="docs/screenshots/06-exam.png" width="32%" />
</div>

## AI 辅助解析

对于不易理解的教材解析，可调用 AI 生成补充说明，包括概念解释、易混点对比和记忆提示。
应用也支持生成独立的交互式图解，用于梳理题目中的概念关系。

选中题目或解析中的文字后，可通过「解释」功能仅针对所选内容发起查询。

该功能需要自行配置 API Key，目前预设 DeepSeek、智谱 GLM 和 ZenMux，
也可修改接口地址及模型名称。未配置时不影响题库、练习和考试功能。

<div align="center">
<img src="docs/screenshots/04-ai.png" width="32%" />
<img src="docs/screenshots/11-settings.png" width="32%" />
<img src="docs/screenshots/12-home-light.png" width="32%" />
</div>

## 题目表述拗口时，试试语音朗读

遇到题干较长、表述复杂或不易断句的题目时，可以通过语音朗读辅助理解。
题目、正确答案、教材解析和 AI 补充说明均支持朗读。
音频采用流式生成和播放，支持 1×、1.25× 和 1.5× 语速，并在变速时保持音调稳定。

语音功能使用 MiMo TTS，需要在设置页配置相应的 API Key。
最近生成的音频会在当前会话中缓存，重复播放时无需再次合成。

## 计算题与公式图谱

科目二练习页提供可收起的科学计算器。计算器与题目页面同时可用，
收起后会保留当前算式和结果。

题库中标记了 31 道计算题，可单独练习；同时提供 18 页公式图谱供复习查阅。

<div align="center">
<img src="docs/screenshots/08-calculator.png" width="32%" />
<img src="docs/screenshots/09-timeline.png" width="32%" />
<img src="docs/screenshots/05-practice-setup.png" width="32%" />
</div>

## 基金业发展时间线与知识图谱

基金业发展时间线收录自 1822 年至今的 71 个可考时点，
按「必背」「常考」「了解」三个层级整理，默认展示考试重点。

「隐藏年份」功能可用于自测。知识图谱则按照“章节—主题—必背要点”的层级组织内容，
并结合本地练习记录展示章节正确率。

<div align="center">
<img src="docs/screenshots/09-timeline.png" width="45%" />
<img src="docs/screenshots/10-map.png" width="45%" />
</div>

---

## 题库说明

当前题库共 1673 道题，全部包含解析。

| 分类 | 题量 |
|---|---:|
| 科目一：基金法律法规、职业道德与业务规范 | 939 |
| 科目二：证券投资基金基础知识 | 734 |

题目来源构成如下：

| 来源 | 题量 |
|---|---:|
| 临考押题 | 692 |
| 模考金题 | 336 |
| 终极押题 | 198 |
| 2026 年 5 月真题 | 149 |
| 2025 年 5 月真题 | 149 |
| 2025 年 11 月真题 | 119 |
| 高频真题 | 30 |

题目入库时会对重复及高度相似内容进行语义去重。对于考点、题干和选项高度相近的题目，
优先保留来源更可靠、解析更完整的版本。

其中 98 道题在原解析之外提供补充说明，原始解析内容保持不变。

章节分类按照官方教材目录逐题整理并经过交叉复核。新增题目入库时会校验科目、章节、
答案和解析等字段，避免未分类题目进入正式题库。

## 安装与离线使用

使用 Safari 或 Chrome 打开[考基宝](https://height.github.io/fund-exam/)，
通过浏览器菜单选择“添加到主屏幕”即可作为 PWA 使用。首次加载并完成缓存后，支持离线访问。

也可以下载完整的 `dist/` 目录进行本地部署。当前目录约 3.5 MB，
核心页面打包在约 1.9 MB 的 `index.html` 中，其他文件包括应用图标、Service Worker 和公式图谱。

## 本地开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 构建到 dist/
```

## 数据与隐私

- 做题记录、错题和考试成绩保存在浏览器本地，不上传至应用服务器
- 考基宝不提供账号系统，不包含行为埋点或远程加载的第三方脚本
- AI 与语音 API Key 保存在本地，仅在调用用户配置的相应接口时发送
- 练习进度可导出为 JSON 文件，并在其他设备或浏览器中导入

## 许可

代码 [MIT](LICENSE)。

题库来自第三方备考资料，版权归原作者，仅供个人学习，请勿商用或再分发。
图标来自 [Tabler Icons](https://github.com/tabler/tabler-icons)（MIT），出处见 [NOTICE](NOTICE)。

> 考点数字以中国证券投资基金业协会最新正式文件为准。
