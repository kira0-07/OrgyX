import { MarketingNavbar } from '@/components/layout/MarketingNavbar';
import { Network, Database, ShieldCheck } from 'lucide-react';

export default function ProductPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNavbar />
      <div className="container mx-auto px-6 py-24 max-w-5xl">
        <div className="text-center mb-20">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              The Architecture of Performance
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Team Catalyst isn't just software. It is a foundational layer for your entire organization, built on enterprise-grade infrastructure.
            </p>
        </div>

        <div className="space-y-24">
            <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                   <h2 className="text-3xl font-bold tracking-tight mb-4">Neural Data Graph</h2>
                   <p className="text-lg text-muted-foreground mb-6">
                     Our proprietary relational database connects every sprint, meeting, and message into a single source of truth. Stop querying structured tables and start understanding the context of your company.
                   </p>
                   <ul className="space-y-3">
                       <li className="flex items-center gap-3"><Network className="w-5 h-5 text-primary"/> Graph-based indexing</li>
                       <li className="flex items-center gap-3"><Database className="w-5 h-5 text-primary"/> Zero-latency state synchronization</li>
                   </ul>
                </div>
                <div className="aspect-video bg-surface-container rounded-2xl border border-white/10 flex items-center justify-center relative overflow-hidden">
                   <div className="absolute inset-0 bg-primary/5"></div>
                   <div className="text-muted-foreground blur-[1px]">Data Graph Visualizer</div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
                <div className="order-2 md:order-1 aspect-video bg-surface-container rounded-2xl border border-white/10 flex items-center justify-center relative overflow-hidden">
                   <div className="absolute inset-0 bg-primary/5"></div>
                   <div className="text-muted-foreground blur-[1px]">IAM Gateway Interface</div>
                </div>
                <div className="order-1 md:order-2">
                   <h2 className="text-3xl font-bold tracking-tight mb-4">Zero Trust Gateway</h2>
                   <p className="text-lg text-muted-foreground mb-6">
                     Security is not an afterthought; it is our foundation. Team Catalyst uses a Zero Trust IAM architecture ensuring that only authenticated devices and personnel can access your mission-critical pipelines.
                   </p>
                   <ul className="space-y-3">
                       <li className="flex items-center gap-3"><ShieldCheck className="w-5 h-5 text-primary"/> Native SSO/SAML Integration</li>
                       <li className="flex items-center gap-3"><ShieldCheck className="w-5 h-5 text-primary"/> End-to-End Encryption</li>
                   </ul>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
}
