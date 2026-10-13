<script setup lang="ts">
import { useId, useTemplateRef } from "vue";
import { MoreHorizontal } from "lucide-vue-next";
import { useTaskMenu } from "../composables/useTaskMenu";
import { useSettingsStore } from "../stores/settings";
import { isCompletedStatus } from "../utils/task-order";

const props = defineProps<{ task: TaskRecord; disabled?: boolean }>();
type Action = "edit" | "planToday" | "postpone" | "snooze" | "nextOccurrence" | "instantiateTemplate" | "delete";
const emit = defineEmits<{ action: [action: Action, task: TaskRecord] }>();
const settings = useSettingsStore();
const trigger = useTemplateRef<HTMLButtonElement>("trigger");
const panel = useTemplateRef<HTMLElement>("panel");
const menuId = useId();
const { open, position, toggle, close, onKeyDown } = useTaskMenu(trigger, panel);

function act(action: Action): void {
  close();
  emit("action", action, props.task);
}
</script>

<template>
  <div class="task-menu">
    <button ref="trigger" class="task-menu-trigger" type="button" :disabled="disabled"
      :title="`${settings.t('task.moreActions')}: ${task.title}`" :aria-label="`${settings.t('task.moreActions')}: ${task.title}`"
      aria-haspopup="menu" :aria-expanded="open" :aria-controls="open ? menuId : undefined"
      @click="toggle" @keydown.down.prevent="open ? undefined : toggle()">
      <MoreHorizontal aria-hidden="true" :size="18" />
    </button>
    <Teleport v-if="open" to="body">
      <div class="focus-workspace task-menu-layer">
      <div :id="menuId" ref="panel" class="task-menu-panel" role="menu" :aria-label="settings.t('task.moreActions')"
        :style="{ ...position, position: 'fixed', maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }" @keydown="onKeyDown">
        <button role="menuitem" tabindex="-1" type="button" @click="act('edit')">{{ settings.t("task.editAction") }}</button>
        <button v-if="!isCompletedStatus(task.status)" role="menuitem" tabindex="-1" type="button" @click="act('planToday')">{{ settings.t("task.today") }}</button>
        <button v-if="!isCompletedStatus(task.status)" role="menuitem" tabindex="-1" type="button" @click="act('postpone')">{{ settings.t("task.tomorrow") }}</button>
        <button v-if="!isCompletedStatus(task.status)" role="menuitem" tabindex="-1" type="button" @click="act('snooze')">{{ settings.t("task.snooze") }}</button>
        <button v-if="task.repeatRule && task.serverId" role="menuitem" tabindex="-1" type="button" @click="act('nextOccurrence')">{{ settings.t("task.next") }}</button>
        <button v-if="task.isTemplate" role="menuitem" tabindex="-1" type="button" @click="act('instantiateTemplate')">{{ settings.t("task.use") }}</button>
        <button role="menuitem" tabindex="-1" type="button" @click="act('delete')">{{ settings.t("task.delete") }}</button>
      </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.task-menu-layer { position: fixed; inset: 0; display: block; z-index: 45; pointer-events: none; }
.task-menu-panel { pointer-events: auto; transition-property: none; }
</style>
