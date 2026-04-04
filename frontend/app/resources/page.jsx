import { MarketingNavbar } from '@/components/layout/MarketingNavbar';
import { FileText, Code, PlayCircle } from 'lucide-react';
import Link from 'next/link';

export default function ResourcesPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingNavbar />
      <div className="container mx-auto px-6 py-24 max-w-5xl">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-center mb-6">
          Resource Center
        </h1>
        <p className="text-xl text-muted-foreground text-center max-w-2xl mx-auto mb-16">
          Everything you need to successfully deploy, migrate, and scale your organization on Team Catalyst.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
            <Link href="#" className="group p-8 rounded-2xl border border-white/10 bg-surface/30 hover:bg-surface/60 transition-colors">
                <FileText className="w-10 h-10 text-primary mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold mb-2">Documentation</h3>
                <p className="text-muted-foreground">Comprehensive guides on setting up your workspaces, sprints, and permissions.</p>
            </Link>
            
            <Link href="#" className="group p-8 rounded-2xl border border-white/10 bg-surface/30 hover:bg-surface/60 transition-colors">
                <Code className="w-10 h-10 text-primary mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold mb-2">API Reference</h3>
                <p className="text-muted-foreground">Integrate your internal tools directly into the Catalyst ecosystem via our GraphQL API.</p>
            </Link>

            <Link href="#" className="group p-8 rounded-2xl border border-white/10 bg-surface/30 hover:bg-surface/60 transition-colors">
                <PlayCircle className="w-10 h-10 text-primary mb-6 group-hover:scale-110 transition-transform" />
                <h3 className="text-xl font-bold mb-2">Webinars</h3>
                <p className="text-muted-foreground">On-demand video sessions with our solutions engineering team.</p>
            </Link>
        </div>
      </div>
    </div>
  );
}
