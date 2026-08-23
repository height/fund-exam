#!/usr/bin/env python3
"""从备考 PDF 抽取单选题，生成 src/data/questions.json 题库。

支持两种版式：
  A 临考Y题:  "1.题干 A.选项 ... 答案：D 解析：..."
  B 真题:     "1、题干 A．选项 ... 【参考答案】D 【...】解析..."
用法: python3 tools/extract.py   (在仓库根目录下运行，PDF 取自 materials/)
"""
import json, re, sys, hashlib, unicodedata
from collections import defaultdict
from pathlib import Path
from pypdf import PdfReader

REPO = Path(__file__).resolve().parents[1]
ROOT = REPO / "materials"          # PDF 素材，不入 git，见 docs/资料索引.md
DATA = REPO / "src" / "data"
OUT = DATA / "questions.json"

SOURCES = [
    # (subject, glob, 来源标签)
    ("科目一", "01_科目一_基金法律法规/04_模拟与押题/2026年基金从业*临考Y题*.pdf", "临考押题"),
    ("科目一", "01_科目一_基金法律法规/05_历年真题/2025年11月.pdf", "真题2025-11"),
    ("科目二", "02_科目二_证券投资基金基础/04_模拟与押题/2026年基金从业*临考Y题*.pdf", "临考押题"),
    ("科目二", "02_科目二_证券投资基金基础/05_历年真题/2025年11月1.pdf", "真题2025-11"),
    ("科目一", "01_科目一_基金法律法规/04_模拟与押题/2026年4月模考金题（一）.pdf", "模考金题"),
    ("科目一", "01_科目一_基金法律法规/04_模拟与押题/2026年5月模考金题（一）_王佳荣.pdf", "模考金题"),
    ("科目一", "01_科目一_基金法律法规/04_模拟与押题/2026年5月模考金题（二）_王佳荣.pdf", "模考金题"),
]

# 章节归类不再用关键词猜。id -> 官方章名的映射表由归类流程产出、进 git，
# 这里只做查表；新题查不到就标「未归类」并在末尾列出来，逼人去补，
# 而不是悄悄塞进「综合」——那等于没归类，还看不出来。
CH_MAP = json.loads((REPO / "tools/chapters.json").read_text(encoding="utf-8")) \
    if (REPO / "tools/chapters.json").exists() else {}
TAXONOMY = json.loads((REPO / "tools/taxonomy.json").read_text(encoding="utf-8"))
CH_ORDER = {sub: {c["name"]: c["no"] for c in TAXONOMY[sub]} for sub in ("科目一", "科目二")}
UNTAGGED = "未归类"


# 来源可信度：真题 > 模考金题 > 临考押题。重复时留可信度高、解析长的那份
SOURCE_RANK = {"真题": 3, "模考": 2}


def src_rank(label):
    for k, v in SOURCE_RANK.items():
        if k in label:
            return v
    return 1


def norm(t):
    """去掉标点、空白、全半角差异，只留可比的正文"""
    t = unicodedata.normalize("NFKC", t)
    return re.sub(r"[\s，。、；：（）()【】“”\"'？?！!,.;:·]+", "", t).lower()


def dedup_key(item):
    """同一道题的内容指纹：题干 + 选项集合（与选项顺序无关）"""
    return norm(item["q"]) + "|" + "".join(sorted(norm(o) for o in item["options"]))


def grams(t, n=4):
    return {t[i:i + n] for i in range(max(1, len(t) - n + 1))}


def load_plain_ids():
    """已经写过白话讲解的题 id：重复题优先留它，免得辛苦写的讲解被合并掉"""
    f = DATA / "plain.json"
    if not f.exists():
        return set()
    return set(json.loads(f.read_text(encoding="utf-8")))


PLAIN_IDS = load_plain_ids()


def better(a, b):
    """两份重复题里挑更该留下的那份"""
    return max(a, b, key=lambda q: (q["id"] in PLAIN_IDS, src_rank(q["source"]), len(q["explain"])))


def tag_of(qid):
    return CH_MAP.get(qid, UNTAGGED)


OPT_RE = re.compile(r"^([ABCD])[.．、]\s*(.+)$")
# 页眉页脚、讲义标题、水印，混进选项里会污染题面
NOISE = re.compile(
    r"^(\d{1,3}|/|\d{1,3}\s*/\s*\d{1,3}|一、单项选择题|二、[^\n]{0,12}|"
    r"[^\n]{0,40}(模考金题|三色笔记|网校|tiku|http)[^\n]{0,40}|"
    r"基金从业[-—][^\n]{0,20}|第\s*\d+\s*讲[^\n]{0,30}|王佳荣[^\n]{0,60})$")
