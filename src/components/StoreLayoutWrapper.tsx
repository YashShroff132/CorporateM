'use client';

import { usePathname } from 'next/navigation';
import { SiteHeader } from './SiteHeader';
import { SiteFooter } from './SiteFooter';

export function StoreLayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <SiteHeader />
      <div className="pt-[72px] md:pt-[76px]">{children}</div>
      <SiteFooter />
    </>
  );
}
