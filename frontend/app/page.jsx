import { MarketingNavbar } from '@/components/layout/MarketingNavbar';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { ArrowRight, Gauge, ShieldCheck, Users, Search, Plus, Bell, ChevronDown, MoreHorizontal, LayoutDashboard, Route, CheckSquare, Layers, CreditCard, Settings } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#fcfbfa] text-[#1c1c1a] dark:bg-slate-950 dark:text-slate-50 selection:bg-[#c2a278]/20 transition-colors duration-300 flex flex-col font-sans">
      <MarketingNavbar />
      
      <main className="flex-1 w-full max-w-[1400px] mx-auto px-6 lg:px-12 flex flex-col pt-8 lg:pt-10 relative overflow-hidden">
        
        {/* Soft decorative background gradients (very subtle) */}
        <div className="absolute top-0 right-0 -mr-48 -mt-48 w-[600px] h-[600px] bg-[#f0eee6]/80 dark:bg-primary/5 rounded-full blur-[120px] pointer-events-none transition-colors duration-700" />
        
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center z-10 w-full mb-10 lg:mb-12">
          
          {/* Left Column: Typography and CTAs */}
          <div className="flex flex-col items-start pr-0 lg:pr-12">
            <h1 className="text-5xl md:text-6xl lg:text-[5rem] font-serif font-medium tracking-tight leading-[1.05] text-[#1c1c1a] dark:text-slate-100 mb-4 text-balance">
              Elevate Team <br className="hidden md:block"/>
              Collaboration & <br className="hidden md:block"/>
              Workflow Efficiency
            </h1>
            
            <p className="text-lg md:text-xl text-[#4a4a48] dark:text-slate-400 max-w-xl leading-snug font-normal mb-8 text-balance">
              The modern operations platform for enterprise teams—trusted, intuitive, and built to scale performance.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
              <Link href="/login" className="w-full sm:w-auto">
                <Button size="lg" className="w-full sm:w-full h-14 px-8 rounded-full bg-[#bda077] hover:bg-[#a98f6a] dark:bg-[#bda077]/90 dark:hover:bg-[#a98f6a] text-white shadow-sm font-medium text-lg transition-all border border-transparent">
                  Get Started Free
                </Button>
              </Link>
              <Link href="/product" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full sm:w-full h-14 px-8 rounded-full border-[#d1cec7] dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-800 text-[#1c1c1a] dark:text-white font-medium text-lg transition-all shadow-sm">
                  Watch Product Tour
                </Button>
              </Link>
            </div>
          </div>

          {/* Right Column: Dashboard Mockup */}
          <div className="relative w-full h-[550px] flex justify-end">
            {/* The Mockup Box */}
            <div className="absolute right-0 lg:-right-12 top-6 w-[110%] lg:w-[130%] h-full max-h-[550px] rounded-[1.5rem] bg-white dark:bg-[#0b1120] border border-[#e8e6e1] dark:border-slate-800 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] dark:shadow-2xl overflow-hidden flex flex-col font-sans">
              
              {/* Fake Top Bar */}
              <div className="h-14 border-b border-[#f0eee6] dark:border-slate-800/60 flex items-center justify-between px-6 bg-white dark:bg-[#0b1120]">
                {/* Search */}
                <div className="flex items-center gap-2 text-[#a19f9a] text-sm bg-[#fcfbfa] dark:bg-slate-900 px-3 py-1.5 rounded-md border border-[#f0eee6] dark:border-slate-800">
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                </div>
                {/* Right profile stuff */}
                <div className="flex items-center gap-4">
                  <Bell className="w-4 h-4 text-[#a19f9a]" />
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
                       <img src="https://ui-avatars.com/api/?name=Sarah+Jenkins&background=random" alt="Avatar" className="w-full h-full object-cover" />
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-xs font-semibold text-[#1c1c1a] dark:text-slate-200">Sarah Jenkins</p>
                      <p className="text-[10px] text-[#a19f9a]">US Account</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-[#a19f9a]" />
                  </div>
                </div>
              </div>

              {/* Fake App Body layout */}
              <div className="flex flex-1 overflow-hidden">
                {/* Sidebar */}
                <div className="w-48 xl:w-56 border-r border-[#f0eee6] dark:border-slate-800/60 p-4 bg-[#fcfbfa] dark:bg-slate-950 flex flex-col gap-1">
                  <div className="flex items-center gap-2 px-2 py-3 mb-4">
                    <div className="w-5 h-5 rounded-full bg-[#c2a278]/20 flex items-center justify-center">
                       <div className="w-2.5 h-2.5 bg-[#c2a278] dark:bg-[#d3b48a] rounded-sm transform rotate-45"></div>
                    </div>
                    <span className="font-semibold text-sm text-[#1c1c1a] dark:text-white">ORG-OS</span>
                  </div>
                  
                  {[{i:LayoutDashboard, t:"Dashboard"}, {i:Route, t:"Workflows"}, {i:CheckSquare, t:"Tasks"}, {i:Layers, t:"Resources", d:true}, {i:CreditCard, t:"Pricing"}, {i:Settings, t:"Settings"}].map((nav, idx) => (
                    <div key={idx} className={`flex items-center justify-between px-3 py-2 rounded-md text-sm ${idx===0 ? 'bg-white dark:bg-slate-900 border border-[#f0eee6] dark:border-slate-800 shadow-sm text-[#1c1c1a] dark:text-white font-medium pl-2 border-l-2 border-l-[#c2a278]' : 'text-[#73726f] dark:text-slate-400 hover:bg-[#f0eee6]/50 dark:hover:bg-slate-900 transition-colors'}`}>
                      <div className="flex items-center gap-2">
                        <nav.i className={`w-4 h-4 ${idx===0 ? 'text-[#c2a278]' : ''}`} />
                        <span>{nav.t}</span>
                      </div>
                      {nav.d && <ChevronDown className="w-3 h-3" />}
                    </div>
                  ))}
                  
                  {/* Bottom User inside sidebar */}
                  <div className="mt-auto flex items-center gap-2 px-2 pt-4 border-t border-[#f0eee6] dark:border-slate-800/60">
                     <img src="https://ui-avatars.com/api/?name=Sarah+Jenkins&background=random" alt="Avatar" className="w-6 h-6 rounded-full" />
                     <span className="text-xs text-[#4a4a48] font-medium hidden xl:block">Sarah Jenkins</span>
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1 p-6 bg-[#f7f6f2] dark:bg-[#0b1120] overflow-hidden flex flex-col gap-6">
                  {/* Top Bar for Project */}
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-semibold text-[#1c1c1a] dark:text-white">Project Titan</h2>
                      <p className="text-xs text-[#73726f] dark:text-slate-400 mt-0.5">Project live-status dashboard for cross-functional workflows.</p>
                    </div>
                    <div className="flex items-center gap-2 border border-[#d1cec7] dark:border-slate-700 bg-white dark:bg-slate-800 rounded-md px-3 py-1.5 shadow-sm text-xs font-medium cursor-pointer">
                      <Search className="w-3.5 h-3.5" /> Monitor <ChevronDown className="w-3.5 h-3.5 ml-1" />
                    </div>
                  </div>

                  {/* Top Grid (Workflows & Performance) */}
                  <div className="grid grid-cols-3 gap-6 h-56">
                     <div className="col-span-2 bg-white dark:bg-slate-900 border border-[#e8e6e1] dark:border-slate-800 rounded-xl p-5 flex flex-col shadow-sm">
                        <div className="flex justify-between items-center mb-4 text-sm font-medium">
                           <span>Project Workflows</span>
                           <MoreHorizontal className="w-4 h-4 text-[#a19f9a]" />
                        </div>
                        <div className="flex items-end gap-2 mb-2">
                           <h3 className="text-2xl font-bold">Project Titan</h3>
                           <div className="flex-1 border-b border-dashed border-[#d1cec7] dark:border-slate-700 mb-1.5 mx-2"></div>
                           <span className="text-2xl font-bold text-[#c2a278]">78%</span>
                        </div>
                        
                        {/* Little Workflow steps */}
                        <div className="flex items-center gap-3 mt-4 text-xs font-medium">
                           <div className="flex flex-col gap-2 p-2 border border-[#e8e6e1] rounded-lg shadow-sm bg-gray-50/50">
                              <span className="text-[#4a4a48]">Project Workflows</span>
                              <div className="flex -space-x-1"><div className="w-4 h-4 rounded-full bg-blue-200"></div><div className="w-4 h-4 rounded-full bg-green-200"></div></div>
                           </div>
                           <ArrowRight className="w-4 h-4 text-[#c2a278]" />
                           <div className="flex flex-col gap-2 p-2 border border-[#e8e6e1] rounded-lg shadow-sm bg-gray-50/50">
                              <span className="text-[#4a4a48]">Team Success</span>
                              <div className="flex -space-x-1"><div className="w-4 h-4 rounded-full bg-red-200"></div></div>
                           </div>
                           <ArrowRight className="w-4 h-4 text-[#a19f9a]" />
                           <div className="flex flex-col gap-2 p-2 border border-[#e8e6e1] rounded-lg shadow-sm bg-gray-50/50 opacity-50">
                              <span className="text-[#4a4a48]">Project Monitor</span>
                              <div className="flex -space-x-1"><div className="w-4 h-4 rounded-full bg-purple-200"></div><div className="w-4 h-4 rounded-full bg-yellow-200"></div></div>
                           </div>
                        </div>
                        
                        <div className="mt-auto">
                           <button className="flex items-center gap-1 text-xs text-[#a19f9a] border border-[#e8e6e1] rounded-md px-2 py-1"><Plus className="w-3 h-3"/> Add new</button>
                        </div>
                     </div>
                     
                     <div className="col-span-1 bg-white dark:bg-slate-900 border border-[#e8e6e1] dark:border-slate-800 rounded-xl p-5 shadow-sm flex flex-col">
                        <div className="flex justify-between items-center mb-1 text-sm font-medium">
                           <span>Performance</span>
                           <MoreHorizontal className="w-4 h-4 text-[#a19f9a]" />
                        </div>
                        <p className="text-[#a19f9a] text-[10px]">Growth</p>
                        <div className="flex items-center gap-2 mb-4">
                           <span className="text-2xl font-bold">24%</span>
                           <span className="text-xs text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded font-medium">+24%</span>
                        </div>
                        {/* Sparkline approximation */}
                        <div className="flex-1 relative w-full h-full mt-2">
                           <svg viewBox="0 0 100 40" className="w-full h-full overflow-visible drop-shadow-md">
                             <defs>
                                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                                   <stop offset="0%" stopColor="#c2a278" stopOpacity="0.2"/>
                                   <stop offset="100%" stopColor="#c2a278" stopOpacity="0"/>
                                </linearGradient>
                             </defs>
                             <path d="M0 30 Q10 32, 20 20 T40 25 T60 10 T80 20 T100 5 L100 40 L0 40 Z" fill="url(#g1)" />
                             <path d="M0 30 Q10 32, 20 20 T40 25 T60 10 T80 20 T100 5" fill="none" stroke="#c2a278" strokeWidth="2" strokeLinecap="round"/>
                             
                             <circle cx="60" cy="10" r="3" fill="#1c1c1a" />
                             <rect x="52" y="-5" width="28" height="10" rounded="2" fill="#1c1c1a" rx="2" />
                             <text x="54" y="2" fill="white" fontSize="4" fontWeight="bold">Growth 24.1%</text>
                           </svg>
                           <div className="flex justify-between text-[8px] text-[#a19f9a] mt-1 border-t border-[#f0eee6] pt-1">
                              <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span>
                           </div>
                        </div>
                     </div>
                  </div>

                  {/* Bottom Grid */}
                  <div className="grid grid-cols-3 gap-6 flex-1 min-h-[220px]">
                     {/* Team Activity */}
                     <div className="bg-white dark:bg-slate-900 border border-[#e8e6e1] dark:border-slate-800 rounded-xl p-5 shadow-sm">
                        <div className="text-xs font-semibold mb-3">Team Activity</div>
                        <div className="space-y-3">
                           {[
                             {n:"Alice", t:"2 mins ago", c:"bg-blue-100 text-blue-700", s:"Completed"},
                             {n:"Ben", t:"1 hour ago", c:"bg-emerald-100 text-emerald-700", s:"Created"},
                             {n:"Chloe", t:"5 hours ago", c:"bg-amber-100 text-amber-700", s:"Pending"}
                           ].map((item, i) => (
                             <div key={i} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                   <div className="w-6 h-6 rounded-full bg-slate-200"></div>
                                   <div>
                                      <p className="text-xs font-medium text-[#1c1c1a] dark:text-white leading-none">{item.n}</p>
                                      <p className="text-[10px] text-[#a19f9a] mt-0.5">{item.t}</p>
                                   </div>
                                </div>
                                <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${item.c}`}>{item.s}</span>
                             </div>
                           ))}
                        </div>
                     </div>
                     {/* Performance Line Chart Area */}
                     <div className="bg-white dark:bg-slate-900 border border-[#e8e6e1] dark:border-slate-800 rounded-xl p-5 shadow-sm">
                         <div className="flex items-center justify-between mb-3">
                           <div className="text-xs font-semibold">Performance</div>
                           <MoreHorizontal className="w-3 h-3 text-[#a19f9a]" />
                         </div>
                         <div className="flex h-full pb-4 items-end relative">
                            {/* SVG Chart */}
                            <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible drop-shadow-sm">
                               <path d="M0 40 Q20 30, 40 45 T70 20 T100 15" fill="none" stroke="#c2a278" strokeWidth="1.5" strokeLinecap="round"/>
                               <circle cx="100" cy="15" r="2" fill="#c2a278" />
                            </svg>
                            {/* Y axis */}
                            <div className="absolute left-0 top-0 h-[80%] flex flex-col justify-between text-[8px] text-[#a19f9a]">
                               <span>60%</span><span>40%</span><span>20%</span><span>0%</span>
                            </div>
                         </div>
                     </div>
                     {/* Tasks List */}
                     <div className="bg-white dark:bg-slate-900 border border-[#e8e6e1] dark:border-slate-800 rounded-xl p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3 text-xs font-semibold">
                           <span>Tasks</span>
                           <MoreHorizontal className="w-3 h-3 text-[#a19f9a]" />
                        </div>
                        <div className="space-y-4">
                           {[{t:"Team sync preparation", d:"Today • 4:00 PM", done:false}, {t:"Update UI libraries", d:"Tomorrow • 9:00 AM", done:true}, {t:"Q3 Metrics report", d:"Thursday • 2:00 PM", done:false}].map((task, i) => (
                              <div key={i} className="flex gap-2">
                                <div className={`w-3.5 h-3.5 mt-0.5 border rounded flex items-center justify-center ${task.done ? 'bg-[#c2a278] border-[#c2a278] text-white' : 'border-[#d1cec7]'}`}>
                                   {task.done && <CheckSquare className="w-2.5 h-2.5" />}
                                </div>
                                <div className={`${task.done ? 'opacity-50 line-through' : ''}`}>
                                  <p className="text-[11px] font-medium leading-none text-[#1c1c1a] dark:text-white">{task.t}</p>
                                  <p className="text-[9px] text-[#a19f9a] mt-1">{task.d}</p>
                                </div>
                              </div>
                           ))}
                        </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Trust Metrics Bar at the very bottom */}
        <div className="w-full mt-auto pt-6 pb-6 lg:pb-8 border-t border-[#e8e6e1] dark:border-slate-800/60 z-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-4 max-w-5xl mx-auto items-center">
            
            <div className="flex items-center gap-4 justify-center md:justify-start">
              <div className="w-12 h-12 rounded-full border border-[#e8e6e1] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center flex-shrink-0 shadow-sm">
                 <Gauge className="w-5 h-5 text-[#1c1c1a] dark:text-slate-300" />
              </div>
              <div className="flex flex-col">
                 <span className="text-xl md:text-2xl font-serif font-medium text-[#1c1c1a] dark:text-white">99.9% Uptime</span>
                 <span className="text-[#73726f] dark:text-slate-400 text-sm">Guaranteed Reliability</span>
              </div>
            </div>

            <div className="flex items-center gap-4 justify-center md:justify-center px-4 md:border-l md:border-r border-[#e8e6e1] dark:border-slate-800/60">
              <div className="w-12 h-12 rounded-full border border-[#e8e6e1] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center flex-shrink-0 shadow-sm">
                 <ShieldCheck className="w-5 h-5 text-[#1c1c1a] dark:text-slate-300" />
              </div>
              <div className="flex flex-col">
                 <span className="text-xl md:text-2xl font-serif font-medium text-[#1c1c1a] dark:text-white">SOC-2 Compliant</span>
                 <span className="text-[#73726f] dark:text-slate-400 text-sm">Enterprise-Grade Security</span>
              </div>
            </div>

            <div className="flex items-center gap-4 justify-center md:justify-end">
              <div className="w-12 h-12 rounded-full border border-[#e8e6e1] dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center flex-shrink-0 shadow-sm">
                 <Users className="w-5 h-5 text-[#1c1c1a] dark:text-slate-300" />
              </div>
              <div className="flex flex-col">
                 <span className="text-xl md:text-2xl font-serif font-medium text-[#1c1c1a] dark:text-white">100k+ Users</span>
                 <span className="text-[#73726f] dark:text-slate-400 text-sm">Trusted globally</span>
              </div>
            </div>

          </div>
        </div>

      </main>
    </div>
  );
}
