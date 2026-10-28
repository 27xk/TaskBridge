// Owns row identity and DOM reconciliation; all presentation dependencies are explicit.
export function createTaskListRenderer({ container, renderItem, getKey = (task) => String(task.id), getSignature, getActiveElement = () => null }) {
  const rows = new Map();
  return {
    render(tasks, { prefix = null, empty = null } = {}) {
      const active = getActiveElement();
      const keys = new Set(tasks.map(getKey));
      for (const [key, record] of rows) {
        if (!keys.has(key)) { record.node.remove(); rows.delete(key); }
      }
      const desired = prefix ? [prefix] : [];
      let restoreFocus = null;
      for (const task of tasks) {
        const key = getKey(task);
        const signature = getSignature(task);
        let record = rows.get(key);
        if (!record || record.signature !== signature) {
          const node = renderItem(task);
          if (record?.node.contains(active)) {
            const action = active?.dataset?.taskAction;
            const controls = [...node.querySelectorAll("button, input, summary")];
            restoreFocus = controls.find((candidate) => (
              (active?.id && candidate.id === active.id) ||
              (action && candidate.dataset.taskAction === action) ||
              (active?.dataset?.taskSelectionId && candidate.dataset.taskSelectionId === active.dataset.taskSelectionId) ||
              (active?.dataset?.trashSelectionId && candidate.dataset.trashSelectionId === active.dataset.trashSelectionId)
            )) || node;
            if (restoreFocus === node) node.setAttribute("tabindex", "-1");
          }
          record?.node.remove();
          record = { node, signature };
          rows.set(key, record);
        }
        desired.push(record.node);
      }
      if (!tasks.length && empty) desired.push(empty);
      const desiredNodes = new Set(desired);
      for (const child of [...container.children]) if (!desiredNodes.has(child)) child.remove();
      desired.forEach((node, index) => {
        if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
      });
      restoreFocus?.focus();
      if (active && container.contains(active) && getActiveElement() !== active) active.focus();
    },
  };
}
