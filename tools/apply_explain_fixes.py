#!/usr/bin/env python3
"""应用解析审核结果。

fixed_explain 非空 → 覆盖 explain；answer_fix → 不直接改，单独列入 tmp/audit/answer_fixes.json
待二次复核（改答案比改解析危险得多）。
"""
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
J = Path(sys.argv[1])

fixes = []
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
    items = v.get("results") if isinstance(v, dict) else (v if isinstance(v, list) else None)
    if items and isinstance(items[0], dict) and "issue" in items[0]:
        fixes.extend(items)

bank = json.loads((REPO / "src/data/questions.json").read_text(encoding="utf-8"))
by_id = {q["id"]: q for q in bank}

n_exp, answer_fixes, seen = 0, [], set()
for f in fixes:
    qid = f["id"]
    if qid in seen or qid not in by_id:
        continue
    seen.add(qid)
    q = by_id[qid]
    if "answer_fix" in f and isinstance(f.get("answer_fix"), int):
        answer_fixes.append({"id": qid, "old": q["answer"], "new": f["answer_fix"],
                             "issue": f["issue"], "explain": f["fixed_explain"],
                             "q": q["q"][:80]})
        continue  # 答案修改暂不落盘
    if f.get("fixed_explain") and f["fixed_explain"].strip():
        q["explain"] = f["fixed_explain"].strip()
        n_exp += 1

(REPO / "src/data/questions.json").write_text(
    json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
(REPO / "tmp/audit/answer_fixes.json").write_text(
    json.dumps(answer_fixes, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"解析修复 {n_exp} 条；答案修改建议 {len(answer_fixes)} 条（待复核）")
