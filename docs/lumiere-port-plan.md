# 绘光 Lumiere 移植回 folia：进度与计划

分支 `lumiere`，全部改动尚未提交。来源是 `../lumisynth` 的 `src/packs/lumiere/`（设计见 lumisynth `docs/LUMIERE.md`，
移植 TODO 见 lumisynth `docs/HANDOFF.md` 末尾「把绘光作为 visualizer 移植回 folia」）。

## 用户已定的决定（2026-09-29）

- 100 种光位全部带过来；全自动编排（加载歌词时编译），只给少量 tuning，不提供光位 / 排版选择。
- 画质：默认全分辨率，提供降级选项（`renderQuality`: full / balanced / low）。
- 关键字着色（主题 `wordColors`）与主题图标（`lyricsIcons` 画成线稿）在 folia 里一起做。
- 断行：绘光倾向长行，尽量少换行（见下方「进行中」）。
- 暗场作为设置加入（见下方「待做 1」）。

## 已完成

- 核心移植：`src/components/visualizer/lumiere/`（scene、light/、lineart/、text/、rigs/、catalog、credits、overlay）；
  folia 侧编译器 `lumiereProgram.ts` + `lumiereStructure.ts` + `lumiereTransitions.ts`；内核类型垫片 `lumiereKernel.ts`；
  `lumiereUnit.ts`（对应 lumisynth adapter 的 buildUnit）。
- 运行时与外壳：`createLumierePixiRuntime.ts`（+ `lumiereRuntimeTuning.ts`、`lumiereSceneFrames.ts`、`lumiereSceneEntry.ts`、
  `lumiereGroupFilters.ts`、`lumiereCreditsLayer.ts`、`lumiereSongSwap.ts`、`lumiereAudio.ts`）、`VisualizerLumiere.tsx`、`entry.tsx`；
  `BUILTIN_VISUALIZER_MODES`、命令面板 `visualizer-lumiere`、README。
- 设置接入：`LumiereTuning` / `DEFAULT_LUMIERE_TUNING`（`src/types.ts`）、`normalizeLumiereTuning`（`src/utils/lumiereTuning.ts`）、
  `useVisualizerSettingsStore`、外观短码 `lmt`、JSON 导入、同步快照、OBS 视觉配置、Folium tunings、i18n、`LumiereSettingsPanel.tsx`。
- 关键字着色与主题图标：`text/keywordColors.ts`、`lineart/iconPaths.ts`、`lineart/themeIcons.ts`；
  sonnet 的图标名解析抽到 `src/utils/lucideIconResolver.ts`（sonnet 行为不变）。
- 光晕抖动修复（用户已确认消失）：文字组 bloom 没有固定 `filterArea`，Pixi 每帧按内容包围盒取区域，降采样网格随字跳动。
  folia 与 lumisynth 的 `scene.ts` / `credits.ts` 都已改为 `text.filterArea = Rectangle(-w, -h, 3w, 3h)` + padding 0。
- 验证基线：`npx tsc --noEmit` 通过；全量单测只有 5 个在干净 HEAD 上就失败的用例
  （`linuxDesktopIntegration`、`foliumApiDocs`、`foliumIcons` ×3），与本次无关。

## 进行中：歌词断行（folia 与 lumisynth 同步修）

问题：`text/lyricWindow.ts` 里横排行长上限是 `region.w`、竖排是 `region.h`（约 0.5 屏高），超出就整体缩小，
竖排超过约 6 个字就明显偏小，邻行再乘槽位缩放后碎成一小撮；横排长句同理。

方案（优先级从高到低）：
1. 单行先用满画框内的可用宽 / 高（避开画框四角与底部字幕），文字区只负责居中。
2. 仍放不下，先整体微缩到约 0.8×。
3. 再放不下才换行：最多 2 行 / 2 列，均衡断行。
4. 2 行 / 2 列仍放不下，才继续缩小。

