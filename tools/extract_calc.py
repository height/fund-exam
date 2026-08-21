#!/usr/bin/env python3
"""从题库里挑出计算题，产出 src/data/calc.json（只存 id）。

只存 id 不复制题面：题面留在 questions.json 一处，改题库不用同步两个文件。

判别思路——记忆题和计算题都可能有数字选项，区别在于「数据给在哪」：
  计算题：题干里给了带单位的数据，选项是算出来的数
  记忆题：题干没数据，数字只出现在选项里（如「净值低于（1000万元）」）
所以要求「选项多数是数字」且「题干至少有一处带单位的数据」。
年份题（选项是 1993/1997/…）单独排除，那是背时间不是算数。

用法: python3 tools/extract_calc.py
"""
import json
import re
import unicodedata
from pathlib import Path

DATA = Path(__file__).resolve().parents[1] / "src" / "data"

NUMOPT = re.compile(r"^[-+]?[\d,]*\.?\d+\s*(%|元|万元|亿元|万|亿|份|股|年|月|天|倍|个基点|bp)?$")
YEAR = re.compile(r"^(19|20)\d{2}$")
ASK = re.compile(r"计算|为多少|是多少|约(为|等于|是)|应(为|是|等于)|则.{0,15}(为|是)|最接近|求")
DATUM = re.compile(r"\d[\d,.]*\s*(%|元|万元|亿元|万|亿|年|月|天|倍|份|股|点|BP)")

norm = lambda s: unicodedata.normalize("NFKC", s)


def is_calc(q):
    stem = norm(q["q"])
    opts = [norm(o).strip() for o in q["options"]]
    if sum(bool(YEAR.match(o)) for o in opts) >= 3:
        return False
    n_opt = sum(bool(NUMOPT.match(o)) for o in opts)
    data = len(DATUM.findall(stem))
    return (n_opt >= 3 and data >= 2) or (n_opt >= 3 and data >= 1 and bool(ASK.search(stem)))


def main():
    bank = json.loads((DATA / "questions.json").read_text(encoding="utf-8"))
    ids = [q["id"] for q in bank if is_calc(q)]
    (DATA / "calc.json").write_text(json.dumps(ids, ensure_ascii=False), encoding="utf-8")

    picked = [q for q in bank if q["id"] in set(ids)]
    print(f"计算题 {len(ids)} 道 -> src/data/calc.json")
    by_sub, by_ch = {}, {}
    for q in picked:
        by_sub[q["subject"]] = by_sub.get(q["subject"], 0) + 1
        by_ch[q["chapter"]] = by_ch.get(q["chapter"], 0) + 1
    print("  科目:", dict(by_sub))
    for c, n in sorted(by_ch.items(), key=lambda x: -x[1]):
        print(f"      {c}: {n}")

    assert ids, "一道都没挑出来"
    assert len(ids) == len(set(ids)), "有重复 id"


if __name__ == "__main__":
    main()
