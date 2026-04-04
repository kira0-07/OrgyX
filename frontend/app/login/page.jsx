'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Eye, EyeOff, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import useAuthStore from '@/store/authStore';
import toast from 'react-hot-toast';
import ThemeToggle from '@/components/shared/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const result = await login(formData.email, formData.password);

    if (result.success) {
      toast.success('Login successful!');
      router.push('/dashboard');
    } else {
      toast.error(result.error || 'Login failed');
    }
  };

  return (
    <div className="min-h-screen flex w-full h-screen overflow-hidden text-[#1a1c1b] dark:text-slate-100 bg-[#faf9f7] dark:bg-slate-950 transition-colors duration-300">
      {/* Theme Toggle Button positioned globally */}
      <div className="absolute top-6 right-6 z-50">
        <ThemeToggle />
      </div>

      {/* Left Panel - Hero Section (60%) */}
      <div className="hidden lg:flex lg:w-[60%] bg-[url('/hero-login.png')] bg-cover bg-center relative">
        {/* Soft light overlay for light mode, dark overlay for dark mode */}
        <div className="absolute inset-0 bg-[#e3e2e0]/60 dark:bg-slate-950/70 mix-blend-multiply transition-colors duration-300" />
        
        {/* Content layering */}
        <div className="relative z-10 flex flex-col justify-end p-16 w-full h-full bg-gradient-to-t from-[#faf9f7]/90 via-[#faf9f7]/40 dark:from-slate-950/90 dark:via-slate-950/40 to-transparent">
          <h1 className="text-6xl font-serif font-bold mb-4 tracking-tight text-[#18334a] dark:text-white">ORG-OS</h1>
          <p className="text-xl text-[#51606c] dark:text-slate-300 font-medium max-w-md">
            The Digital Architect’s Atelier. Orchestrate your enterprise with supreme clarity and professional precision.
          </p>
        </div>
      </div>

      {/* Right Panel - Form Section (40%) */}
      <div className="w-full lg:w-[40%] flex items-center justify-center p-8 sm:p-16 relative overflow-y-auto bg-[#faf9f7] dark:bg-slate-950">
        
        <div className="w-full max-w-md bg-transparent relative z-10">
          <div className="mb-10 lg:hidden flex justify-center">
             <span className="text-4xl font-serif font-bold text-[#18334a] dark:text-white">
                ORG-OS
             </span>
          </div>
          
          <div className="space-y-3 mb-10">
            <h2 className="text-3xl font-bold tracking-tight text-[#1a1c1b] dark:text-slate-100">
              Welcome back
            </h2>
            <p className="text-[#51606c] dark:text-slate-400">
              Please enter your details to access your workspace.
            </p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-bold tracking-wider text-[#51606c] dark:text-slate-400 uppercase">Email Address</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  className="bg-white dark:bg-slate-900 border-[#c3c7cd] dark:border-slate-800 text-[#1a1c1b] dark:text-white focus:ring-[#304a61] dark:focus:ring-primary focus:border-[#304a61] dark:focus:border-primary h-12 shadow-sm"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="password" className="text-xs font-bold tracking-wider text-[#51606c] dark:text-slate-400 uppercase">Password</Label>
                <Link href="/forgot-password" className="text-xs font-medium text-[#18334a] dark:text-slate-300 hover:underline transition-all">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) =>
                    setFormData({ ...formData, password: e.target.value })
                  }
                  className="pr-10 bg-white dark:bg-slate-900 border-[#c3c7cd] dark:border-slate-800 text-[#1a1c1b] dark:text-white focus:ring-[#304a61] dark:focus:ring-primary focus:border-[#304a61] dark:focus:border-primary h-12 shadow-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-[#73777d] dark:text-slate-500 hover:text-[#18334a] dark:hover:text-slate-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 bg-gradient-to-r from-[#18334a] to-[#304a61] hover:from-[#132839] hover:to-[#24394b] dark:bg-none dark:bg-slate-800 dark:hover:bg-slate-700 text-white shadow-md transition-all duration-300 text-base font-semibold mt-8 rounded-md"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="mt-8 relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-[#e3e2e0] dark:border-slate-800"></span>
            </div>
            <div className="relative flex justify-center text-xs uppercase font-medium">
              <span className="bg-[#faf9f7] dark:bg-slate-950 px-2 text-[#73777d] dark:text-slate-500">Or continue with</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <Button type="button" variant="outline" className="bg-white dark:bg-slate-900 border-[#c3c7cd] dark:border-slate-800 text-[#51606c] dark:text-slate-300 hover:bg-[#efeeec] dark:hover:bg-slate-800 hover:text-[#1a1c1b] dark:hover:text-white h-12 shadow-sm">
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Google
            </Button>
            <Button type="button" variant="outline" className="bg-white dark:bg-slate-900 border-[#c3c7cd] dark:border-slate-800 text-[#51606c] dark:text-slate-300 hover:bg-[#efeeec] dark:hover:bg-slate-800 hover:text-[#1a1c1b] dark:hover:text-white h-12 shadow-sm">
              <Lock className="w-4 h-4 mr-2 text-[#51606c] dark:text-slate-300" />
              SSO
            </Button>
          </div>

          <div className="mt-8 text-center text-xs text-[#73777d] dark:text-slate-500">
            <p>Demo credentials:</p>
            <p className="font-mono mt-1 text-[#51606c] dark:text-slate-400">admin@orgos.app / Password123!</p>
          </div>
        </div>
      </div>
    </div>
  );
}
