// 富文本 HTML 工具：提取纯文本摘要（列表/审核预览用，避免直接 slice 把标签切出来）
export function stripHtml(html, maxLen) {
  const div = document.createElement('div')
  div.innerHTML = html || ''
  let text = div.textContent || ''
  text = text.replace(/\s+/g, ' ').trim()
  if (maxLen && text.length > maxLen) return text.slice(0, maxLen) + '...'
  return text
}
