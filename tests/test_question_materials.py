import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
from question_materials import mark_material, requires_review, trim_following_material

class MaterialTests(unittest.TestCase):
    def test_all_siblings_need_review_even_without_reference(self):
        text = '25、根据材料回答25-27题：甲公司如下表所示。26、平均需要几天？27、比行业高还是低？28、独立题'
        for n in [25, 26, 27]:
            q = mark_material({'q': '平均需要几天？', 'answer': 2}, text, f'{n}、题干')
            self.assertEqual(q['sourceMaterialGroup'], [25, 27])
            self.assertTrue(requires_review(q))
        self.assertFalse(requires_review(mark_material({'q':'独立题'}, text, '28、独立题')))
    def test_whitespace_and_range_variants(self):
        for separator in ['-', '—', '～', '至', '–', '－']:
            q = mark_material({'q':'两只基金的净值如何变化？'}, f'请根据材料回答 48 {separator} 50 题', '49、题干')
            self.assertTrue(requires_review(q))
    def test_image_table_requires_original_page_not_answer_agreement(self):
        q = mark_material({'q':'某权证的基本要素如下表所示', 'answer':0})
        self.assertTrue(requires_review(q))
        q['materialReview']={'status':'verified'}
        self.assertTrue(requires_review(q))
        q.update(q='【题目材料】\n原表内容\n【问题】\n题干', materialReview={'status':'verified','sourceFile':'source.pdf','sourcePage':12})
        self.assertFalse(requires_review(q))
    def test_nonmaterial_phrases(self):
        for stem in ['以下表述正确的是', '以下表达错误的是', '资产负债表中属于资产的是']:
            self.assertFalse(requires_review(mark_material({'q':stem})))

    def test_unnumbered_case_marker_protects_all_following_siblings(self):
        for marker in ['（材料题）', '(材料题)', '【材料题】']:
            text = f'97. 独立题\nD. I、II\n{marker}甲乙凑资。共 3 小题\n98. 谁能投资？\n99. 哪项违规？\n100. 原因是什么？\n101. 独立题'
            for n in [98, 99, 100]:
                q = mark_material({'q': '哪项违规？'}, text, f'{n}. 哪项违规？')
                self.assertEqual(q['sourceMaterialGroup'], [98, 100])
                self.assertTrue(requires_review(q))
            for n in [97, 101]:
                self.assertFalse(requires_review(mark_material({'q':'独立题'}, text, f'{n}. 独立题')))
            self.assertEqual(trim_following_material(text).strip(), '97. 独立题\nD. I、II')

    def test_case_without_explicit_count_is_conservatively_reviewed(self):
        text = '97. 前题\n（材料题）公司风险案例\n98. 风险？\n99. 缺陷？\n100. 措施？'
        self.assertTrue(requires_review(mark_material({'q':'缺陷？'}, text, '99. 缺陷？')))
        for stem in ['（1）在以上案例中谁能投资？', '本案例的违规行为是？', '针对本案例应改进什么？']:
            self.assertTrue(requires_review(mark_material({'q':stem})))

if __name__ == '__main__': unittest.main()
