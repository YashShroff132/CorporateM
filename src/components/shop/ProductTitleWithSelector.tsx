'use client';

import { useState } from 'react';
import { WfhDesignSelector } from './WfhDesignSelector';

interface ProductTitleWithSelectorProps {
  slug: string;
  initialSlogan: string;
}

export function ProductTitleWithSelector({
  slug,
  initialSlogan,
}: ProductTitleWithSelectorProps) {
  const [slogan, setSlogan] = useState<string>(initialSlogan);

  const isWfhProduct = slug === 'boyfriend-wfh';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-black tracking-tight">{slogan}</h1>

      {isWfhProduct && (
        <WfhDesignSelector
          initialSlogan={initialSlogan}
          onSloganChange={(newSlogan) => setSlogan(newSlogan)}
        />
      )}
    </div>
  );
}
