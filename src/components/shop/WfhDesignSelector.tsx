'use client';

import { useState } from 'react';

interface WfhDesignSelectorProps {
  initialSlogan: string;
  onSloganChange?: (newSlogan: string, optionName: string) => void;
}

export function WfhDesignSelector({
  initialSlogan,
  onSloganChange,
}: WfhDesignSelectorProps) {
  const [selectedOption, setSelectedOption] = useState<'boyfriend' | 'girlfriend'>(
    initialSlogan.toLowerCase().includes('girlfriend') ? 'girlfriend' : 'boyfriend'
  );

  const handleSelect = (option: 'boyfriend' | 'girlfriend') => {
    setSelectedOption(option);
    const newSlogan = option === 'boyfriend' 
      ? 'MY BOYFRIEND IS DOING WFH' 
      : 'MY GIRLFRIEND IS DOING WFH';
    const label = option === 'boyfriend' ? 'My Boyfriend' : 'My Girlfriend';
    onSloganChange?.(newSlogan, label);
  };

  return (
    <fieldset className="flex flex-col gap-1.5 mb-3 select-none">
      <legend className="text-xs font-bold uppercase tracking-widest text-ink/60 mb-1 flex items-center gap-1.5">
        <span>Design Slogan Option</span>
        <span className="text-[10px] text-stamp-red font-mono font-normal">(Select Version)</span>
      </legend>

      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => handleSelect('boyfriend')}
          className={`flex items-center gap-2 rounded border px-4 py-2 text-xs font-bold transition-colors duration-100 ${
            selectedOption === 'boyfriend'
              ? 'border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink shadow-sm'
              : 'border-ink/20 bg-paper text-ink hover:border-ink dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:border-white'
          }`}
          aria-pressed={selectedOption === 'boyfriend'}
        >
          <span>🔥 My Boyfriend Is Doing WFH</span>
        </button>

        <button
          type="button"
          onClick={() => handleSelect('girlfriend')}
          className={`flex items-center gap-2 rounded border px-4 py-2 text-xs font-bold transition-colors duration-100 ${
            selectedOption === 'girlfriend'
              ? 'border-ink bg-ink text-paper dark:border-paper dark:bg-paper dark:text-ink shadow-sm'
              : 'border-ink/20 bg-paper text-ink hover:border-ink dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:border-white'
          }`}
          aria-pressed={selectedOption === 'girlfriend'}
        >
          <span>🌶️ My Girlfriend Is Doing WFH</span>
        </button>
      </div>

      <input 
        type="hidden" 
        name="sloganOption" 
        value={selectedOption === 'boyfriend' ? 'MY BOYFRIEND IS DOING WFH' : 'MY GIRLFRIEND IS DOING WFH'} 
      />
    </fieldset>
  );
}
