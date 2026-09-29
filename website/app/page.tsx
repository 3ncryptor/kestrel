import { SITE } from '@/lib/site';

export default function Home() {
    return (
        <section className="mx-auto max-w-6xl px-6 pt-40 pb-24">
            <h1 className="font-semibold text-5xl text-k-text tracking-tight">htop and pm2, in one terminal app.</h1>
            <p className="mt-6 max-w-2xl text-lg">{SITE.tagline}</p>
        </section>
    );
}
