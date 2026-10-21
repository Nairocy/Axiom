import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UseAppActionsOptions {
  t: (key: string) => string;
  openConfirm: (opts: { title: string; message: string; onConfirm: () => void }) => void;
  closeConfirm: () => void;
  fetchHistory: (reset?: boolean) => Promise<void>;
}

export const useAppActions = ({
  t,
  openConfirm,
  closeConfirm,
  fetchHistory
}: UseAppActionsOptions) => {
  const clearHistory = useCallback(() => {
    openConfirm({
      title: t("clear_confirm_title"),
      message: t("clear_confirm_message"),
      onConfirm: async () => {
        try {
          await invoke("clear_clipboard_history");
          fetchHistory(true);
        } catch (err) {
          console.error("清空失败", err);
        }
        closeConfirm();
      }
    });
  }, [closeConfirm, fetchHistory, openConfirm, t]);

  return { clearHistory };
};
