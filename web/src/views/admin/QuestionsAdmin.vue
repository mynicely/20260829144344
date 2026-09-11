<template>
  <div class="page admin-page">
    <h1>题库管理</h1>
    <AdminNav />

    <!-- 筛选 -->
    <div class="card">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <select class="input" v-model="filterCourse" style="flex:1;min-width:140px;margin-bottom:0;" @change="load">
          <option :value="0">全部课程</option>
          <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}（{{ c.qcount }}题）</option>
        </select>
        <input class="input" v-model="kw" placeholder="搜索题干/答案" style="flex:2;min-width:150px;margin-bottom:0;" @keyup.enter="load" />
        <button class="btn" @click="load">搜索</button>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-primary" style="flex:1;" @click="openEdit()">+ 新增题目</button>
        <button class="btn btn-outline" style="flex:1;" @click="showBatch = true">批量导入</button>
      </div>
    </div>

    <!-- 题目列表 -->
    <div class="card" v-for="q in list" :key="q.id" style="border-left:4px solid var(--brand);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:6px;">
            <span class="quiz-tag" :class="q.type">{{ typeText(q.type) }}</span>
            <span class="chip chip-line">#{{ q.id }}</span>
            <span class="tag" :class="q.status === 'on' ? 'tag-green' : 'tag-gray'">{{ q.status === 'on' ? '启用' : '停用' }}</span>
          </div>
          <p style="font-weight:600;" class="rich-content" v-html="q.question"></p>
          <p class="muted" style="font-size:12px;">
            {{ (q.options || []).map(o => o.k + '.' + o.t).join('　') }}
          </p>
          <p style="font-size:12px;color:var(--green);">✔ 答案：{{ q.answer }}</p>
          <p v-if="q.analysis" class="muted" style="font-size:12px;">解析：<span class="rich-content" v-html="q.analysis"></span></p>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
          <button class="btn btn-ghost btn-sm" @click="toggleStatus(q)">{{ q.status === 'on' ? '停用' : '启用' }}</button>
          <button class="btn btn-outline btn-sm" @click="openEdit(q)">编辑</button>
          <button class="btn btn-danger btn-sm" @click="del(q)">删除</button>
        </div>
      </div>
    </div>
    <div v-if="!list.length" class="card"><div class="empty"><span class="e-ico">📭</span>暂无题目，点击「新增题目」录入</div></div>

    <!-- 新增/编辑弹窗 -->
    <div v-if="showEdit" class="mask" @click.self="showEdit = false">
      <div class="modal">
        <h2>{{ form.id ? '编辑题目 #' + form.id : '新增题目' }}</h2>
        <label class="label">所属课程</label>
        <select class="input" v-model="form.courseId">
          <option :value="0">通用练习</option>
          <option v-for="c in courses" :key="c.id" :value="c.id">{{ c.title }}</option>
        </select>
        <label class="label">题型</label>
        <div class="opt-grid">
          <button class="opt-chip" :class="{ active: form.type === 'single' }" @click="form.type = 'single'">单选</button>
          <button class="opt-chip" :class="{ active: form.type === 'multi' }" @click="form.type = 'multi'">多选</button>
          <button class="opt-chip" :class="{ active: form.type === 'judge' }" @click="form.type = 'judge'">判断</button>
        </div>
        <label class="label">题干</label>
        <WysiwygEditor v-model="form.question" :min-height="'100px'" placeholder="请输入题目内容，支持加粗、图片等富文本" />

        <!-- 判断题型：固定 对/错 -->
        <template v-if="form.type === 'judge'">
          <div class="opt-chip" style="pointer-events:none;">对 / 错</div>
          <label class="label">正确答案</label>
          <div class="opt-grid">
            <button class="opt-chip" :class="{ active: form.answer === '对' }" @click="form.answer = '对'">对</button>
            <button class="opt-chip" :class="{ active: form.answer === '错' }" @click="form.answer = '错'">错</button>
          </div>
        </template>

        <!-- 选择题型：选项编辑 -->
        <template v-else>
          <label class="label">选项（点击「×」删除）</label>
          <div v-for="(o, i) in form.options" :key="i" style="display:flex;gap:6px;align-items:center;">
            <input class="input" v-model="o.k" style="width:52px;flex-shrink:0;text-align:center;" placeholder="A" />
            <input class="input" v-model="o.t" style="flex:1;" placeholder="选项内容" @keyup.enter="addOpt" />
            <button class="btn btn-danger btn-sm" @click="form.options.splice(i, 1)" :disabled="form.options.length <= 1">×</button>
          </div>
          <button class="btn btn-ghost btn-sm" @click="addOpt">+ 添加选项</button>
          <label class="label">正确答案（多选用逗号分隔，如 A,B）</label>
          <input class="input" v-model="form.answer" placeholder="如 A / A,B" />
        </template>

        <label class="label">解析（选填）</label>
        <WysiwygEditor v-model="form.analysis" :min-height="'100px'" placeholder="答案解析，交卷后展示给学员" />
        <label class="label">排序（数字越小越靠前）</label>
        <input class="input" type="number" v-model="form.sort" placeholder="0" />

        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost" style="flex:1;" @click="showEdit = false">取消</button>
          <button class="btn btn-primary" style="flex:1;" @click="save">保存</button>
        </div>
      </div>
    </div>

    <!-- 批量导入弹窗 -->
    <div v-if="showBatch" class="mask" @click.self="showBatch = false">
      <div class="modal">
        <h2>批量导入题目</h2>
        <p class="muted" style="font-size:12px;line-height:1.8;">
          每行一道题，格式：<b>题干 | 题型 | 选项 | 答案 | 解析</b><br/>
          题型填：单选 / 多选 / 判断；选项用逗号分隔；判断不填选项<br/>
          示例：<br/>
          <span style="color:#8a7a63;">「中锋用笔的特点？ | 单选 | 笔尖居中,笔尖靠边 | A | 中锋线条饱满」</span>
        </p>
        <label class="label">题目数据（每行一题）</label>
        <textarea class="input" rows="8" v-model="batchText" placeholder="粘贴题目数据..."></textarea>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost" style="flex:1;" @click="showBatch = false">取消</button>
          <button class="btn btn-primary" style="flex:1;" @click="doBatch">开始导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import api from '../../api'
