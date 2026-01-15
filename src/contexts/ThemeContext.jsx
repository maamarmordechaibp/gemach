import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
    import { supabase } from '@/lib/customSupabaseClient';
    import { useAuth } from '@/contexts/SupabaseAuthContext';

    const ThemeContext = createContext();

    export const useTheme = () => useContext(ThemeContext);

    export const ThemeProvider = ({ children }) => {
        const { session } = useAuth();
        const [themes, setThemes] = useState([]);
        const [activeThemeName, setActiveThemeName] = useState('Default');
        const [loading, setLoading] = useState(true);

        const applyTheme = (theme) => {
            const root = window.document.documentElement;
            root.classList.remove('dark', 'light');
            
            if (theme) {
                Object.entries(theme.colors).forEach(([key, value]) => {
                    root.style.setProperty(key, value);
                });
                // Simple check for dark/light mode based on background lightness
                const backgroundLightness = parseInt(theme.colors['--background'].split(' ')[2], 10);
                if (backgroundLightness < 50) {
                    root.classList.add('dark');
                } else {
                    root.classList.add('light');
                }
            }
        };

        const fetchAndApplyTheme = useCallback(async () => {
            setLoading(true);
            try {
                const { data: themeData, error: themeError } = await supabase.from('themes').select('*');
                if (themeError) throw themeError;
                setThemes(themeData || []);

                const { data: settingData, error: settingError } = await supabase
                    .from('system_settings')
                    .select('value')
                    .eq('key', 'active_theme')
                    .single();
                
                const currentThemeName = settingError ? 'Default' : settingData.value;
                setActiveThemeName(currentThemeName);

                const activeTheme = (themeData || []).find(t => t.name === currentThemeName);
                if (activeTheme) {
                    applyTheme(activeTheme);
                } else {
                    const defaultTheme = (themeData || []).find(t => t.name === 'Default');
                    if (defaultTheme) applyTheme(defaultTheme);
                }

            } catch (error) {
                console.error("Error loading theme:", error);
            } finally {
                setLoading(false);
            }
        }, []);

        useEffect(() => {
            if (session) {
                fetchAndApplyTheme();
            }
        }, [session, fetchAndApplyTheme]);

        const selectTheme = async (themeName) => {
            const theme = themes.find(t => t.name === themeName);
            if (theme) {
                applyTheme(theme);
                setActiveThemeName(themeName);
                try {
                    await supabase.from('system_settings').upsert({ key: 'active_theme', value: themeName }, { onConflict: 'key' });
                } catch (error) {
                    console.error("Failed to save theme setting:", error);
                }
            }
        };

        const value = {
            themes,
            activeThemeName,
            selectTheme,
            loading,
        };

        return (
            <ThemeContext.Provider value={value}>
                {children}
            </ThemeContext.Provider>
        );
    };