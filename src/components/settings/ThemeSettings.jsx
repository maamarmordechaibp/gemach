
    import React from 'react';
    import { useTheme } from '@/contexts/ThemeContext';
    import { toast } from '@/components/ui/use-toast';
    import { cn } from '@/lib/utils';
    import { Loader2 } from 'lucide-react';

    const ThemeSelector = ({ themes, activeTheme, onSelectTheme }) => {
      return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {themes.map(theme => (
            <div key={theme.id} onClick={() => onSelectTheme(theme.name)} className="cursor-pointer group">
              <div className={cn(
                "p-4 rounded-lg border-2 transition-all",
                activeTheme === theme.name ? 'border-primary scale-105 shadow-lg' : 'border-border group-hover:border-accent-foreground'
              )}>
                <div className="flex gap-2 mb-2">
                  <div className="w-6 h-6 rounded" style={{ backgroundColor: `hsl(${theme.colors['--primary']})`}}></div>
                  <div className="w-6 h-6 rounded" style={{ backgroundColor: `hsl(${theme.colors['--secondary']})`}}></div>
                  <div className="w-6 h-6 rounded" style={{ backgroundColor: `hsl(${theme.colors['--accent']})`}}></div>
                </div>
                <p className="text-foreground font-medium">{theme.name}</p>
              </div>
            </div>
          ))}
        </div>
      );
    };

    const ThemeSettings = () => {
        const { themes, activeThemeName, selectTheme, loading } = useTheme();

        const handleSelectTheme = async (themeName) => {
            await selectTheme(themeName);
            toast({ title: 'Theme Updated!', description: `${themeName} theme has been applied.` });
        };

        if (loading) {
            return <div className="flex justify-center items-center h-24"><Loader2 className="h-8 w-8 animate-spin" /></div>;
        }

        return <ThemeSelector themes={themes} activeTheme={activeThemeName} onSelectTheme={handleSelectTheme} />;
    };

    export default ThemeSettings;
  