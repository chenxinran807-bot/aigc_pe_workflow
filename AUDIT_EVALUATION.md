# AI 试穿图片盲测闭环

## 目标

以人工问题标注为标准答案，评估模型通过 Prompt 对用户图、搭配图和生成图进行理解、比较和问题识别的能力。

人工分数、问题标签、归因和备注只进入本地评测器，禁止进入 Coze 审核模型。

## 当前资产

- 唯一测试工作流：`7668610423507419182`
- 当前回归模型：豆包 1.8 深度思考
- 当前候选 Prompt：`evidence-first-v1-loaded-wait`
- 飞书来源：见 `src/audit-source-catalog.mjs`

注意：首轮 10 条三模型结果发现 Coze 的 URL 图片存在首次抓取未完成的问题。旧结果仅用于诊断，不能用于模型排名。批处理器现在会在填值后等待 3.5 秒；若输出明确包含“输入缺失”，会使用完全相同输入自动复跑一次，并记录 `inputWarmRetry`。

## 执行

```bash
# 1. 只读采集并标准化飞书历史标注
npm run audit:collect -- work/audit-dataset.json

# 2. 运行前 N 条 Coze 盲测；Chrome 需要以调试端口启动并登录 Coze
COZE_DEBUG_PORT=9223 npm run audit:run -- \
  work/audit-dataset.json \
  work/audit-predictions.json \
  20

# 3. 生成按 user_image + outfit_image 分组隔离的固定数据切分
npm run audit:split -- work/audit-dataset.json work/audit-split.json

# 4. 生成标签级评测报告
npm run audit:evaluate -- \
  work/audit-dataset.json \
  work/audit-predictions.json \
  work/audit-report.json
```

固定切分使用同一 `groupId` 隔离，避免相同用户图和搭配图同时进入 Prompt 开发集与验证/测试集。当前切分为 56 条训练、20 条验证、11 条最终测试；Prompt 调试只能查看训练集人工标签，验证集只用于版本比较，测试集在最终候选确定前保持冻结。

## 指标约定

- `issueRecall`：人工记录的问题中，模型发现的比例。
- `macroRecall`：各问题标签召回率的宏平均。
- `macroF1Strict`：保守指标，暂把人工未记录的模型发现视为误报。
- `unverifiedExtraFindings`：模型发现但人工未记录的问题；正式结果中单独保存，不直接判模型错误。
- `parseFailures`：Coze 输出无法解析为约定 JSON。
- `pendingCases`：数据集中尚未运行的 Case，不计为解析失败。

0/1/2 分保留在数据集和模型输出中，只作为缺少细粒度问题标签时的辅助指标。

## 临时额外发现审查

该页面只用于 Prompt 优化前核验模型额外发现，不是通用标注产品。

```bash
npm run audit:review-html -- <dataset.json> <split.json> <doubao-1.6-report.json> work/extra-findings-review.html
```

生成的 HTML 同时展示用户图、搭配图、生成图、人工历史标签和模型额外发现。审查结论保存在浏览器本地，可导出 JSON；运行文件由 Git 忽略。审查完成后应立即回到豆包 1.6 Prompt 优化和冻结验证集回归。

## 局部裁剪输入实验

仓库提供 `audit:build-crops` 和 `audit:run-crops`，用于在训练比较集构建组合裁剪图并通过本地文件输入运行 Coze。2026-08-02 的定向 smoke 中，`contact-sheet-v1` 将 4 个目标问题召回从 2 提高到 4，但额外发现从 12 增至 17，且证据出现占位描述与语义混淆，因此该输入方案不升级、不进入验证集，也不建设内部 HTTP 裁剪服务。详见 `docs/crop-input-experiment-2026-08-02.md`。
