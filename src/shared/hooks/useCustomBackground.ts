import { useEffect } from "react";
import { supportsCustomBackground } from "../config/themes";

interface UseCustomBackgroundOptions {
  customBackground: string;
  customBackgroundOpacity: number;
  theme: string;
}

export const useCustomBackground = ({
  customBackground,
  customBackgroundOpacity,
  theme
}: UseCustomBackgroundOptions) => {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    root.style.setProperty("--custom-bg-opacity", (customBackgroundOpacity / 100).toString());

    // Fallback to localStorage if state is empty (e.g., before DB settings load)
    const bg = customBackground || (() => { try { return localStorage.getItem('axiom_custom_background') || ''; } catch { return ''; } })();

    // bg is now a data URL (base64), use directly — no convertFileSrc needed
    if (bg && bg.startsWith('data:') && supportsCustomBackground(theme)) {
      root.style.setProperty("--custom-bg-image", `url("${bg}")`);
      body.classList.add("has-custom-bg");
    } else {
      root.style.removeProperty("--custom-bg-image");
      body.classList.remove("has-custom-bg");
    }
  }, [customBackground, theme, customBackgroundOpacity]);
};
