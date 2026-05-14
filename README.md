# 中欧合作 · 粒子对撞机里的科技外交

《数据可视化》小组作业 / 2026 春。把 2011–2020 年中国与中东欧 16 国的论文合作做成 6 屏数据故事。

**线上版本:** https://szq6527.github.io/china-ceec-viz/
**截稿日期:** 2026-06-15 23:59

---

## 一句话讲清楚

数据看起来是"十年中欧合作大爆发",拆开看,**7.5% 的大科学协作论文吃下了 37.4% 的"合作量"**。
剥离物理之后,真实的双边专长(医、化、生、数)才浮出水面。

---

## 6 屏故事线(每一屏都有数据当骨架)

| # | 屏 | 核心数据断言 | 主数据源 |
|---|---|---|---|
| 01 | 最热的友谊 | 2011→2020 合作论文 1,046 → 4,791,十年累计 25,685,4.6× 增长 | `yearly.json` |
| 02 | 但有人被甩开了 | 16 国 8 秒赛跑;头号(波兰)≈ 末位(阿尔巴尼亚)的 98×;前 5 国占 67% | `per_country_yearly.json` |
| 03 | 排位却在掉 | 16 国双时期排位散点;7 国排位下降(头部)、6 国上升(尾部)、1 国持平 | `per_country.json` rank_125/135 |
| 04 | 粒子对撞机里的中欧外交 | 抽样 17,098 篇:**7.5% 论文(≥100 作者)制造 37.4% 合作量**;最严重克罗地亚 53% | `megapaper_stats.json`(OpenAlex) |
| 05 | 剥离物理,真实双边长这样 | 14 国学科栈式条;物理+天文均值 69%;每 4 秒切换"完整↔剥离"两态 | `country_subjects.json` |
| 06 | 合作的另一种地图 | 剥离物理后地图重画;4 张双边专长卡(中-希腊·医、中-波兰·化、中-捷克·生、中-罗·数) | 计算合成 |

详细的故事板和决策记录在 [设计文档.md](../设计文档.md)(数据目录的姊妹文件)。

---

## 设计哲学(必读)

两个层级、顺序不可颠倒、彼此解耦:

1. **第 1 层(地基):故事线必须完整、有趣、数据驱动。** 没有强故事,炫技再多也是空壳。
2. **第 2 层(装修):可视化执行本身** —— 动效、配色、3D、转场。**与具体数据值解耦** —— 数据决定"讲什么",视觉决定"怎么讲得带劲"。

加任何视觉效果之前先问:"这屏的核心断言在数据里能找到吗?"如果不能,先补故事,**不要**先做视觉。

---

## 数据从哪来,怎么洗

### 1. 主数据 · ScienceDB

> Database of China-CEEC Co-authorship Papers (2011–2020),`小组作业/中国与中东欧国家论文合作/data_raw/extracted/`

原始 5 类(每类 xlsx + csv,gb18030 编码,布局有点乱):

- `1.中东欧群体发文数量`:2011-2020 逐年中-中东欧合作量及占中国国际合作论文比例
- `2.各国发文量(135-125)`:16 国分十二五 / 十三五的合作量、占比、排位、增长率、位次变化
- `3. 中东欧群体合作领域`:中-中东欧群体的学科分布(两阶段)
- `4. 各国合作领域`:各国 2016-2020 学科分布
- `5. 合作机构`:中方与中东欧两侧机构 TOP 排行(注:不是机构间一对一边)

由 `scripts/build_data.py` 清洗成 6 个 JSON,放在 `public/data/`。命令:`npm run data`。

### 2. 补充数据 · OpenAlex

原数据有几个空缺,我们用 OpenAlex 公开 API 补:

- **megapaper_stats.json** — 抽样 12 国 × 2016-2020 共 17,098 篇中-CEEC 合作论文,按作者数分桶。证明"少数大科学论文吃下大半合作量"的核心论断。重建:`python3 scripts/fetch_openalex_megapapers.py`(~3 分钟)
- **per_country.json / per_country_yearly.json** 增补立陶宛、北马其顿(原数据缺) — `python3 scripts/backfill_missing_countries.py`
- **feature_paper.json** — Scene 4 引用的 ATLAS Higgs 2012 论文的真实作者数 / 国家数 / 机构数

### 3. 已知的数据局限(小报告里要写清)

- 原 ScienceDB 数据**没有逐篇论文的作者级共著边**,所以不能做真实作者合作网络。
- 机构数据是**单侧排行**(中方机构 vs 中东欧机构两份),**不是机构间一对一边权**;若做机构图要谨慎措辞。
- 各国合作量**含与多国共著的论文**(同一篇 CERN 论文同时计入波兰、捷克、希腊...),所以"各国数和 ≠ CEEC 总数"。这反过来正好是 Scene 4 的故事种子。
- 立陶宛、北马其顿为 OpenAlex 回填,排位是按现有 14 国分布插值估算,不是 WoS 原始排位。
- Scene 2 逐年数据为"125/135 期间总量按全局年度走势分配"的估算 —— 各国年总量精确,年内分布是估算。
- OpenAlex 单篇论文的 authorships 数组在作者 ≥ 250 时会被截断,所以"500-999""1000+"两个桶在 megapaper_stats 里基本为空,实际超大论文落入"100-499"桶。**这不影响"7.5% / 37.4%"的核心论断**(100 是判断阈值)。

---

## 本地启动

```bash
# 1. 安装依赖
npm install

# 2. 启动 dev server(端口 5173)
npm run dev
```

打开 http://127.0.0.1:5173/

