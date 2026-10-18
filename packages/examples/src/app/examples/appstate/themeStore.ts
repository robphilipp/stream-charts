import {create} from 'zustand'
import {lightTheme, type Theme} from "../../ui/Themes.ts";

interface ThemeStore {
    theme: Theme,
    updateTheme: (theme: Theme) => void
}

/**
 * Store for managing the theme of the application.
 */
export const useThemeStore = create<ThemeStore>()(
    set => ({
        theme: lightTheme,
        updateTheme: (theme: Theme) => set({theme})
    })
)