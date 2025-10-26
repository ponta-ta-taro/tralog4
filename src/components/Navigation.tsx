'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Menu as MenuIcon, X as CloseIcon, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavLink {
  name: string;
  href: string;
  icon?: ComponentType<{ className?: string }>;
}

const NAV_LINKS: NavLink[] = [
  { name: 'ダッシュボード', href: '/' },
  { name: 'セッション記録', href: '/workouts/session' },
  
  { name: '履歴', href: '/workouts' },
  { name: 'メニュー管理', href: '/menus' },
  { name: '分析', href: '/analytics' },
  { name: 'データ共有', href: '/share' }
];

export default function Navigation() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const renderNavLinks = (orientation: 'horizontal' | 'vertical', closeOnClick = false) => (
    <ul
      className={cn(
        'm-0 list-none p-0',
        orientation === 'vertical' ? 'flex flex-col gap-2' : 'flex items-center gap-4'
      )}
    >
      {NAV_LINKS.map(link => {
        const isActive = pathname === link.href;
        const Icon = link.icon;
        const handleClick = () => {
          if (closeOnClick) {
            setIsMobileOpen(false);
          }
        };

        return (
          <li key={link.href}>
            <Link
              href={link.href}
              onClick={handleClick}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                'hover:bg-accent hover:text-accent-foreground',
                isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'
              )}
            >
              {Icon && <Icon className="h-4 w-4" />}
              <span>{link.name}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 sm:hidden"
            aria-label="メニュー"
            onClick={() => setIsMobileOpen(prev => !prev)}
          >
            {isMobileOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
          <Link href="/" className="text-lg font-semibold">
            Tralog4
          </Link>
        </div>

        <nav className="hidden flex-1 justify-center sm:flex">
          {renderNavLinks('horizontal')}
        </nav>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="hidden flex-col items-end sm:flex">
                <span className="text-sm font-medium text-foreground">
                  {user.displayName || user.email || 'ユーザー'}
                </span>
                <span className="text-xs text-muted-foreground">
                  {user.email || 'ログイン中'}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSignOut}
                className="flex items-center gap-1"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">ログアウト</span>
              </Button>
            </>
          ) : (
            <Button size="sm" asChild>
              <Link href="/login">ログイン</Link>
            </Button>
          )}
        </div>
      </div>

      {isMobileOpen && (
        <div className="sm:hidden">
          <nav className="border-t bg-background px-4 py-3 shadow-sm">
            {renderNavLinks('vertical', true)}
            {user && (
              <div className="mt-4 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {user.displayName || user.email || 'ユーザー'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {user.email || 'ログイン中'}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsMobileOpen(false);
                    handleSignOut();
                  }}
                  className="flex items-center gap-1"
                >
                  <LogOut className="h-4 w-4" />
                  ログアウト
                </Button>
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
