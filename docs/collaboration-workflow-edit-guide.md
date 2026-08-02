# 豆包 1.6 互相纠正工作流

## 目标结构

```text
Start: user_image / outfit_image / generated_image
  → A_候选问题提出者
  → B_证据核验者
  → C_最终裁决者
  → End: audit_result
```

三个模型节点均使用 `豆包·1.6·视觉理解-250815`。A、B、C 都接收三张原图；B 额外接收 A 的 `candidate_json`；C 额外接收 A 的 `candidate_json` 和 B 的 `verification_json`。

## 输出变量

- A：`candidate_json`（String）
- B：`verification_json`（String）
- C：`audit_result`（String）
- End：返回 C 的 `audit_result`

## Prompt 文件

- `prompts/collaboration-a-proposer-system.txt`
- `prompts/collaboration-a-proposer-user.txt`
- `prompts/collaboration-b-verifier-system.txt`
- `prompts/collaboration-b-verifier-user.txt`
- `prompts/collaboration-c-arbiter-system.txt`
- `prompts/collaboration-c-arbiter-user.txt`

`{{candidate_json}}` 和 `{{verification_json}}` 是说明占位符；在 Coze 编辑器中应删除占位符并插入对应上游变量，不能作为普通文本保留。

该工作流仅用于训练集实验，不发布。人工标签不得进入任何模型节点。
