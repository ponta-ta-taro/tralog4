'use client';

import { type PropsWithChildren } from 'react';
import { usePathname } from 'next/navigation';

export default function ClientNavWrapper({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const shouldShowNav = pathname !== '/login';

  if (!shouldShowNav) {
    return null;
  }

  return <>{children}</>;
}
