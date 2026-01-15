import React, { createContext, useContext } from 'react';

const micrChars = {
  '0': 'd', '1': 'a', '2': 'b', '3': 'c', '4': 'e',
  '5': 'f', '6': 'g', '7': 'h', '8': 'i', '9': 'j',
  'T': 'k', // Transit
  'U': 'l', // On-Us
  'A': 'm', // Amount
  'D': 'n', // Dash
  'C': 'o'  // Should be the character for the check symbol, but using 'o' as a placeholder
};

const translateToMicr = (text) => {
  return text.split('').map(char => micrChars[char] || char).join('');
};

const MICRContext = createContext();

export const MICRProvider = ({ children }) => {
  return (
    <MICRContext.Provider value={{}}>
      {children}
    </MICRContext.Provider>
  );
};

export const MICR = ({ text }) => {
  const translatedText = translateToMicr(text);
  return (
    <span style={{ fontFamily: 'E13B', fontSize: '16px' }}>
      {translatedText}
    </span>
  );
};