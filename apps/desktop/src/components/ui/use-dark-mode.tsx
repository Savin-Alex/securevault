import { useEffect, useState } from "react";

export function useDarkMode() {
  const [enabled, setEnabled] = useState(() => {
    // Check localStorage first, then fallback to system preference
    const stored = localStorage.getItem("darkMode");
    if (stored !== null) {
      return stored === "true";
    }
    // Check if dark class is already present (for SSR compatibility)
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    // Apply the dark class to document element
    if (enabled) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    
    // Persist the state to localStorage
    localStorage.setItem("darkMode", enabled.toString());
  }, [enabled]);

  return { enabled, toggle: () => setEnabled((e) => !e) };
}

