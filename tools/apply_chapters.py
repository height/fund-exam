#!/usr/bin/env python3
"""把归类结果落进题库。

输入 tools/chapters.json（id -> 官方章名，归类流程的产物，进 git 当事实来源），
校验通过后写回 src/data/questions.json 的 chapter 字段，并按章序重排题库。

校验是硬的，一条不过就整体拒绝落盘——归类错了比没归类更糟：
错的章名会让「章节练习」抽出一堆不相干的题，而用户不会怀疑是标签错了。

    python3 tools/apply_chapters.py            # 落盘
    python3 tools/apply_chapters.py --check    # 只校验不写
"""
import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BANK = ROOT / "src/data/questions.json"
TAX = ROOT / "tools/taxonomy.json"
MAP = ROOT / "tools/chapters.json"
CH_JS = ROOT / "src/data/chapters.js"


def main():
    check_only = "--check" in sys.argv
    bank = json.loads(BANK.read_text(encoding="utf-8"))
    tax = json.loads(TAX.read_text(encoding="utf-8"))
    mapping = json.loads(MAP.read_text(encoding="utf-8"))

    # 章名 -> 序号，同时也是合法性白名单（按科目分开，防止串科目）
    order = {s: {c["name"]: c["no"] for c in tax[s]} for s in ("科目一", "科目二")}

    errs = []
    ids = {q["id"] for q in bank}

    missing = ids - mapping.keys()
    if missing:
        errs.append(f"漏了 {len(missing)} 题没归类，例：{sorted(missing)[:5]}")

    extra = mapping.keys() - ids
    if extra:
        errs.append(f"多出 {len(extra)} 个题库里不存在的 id，例：{sorted(extra)[:5]}")

    for q in bank:
        ch = mapping.get(q["id"])
        if ch is None:
            continue
        if ch not in order[q["subject"]]:
            errs.append(f"{q['id']} 的章名「{ch}」不属于{q['subject']}：{q['q'][:30]}")

    if errs:
        print(f"校验不通过，{len(errs)} 处问题，未写入：\n")
        for e in errs[:25]:
            print("  -", e)
        if len(errs) > 25:
            print(f"  …还有 {len(errs) - 25} 处")
        return 1

    for q in bank:
        q["chapter"] = mapping[q["id"]]

    # 按 (科目, 章序, 题干) 重排：练习的「章节顺序」直接吃这个顺序，
    # 原来按章名字母排，换成官方章名后顺序会变成乱的
    bank.sort(key=lambda q: (q["subject"], order[q["subject"]][q["chapter"]], q["q"]))

    dist = Counter((q["subject"], q["chapter"]) for q in bank)
    for s in ("科目一", "科目二"):
        sub = [q for q in bank if q["subject"] == s]
        print(f"\n{s}  {len(sub)} 题")
        for c in tax[s]:
            n = dist[(s, c["name"])]
            flag = "  ← 空" if n == 0 else ""
            print(f"  第{c['no']:>2}章 {c['name']:<24} {n:>4}{flag}")

    print(f"\n合计 {len(bank)} 题，覆盖 {len({k for k in dist})} 个章节")

    if check_only:
        print("\n--check：只校验，未写入")
        return 0

    BANK.write_text(json.dumps(bank, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    CH_JS.write_text(
        "/* 官方教材章序，由 tools/taxonomy.json 生成（tools/apply_chapters.py）。\n"
        "   题库的 chapter 字段只会取这里的值；数组顺序就是章序，别手排。 */\n"
        "export const CHAPTERS = "
        + json.dumps({s: [c["name"] for c in tax[s]] for s in ("科目一", "科目二")},
                     ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    print(f"\n已写入 {BANK.relative_to(ROOT)} 与 {CH_JS.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
