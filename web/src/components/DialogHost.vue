<template>
  <transition name="dlg-fade">
    <div class="dlg-mask" v-if="dialogState.visible" @click.self="onMask">
      <div class="dlg" :class="'dlg-' + dialogState.type">
        <!-- 顶部图标 -->
        <div class="dlg-icon" :class="'ic-' + dialogState.type">
          <span v-if="dialogState.type === 'alert'">ℹ</span>
          <span v-else-if="dialogState.type === 'confirm'">?</span>
          <span v-else>✎</span>
        </div>
        <h3 class="dlg-title">{{ dialogState.title }}</h3>
        <p class="dlg-msg" v-if="dialogState.message">{{ dialogState.message }}</p>

        <!-- 输入框（prompt） -->
        <div v-if="dialogState.type === 'prompt'" class="dlg-input-wrap">
          <input class="input" v-model="dialogState.value" :placeholder="dialogState.placeholder"
            :aria-label="dialogState.title" @keyup.enter="confirm" @keyup.esc="cancel" ref="inputEl" />
        </div>

        <div class="dlg-btns" :class="{ single: dialogState.type === 'alert' }">
          <button v-if="dialogState.type !== 'alert'" class="btn btn-outline" @click="cancel">取消</button>
          <button class="btn btn-primary" @click="confirm">
            {{ dialogState.type === 'confirm' ? '确定' : dialogState.type === 'prompt' ? '确定' : '知道了' }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
import { watch, ref, nextTick } from 'vue'
import { dialogState } from '../utils/dialog'

const inputEl = ref(null)

watch(() => dialogState.visible, (v) => {
  if (v && dialogState.type === 'prompt') {
    nextTick(() => { inputEl.value?.focus() })
  }
})

function onMask() {
  if (dialogState.type === 'alert') confirm()
  // confirm / prompt 点击遮罩不关闭，强制用户明确选择
}
function cancel() {
  dialogState.resolve?.(dialogState.type === 'prompt' ? null : false)
  dialogState.visible = false
  dialogState.resolve = null
}
function confirm() {
  dialogState.resolve?.(dialogState.type === 'prompt' ? dialogState.value : true)
  dialogState.visible = false
  dialogState.resolve = null
}
</script>

<style scoped>
.dlg-mask {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(43, 33, 24, .5);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.dlg {
  width: 100%; max-width: 340px;
  background: #fffdf9;
  border: 1px solid var(--line);
  border-radius: 18px;
  padding: 24px 20px 18px;
  text-align: center;
  box-shadow: 0 18px 50px rgba(43, 33, 24, .28);
  animation: dlgPop .28s cubic-bezier(.22, 1.2, .36, 1);
}
@keyframes dlgPop {
  from { opacity: 0; transform: scale(.9) translateY(14px); }
  to { opacity: 1; transform: none; }
}
.dlg-icon {
  width: 52px; height: 52px;
  margin: 0 auto 10px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 26px; font-weight: 800; color: #fff;
}
.ic-alert { background: linear-gradient(135deg, #e3b23c, #c98f1b); }
.ic-confirm { background: var(--grad); }
.ic-prompt { background: linear-gradient(135deg, #66bb6a, #2e7d32); }
.dlg-title { font-size: 17px; margin-bottom: 6px; color: var(--ink); }
.dlg-msg {
  font-size: 14px; color: #6b5d4e; line-height: 1.7;
  white-space: pre-line;
  max-height: 40vh; overflow-y: auto;
  margin: 0 auto;
}
.dlg-input-wrap { margin: 14px 0 4px; }
.dlg-btns { display: flex; gap: 10px; margin-top: 18px; }
.dlg-btns.single { justify-content: center; }
.dlg-btns .btn { flex: 1; }
.dlg-btns.single .btn { max-width: 200px; }
.dlg-fade-enter-active, .dlg-fade-leave-active { transition: opacity .2s; }
.dlg-fade-enter-from, .dlg-fade-leave-to { opacity: 0; }
</style>
