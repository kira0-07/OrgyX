import { MarketingNavbar } from '@/components/layout/MarketingNavbar';
import Link from 'next/link';
import { ShieldCheck, HeadphonesIcon, ActivitySquare, GitMerge } from 'lucide-react';

export default function EnterprisePage() {
  return (
    <div className="min-h-screen bg-[#faf9f6] dark:bg-slate-950 font-sans text-slate-800 dark:text-slate-50 selection:bg-primary/20 transition-colors duration-300">
      <MarketingNavbar />

      <main className="pt-32">
        {/* Hero Section */}
        <section className="max-w-[1440px] mx-auto px-6 md:px-12 py-24 md:py-32 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          <div className="lg:col-span-7 flex flex-col gap-8 tracking-tight">
            <div className="flex flex-col gap-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 font-bold border border-slate-300 dark:border-slate-800 rounded-full px-5 py-2 w-fit bg-slate-100 dark:bg-slate-900 shadow-sm leading-relaxed max-w-xl">
                This is an official and registered product of the CATALYST TECHNOLOGIES Pvt. Ltd. that is "THE C. Tech."
              </p>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter text-slate-900 dark:text-white leading-[1.1] md:leading-[1.0] max-w-2xl font-serif mt-2">
                Orchestrate at Scale.
              </h1>
              <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 font-light max-w-lg leading-relaxed mt-4">
                The unified platform for large-scale enterprise operations. Precision drafting for the modern industrial workspace.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mt-4">
              <Link href="/contact">
                <button className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-8 py-4 rounded-xl font-bold tracking-tight text-lg shadow-lg hover:scale-[0.98] transition-transform w-full sm:w-auto">
                  Request Enterprise Demo
                </button>
              </Link>
              <Link href="/pricing">
                <button className="bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white px-8 py-4 rounded-xl font-bold tracking-tight text-lg hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors w-full sm:w-auto">
                  View Pricing
                </button>
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 relative hidden lg:block">
            <div className="aspect-[4/5] bg-slate-100 dark:bg-slate-900 rounded-3xl overflow-hidden relative group shadow-2xl">
              <img
                alt="Architectural facade"
                className="w-full h-full object-cover grayscale brightness-110 contrast-125 transition-transform duration-700 group-hover:scale-105"
                src="https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=2070&auto=format&fit=crop"
              />
              <div className="absolute inset-0 bg-slate-900/10 mix-blend-multiply"></div>

              <div className="absolute bottom-6 left-6 right-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl">
                <p className="text-xs uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 font-bold">Operational Integrity</p>
                <p className="text-slate-900 dark:text-white font-bold text-xl leading-tight">99.99% Guaranteed Infrastructure Stability</p>
              </div>
            </div>
            {/* Asymmetric Decorative Element */}
            <div className="absolute -top-12 -right-12 w-48 h-48 bg-primary/20 rounded-full blur-3xl -z-10"></div>
          </div>
        </section>

        {/* Feature Bento Grid */}
        <section className="bg-slate-100/50 dark:bg-slate-900/30 py-32 border-y border-slate-200 dark:border-slate-900">
          <div className="max-w-[1440px] mx-auto px-6 md:px-12">
            <div className="mb-20 space-y-6">
              <div className="w-12 h-1.5 bg-primary rounded-full"></div>
              <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white max-w-2xl leading-tight">
                Built for the Architectural Complexity of Enterprise
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">

              {/* Feature 1: Security */}
              <div className="md:col-span-8 bg-white dark:bg-slate-950 p-8 md:p-12 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all duration-300">
                <div className="flex flex-col md:flex-row gap-12 items-center h-full">
                  <div className="flex-1 space-y-6">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-primary">
                      <ShieldCheck className="w-8 h-8" />
                    </div>
                    <h3 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Security &amp; Access</h3>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-lg">
                      Single Sign-On (SSO) with enterprise-grade encryption. We provide a fortified perimeter for your intellectual property with Zero-Trust protocols and hardware-level isolation.
                    </p>
                  </div>
                  <div className="flex-1 w-full min-h-[240px] h-full rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900 relative hidden md:block">
                    <img
                      alt="Data Center"
                      className="absolute inset-0 w-full h-full object-cover grayscale opacity-90"
                      src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=2034&auto=format&fit=crop"
                    />
                  </div>
                </div>
              </div>

              {/* Feature 2: Support */}
              <div className="md:col-span-4 bg-slate-900 dark:bg-slate-800 text-white p-8 md:p-12 rounded-3xl flex flex-col justify-between shadow-lg overflow-hidden relative group">
                <div className="space-y-6 relative z-10">
                  <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-white">
                    <HeadphonesIcon className="w-8 h-8" />
                  </div>
                  <h3 className="text-3xl font-bold tracking-tight">Dedicated Support</h3>
                  <p className="text-white/80 leading-relaxed text-lg">
                    24/7 concierge support and strategic account management for global operations across every time zone.
                  </p>
                </div>
                <div className="mt-12 relative z-10">
                  <Link className="inline-flex items-center gap-2 font-bold tracking-tight hover:opacity-80 transition-all text-xl" href="/contact">
                    Meet your Team &rarr;
                  </Link>
                </div>
                <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors"></div>
              </div>

              {/* Feature 3: Reliability */}
              <div className="md:col-span-5 bg-white dark:bg-slate-950 p-8 md:p-12 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all duration-300">
                <div className="space-y-6 h-full flex flex-col justify-center">
                  <div className="flex items-baseline gap-1 relative">
                    <span className="text-7xl md:text-8xl font-black tracking-tighter text-slate-900 dark:text-white">99.99</span>
                    <span className="text-3xl font-bold text-primary">%</span>
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white pt-2">Reliability SLA</h3>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-lg">
                    Our Uptime guarantee isn't just a promise; it's a structural mandate backed by multi-region redundancy and real-time failover logic.
                  </p>
                </div>
              </div>

              {/* Feature 4: Flexibility */}
              <div className="md:col-span-7 bg-white dark:bg-slate-950 p-8 md:p-12 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden hover:shadow-xl transition-all duration-300 flex flex-col justify-center">
                <div className="relative z-10 space-y-6 max-w-xl h-full flex flex-col justify-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-900 flex items-center justify-center text-primary">
                    <GitMerge className="w-8 h-8" />
                  </div>
                  <h3 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Flexibility &amp; Custom Workflows</h3>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-lg">
                    Designed for your unique organizational structure. OrgOS adapts to your established hierarchy, not the other way around. Craft bespoke approval chains and data pipelines.
                  </p>
                </div>
                <div className="absolute right-0 bottom-0 text-[180px] leading-none opacity-[0.03] dark:opacity-[0.05] pointer-events-none translate-x-12 translate-y-12">
                  <ActivitySquare className="w-full h-full" />
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="max-w-[1440px] mx-auto px-6 md:px-12 py-32 text-center">
          <div className="bg-slate-900 dark:bg-slate-950 text-white p-12 md:p-24 rounded-[3rem] relative overflow-hidden shadow-2xl">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800/80 via-transparent to-transparent opacity-60"></div>

            <div className="relative z-10 max-w-3xl mx-auto space-y-10">
              <h2 className="text-5xl md:text-6xl font-extrabold tracking-tighter leading-tight font-serif">
                Draft your Enterprise's Future.
              </h2>
              <p className="text-xl text-slate-300 leading-relaxed max-w-2xl mx-auto">
                Join the world's most resilient organizations who use OrgOS to architect their digital operations with precision, security, and scale.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-6 pt-4">
                <Link href="/contact" className="w-full sm:w-auto">
                  <button className="bg-white text-slate-900 px-10 py-5 rounded-2xl font-bold text-xl shadow-xl hover:scale-[0.98] transition-transform w-full">
                    Start Orchestrating
                  </button>
                </Link>
                <Link href="/pricing" className="w-full sm:w-auto">
                  <button className="bg-white/10 hover:bg-white/20 text-white border border-white/10 px-10 py-5 rounded-2xl font-bold text-xl transition-colors backdrop-blur-sm w-full">
                    Technical Details
                  </button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="w-full mt-12 bg-slate-100/50 dark:bg-slate-950/30 border-t border-slate-200 dark:border-slate-800">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-12 max-w-[1440px] mx-auto px-12 py-20">
          <div className="col-span-2 md:col-span-1 space-y-6">
            <div className="text-xl font-black tracking-tight text-slate-900 dark:text-white">ORG-OS</div>
            <p className="font-sans text-xs tracking-wider text-slate-500 dark:text-slate-400 leading-relaxed uppercase font-semibold">
              This is an official and registered product of the CATALYST TECHNOLOGIES Pvt. Ltd. that is "THE C. Tech."
            </p>
            <p className="font-sans text-xs tracking-wider text-slate-500 dark:text-slate-500 leading-relaxed">
              © 2024 Catalyst Technologies. All rights reserved.
            </p>
          </div>
          <div className="space-y-4">
            <h4 className="font-sans text-xs uppercase tracking-widest font-bold text-slate-900 dark:text-white">Product</h4>
            <div className="flex flex-col gap-3">
              <Link href="#" className="font-sans text-sm text-slate-600 dark:text-slate-400 dark:hover:text-white transition-colors">Documentation</Link>
              <Link href="#" className="font-sans text-sm text-slate-600 dark:text-slate-400 dark:hover:text-white transition-colors">Security</Link>
              <Link href="/pricing" className="font-sans text-sm text-slate-600 dark:text-slate-400 dark:hover:text-white transition-colors">Pricing</Link>
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="font-sans text-xs uppercase tracking-widest font-bold text-slate-900 dark:text-white">Legal</h4>
            <div className="flex flex-col gap-3">
              <Link href="#" className="font-sans text-sm text-slate-600 dark:text-slate-400 dark:hover:text-white transition-colors">Privacy Policy</Link>
              <Link href="#" className="font-sans text-sm text-slate-600 dark:text-slate-400 dark:hover:text-white transition-colors">Terms of Service</Link>
            </div>
          </div>
          <div className="space-y-4">
            <h4 className="font-sans text-xs uppercase tracking-widest font-bold text-slate-900 dark:text-white">Social</h4>
            <div className="flex flex-col gap-3">
              <Link href="#" className="font-sans text-sm text-slate-600 dark:text-slate-400 dark:hover:text-white transition-colors">LinkedIn</Link>
              <Link href="#" className="font-sans text-sm text-slate-600 dark:text-slate-400 dark:hover:text-white transition-colors">Twitter</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
