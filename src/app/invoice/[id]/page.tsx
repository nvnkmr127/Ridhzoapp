import { notFound, redirect } from "next/navigation";
import { requireOrg, hasPermission, isSuperAdmin } from "@/lib/rbac";
import { InvoiceService } from "@/domains/billing/invoiceService";
import { PrintButton } from "./PrintButton";

// Printable GST tax invoice. Outside the dashboard layout so the printed page is just the invoice;
// "Download PDF" is the browser's print → Save as PDF.
// ponytail: browser print instead of a PDF library; add server-side PDF if invoices must be attached to email.
export const dynamic = "force-dynamic";

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireOrg();
  if (!(await hasPermission("billing.manage"))) redirect("/leads");
  const inv = await InvoiceService.getInvoice(id);
  // Other tenants' invoices look exactly like missing ones.
  if (!inv || (inv.orgId !== organizationId && !(await isSuperAdmin()))) notFound();

  const supplier = {
    name: process.env.GST_SUPPLIER_NAME || "Ridhzo",
    gstin: process.env.GST_SUPPLIER_GSTIN || null,
    address: process.env.GST_SUPPLIER_ADDRESS || null,
  };
  const isCredit = inv.type === "credit_note";
  const rows: [string, number][] = [
    ...(inv.cgst ? ([[`CGST @ ${inv.taxRate / 2}%`, inv.cgst], [`SGST @ ${inv.taxRate / 2}%`, inv.sgst ?? 0]] as [string, number][]) : []),
    ...(inv.igst ? ([[`IGST @ ${inv.taxRate}%`, inv.igst]] as [string, number][]) : []),
  ];

  return (
    <div className="min-h-screen bg-muted/40 py-8 print:bg-white print:py-0">
      <div className="mx-auto max-w-3xl px-4 mb-4 flex justify-end print:hidden">
        <PrintButton />
      </div>
      <article className="mx-auto max-w-3xl bg-white text-black p-8 sm:p-10 rounded-xl border print:border-0 print:rounded-none space-y-8 text-sm">
        <header className="flex flex-wrap justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold">{isCredit ? "Credit Note" : "Tax Invoice"}</h1>
            <p className="font-mono mt-1">{inv.invoiceNumber}</p>
            {inv.status === "void" && <p className="mt-1 font-semibold text-red-600">VOID</p>}
          </div>
          <div className="text-right">
            <p className="font-semibold">{supplier.name}</p>
            {supplier.address && <p className="whitespace-pre-line text-neutral-600">{supplier.address}</p>}
            {supplier.gstin && <p>GSTIN: <span className="font-mono">{supplier.gstin}</span></p>}
          </div>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-neutral-500">Billed to</p>
            <p className="font-semibold">{inv.buyerName || inv.orgName}</p>
            {inv.gstin && <p>GSTIN: <span className="font-mono">{inv.gstin}</span></p>}
            {inv.placeOfSupply && <p>Place of supply: state code {inv.placeOfSupply}</p>}
          </div>
          <div className="sm:text-right space-y-0.5">
            <p>Date: {day(inv.issuedAt)}</p>
            <p>Period: {day(inv.periodStart)} – {day(inv.periodEnd)}</p>
            {inv.paidAt && <p>Paid: {day(inv.paidAt)}</p>}
            {inv.paymentId && <p className="text-neutral-500">Payment ref: {inv.paymentId}</p>}
          </div>
        </section>

        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 font-medium">Description</th>
              <th className="py-2 font-medium">SAC</th>
              <th className="py-2 font-medium text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b">
              <td className="py-2">Ridhzo subscription — {inv.plan} plan</td>
              <td className="py-2">{inv.sacCode}</td>
              <td className="py-2 text-right tabular-nums">{inr(inv.amount)}</td>
            </tr>
          </tbody>
          <tfoot className="tabular-nums">
            <tr><td colSpan={2} className="pt-3 text-right">Taxable value</td><td className="pt-3 text-right">{inr(inv.amount)}</td></tr>
            {rows.map(([label, n]) => (
              <tr key={label}><td colSpan={2} className="text-right">{label}</td><td className="text-right">{inr(n)}</td></tr>
            ))}
            <tr className="font-bold text-base"><td colSpan={2} className="pt-2 text-right">Total</td><td className="pt-2 text-right">{inr(inv.totalAmount)}</td></tr>
          </tfoot>
        </table>

        <footer className="text-xs text-neutral-500">This is a computer-generated invoice and needs no signature.</footer>
      </article>
    </div>
  );
}
