import path from 'node:path';
import type { NextConfig } from 'next';

// The site is its own project (website/bun.lock); the repository root has the product's lockfile.
const ROOT = path.resolve(__dirname);

// Security headers for every route (website/README.md explains the CSP). Nothing on the site loads from
// another origin: fonts are self-hosted, and there are no analytics, embeds or third-party scripts.
const CSP = [
    "default-src 'self'",
    // Statically prerendered Next pages bootstrap with inline scripts; nonces would force dynamic rendering.
    // The site has no user input, auth, cookies or third-party code, so 'unsafe-inline' adds no real risk.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
    { key: 'Content-Security-Policy', value: CSP },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'X-Frame-Options', value: 'DENY' },
    {
        key: 'Permissions-Policy',
        value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=(), interest-cohort=()',
    },
];

const config: NextConfig = {
    reactStrictMode: true,
    turbopack: { root: ROOT },
    outputFileTracingRoot: ROOT,
    poweredByHeader: false,
    typedRoutes: true,
    images: { unoptimized: true },
    async headers() {
        return [
            { source: '/:path*', headers: SECURITY_HEADERS },
            { source: '/fonts/:file*', headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }] },
        ];
    },
};

export default config;
