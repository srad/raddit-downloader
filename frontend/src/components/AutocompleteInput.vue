<script setup lang="ts">
import { ref, computed } from 'vue';
import { onClickOutside } from '@vueuse/core';

const props = defineProps<{
  modelValue: string;
  items: string[];
  placeholder?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'submit'): void;
}>();

// --- State ---
const showDropdown = ref(false);
const selectedIndex = ref(-1);
const container = ref<HTMLElement | null>(null);

// --- Logic ---
onClickOutside(container, () => {
  showDropdown.value = false;
});

const filteredItems = computed(() => {
  if (!props.modelValue) return props.items;
  const search = props.modelValue.toLowerCase();
  return props.items.filter(item => item.toLowerCase().includes(search));
});

const selectItem = (item: string) => {
  emit('update:modelValue', item);
  showDropdown.value = false;
  selectedIndex.value = -1;
};

const onInput = (e: Event) => {
  const value = (e.target as HTMLInputElement).value;
  emit('update:modelValue', value);
  showDropdown.value = true;
  selectedIndex.value = -1;
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (!showDropdown.value || filteredItems.value.length === 0) {
    if (e.key === 'ArrowDown') showDropdown.value = true;
    if (e.key === 'Enter') emit('submit');
    return;
  }

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedIndex.value = (selectedIndex.value + 1) % filteredItems.value.length;
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectedIndex.value = (selectedIndex.value - 1 + filteredItems.value.length) % filteredItems.value.length;
      break;
    case 'Enter':
      e.preventDefault();
      const selectedItemValue = filteredItems.value[selectedIndex.value];
      if (selectedIndex.value >= 0 && selectedItemValue) {
        selectItem(selectedItemValue);
      } else {
        showDropdown.value = false;
        emit('submit');
      }
      break;
    case 'Escape':
      showDropdown.value = false;
      break;
  }
};
</script>

<template>
  <div class="autocomplete-container position-relative" ref="container">
    <input
      type="text"
      :value="modelValue"
      @input="onInput"
      @focus="showDropdown = true"
      @keydown="handleKeyDown"
      :placeholder="placeholder"
      :disabled="disabled"
      class="form-control px-3 py-3"
      style="font-size: 1.05rem;"
      required
    />

    <Transition name="fade">
      <ul v-if="showDropdown && filteredItems.length > 0" class="autocomplete-dropdown">
        <li
          v-for="(item, index) in filteredItems"
          :key="item"
          :class="{ 'active': index === selectedIndex }"
          @mousedown.prevent="selectItem(item)"
          @mouseenter="selectedIndex = index"
        >
          <span class="history-icon">🕒</span>
          <span class="history-text text-truncate">{{ item }}</span>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.autocomplete-container {
  width: 100%;
}

.autocomplete-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  background: #1e1e1e;
  border: 1px solid #2a2a2a;
  border-top: none;
  border-radius: 0 0 12px 12px;
  margin: 0;
  padding: 5px 0;
  list-style: none;
  max-height: 250px;
  overflow-y: auto;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
}

.autocomplete-dropdown li {
  padding: 10px 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.15s ease;
  color: #e8e8e8;
  border-left: 3px solid transparent;
}

.autocomplete-dropdown li:hover,
.autocomplete-dropdown li.active {
  background: #2d2d2d;
}

.autocomplete-dropdown li.active {
  border-left-color: #ff4500;
  background: #252525;
}

.history-icon {
  font-size: 0.9rem;
  opacity: 0.4;
}

.history-text {
  font-size: 0.95rem;
  flex: 1;
}

/* Scrollbar for dropdown */
.autocomplete-dropdown::-webkit-scrollbar {
  width: 6px;
}
.autocomplete-dropdown::-webkit-scrollbar-track {
  background: transparent;
}
.autocomplete-dropdown::-webkit-scrollbar-thumb {
  background: #333;
  border-radius: 3px;
}
</style>
