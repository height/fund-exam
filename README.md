<div align="center">

# 基金从业刷题

**1071 道带解析的真题押题，按官方教材目录归好类。一个网页，装到手机就能离线刷。**

不用注册，没有会员，做题记录只存在你自己手机里。

### [→ 打开就能用](https://height.github.io/fund-exam/)

<img src="docs/screenshots/01-home.png" width="32%" />
<img src="docs/screenshots/03-practice.png" width="32%" />
<img src="docs/screenshots/02-chapters.png" width="32%" />

</div>

---

## 对着教材一章一章刷

科目一 8 章、科目二 18 章，跟书上的目录一模一样。
每章多少题、做过多少、正确率多少，一眼看到底。哪章红了就补哪章。

上面切一下就从「练习」变「考试」——单章抽 30 题限时考一遍，
考完就知道这章到底会了没有。

<div align="center">
<img src="docs/screenshots/02-chapters.png" width="32%" />
<img src="docs/screenshots/05-practice-setup.png" width="32%" />
<img src="docs/screenshots/10-map.png" width="32%" />
</div>

## 选完立刻出解析

不用等交卷。选错了直接告诉你正确答案是哪个、你错在哪，解析就在下面。
答对可以设成自动跳下一题，答错才停下来。

答错的题自动进错题本，再答对自动移出去。

<div align="center">
<img src="docs/screenshots/03-practice.png" width="32%" />
<img src="docs/screenshots/07-wrong.png" width="32%" />
<img src="docs/screenshots/06-exam.png" width="32%" />
</div>

## 解析看不懂？让 AI 换个讲法

有些解析写得跟法条一样。点一下「AI 解析」，用大白话重讲一遍，
比喻、口诀、易混对比表都有。还能生成一页交互式图解，一步一步点着看。

要自己填 Key，DeepSeek / 智谱 GLM / ZenMux 都行，Key 只存在你手机上。
不配也不影响刷题。

<div align="center">
<img src="docs/screenshots/04-ai.png" width="32%" />
<img src="docs/screenshots/11-settings.png" width="32%" />
<img src="docs/screenshots/12-home-light.png" width="32%" />
</div>

## 算不清就叫计算器

科目二有一堆算收益率、算周转天数的题。右下角常挂一个科学计算器，
点开是个抽屉——题目照样能滚能点，边看题边算，算到一半收起来看数字也不会丢。

31 道计算题挑出来单练，配 18 页公式图谱，做错了直接翻。

<div align="center">
<img src="docs/screenshots/08-calculator.png" width="32%" />
<img src="docs/screenshots/09-timeline.png" width="32%" />
<img src="docs/screenshots/05-practice-setup.png" width="32%" />
</div>

## 基金发展史，专治年份题

「第一只货币市场基金是哪年」「淄博基金是谁批的」——这种题每年都考，
背起来又乱。1822 年到现在的 71 个时点串成一条线，分「必背 / 常考 / 了解」三档，
默认只显示考试重点。

有个「盖住年份」的开关，把日期全遮起来，自己想完再点开对答案。

<div align="center">
<img src="docs/screenshots/09-timeline.png" width="45%" />
<img src="docs/screenshots/10-map.png" width="45%" />
</div>

---

## 题从哪来

1071 道，全部带解析：

| | |
|---|---|
| 科目一 基金法律法规 | 647 题 |
| 科目二 证券投资基金基础 | 424 题 |
| 临考押题 | 733 题 |
| 模考金题 | 283 题 |
| 2025 年 11 月真题 | 55 题 |

重复的题会被合掉——同一道题不管从哪份资料里抽出来都算同一道，
留解析更全、来源更可信的那份（真题 > 模考 > 押题）。

其中 99 道解析最难懂的另配了大白话版本，折叠在原解析下面，原文一字不改。

**章节是重做过的。** 一开始是按关键词猜的，1071 题里有 257 题堆在「综合」里，
等于没归类。后来推倒重来，一题一题对着教材归位，归完再交叉复核两轮，
有分歧的逐题查教材原文定夺。现在每道题都落在书上真实存在的那一章。

## 装到手机

用 Safari 或 Chrome 打开 [在线地址](https://height.github.io/fund-exam/)，
点分享 → 添加到主屏幕。之后它就是一个 App 图标，点开全屏，断网也能刷。

也可以直接下载 `dist/index.html`，一个文件 1.2 MB，双击用浏览器打开就行。
塞进 U 盘、发微信给同学都可以。

## 本地跑

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 打包成单个 dist/index.html
```

## 隐私

- 做题记录、错题、成绩存在浏览器本地，不上传
- 没有账号，没有埋点，没有第三方脚本
- API Key 存在你自己手机上，只发给你填的那个接口
- 设置页可以导出进度 JSON，换手机自己搬过去

## 许可

代码 [MIT](LICENSE)。

题库来自第三方备考资料，版权归原作者，仅供个人学习，请勿商用或再分发。
图标来自 [Tabler Icons](https://github.com/tabler/tabler-icons)（MIT），出处见 [NOTICE](NOTICE)。

> 考点数字以中国证券投资基金业协会最新正式文件为准。
