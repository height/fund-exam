#!/usr/bin/env python3
"""从蒸馏工作流 journal 汇总结果到 tmp/distill/classifications.json 与 answers.json。

answers 按「同 id 集合的两份独立作答」配对成 rep0/rep1。
"""
import json
import sys
from pathlib import Path

J = Path(sys.argv[1])  # workflow transcript 目录下的 journal.jsonl
D = Path(__file__).resolve().parents[1] / "tmp" / "distill"

classifications, answer_sets = [], []
for line in J.read_text(encoding="utf-8").splitlines():
    rec = json.loads(line)
    if rec.get("type") != "result":
        continue
    v = rec.get("result")
    if isinstance(v, str):
        try:
            v = json.loads(v)
        except Exception:
            continue
    items = v.get("results") if isinstance(v, dict) else None
    if not items:
        continue
    if "chapter" in items[0]:
        classifications.extend(items)
    elif "answer" in items[0]:
        answer_sets.append({i["id"]: i for i in items})

# 去重归类（同一 id 只留一条；多次运行可能有重复记录）
seen, cls_out = set(), []
for c in classifications:
    if c["id"] not in seen:
        seen.add(c["id"])
        cls_out.append(c)

# 双盲配对：按 id 收集各作答记录，取来自不同记录的前两份（容忍某份漏题）
answers = {}
by_id = {}
for s in answer_sets:
    for qid, it in s.items():
        by_id.setdefault(qid, []).append(it)
for qid, reps in by_id.items():
    if len(reps) >= 2:
        answers[qid] = {"rep0": {"answer": reps[0]["answer"], "explain": reps[0].get("explain", "")},
                        "rep1": {"answer": reps[1]["answer"], "explain": reps[1].get("explain", "")}}

(D / "classifications.json").write_text(json.dumps(cls_out, ensure_ascii=False, indent=0), encoding="utf-8")
(D / "answers.json").write_text(json.dumps(answers, ensure_ascii=False, indent=0), encoding="utf-8")
print(f"classifications: {len(cls_out)}, 双盲齐全: {len(answers)}, 作答记录数: {len(answer_sets)}")
