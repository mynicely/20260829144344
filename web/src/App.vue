<template>
  <RouteProgress />
  <router-view v-slot="{ Component }">
    <transition name="page-fade" mode="out-in">
      <component :is="Component" :key="$route.path" />
    </transition>
  </router-view>
  <TabBar />
  <BackTop />
  <DialogHost />
</template>

<script setup>
import TabBar from './components/TabBar.vue'
import BackTop from './components/BackTop.vue'
import RouteProgress from './components/RouteProgress.vue'
import DialogHost from './components/DialogHost.vue'
</script>
