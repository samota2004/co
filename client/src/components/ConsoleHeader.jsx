import React from 'react';
import { BrainCircuit, ShieldCheck } from 'lucide-react';

export function ConsoleHeader({title, description, kind='security'}) {
  const Icon=kind==='ai'?BrainCircuit:ShieldCheck;
  return <header className={`console-heading console-heading-${kind}`}>
    <div className="console-heading-icon"><Icon size={24} strokeWidth={1.6}/></div>
    <div><div className="console-eyebrow">{kind==='ai'?'Machine learning intelligence':'Zero Trust operations'}</div>
      <h1>{title}</h1><p>{description}</p></div>
  </header>;
}
