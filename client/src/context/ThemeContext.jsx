import React, {
  createContext,
  useContext,
  useState,
  useEffect,
} from "react";

const ThemeContext = createContext(undefined);

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState("dark");

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    // CyberOrbit uses a consistent dark theme.
    localStorage.setItem("cyberorbit_theme", "dark");

    root.classList.add("dark");
    root.classList.remove("light-theme");

    body.classList.add("dark");
    body.classList.remove("light-theme");

    // Let index.css control the background and typography.
    body.style.removeProperty("background-color");
    body.style.removeProperty("color");
  }, []);

  const setTheme = () => {
    setThemeState("dark");
  };

  const toggleTheme = () => {
    setThemeState("dark");
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        isDark: true,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

const fallbackThemeContext = {
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
  isDark: true,
};

export const useTheme = () => {
  const context = useContext(ThemeContext);

  if (!context) {
    return fallbackThemeContext;
  }

  return context;
};