#!/usr/bin/env python3
"""把蒸馏结果并入题库。

输入：
  tmp/distill/candidates.json      解析+去重后的候选题（answer=-1 表示无源答案）
  tmp/distill/classifications.json 归类结果 [{id, chapter, confidence}]
  tmp/distill/answers.json         双盲作答 {id: {rep0: {answer, explain}, rep1: {...}}}

规则：
- 有源答案的题直接收；双盲作答的题仅当两人答案一致才收，解析取长的一份；
  任一人标了「把握不大」的，题目标记 review=true 供后续重点复核。
- 章节取归类结果；低置信的标记 review=true。
- 追加进 src/data/questions.json，并把新 id->chapter 并入 tools/chapters.json，
  最后由 apply_chapters.py 统一校验落盘。
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
D = REPO / "tmp" / "distill"

cand = json.loads((D / "candidates.json").read_text(encoding="utf-8"))
cls = {c["id"]: c for c in json.loads((D / "classifications.json").read_text(encoding="utf-8"))}
ans = json.loads((D / "answers.json").read_text(encoding="utf-8"))
bank = json.loads((REPO / "src/data/questions.json").read_text(encoding="utf-8"))
chmap = json.loads((REPO / "tools/chapters.json").read_text(encoding="utf-8"))

tax = json.loads((REPO / "tools/taxonomy.json").read_text(encoding="utf-8"))
valid = {s: {c["name"] for c in tax[s]} for s in ("科目一", "科目二")}

kept, dropped_noagree, dropped_nocls = [], 0, 0
for q in cand:
    c = cls.get(q["id"])
    if not c or c["chapter"] not in valid[q["subject"]]:
        dropped_nocls += 1
        continue
    q["chapter"] = c["chapter"]
    if q["answer"] == -1:
        a = ans.get(q["id"], {})
        r0, r1 = a.get("rep0"), a.get("rep1")
        if not r0 or not r1 or r0["answer"] != r1["answer"]:
            dropped_noagree += 1
            continue
        q["answer"] = r0["answer"]
        q["explain"] = max(r0["explain"], r1["explain"], key=len)
        if "把握不大" in r0["explain"] or "把握不大" in r1["explain"]:
            q["review"] = True
        q["explain"] = q["explain"].replace("（把握不大）", "")
    if c.get("confidence") == "low":
        q["review"] = True
    kept.append(q)
    chmap[q["id"]] = q["chapter"]

bank.extend(kept)
(REPO / "src/data/questions.json").write_text(
    json.dumps(bank, ensure_ascii=False, indent=1), encoding="utf-8")
(REPO / "tools/chapters.json").write_text(
    json.dumps(chmap, ensure_ascii=False, indent=0), encoding="utf-8")
print(f"入库 {len(kept)}（双盲不一致丢弃 {dropped_noagree}，无有效归类丢弃 {dropped_nocls}）")
print(f"题库总量 {len(bank)}")
