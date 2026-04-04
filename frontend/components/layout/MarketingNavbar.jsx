import Link from 'next/link';
import { Button } from '@/components/ui/button';
import ThemeToggle from '@/components/shared/ThemeToggle';
import { ChevronDown, Disc } from 'lucide-react';

export function MarketingNavbar() {
  return (
    <nav className="sticky top-0 z-50 w-full bg-[#fcfbfa]/90 dark:bg-slate-950/90 backdrop-blur-md transition-colors duration-300">
      <div className="max-w-7xl mx-auto flex h-20 items-center justify-between px-6 lg:px-8 pt-4">
        
        {/* Logo */}
        <div className="flex items-center gap-2">
          <Disc className="w-7 h-7 text-[#c2a278] dark:text-[#d3b48a] fill-current opacity-80" />
          <Link href="/" className="flex items-center">
            <span className="text-2xl font-bold tracking-tight text-[#1c1c1a] dark:text-white uppercase">ORG-OS</span>
          </Link>
        </div>

        {/* Center Links */}
        <div className="hidden lg:flex items-center gap-8 text-[15px] font-medium text-[#4a4a48] dark:text-slate-300">
          <Link href="#" className="flex items-center hover:text-[#1c1c1a] dark:hover:text-white transition-colors">
            Product <ChevronDown className="ml-1 h-4 w-4 opacity-50" />
          </Link>
          <Link href="#" className="flex items-center hover:text-[#1c1c1a] dark:hover:text-white transition-colors">
            Solutions <ChevronDown className="ml-1 h-4 w-4 opacity-50" />
          </Link>
          <Link href="#" className="flex items-center hover:text-[#1c1c1a] dark:hover:text-white transition-colors">
            Resources <ChevronDown className="ml-1 h-4 w-4 opacity-50" />
          </Link>
          <Link href="/pricing" className="hover:text-[#1c1c1a] dark:hover:text-white transition-colors">Pricing</Link>
          <Link href="/enterprise" className="hover:text-[#1c1c1a] dark:hover:text-white transition-colors">Enterprise</Link>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link href="/login">
            <Button className="bg-[#bda077] hover:bg-[#a98f6a] dark:bg-[#bda077]/90 dark:hover:bg-[#a98f6a] text-white rounded-full px-7 h-10 font-medium transition-all shadow-sm">
              Request Demo
            </Button>
          </Link>
        </div>

      </div>
    </nav>
  );
}
