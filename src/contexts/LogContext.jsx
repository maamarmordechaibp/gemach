
    import React, { createContext, useContext, useState, useCallback } from 'react';
    import { v4 as uuidv4 } from 'uuid';

    const LogContext = createContext();

    export const useLog = () => useContext(LogContext);

    export const LogProvider = ({ children }) => {
        const [logs, setLogs] = useState([]);

        const addLog = useCallback((message, level = 'info', details = null) => {
            const newLog = {
                id: uuidv4(),
                timestamp: new Date(),
                message,
                level, // 'info', 'success', 'warning', 'error'
                details,
            };
            setLogs(prevLogs => [newLog, ...prevLogs]);
        }, []);

        const value = { logs, addLog };

        return (
            <LogContext.Provider value={value}>
                {children}
            </LogContext.Provider>
        );
    };
  