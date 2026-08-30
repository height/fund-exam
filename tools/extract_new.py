#!/usr/bin/env python3
"""从 tmp/cand/ 的候选文本里解析新题，与现有题库去重，输出 tmp/distill/candidates.json。

复用 extract.py 的 split_questions/parse_block/dedup_key。
终极押题（题目/答案分离且答案无文本层）只解析题干+选项，answer=-1，留给教研 agent 作答。
"""
import hashlib
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extract import split_questions, parse_block, dedup_key, norm, OPT_RE, scrub  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
CAND = REPO / "tmp" / "cand"
OUT = REPO / "tmp" / "distill"
BANK = REPO / "src" / "data" / "questions.json"

# 文件名前缀 -> (subject, source 标签)
FILES = [
    ("科目一__模考金题__2026年7月模考金题_王佳荣.txt", "科目一", "模考金题"),
    ("科目一__真题2025-05__2025年5月.txt", "科目一", "真题2025-05"),
    ("科目一__真题2026-05__2026年5月_回忆版82题.txt", "科目一", "真题2026-05"),
    ("科目一__高频真题__考前急救_基金科目一_法律法规_30个原题带刷.txt", "科目一", "高频真题"),
    ("科目二__真题2025-05__2025年5月.txt", "科目二", "真题2025-05"),
    ("科目二__真题2025-11__2025年11月2.txt", "科目二", "真题2025-11"),
    ("科目二__真题2026-05__2026年5月_100题完整版.txt", "科目二", "真题2026-05"),
    ("科目二__高频真题__考前必刷_基金科目二_证券投资基金_30道高频真题.txt", "科目二", "高频真题"),
    ("科目二__高频真题__抢分必刷_基金科目二_基础知识_30个高频真题.txt", "科目二", "高频真题"),
]

YATI = [  # 无答案押题：题干+选项，answer=-1
    ("科目一__终极押题__法规_终极押题_一_题目.txt", "科目一", "终极押题"),
    ("科目一__终极押题__法规_终极押题_二_题目.txt", "科目一", "终极押题"),
    ("科目二__终极押题__基础_终极押题_一_题目.txt", "科目二", "终极押题"),
    ("科目二__终极押题__基础_终极押题_二_题目.txt", "科目二", "终极押题"),
]

NO_ANS_RE = re.compile(r"^\s*\d{1,3}\s*[.、．]\s*(?:（单选题\s*\d+\s*分）)?")

OPT_START = re.compile(r"^([ABCD])[.．、]\s*(.*)$")
# 答案区：「1 答案：A」或题号单独一行然后「答案：X」，解析到下一题号为止
ANS_RE = re.compile(
    r"(?m)^\s*(\d{1,3})\s*[、.．]?\s*\n?\s*答案[：:]\s*\n?\s*([ABCD])(?![一-鿿])")


def parse_stem_block(block):
    """题干区的一块：题号+题干+四个选项（选项字母可能独占一行）"""
    block = block.replace("　", " ").replace(" ", "")
    lines = [l.strip() for l in block.splitlines() if l.strip()]
    stem, opts, cur = [], [], None
    for line in lines:
        if re.match(r"^\d{1,3}\s*/\s*\d{1,3}$", line):  # 页码
            continue
        om = OPT_START.match(line)
        if om and len(opts) < 4 or (om and om.group(2) and len(opts) < 4):
            if cur is not None:
                opts.append(cur)
            cur = om.group(2).strip()
        elif cur is not None:
            cur += line
        else:
            stem.append(line)
    if cur is not None:
        opts.append(cur)
    if len(opts) != 4:
        return None
    opts = [scrub(o) for o in opts]
    if not all(opts) or len(set(opts)) < 4:
        return None
    q = scrub(re.sub(r"\s+", "", "".join(stem)))
    q = re.sub(r"^\d{1,3}\s*[、.．]\s*", "", q)
    q = re.sub(r"^第\s*\d+\s*题\s*单选题[^\n]*", "", q)
    q = re.sub(r"(?<=.)(Ⅰ|Ⅱ|Ⅲ|Ⅳ|IV|III|II|I)(?=[、．.])", r"\n\1", q)
    if len(q) < 6:
        return None
    return {"q": q, "options": opts}


def parse_two_part(text):
    """题答分离版式：前半 1..100 题干，「答案解析」后半按题号给答案+解析"""
    m = re.search(r"答案解析", text)
    if not m:
        return []
    stem_text, ans_text = text[: m.start()], text[m.end():]
    # 答案区：题号 -> (答案, 解析)
    marks = list(ANS_RE.finditer(ans_text))
    answers = {}
    for i, am in enumerate(marks):
        num = int(am.group(1))
        end = marks[i + 1].start() if i + 1 < len(marks) else len(ans_text)
        exp = ans_text[am.end():end]
        exp = re.sub(r"^\s*解析[：:]?\s*", "", exp.strip())
        exp = re.sub(r"\s+", "", exp)
        exp = re.sub(r"^\d{1,3}/\d{1,3}", "", exp)
        answers[num] = ("ABCD".index(am.group(2)), scrub(exp)[:600])
    # 序号必须从 1 连续递增，否则说明答案区有漏匹配，整份文件不可信
    if sorted(answers) != list(range(1, len(answers) + 1)):
        return []
    out = []
    for block in split_questions(stem_text):
        item = parse_stem_block(block)
        if not item:
            continue
        nm = re.match(r"^\s*(\d{1,3})", block)
        num = int(nm.group(1)) if nm else None
        if num not in answers:
            continue
        ans, exp = answers[num]
        item.update(answer=ans, explain=exp)
        out.append(item)
    return out