import AdminNav from './AdminNav.vue'
import { toast } from '../../utils/toast'
import { dialog } from '../../utils/dialog'
import WysiwygEditor from '../../components/WysiwygEditor.vue'

const courses = ref([])
const list = ref([])
const filterCourse = ref(0)
const kw = ref('')
const showEdit = ref(false)
const showBatch = ref(false)
const batchText = ref('')
const emptyForm = () => ({ id: null, courseId: 0, type: 'single', question: '', options: [{ k: 'A', t: '' }, { k: 'B', t: '' }], answer: '', analysis: '', sort: 0, status: 'on' })
const form = ref(emptyForm())

const typeText = (t) => ({ single: '单选题', multi: '多选题', judge: '判断题' }[t] || t)

onMounted(async () => {
  try {
    const d = (await api.get('/practice/courses')).data
    courses.value = d
  } catch (e) {}
  load()
})
async function load() {
  try {
    const d = (await api.get('/admin/questions', { params: { courseId: filterCourse.value, kw: kw.value } })).data
    list.value = d
  } catch (e) { toast(e.message, 'error') }
}

function addOpt() {
  const keys = 'ABCDEFGH'
  const k = keys[form.value.options.length] || String.fromCharCode(65 + form.value.options.length)
  form.value.options.push({ k, t: '' })
}

function openEdit(q) {
  if (q) {
    form.value = {
      id: q.id, courseId: q.course_id, type: q.type, question: q.question,
      options: (q.options || []).map(o => ({ ...o })),
      answer: q.answer, analysis: q.analysis || '', sort: q.sort || 0, status: q.status || 'on',
    }
  } else {
    form.value = emptyForm()
  }
  showEdit.value = true
}

async function save() {
  const f = form.value
  if (!f.question.trim()) return toast('请填写题干', 'warn')
  if (f.type !== 'judge' && f.options.some(o => !o.t.trim())) return toast('选项内容不能为空', 'warn')
  if (!f.answer.trim()) return toast('请填写正确答案', 'warn')
  try {
    await api.post('/admin/questions', {
      id: f.id, courseId: f.courseId, type: f.type, question: f.question,
      options: f.type === 'judge' ? [{ k: 'A', t: '对' }, { k: 'B', t: '错' }] : f.options,
      answer: f.answer.trim(), analysis: f.analysis, sort: f.sort, status: f.status,
    })
    toast('保存成功')
    showEdit.value = false
    load()
  } catch (e) { toast(e.message, 'error') }
}

async function del(q) {
  if (!(await dialog.confirm(`确定删除题目 #${q.id}「${q.question.slice(0, 20)}...」？删除后不可恢复`))) return
  try { await api.delete('/admin/questions/' + q.id); toast('已删除'); load() }
  catch (e) { toast(e.message, 'error') }
}

async function toggleStatus(q) {
  try {
    await api.post('/admin/questions', {
      id: q.id, courseId: q.course_id, type: q.type, question: q.question,
      options: q.options, answer: q.answer, analysis: q.analysis, sort: q.sort,
      status: q.status === 'on' ? 'off' : 'on',
    })
    toast(q.status === 'on' ? '已停用' : '已启用')
    load()
  } catch (e) { toast(e.message, 'error') }
}

async function doBatch() {
  const lines = batchText.value.split('\n').map(s => s.trim()).filter(Boolean)
  if (!lines.length) return toast('请粘贴题目数据', 'warn')
  const items = []
  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim())
    if (parts.length < 4) continue
    const typeMap = { '单选': 'single', '多选': 'multi', '判断': 'judge', 'single': 'single', 'multi': 'multi', 'judge': 'judge' }
    const type = typeMap[parts[1]] || 'single'
    let options = []
    if (type === 'judge') {
      options = [{ k: 'A', t: '对' }, { k: 'B', t: '错' }]
    } else {
      const texts = parts[2].split(/[,，、;；]/).map(s => s.trim()).filter(Boolean)
      options = texts.map((t, i) => ({ k: String.fromCharCode(65 + i), t }))
    }
    items.push({ question: parts[0], type, options, answer: parts[3], analysis: parts[4] || '' })
  }
  if (!items.length) return toast('未解析到有效题目，请检查格式', 'error')
  try {
    const r = await api.post('/admin/questions/batch', { courseId: filterCourse.value, items })
    toast(r.msg)
    showBatch.value = false; batchText.value = ''
    load()
  } catch (e) { toast(e.message, 'error') }
}
</script>
