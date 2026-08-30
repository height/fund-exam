#!/usr/bin/env python3
"""把题库切成归类用的 chunk 文件，供教研 agent 逐个 Read。

每个 chunk 只放题面（id/q/options/answer），刻意不放旧章名，避免锚定偏差。
旧归类另存 oldmap.json，留给工作流做 diff。输出到 tmp/classify/。
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "tmp" / "classify"
CHUNK = 45

bank = json.loads((REPO / "src/data/questions.json").read_text(encoding="utf-8"))

OUT.mkdir(parents=True, exist_ok=True)
oldmap = {q["id"]: q["chapter"] for q in bank}
(OUT / "oldmap.json").write_text(json.dumps(oldmap, ensure_ascii=False, indent=0), encoding="utf-8")

items = [{"id": q["id"], "subject": q["subject"], "q": q["q"],
          "options": q["options"], "answer": q["answer"]} for q in bank]
# 按科目分组切，避免一个 chunk 里混两个科目的章名空间
chunks = []
for subj in ("科目一", "科目二"):
    pool = [it for it in items if it["subject"] == subj]
    for i in range(0, len(pool), CHUNK):
        chunks.append(pool[i:i + CHUNK])

for n, c in enumerate(chunks):
    (OUT / f"chunk_{n:02d}.json").write_text(
        json.dumps(c, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"{len(items)} 题 -> {len(chunks)} 个 chunk（每块≤{CHUNK}）")
