const fs = require('fs')
const p = 'c:/Users/Administrator/CodeBuddy/20260829144344/server/src/hanmo_project_workdoc.md'
let c = fs.readFileSync(p, 'utf8')
const s = c.indexOf('追加至 hanmo_project_workdoc.md')
const e = c.indexOf('代码与项目文档综合总结')
if (s < 0 || e < 0 || e < s) { console.error('ANCHOR-ERR', s, e); process.exit(1) }
const ref = '> 📂 该任务已完成并归档：小程序整套国风UI改版开发（后端零改动）✅ 已完成（2026-09-02），完整需求与开发输出记录已剪切至 `hanmo_history_archive.md`，后续排查请查阅归档文档。\n\n'
c = c.slice(0, s) + ref + c.slice(e)
fs.writeFileSync(p, c, 'utf8')
console.log('ARCHIVE-CUT-OK start=' + s + ' end=' + e)
