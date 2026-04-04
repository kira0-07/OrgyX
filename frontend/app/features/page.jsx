import { MarketingNavbar } from '@/components/layout/MarketingNavbar';

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNavbar />
      <div className="container mx-auto px-6 py-24 max-w-5xl text-center">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          Enterprise Features
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-16">
          Precision tools designed for scale. Explore the core systems that power the most demanding organizations.
        </p>
        
        <div className="grid md:grid-cols-2 gap-8 text-left">
          <div className="p-8 rounded-2xl border border-white/10 bg-surface/50 backdrop-blur-md">
             <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6">
                <span className="text-primary font-bold text-xl">01</span>
             </div>
             <h3 className="text-2xl font-bold mb-3">Meeting Analytics</h3>
             <p className="text-muted-foreground leading-relaxed">
               Quantify team engagement with granular metrics. Track talk time, decision frequency, and action item completion cross-referenced against business objectives.
             </p>
          </div>
          
          <div className="p-8 rounded-2xl border border-white/10 bg-surface/50 backdrop-blur-md">
             <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6">
                <span className="text-primary font-bold text-xl">02</span>
             </div>
             <h3 className="text-2xl font-bold mb-3">Predictive Sprints</h3>
             <p className="text-muted-foreground leading-relaxed">
               Leverage AI to forecast sprint velocity. Our machine learning models analyze historical Jira and GitHub data to accurately predict project delivery timelines.
             </p>
          </div>
          
          <div className="p-8 rounded-2xl border border-white/10 bg-surface/50 backdrop-blur-md">
             <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6">
                <span className="text-primary font-bold text-xl">03</span>
             </div>
             <h3 className="text-2xl font-bold mb-3">Resource Allocation</h3>
             <p className="text-muted-foreground leading-relaxed">
               Intelligently distribute workload across engineering and product teams to prevent burnout while maximizing output.
             </p>
          </div>
          
          <div className="p-8 rounded-2xl border border-white/10 bg-surface/50 backdrop-blur-md">
             <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center mb-6">
                <span className="text-primary font-bold text-xl">04</span>
             </div>
             <h3 className="text-2xl font-bold mb-3">Audit & Compliance</h3>
             <p className="text-muted-foreground leading-relaxed">
               Maintain absolute control over your data with detailed access logs, role-based permissions, and out-of-the-box SOC-2 compliance reporting.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
