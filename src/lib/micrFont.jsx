
import React, { createContext, useContext } from 'react';

const MICRContext = createContext();

export const MICRProvider = ({ children }) => {
  return (
    <MICRContext.Provider value={{}}>
      {children}
    </MICRContext.Provider>
  );
};

export const MICR = ({ text }) => {
  const micrStyle = {
    fontFamily: '"E-13B", "Courier New", Courier, monospace',
    fontSize: '16px',
    fontWeight: 'normal',
    letterSpacing: '1px',
    lineHeight: '1.2'
  };

  // MICR symbol mapping for E-13B font
  const symbols = {
    'A': '\u00C0', // Transit symbol (⑆)
    'B': '\u00C1', // On-Us symbol (⑈) 
    'C': '\u00C2', // Amount symbol (⑇)
    'D': '\u00C3'  // Dash symbol (⑉)
  };

  const transformedText = text.replace(/[A-D]/g, match => symbols[match] || match);

  return (
    <div style={micrStyle} className="select-none">
      {transformedText}
    </div>
  );
};

export const useMICR = () => useContext(MICRContext);
