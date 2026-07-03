import { ref } from "vue";

export interface ConfirmDialogState {
  visible: boolean;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  danger: boolean;
}

export interface ConfirmationOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export function useConfirmDialog(getLanguage: () => string) {
  const confirmDialog = ref<ConfirmDialogState>({
    visible: false,
    title: "",
    message: "",
    confirmText: "",
    cancelText: "",
    danger: false,
  });
  let pendingResolve: ((confirmed: boolean) => void) | null = null;

  function requestConfirmation(options: ConfirmationOptions): Promise<boolean> {
    pendingResolve?.(false);
    const labels = defaultLabels(getLanguage());
    confirmDialog.value = {
      visible: true,
      title: options.title ?? labels.title,
      message: options.message,
      confirmText: options.confirmText ?? labels.confirm,
      cancelText: options.cancelText ?? labels.cancel,
      danger: Boolean(options.danger),
    };
    return new Promise((resolve) => {
      pendingResolve = resolve;
    });
  }

  function confirmRequestedAction(): void {
    settleConfirmation(true);
  }

  function cancelRequestedAction(): void {
    settleConfirmation(false);
  }

  function settleConfirmation(confirmed: boolean): void {
    const resolve = pendingResolve;
    pendingResolve = null;
    confirmDialog.value.visible = false;
    resolve?.(confirmed);
  }

  return {
    confirmDialog,
    requestConfirmation,
    confirmRequestedAction,
    cancelRequestedAction,
  };
}

function defaultLabels(language: string): { title: string; confirm: string; cancel: string } {
  if (language === "en-US") {
    return { title: "Confirm action", confirm: "Confirm", cancel: "Cancel" };
  }
  return { title: "确认操作", confirm: "确认", cancel: "取消" };
}
