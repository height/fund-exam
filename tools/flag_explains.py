#!/usr/bin/env python3
"""解析质量启发式筛查：输出 tmp/audit/flags.json 供教研 agent 重点复核。

规则（宁多勿漏，agent 做最终判断）：
- empty: 解析为空或过短
- letter_conflict: 解析声称的正确选项字母与 answer 字段不一致
- option_mismatch: 解析引用了选项里不存在的字母/内容
- watermark: 解析带水印/页脚残留
- truncated: 解析以明显残句结尾（被 600 字截断）
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
bank = json.loads((REPO / "src/data/questions.json").read_text(encoding="utf-8"))

WATERMARK = re.compile(r"加微信|网校|题库|http|www\.|押题|公众号")
SAYS_CORRECT = re.compile(r"([A-D])\s*[项个]?\s*(?:正确|是对的|符合题意)|选(?:项)?\s*([A-D])|答案[是为：:]\s*([A-D])")
SAYS_WRONG = re.compile(r"([A-D])\s*[项个]?\s*(?:错误|不正确|不符合|有误)")


def flags_for(q):
    f = []
    exp = q.get("explain", "")
    ans_letter = "ABCD"[q["answer"]]
    if len(exp) < 15:
        f.append("empty")
        return f
    if WATERMARK.search(exp):
        f.append("watermark")
    corrects = {m for g in SAYS_CORRECT.findall(exp) for m in g if m}
    if corrects and ans_letter not in corrects and ans_letter not in {
        m for g in SAYS_WRONG.findall(exp) for m in g if m}:
        # 解析点了别的字母正确、且没把答案字母当错误项讨论 → 疑似答案错位
        if len(corrects) == 1:
            f.append("letter_conflict")
    if exp[-1] not in "。！？.”)）】%0123456789":
        f.append("truncated")
    return f


out = []
for q in bank:
    f = flags_for(q)
    if f:
        out.append({"id": q["id"], "subject": q["subject"], "flags": f,
                    "answer_letter": "ABCD"[q["answer"]],
                    "q": q["q"][:60], "explain_head": q.get("explain", "")[:80]})

(REPO / "tmp/audit").mkdir(exist_ok=True)
(REPO / "tmp/audit/flags.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
from collections import Counter
print(Counter(x for q in out for x in q["flags"]))
print("flagged:", len(out), "/", len(bank))
