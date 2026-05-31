<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();

onMounted(() => {
  if (userStore.token && !userStore.loaded) {
    userStore.fetchUserInfo();
  }
});
</script>
