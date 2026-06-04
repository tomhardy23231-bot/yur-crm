import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getT } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t.auth.forbidden.metaTitle };
}

export default async function ForbiddenPage() {
  const { t } = await getT();
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex max-w-md flex-col gap-5 text-center">
        <h1 className="text-[28px] leading-[1.2] tracking-[-0.015em] font-bold text-text">
          {t.auth.forbidden.title}
        </h1>
        <p className="text-[14px] text-text-muted leading-[1.55]">
          {t.auth.forbidden.message}
        </p>
        <Button asChild variant="secondary" className="mx-auto mt-2">
          <Link href="/">{t.auth.forbidden.backHome}</Link>
        </Button>
      </div>
    </div>
  );
}