# 合并空白后仍会粘在正文里的水印
WATERMARK = [re.compile(p) for p in (
    r"(基金从业[-—]基金法律法规)+",
    r"考前[^，。；]{0,10}押题加微信[A-Za-z0-9]+获取",
    r"加微信[A-Za-z0-9]+获取",
    r"才士题库解析",
    r"233网校[^，。]{0,20}",
    r"https?://\S+",
)]


def scrub(t):
    """去掉粘在正文里的水印和页脚"""
    for w in WATERMARK:
        t = w.sub("", t)
    return t.strip()


def parse_block(block):
    """block: 一道题的原始文本，返回 dict 或 None"""
    block = block.replace("　", " ")
    m = re.search(r"(?:答案[:：]\s*|【参考答案】\s*|(?:【答案】\s*)+)([ABCD])", block)
    if not m:
        return None
    answer = "ABCD".index(m.group(1))
    head, tail = block[: m.start()], block[m.end():]

    # 解析：先按行剔页眉页脚，再去水印，最后才合并空白（顺序反了会把页脚粘进正文）
    exp = re.sub(r"^\s*(?:解析[:：]|【[^】]*解析[^】]*】\s*)+", "", tail.strip())
    exp = "\n".join(l for l in exp.splitlines() if not NOISE.match(l.strip()))
    exp = re.sub(r"【[^】]{0,40}(解析|转载)[^】]{0,40}】", "", exp)
    exp = re.sub(r"\s+", "", exp)
    exp = scrub(exp)

    lines = [l.strip() for l in head.splitlines() if l.strip() and not NOISE.match(l.strip())]
    stem, opts, cur = [], [], None
    for line in lines:
        om = OPT_RE.match(line)
        if om:
            if cur:
                opts.append(cur)
            cur = om.group(2).strip()
        elif cur is not None:
            cur += line.strip()
        else:
            stem.append(line)
    if cur:
        opts.append(cur)
    if len(opts) != 4:
        return None
    opts = [scrub(o) for o in opts]
    if not all(opts):
        return None
    if len(set(opts)) < 4:           # 选项重复 = 抽取时串页了，这题不可答
        return None
    q = scrub(re.sub(r"\s+", "", "".join(stem)))
    # 选项引用了题干里没有的罗马数字，说明题干缺项
    if {r for o in opts for r in re.findall(r"[ⅠⅡⅢⅣⅤ]", o)} - set(re.findall(r"[ⅠⅡⅢⅣⅤ]", q)):
        return None
    q = re.sub(r"^\d+[.、．]\s*", "", q)
    # 罗马数字选项（Ⅰ、Ⅱ…）折行，避免挤成一坨
    q = re.sub(r"(?<=.)(Ⅰ|Ⅱ|Ⅲ|Ⅳ|IV|III|II|I)(?=[、．.])", r"\n\1", q)
    if len(q) < 6:
        return None
    return {"q": q, "options": opts, "answer": answer, "explain": exp[:600]}


def split_questions(text):
    """按行首题号切块"""
    text = re.sub(r"\n?单项选择题\n", "\n", text)
    text = re.sub(r"\n\d+\s*/\s*\d+\n", "\n", text)          # 页码
    text = re.sub(r"第\s*\d+\s*题\s*单选题[^\n]*\n", "", text)
    idx = [(m.start(), int(m.group(1))) for m in re.finditer(r"(?m)^(\d{1,3})\s*[.、．]\s*", text)]
    out, expect = [], 1
    keep = []
    for pos, num in idx:
        if num == expect or (num == expect + 1 and keep):  # 容错跳号
            keep.append((pos, num))
            expect = num + 1
    for i, (pos, num) in enumerate(keep):
        end = keep[i + 1][0] if i + 1 < len(keep) else len(text)
        out.append(text[pos:end])
    return out


def read_pdf(path):
    r = PdfReader(str(path))
    return "\n".join((p.extract_text() or "") for p in r.pages)


