#!/usr/bin/env python3
"""清理人工复核确认的重复题，并同步题库的派生索引。

自动相似度只能负责找候选：相同题干可能搭配完全不同的考查选项，不能直接删。
这里的每一组都经过题干、选项和正确答案三项复核；组首是保留项，其余项删除。
"""
import json
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DATA = REPO / "src" / "data"

# (保留 id, 删除 id...)。优先保留真题/高频真题，其次保留解析更完整的版本。
DUPLICATE_GROUPS = [
    ("2e9493b80f31", "e7bcced6c64e"),
    ("2a527fd03cbe", "b187bf8d60d8"),
    ("a6860d262813", "326f2c2fe51a"),
    ("3dfe39935801", "fd3e9774ab80"),
    ("cdd88cee8934", "26ec01b96d66"),
    ("375ab6263e58", "de7fea9f216a"),
    ("3fbb8e1fa063", "9f1a0eafba8b"),
    ("6f91ab8034fe", "c31d12007254"),
    ("31458c9badf0", "15776c90332d"),
    ("737e68434561", "797503562eae"),
    ("a787248f837b", "d9f4a9d3a8e2"),
    ("f2c7c1d3ebf0", "53fa3f775861"),
    ("81cc70b93ff9", "297fafb98d66"),
    ("872c22845ef9", "b2eba33f1d82"),
    ("9a2e95b80b5a", "4bde8219279d"),
]


def write_json(path, value, *, indent=None):
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":")),
        encoding="utf-8",
    )


def main():
    questions_path = DATA / "questions.json"
    questions = json.loads(questions_path.read_text(encoding="utf-8"))
    by_id = {q["id"]: q for q in questions}
    remove = {qid for group in DUPLICATE_GROUPS for qid in group[1:]}
    referenced = {qid for group in DUPLICATE_GROUPS for qid in group}
    missing = sorted(referenced - by_id.keys())
    if missing:
        raise SystemExit(f"待复核 id 不在题库中，停止修改：{', '.join(missing)}")

    removed = [q for q in questions if q["id"] in remove]
    kept = [q for q in questions if q["id"] not in remove]
    write_json(questions_path, kept, indent=1)

    # chapters.json 是题库 id -> 章名的生成索引，删除失效 id。
    chapters_path = REPO / "tools" / "chapters.json"
    chapters = json.loads(chapters_path.read_text(encoding="utf-8"))
    for qid in remove:
        chapters.pop(qid, None)
    write_json(chapters_path, chapters, indent=0)

    # plain/calc 可能没有命中，但仍同步清理，避免以后留下孤儿引用。
    plain_path = DATA / "plain.json"
    plain = json.loads(plain_path.read_text(encoding="utf-8"))
    for qid in remove:
        plain.pop(qid, None)
    write_json(plain_path, plain)

    calc_path = DATA / "calc.json"
    calc = [qid for qid in json.loads(calc_path.read_text(encoding="utf-8")) if qid not in remove]
    write_json(calc_path, calc, indent=1)

    changes = Counter(f'{q["subject"]} / {q["chapter"]}' for q in removed)
    print(f"题库 {len(questions)} -> {len(kept)}，删除 {len(removed)} 道重复题")
    for chapter, count in sorted(changes.items()):
        print(f"  {chapter}: -{count}")


if __name__ == "__main__":
    main()
