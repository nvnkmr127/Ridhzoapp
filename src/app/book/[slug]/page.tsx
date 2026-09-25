import { BookingService } from "@/domains/booking/service";
import { BookingForm } from "@/components/booking/BookingForm";
import { notFound } from "next/navigation";

export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const org = await BookingService.getOrgBySlug(slug);
  if (!org) notFound();

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-muted">
      <div className="w-full max-w-md border rounded-2xl bg-card p-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Book a meeting with {org.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">Pick a time and we&apos;ll get back to you to confirm.</p>
          {(org.addressLine1 || org.city || org.phone) && (
            <div className="mt-3 space-y-0.5 text-sm text-muted-foreground">
              {(org.addressLine1 || org.city) && <p>📍 {[org.addressLine1, org.city].filter(Boolean).join(", ")}</p>}
              {org.phone && <p>📞 <a href={`tel:${org.phone.replace(/[^\d+]/g, "")}`} className="underline underline-offset-2">{org.phone}</a></p>}
            </div>
          )}
        </div>
        <BookingForm slug={slug} />
      </div>
    </div>
  );
}
