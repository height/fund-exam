#!/usr/bin/env python3
"""把 tmp/extract-batches/plain*.json 的小白版讲解合并进 src/data/plain.json，并做一轮校验。

校验不通过的条目会被丢弃并打印原因——宁可少一条，也不要把讲错的内容放进复习资料。
用法: python3 tools/merge_plain.py
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "src" / "data"
BATCH = REPO / "tmp" / "extract-batches"   # 抽题中间产物，不入 git
SECTIONS = ("考点", "为什么选", "其他选项", "怎么记")


def load_bank():
    return {q["id"]: q for q in json.loads((DATA / "questions.json").read_text(encoding="utf-8"))}


def norm(t):
    import unicodedata
    t = unicodedata.normalize("NFKC", t)
    return re.sub(r"[\s，。、；：（）()【】“”\"'？?！!,.;:·]+", "", t).lower()


def stem_index(bank):
    """题干 -> 题。去重合并后 id 会变，讲解靠题干重新认领"""
    idx = {}
    for q in bank.values():
        idx.setdefault(norm(q["q"]), q)
    return idx


def relink(item, bank, by_stem, batches):
    """id 失效时，按原题题干在现有题库里找回对应的题"""
    if item.get("id") in bank:
        return item["id"], 0
    src = batches.get(item.get("id"))
    if not src:
        return item.get("id"), 0
    q = by_stem.get(norm(src["q"]))
    return (q["id"], 1) if q else (item.get("id"), 0)


def check(item, bank):
    """返回 None 表示通过，否则返回丢弃原因"""
    q = bank.get(item.get("id"))
    if not q:
        return "id 不在题库里"
    plain = (item.get("plain") or "").strip()
    if len(plain) < 60:
        return "讲解太短"
    heads = re.findall(r"【([^】]+)】", plain)
    if len(heads) != 4:
        return f"小节数不对（{len(heads)}）"
    for want, got in zip(SECTIONS, heads):
        if not got.startswith(want):
            return f"小节顺序/名称不对：期望 {want}，实到 {got}"
    letter = "ABCD"[q["answer"]]
    if heads[1] != f"为什么选{letter}":
        return f"答案字母对不上：讲解写 {heads[1]}，正确答案是 {letter}"
    if re.search(r"根据解析|如上所述|综上所述所述", plain):
        return "出现指代原文的措辞"
    return None


def main():
    bank = load_bank()
    by_stem = stem_index(bank)
    # batch 文件里存的是抽题当时的 id，题库换过 id 方案，所以按内容哈希再索引一遍
    import hashlib
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from extract import dedup_key

    batches = {}
    for f in sorted(BATCH.glob("batch*.json")):
        for q in json.loads(f.read_text(encoding="utf-8")):
            batches[q["id"]] = q
            batches[hashlib.md5(dedup_key(q).encode()).hexdigest()[:12]] = q

    out, dropped, relinked = {}, [], 0
    for f in sorted(BATCH.glob("plain*.json")):
        for item in json.loads(f.read_text(encoding="utf-8")):
            item["id"], n = relink(item, bank, by_stem, batches)
            relinked += n
            why = check(item, bank)
            if why:
                dropped.append((f.name, item.get("id"), why))
            else:
                out[item["id"]] = item["plain"].strip()

    (DATA / "plain.json").write_text(
        json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"合并 {len(out)} 条小白讲解 -> src/data/plain.json"
          + (f"（其中 {relinked} 条因题目去重换了 id，已按题干认领回来）" if relinked else ""))
    if dropped:
        print(f"丢弃 {len(dropped)} 条：")
        for f, i, why in dropped:
            print(f"  {f} {i}: {why}")
    lens = [len(v) for v in out.values()]
    if lens:
        print(f"平均 {sum(lens)//len(lens)} 字，最短 {min(lens)}，最长 {max(lens)}")
    assert out, "一条都没合并成功"


if __name__ == "__main__":
    main()
