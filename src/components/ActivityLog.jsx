
    import React from 'react';
    import { motion, AnimatePresence } from 'framer-motion';
    import { Info, CheckCircle, AlertTriangle, XCircle, Code } from 'lucide-react';
    import { useLog } from '@/contexts/LogContext';
    import { cn } from '@/lib/utils';
    import {
      Collapsible,
      CollapsibleContent,
      CollapsibleTrigger,
    } from "@/components/ui/collapsible";
    import { Button } from './ui/button';


    const logConfig = {
        info: { icon: Info, color: 'text-blue-400' },
        success: { icon: CheckCircle, color: 'text-green-400' },
        warning: { icon: AlertTriangle, color: 'text-yellow-400' },
        error: { icon: XCircle, color: 'text-red-400' },
    };

    const ActivityLog = () => {
        const { logs } = useLog();

        return (
            <div className="mt-8">
                <h2 className="text-xl font-bold mb-4 text-foreground">Activity Log</h2>
                <div className="bg-card border border-border rounded-xl max-h-64 overflow-y-auto p-4 space-y-3">
                    <AnimatePresence>
                        {logs.length === 0 ? (
                             <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-center py-8 text-muted-foreground"
                            >
                                <p>Logs will appear here as you perform actions.</p>
                            </motion.div>
                        ) : (
                            logs.map(log => {
                                const config = logConfig[log.level] || logConfig.info;
                                const Icon = config.icon;
                                return (
                                    <motion.div
                                        key={log.id}
                                        layout
                                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.3 }}
                                        className={cn('text-sm font-mono p-3 rounded-lg',
                                          log.level === 'error' ? 'bg-red-900/30' : 'bg-muted/50'
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", config.color)} />
                                            <div className="flex-grow">
                                                <span className="text-foreground">{log.message}</span>
                                                <span className="text-xs text-muted-foreground ml-2">
                                                    {log.timestamp.toLocaleTimeString()}
                                                </span>
                                            </div>
                                        </div>
                                        {log.details && (
                                           <Collapsible>
                                                <CollapsibleTrigger asChild>
                                                    <Button variant="link" size="sm" className="text-xs text-muted-foreground h-auto p-0 mt-1">
                                                        <Code className="h-3 w-3 mr-1" />
                                                        Show Details
                                                    </Button>
                                                </CollapsibleTrigger>
                                                <CollapsibleContent>
                                                    <pre className="mt-2 text-xs bg-black/50 p-2 rounded-md overflow-x-auto">
                                                        {JSON.stringify(log.details, null, 2)}
                                                    </pre>
                                                </CollapsibleContent>
                                            </Collapsible>
                                        )}
                                    </motion.div>
                                );
                            })
                        )}
                    </AnimatePresence>
                </div>
            </div>
        );
    };

    export default ActivityLog;
  