- 测量用 `@chenglou/pretext` 直接给出的宽度：`measureNaturalWidth`、rich-inline 的 `measureRichInlineStats`、
  `walkRichInlineLineRanges`（每行 `width`，片段 `gapBefore` / `occupiedWidth`）。每词一个 item（带各自字号倍率、`break: 'never'`、letterSpacing），
  行数 = ceil(自然宽 / 上限)，目标宽 ≈ 自然宽 / 行数 + 最宽词余量，不做二分。竖排：直立中日文按字号步进，侧转拉丁 / 数字用 pretext 自然宽。
- 分词沿用 `segmentLyricWords`（尊重用户保存的精细分词），粘连标点跟随词。
- 邻行槽位间距按实际行数 / 列数计算；追字光斑、飞字轨迹、十字爆闪都跟随行 / 列。
- 列布局数学放新模块（如 `text/verticalColumns.ts`），不再加长 `lyricWindow.ts`。
- 验收：单测（断行、尊重分词、不重叠、在画框内、常见长度保持单行）；dev probe 截图（常见长度单行 + 超长句 2 行 / 2 列，横竖各一，含 crossed 与浅色主题）；
  lumisynth 单测、typecheck 与渲染回归（基线只报告不更新，差异应能由本修复与光晕修复解释）。

## 待做

### 0. 断行这轮完成后先在 folia 提交一次（用户要求）
检查通过（tsc、单测、截图）后提交 folia 当前全部改动；中文 Conventional Commits、GPG 签名、不加 co-author / 会话链接，
正文说明机制。`dev/probes/visualizerMemory.probe.tsx` 的新参数随之提交；scratchpad 里的临时脚本不进仓库。
本计划文件是否随提交保留，提交前问用户。lumisynth 那边的改动（光晕修复、断行）不在这次提交里，另问用户。

### 1. 暗场强度设置
现状：暗场底在光场着色器里画（`uDark`，`scene.ts` 的 `resolveLumierePalette`），亮色主题固定 alpha 0.94，深色主题为 0。
深色主题下 folia 的共享背景（默认 latent）会透上来，把暗场冲淡发灰。

- `LumiereTuning` 加 `darkField: number`（0–1，暂定默认 0.6，按截图调）；`normalizeLumiereTuning` 钳范围；
  `LumiereSceneTuning` 同步加字段，`lumiereRuntimeTuning.ts` 映射。
- 生效规则：深色主题 alpha = `darkField`；亮色主题保留 0.94 的保底（lumisynth 已定「绘光始终在暗场里」），即 `max(darkField, 0.94)`。
  如果用户希望亮色主题也可调，再改。
- 颜色仍由主题背景色压暗（`scaleRgb(background, 0.06)`）。
- 实时生效：palette 目前在构建场景时算一次，改为每帧从共享 tuning 读 alpha（与 `fogDensity` 等实时字段同一机制），不触发重建。片尾卡同样处理。
- 检查转场：出场帧带 alpha 的转场（非熄灯）在深色主题 + 暗场下会不会透出背景闪一下；有问题就把暗场改成运行时层级的一整块底（不随单元转场），场景里不再画。
- 接入：设置面板「氛围」组加滑块；外观短码（`LUMIERE_SHORT_KEYS` 加短键，旧短码缺字段时走默认）、JSON 导入、同步 schema、i18n（en / zh-CN）；
  更新 `test/unit/visualizer/lumiereSettings.test.ts` 与 store / config 快照。
- 只改 folia（lumisynth 的背景由内核管，没有共享背景层的问题）。

### 2. 收尾
- 在完整 App 与 VisPlayground 里手动过一遍（切模式、设置面板、导入导出、切歌、暂停、OBS 源）。
- 已知遗留：歌词字号不跟随 `lyricsFontScale`（与 sonnet / tempera 一样显示「字号自动」提示）；
  `lyricWindow.ts`、`lineart/diagrams.ts`、`createLumierePixiRuntime.ts` 超出拆分建议长度。
- `in.ts` 缺 `lumiereFontSizeAutoNotice`（与 tempera 一样回退英文）。
- lumisynth 的 T1（绘光关键字着色与图标）仍未做，可以把 folia 的实现回移；需要时更新 lumisynth `docs/HANDOFF.md`。
- 用户确认后按中文 Conventional Commits 分几次提交（不加 co-author），本文件是否保留由用户决定。