def parse_no_answer(block):
    """终极押题版式：题号（单选题 1 分）题干 A. ... D. ...，无答案"""
    block = block.replace("　", " ")
    lines = [l.strip() for l in block.splitlines() if l.strip()]
    stem, opts, cur = [], [], None
    for line in lines:
        om = OPT_RE.match(line)
        if om:
            if cur:
                opts.append(cur)
            cur = om.group(2).strip()
        elif cur is not None:
            cur += line
        else:
            stem.append(line)
    if cur:
        opts.append(cur)
    if len(opts) != 4 or len(set(opts)) < 4:
        return None
    q = scrub(re.sub(r"\s+", "", "".join(stem)))
    q = NO_ANS_RE.sub("", q)
    q = re.sub(r"(?<=.)(Ⅰ|Ⅱ|Ⅲ|Ⅳ|IV|III|II|I)(?=[、．.])", r"\n\1", q)
    if len(q) < 6:
        return None
    return {"q": q, "options": [scrub(o) for o in opts], "answer": -1, "explain": ""}


def grams(t, n=4):
    return {t[i:i + n] for i in range(max(1, len(t) - n + 1))}


def main():
    bank = json.loads(BANK.read_text(encoding="utf-8"))
    bank_keys = {}
    for q in bank:
        bank_keys.setdefault(dedup_key(q), q["id"])
    # 题干 4-gram 索引，用于模糊去重（换措辞的同一道题）
    bank_grams = []
    for q in bank:
        bank_grams.append((grams(norm(q["q"])), q["id"]))

    def fuzzy_dup(item):
        g = grams(norm(item["q"]))
        if not g:
            return None
        best, bg = 0.0, None
        for bgset, qid in bank_grams:
            inter = len(g & bgset)
            if not inter:
                continue
            j = inter / min(len(g), len(bgset))
            if j > best:
                best, bg = j, qid
        return (bg, best) if best >= 0.6 else None

    out, stats = [], {}
    seen_session = {}
    WM = re.compile(r"经典真题带刷|全真机考.*题库|http\S*")

    def clean(item):
        item["q"] = WM.sub("", item["q"]).strip()
        item["options"] = [WM.sub("", o).strip() for o in item["options"]]
        return item

    def add(item, subject, source, fname):
        item = clean(item)
        if len(item["q"]) < 6 or not all(item["options"]) or len(set(item["options"])) < 4:
            return
        fp = dedup_key(item)
        qid = hashlib.md5(fp.encode()).hexdigest()[:12]
        st = stats.setdefault(fname, {"parsed": 0, "dup_bank": 0, "dup_fuzzy": 0, "dup_self": 0, "kept": 0})
        st["parsed"] += 1
        if fp in bank_keys or qid in {q["id"] for q in bank}:
            st["dup_bank"] += 1
            return
        if fp in seen_session:
            st["dup_self"] += 1
            return
        dup = fuzzy_dup(item)
        if dup:
            st["dup_fuzzy"] += 1
            return
        seen_session[fp] = 1
        item.update(id=qid, subject=subject, source=source)
        out.append(item)
        # 同一轮可能同时导入多份资料。已接收的候选也要立刻加入模糊索引，
        # 否则它们只会和旧题库比较，彼此之间的改写题会一起漏进入库。
        bank_grams.append((grams(norm(item["q"])), qid))
        st["kept"] += 1

    for fname, subject, source in FILES:
        text = (CAND / fname).read_text(encoding="utf-8")
        two_part = parse_two_part(text)
        if len(two_part) >= 20:      # 题答分离版式解析成功
            for item in two_part:
                add(item, subject, source, fname)
            continue
        # 【真题N·单选】版式（高频真题带刷）
        if "【真题" in text or "【考题" in text:
            for block in re.split(r"【(?:真题|考题)\s*\d+[^】]*】", text):
                item = parse_block(block)
                if item:
                    add(item, subject, source, fname)
            continue
        for block in split_questions(text):
            item = parse_block(block)
            if item:
                add(item, subject, source, fname)

    for fname, subject, source in YATI:
        text = (CAND / fname).read_text(encoding="utf-8")
        for block in split_questions(text):
            item = parse_no_answer(block)
            if item:
                add(item, subject, source, fname)

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "candidates.json").write_text(
        json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    for f, st in stats.items():
        print(f, st)
    print("新题合计:", len(out), "（其中待作答:", sum(1 for q in out if q["answer"] == -1), "）")


if __name__ == "__main__":
    main()
