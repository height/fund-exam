#!/usr/bin/env python3
"""讲义正文检索审计。相似度只召回候选，绝不自动改题库章节。

需要系统 pdftotext，无第三方 Python 依赖。
python3 tools/audit-lecture-classification.py --subject-one-pdf /path/科目一讲义.pdf \
    --subject-two-pdf /path/科目二讲义.pdf
"""
import argparse
import hashlib
import json
import math
import re
import subprocess
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def fingerprint(q):
    fields = {k: q.get(k) for k in ('subject', 'q', 'options', 'answer', 'explain')}
    return hashlib.sha256(json.dumps(fields, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


def extract_topics(text, subject, body_start=5):
    topics, chapter, current, stopped = [], None, None, False
    for page, content in enumerate(text.split('\f'), 1):
        # 导学含2017旧目录及考试安排，禁止参与归类检索。
        if page < body_start:
            continue
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith('基金从业-') or re.fullmatch(r'\d+\s*/\s*\d+', line):
                continue
            if re.match(r'^第[一二三四五六七八九十]+章 ', line):
                chapter, current = line.split(' ', 1)[1].strip(), None
                continue
            if re.match(r'^第[一二三四五六七八九十]+节 ', line):
                current = None
                continue
            if re.match(r'^第\d+讲', line):
                if re.search(r'题解|习题|练习', line):
                    stopped = True
                continue
            match = re.match(r'^(?:知识点[一二三四五六七八九十]+\s+|考点\s*\d+\s*[：:])(.+)', line)
            if match and chapter:
                current = dict(chapter=chapter, title=match[1].strip(), page=page, lines=[])
                topics.append(current)
                stopped = False
                continue
            if re.match(r'测试题|本章知识回顾|经典例题|章节习题|习题演练|强化练习', line):
                stopped = True
            if current and not stopped:
                current['lines'].append(line)
    for topic in topics:
        topic['text'] = '\n'.join(topic.pop('lines'))
    return topics


def grams(text):
    text = re.sub(r'\s+', '', text).lower()
    return Counter(text[i:i+n] for n in (2, 3) for i in range(len(text)-n+1)
                   if re.fullmatch(r'[\w\u4e00-\u9fff]+', text[i:i+n]))


def retrieve(bank, topics):
    counts = [grams(t['title'] * 3 + ' ' + t['text']) for t in topics]
    df = Counter(k for c in counts for k in c)
    idf = {k: math.log(1 + len(topics) / v) for k, v in df.items()}
    index = defaultdict(list)
    for i, counts_i in enumerate(counts):
        vector = {k: (1 + math.log(n)) * idf[k] for k, n in counts_i.items()}
        norm = math.sqrt(sum(x*x for x in vector.values())) or 1
        for key, value in vector.items():
            index[key].append((i, value/norm))
    results = []
    for q in bank:
        query = grams(q['q'] + ' ' + q['options'][q['answer']] + ' ' + q['explain'])
        vector = {k: (1 + math.log(n)) * idf[k] for k, n in query.items() if k in idf}
        norm = math.sqrt(sum(x*x for x in vector.values())) or 1
        scores = defaultdict(float)
        for key, value in vector.items():
            for i, weight in index[key]:
                scores[i] += value/norm * weight
        ordered = sorted(range(len(topics)), key=lambda i: -scores[i])
        own = next(i for i in ordered if topics[i]['chapter'] == q['chapter'])
        def candidate(i):
            return {**{k: topics[i][k] for k in ('chapter', 'title', 'page')}, 'similarity': round(scores[i], 4)}
        results.append(dict(id=q['id'], subject=q['subject'], chapter=q['chapter'],
                            contentFingerprint=fingerprint(q), currentChapterCandidate=candidate(own),
                            candidates=[candidate(i) for i in ordered[:3]]))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--subject-one-pdf', required=True, type=Path)
    parser.add_argument('--subject-two-pdf', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/lecture-classification-audit.json')
    args = parser.parse_args()
    read = lambda name: json.loads((ROOT / name).read_text())
    sources = read('tools/lecture-sources.json')
    bank, taxonomy = read('src/data/questions.json'), read('tools/taxonomy.json')
    reviews = {r['id']: r for r in read('tools/lecture-classification-review.json')}
    results = []
    for subject, path in [('科目一', args.subject_one_pdf), ('科目二', args.subject_two_pdf)]:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != sources[subject]['sha256']:
            raise ValueError(f'{subject}讲义指纹变化，请先复核版本，不能套用旧修订')
        text = subprocess.run(['pdftotext', '-layout', str(path), '-'], check=True, capture_output=True).stdout.decode()
        topics = extract_topics(text, subject, sources[subject]['bodyStartPage'])
        if {t['chapter'] for t in topics} != {c['name'] for c in taxonomy[subject]}:
            raise ValueError(f'{subject}正文章名未完整匹配，停止生成')
        results += retrieve([q for q in bank if q['subject'] == subject], topics)
    for result in results:
        review = reviews.get(result['id'])
        result['status'] = review['status'] if review else 'screened'
        if review:
            result['review'] = {k: review[k] for k in ('sectionId', 'sourceFile', 'pages', 'reason')}
    report = dict(method='字符2/3元组TF-IDF余弦相似度，仅作检索召回，不是归类准确率；screened不代表人工核准。正文从第5页开始，不索引导学、旧目录或测试题答案。',
                  sources=sources, total=len(results), results=results)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'已输出{len(results)}题检索审计；未更改题库。')


if __name__ == '__main__':
    main()