def main():
    bank, seen = [], {}
    dropped = defaultdict(int)
    stats = {}
    for subject, pattern, label in SOURCES:
        for pdf in sorted(ROOT.glob(pattern)):
            try:
                text = read_pdf(pdf)
            except Exception as e:
                print(f"跳过 {pdf.name}: {e}", file=sys.stderr)
                continue
            n = 0
            for block in split_questions(text):
                item = parse_block(block)
                if not item:
                    continue
                fp = dedup_key(item)
                qid = hashlib.md5(fp.encode()).hexdigest()[:12]
                item.update(id=qid, subject=subject, source=label, chapter=tag_of(qid))
                if fp in seen:                       # 完全同题，留更可信/解析更全的那份
                    old = seen[fp]
                    bank[old] = better(bank[old], item)
                    dropped["完全重复"] += 1
                    continue
                seen[fp] = len(bank)
                bank.append(item)
                n += 1
            stats[pdf.name] = n
            print(f"{n:4d} 题  {pdf.name}")

    # 近似重复：题干+选项 4-gram 相似度 >= 0.85 视为同一道题
    docs = [(q, grams(dedup_key(q))) for q in bank]
    inv = defaultdict(list)
    for i, (q, g) in enumerate(docs):
        for x in g:
            inv[x].append(i)
    pairs = set()
    for ids in inv.values():
        if len(ids) > 80:                            # 太常见的片段没有区分度
            continue
        for a in range(len(ids)):
            for c in range(a + 1, len(ids)):
                pairs.add((ids[a], ids[c]))
    kill = set()
    for i, j in sorted(pairs):
        if i in kill or j in kill:
            continue
        qi, qj = docs[i][0], docs[j][0]
        gi, gj = docs[i][1], docs[j][1]
        sim = len(gi & gj) / len(gi | gj)
        # 选项集合和正确答案都一样时，题干换个说法也是同一道题；但选项集合太通用
        # （Ⅰ、Ⅱ / Ⅰ、Ⅱ、Ⅲ 这种）会撞车，所以仍要求题干足够像
        same_opts = (sorted(norm(o) for o in qi["options"]) == sorted(norm(o) for o in qj["options"])
                     and norm(qi["options"][qi["answer"]]) == norm(qj["options"][qj["answer"]]))
        # 题干一字不差、四个选项里有三个相同 = 同一道题被改了个别选项措辞。
        # 但只凭题干相同不够：有些题题干一样、四个选项整套不同，那是两道不同的题。
        oi = [norm(o) for o in qi["options"]]
        oj = [norm(o) for o in qj["options"]]
        same_stem_mostly = (norm(qi["q"]) == norm(qj["q"])
                            and len(set(oi) & set(oj)) >= 3
                            and norm(qi["options"][qi["answer"]]) in set(oj + [""]) | {norm(qj["options"][qj["answer"]])})
        if sim >= 0.85 or (sim >= 0.70 and same_opts) or same_stem_mostly:
            keep = better(qi, qj)
            kill.add(j if keep is qi else i)
            dropped["近似重复"] += 1
    bank = [q for i, q in enumerate(bank) if i not in kill]

    bank.sort(key=lambda x: (x["subject"], CH_ORDER[x["subject"]].get(x["chapter"], 999), x["q"]))
    OUT.write_text(json.dumps(bank, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"\n去重丢弃：" + "，".join(f"{k} {v} 题" for k, v in dropped.items()))
    print(f"合计 {len(bank)} 题 -> {OUT}")
    for s in ("科目一", "科目二"):
        sub = [q for q in bank if q["subject"] == s]
        print(f"  {s}: {len(sub)} 题")
        ch = {}
        for q in sub:
            ch[q["chapter"]] = ch.get(q["chapter"], 0) + 1
        for k, v in sorted(ch.items(), key=lambda x: -x[1]):
            print(f"      {k}: {v}")

    missing = [q for q in bank if q["chapter"] == UNTAGGED]
    if missing:
        print(f"\n⚠ {len(missing)} 题没有章节归类，跑归类流程补进 tools/chapters.json：")
        for q in missing[:10]:
            print(f"    {q['id']}  {q['q'][:40]}")

    # 自检：结构完整性
    assert bank, "题库为空"
    for q in bank:
        assert len(q["options"]) == 4 and 0 <= q["answer"] < 4 and q["q"], q
    assert len({q["id"] for q in bank}) == len(bank), "存在重复 id"
    assert len({dedup_key(q) for q in bank}) == len(bank), "还有内容完全相同的题"


if __name__ == "__main__":
    main()
