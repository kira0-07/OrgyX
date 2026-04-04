import { MarketingNavbar } from '@/components/layout/MarketingNavbar';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import Link from 'next/link';

export default function PricingPage() {
   return (
      <div className="min-h-screen bg-background text-foreground">
         <MarketingNavbar />
         <div className="container mx-auto px-6 py-24 max-w-5xl text-center">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
               Enterprise Licensing
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-16">
               Predictable, scalable pricing for organizations that demand elite performance. No hidden fees.
            </p>

            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto text-left">
               {/* Professional Tier */}
               <div className="p-8 rounded-3xl border border-white/10 bg-surface/40 flex flex-col h-full">
                  <h3 className="text-2xl font-bold text-foreground">Professional</h3>
                  <p className="text-muted-foreground mt-2">For scaling mid-market teams.</p>

                  <div className="mt-8 mb-8">
                     <span className="text-5xl font-bold tracking-tight">$999</span>
                     <span className="text-muted-foreground">/user/mo</span>
                  </div>

                  <div className="space-y-4 mb-8 flex-1">
                     <div className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">Unlimited Workspaces & Sprints</span>
                     </div>
                     <div className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">Advanced Meeting Analytics</span>
                     </div>
                     <div className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">Standard SLA (99%)</span>
                     </div>
                     <div className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">Email & Chat Support</span>
                     </div>
                  </div>

                  <Link href="/login" className="w-full">
                     <Button className="w-full text-lg h-12 bg-white text-black hover:bg-neutral-200" variant="secondary">
                        Purchase License
                     </Button>
                  </Link>
               </div>

               {/* Enterprise Tier */}
               <div className="p-8 rounded-3xl border-2 border-primary/50 bg-primary/5 flex flex-col h-full relative">
                  <div className="absolute top-0 right-8 -translate-y-1/2 bg-primary text-primary-foreground px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                     Recommended
                  </div>

                  <h3 className="text-2xl font-bold text-foreground">Enterprise</h3>
                  <p className="text-muted-foreground mt-2">For multi-national operations.</p>

                  <div className="mt-8 mb-8">
                     <span className="text-5xl font-bold tracking-tight">Custom</span>
                  </div>

                  <div className="space-y-4 mb-8 flex-1">
                     <div className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">Everything in Professional</span>
                     </div>
                     <div className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">Dedicated Solutions Engineer</span>
                     </div>
                     <div className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">Enterprise SLA (99.99%)</span>
                     </div>
                     <div className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">Custom SAML & SSO Config</span>
                     </div>
                     <div className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <span className="text-sm font-medium">Self-Hosted / VPC Options</span>
                     </div>
                  </div>

                  <Link href="/contact" className="w-full">
                     <Button className="w-full text-lg h-12 bg-primary text-primary-foreground hover:bg-primary/90">
                        Contact Sales
                     </Button>
                  </Link>
               </div>
            </div>
         </div>
      </div>
   );
}
