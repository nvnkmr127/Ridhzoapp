import Script from "next/script";

// GA4 for the superadmin console only (/admin/**). No-op until NEXT_PUBLIC_GA_MEASUREMENT_ID is set.
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {GA_ID && /^G-[A-Z0-9]+$/.test(GA_ID) && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-admin" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');`}
          </Script>
        </>
      )}
      {children}
    </>
  );
}