**操作:**
- ←→ 切屏
- 空格切换自动播放
- 滚轮也能切屏
- 顶部右上"自动播放"按钮显示状态

**设计视口:** 1440×900。小于此尺寸会等比 letterbox 缩放(到 1280 / 1024 都没问题)。

---

## 目录结构

```
web/                                  ← 这个仓库的根
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── README.md                         ← 你在看的这个文件
├── public/
│   └── data/                         ← 所有 JSON 数据
│       ├── yearly.json
│       ├── per_country.json
│       ├── per_country_yearly.json
│       ├── group_subjects.json
│       ├── country_subjects.json
│       ├── institutions.json
│       ├── countries.json
│       ├── world-110m.json           ← Natural Earth TopoJSON
│       ├── feature_paper.json        ← OpenAlex ATLAS 论文卡
│       └── megapaper_stats.json      ← OpenAlex 抽样统计
├── scripts/
│   ├── build_data.py                 ← ScienceDB → JSON 清洗
│   ├── fetch_openalex_megapapers.py  ← OpenAlex 大作者分桶
│   └── backfill_missing_countries.py ← 立陶宛 / 北马其顿
├── src/
│   ├── main.tsx
│   ├── App.tsx                       ← 6 屏路由、键盘 / 滚轮 / 自动播放、过场
│   ├── types.ts
│   ├── data/
│   │   └── useData.ts                ← 加载所有 JSON
│   ├── styles/
│   │   └── globals.css               ← 设计 token、过场动画、letterbox
│   ├── components/
│   │   └── WorldMap.tsx              ← 地图 + 弧线(Scene 1 / 6 共享)
│   └── scenes/
│       ├── Scene1Opening.tsx         ← 最热的友谊
│       ├── Scene2BarRace.tsx         ← 但有人被甩开了
│       ├── Scene3RankFall.tsx        ← 排位却在掉
│       ├── Scene4Collider.tsx        ← 粒子对撞机(Three.js + Bloom)
│       ├── Scene5RealBilateral.tsx   ← 剥离 CERN,真实双边
│       └── Scene6AnotherMap.tsx      ← 合作的另一种地图
└── dist/                             ← npm run build 产物(.gitignore)
```

---

## 技术栈

| 用途 | 库 |
|---|---|
| 框架 | React 18 + Vite 5 + TypeScript |
| 2D 图表 / 地图 | d3, d3-geo, topojson-client(Natural Earth 110m) |
| 3D / 粒子 | three, @react-three/fiber, @react-three/postprocessing(Bloom / ChromaticAberration / Vignette) |
| 动画 | GSAP(已装,可加更多复杂时间线) |
| 字体 | Noto Serif SC(标题) + JetBrains Mono(数字) |
| 部署 | gh-pages → `gh-pages` 分支 |

---

## 常用命令

```bash
npm run dev      # 启动 dev server
npm run build    # 出生产包到 dist/
npm run preview  # 预览生产包
npm run data     # 重跑 build_data.py 重生成 JSON
npm run deploy   # build + 推 dist 到 gh-pages 分支(发布到 GitHub Pages)
```

---

## 部署

线上是 GitHub Pages,源是 `gh-pages` 分支。一行命令:

```bash
npm run deploy
```

效果:`npm run build` → `gh-pages -d dist -m "deploy: YYYY-MM-DD"`,把 `dist/` 推到 `gh-pages` 分支。
约 30 秒后 https://szq6527.github.io/china-ceec-viz/ 生效。

`main` 分支正常 git push 同步源码,不会自动触发部署 —— 部署必须显式 `npm run deploy`。

---

## 协作约定

1. **改前先看 [设计文档.md](../设计文档.md)** —— 故事板、配色、已做的决策都在里面。
2. **数字必须能在数据里溯源** —— 别在文案里写没在 JSON 里出现过的数字。如果故事需要新数字,先去 OpenAlex / WoS / Scopus 拉,把来源写进数据 JSON 的注释或 `_source` 字段。
3. **新加视觉效果前先问:这屏故事缺不缺角?** 缺就先补故事(改文案 / 拉数据),不缺再做装修(动效 / 配色 / 3D)。
4. **每次合并前 `npm run build` 跑一遍** —— TypeScript 严格模式,有错过不了。

---

## 后续可做的(故事已立住,以下都是装修)

- Scene 4 粒子飞回地图各国位置(连接 Scene 1 视觉)—— 中等工作量,视觉收益大
- Scene 1 / 6 地图弧线再发光一点(WebGL 自定义着色器)
- 移动端 portrait 布局(目前 letterbox 缩放,文字偏小)
- 小报告 Markdown 草稿(数据来源 + 处理方式 + 分工 + 参考文献)—— 这块同学负责,见 `设计文档.md` 第 8 节
- 给 Scene 5 / 6 的 toggle 增加键盘快捷键

---

## 数据来源(引用)

- 高扬, 宋征玺, 田威, 李蕴. 我国与中东欧国家科研合作态势研究. 世界科技研究与发展, 2022, 44(3): 442–453. DOI: 10.16507/j.issn.1006-6055.2022.03.003
- 配套数据:Database of China-CEEC Co-authorship Papers (2011-2020), ScienceDB
- 补充数据:OpenAlex /works API,2026-05-09 抽样
- ATLAS Collaboration. Observation of a new particle in the search for the Standard Model Higgs boson with the ATLAS detector at the LHC. Phys. Lett. B 716 (2012) 1–29. DOI: 10.1016/j.physletb.2012.08.020
- 世界地图底图:Natural Earth 110m via `world-atlas@2`
