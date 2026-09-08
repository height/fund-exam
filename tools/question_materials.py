"""PDF 文本不能证明图片表格已读到。疑似材料题须人工核对原页后方可入库。"""
import re

REFERENCE = re.compile(r'如下[表图]|下表(?!述|达)|上表(?!述|达)|下图|上图|如[图表]所示|(?:数据|分布|方案)如下[：:。]?(?:关于|以下|下列|根据这些)|根据.{0,8}表格|根据.{0,8}材料|[【（(]材料题[】）)]|以上案例|本案例')
GROUP = re.compile(r'回答\s*(\d+)\s*[-—～至–－]\s*(\d+)\s*题')
MATERIAL_START = re.compile(r'[【（(]材料题[】）)]')
QUESTION_NUMBER = re.compile(r'^\s*(\d{1,3})\s*[、.．]', re.M)


def material_groups(source_text):
    groups = [(int(a), int(b)) for a, b in GROUP.findall(source_text)]
    markers = list(MATERIAL_START.finditer(source_text))
    for i, marker in enumerate(markers):
        end = markers[i + 1].start() if i + 1 < len(markers) else len(source_text)
        following = source_text[marker.end():end]
        numbers = [int(m.group(1)) for m in QUESTION_NUMBER.finditer(following)]
        if not numbers:
            continue
        count = re.search(r'共\s*(\d+)\s*小题', following)
        # 未标小题数时保守送审后续题，不凭猜测把同组小题放行。
        groups.append((numbers[0], numbers[0] + int(count.group(1)) - 1 if count else max(numbers)))
    return groups


def trim_following_material(block):
    """题块末尾属于下一组的案例不能并入当前题的 D 选项。"""
    marker = MATERIAL_START.search(block)
    if marker and re.search(r'^\s*D[.．、]', block[:marker.start()], re.M):
        return block[:marker.start()]
    return block


def mark_material(item, source_text='', block='', source_file=None):
    match = re.match(r'^\s*(\d{1,3})\s*[、.．]', block)
    if match:
        item['sourceQuestionNo'] = int(match.group(1))
    if source_file:
        item['sourceFile'] = str(source_file)
    number = item.get('sourceQuestionNo')
    groups = material_groups(source_text)
    group = next(((a, b) for a, b in groups if number is not None and a <= number <= b), None)
    # 非编号版式无法可靠映射组号时，整份材料先要求核对，不能默认独立题。
    uncertain_group = groups and number is None
    if group or uncertain_group or REFERENCE.search(item['q']):
        item['materialRequired'] = True
        if group:
            item['sourceMaterialGroup'] = list(group)
        item.setdefault('materialReview', {'status': 'pending'})
    return item


def requires_review(item):
    verified = item.get('materialReview', {}).get('status') == 'verified'
    complete = item['q'].startswith('【题目材料】\n') and '\n【问题】\n' in item['q']
    provenance = item.get('materialReview', {}).get('sourceFile') and item.get('materialReview', {}).get('sourcePage')
    required = item.get('materialRequired') or REFERENCE.search(item['q']) or GROUP.search(item['q'])
    return bool(required and not (verified and complete and provenance))
