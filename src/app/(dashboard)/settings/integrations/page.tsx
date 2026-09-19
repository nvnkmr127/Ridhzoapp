import Link from "next/link";
import { ArrowLeft, Calendar, MessageCircle, Megaphone, CreditCard, Bell, Webhook, Sparkles, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg } from "@/lib/rbac";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { GoogleCalendarService } from "@/domains/integrations/googleCalendarService";
import { isConfigured as googleConfigured } from "@/lib/integrations/google";
import { isConfigured as whatsappConfigured } from "@/lib/messaging/whatsapp/client";
import { isConfigured as razorpayConfigured } from "@/lib/billing/razorpay";
import { IntegrationCard } from "@/components/settings/IntegrationCard";
import { GoogleConnectButton } from "@/components/settings/GoogleConnectButton";
import { EnablePushButton } from "@/components/layout/EnablePushButton";
import { TenantIntegrationsService } from "@/domains/organizations/tenantIntegrationsService";
import { Suspense } from "react";
import { IntegrationStatusToast } from "@/components/settings/IntegrationStatusToast";

function ManageLink({ href, label = "Manage" }: { href: string; label?: string }) {
  return <Button asChild variant="outline" size="sm"><Link href={href}>{label}</Link></Button>;
}

export default async function IntegrationsPage() {
  const { organizationId } = await requireOrg();
  const session = await getServerSession(authOptions); // cheap JWT decode, no DB
  const [leadIntel, googleConnected] = await Promise.all([
    TenantIntegrationsService.getView(organizationId),
    session?.user?.id ? GoogleCalendarService.isConnected(session.user.id) : Promise.resolve(false),
  ]);
  const leadIntelOn = leadIntel.enrichmentEnabled || leadIntel.inboundEmailEnabled;

  const facebookConfigured = Boolean(process.env.NEXT_PUBLIC_FACEBOOK_APP_ID);
  const pushConfigured = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const gcfg = googleConfigured();
  const wa = whatsappConfigured();
  const rzp = razorpayConfigured();

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-5xl">
      <Suspense fallback={null}>
        <IntegrationStatusToast />
      </Suspense>
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Integrations</h2>
          <p className="text-sm text-muted-foreground">Connect external services to capture leads, message clients, take payments, and sync your calendar.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <IntegrationCard
          name="WhatsApp Business API"
          description="Send templates, sequences, and campaigns to leads through the official WhatsApp Business API."
          icon={<MessageCircle className="h-5 w-5 text-emerald-500" />}
          status={wa ? "configured" : "unconfigured"}
          action={<ManageLink href="/settings/sources" />}
          docsHint="Set WATXIO_BASE_URL, WATXIO_API_KEY, WATXIO_PHONE_NUMBER_ID"
        />

        <IntegrationCard
          name="Facebook Lead Ads"
          description="Pull new leads instantly from your Meta lead ad forms into your pipeline."
          icon={<Megaphone className="h-5 w-5 text-blue-600" />}
          status={facebookConfigured ? "configured" : "unconfigured"}
          action={<ManageLink href="/settings/sources" label="Connect" />}
          docsHint="Set NEXT_PUBLIC_FACEBOOK_APP_ID + FACEBOOK_APP_SECRET"
        />

        <IntegrationCard
          name="Lead Source Webhooks"
          description="Receive leads from your website forms or any external service via signed webhooks."
          icon={<Webhook className="h-5 w-5 text-violet-500" />}
          status="configured"
          action={<ManageLink href="/settings/sources" />}
        />

        <IntegrationCard
          name="Google Calendar"
          description="Booking requests create events on your calendar automatically."
          icon={<Calendar className="h-5 w-5 text-sky-500" />}
          status={googleConnected ? "connected" : gcfg ? "configured" : "unconfigured"}
          action={<GoogleConnectButton connected={googleConnected} configured={gcfg} />}
          docsHint="Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI"
        />

        <IntegrationCard
          name="Payments (Razorpay)"
          description="Collect subscription payments and manage billing for your plan."
          icon={<CreditCard className="h-5 w-5 text-indigo-500" />}
          status={rzp ? "configured" : "unconfigured"}
          action={<ManageLink href="/settings/billing" />}
          docsHint="Set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET"
        />

        <IntegrationCard
          name="Web Push Notifications"
          description="Get instant browser alerts on this device when new leads arrive or follow-ups are due."
          icon={<Bell className="h-5 w-5 text-amber-500" />}
          status={pushConfigured ? "configured" : "unconfigured"}
          action={pushConfigured ? <EnablePushButton mode="button" allowTest /> : undefined}
          docsHint="Set NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY"
        />

        <IntegrationCard
          name="PWA Mobile App"
          description="Install Ridhzo directly onto iPhone or Android for a standalone mobile app experience with home-screen launch."
          icon={<Smartphone className="h-5 w-5 text-emerald-500" />}
          status="configured"
          action={<ManageLink href="/" label="Open PWA" />}
        />

        <IntegrationCard
          name="Lead Intelligence"
          description="Enrich new leads from your own data provider and pull inbound email onto the lead timeline."
          icon={<Sparkles className="h-5 w-5 text-violet-500" />}
          status={leadIntelOn ? "configured" : "unconfigured"}
          action={<ManageLink href="/settings/lead-intelligence" />}
        />
      </div>
    </div>
  );
}
