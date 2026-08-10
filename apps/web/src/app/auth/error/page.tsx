import Link from 'next/link';

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="surface w-full max-w-sm rounded-[20px] p-6" style={{ background: 'var(--surface)' }}>
        <h1 className="display-face text-xl font-bold">Sign-in link didn&apos;t work</h1>
        <p className="mt-2 text-sm ink-2">
          {reason === 'missing_code'
            ? 'That link was incomplete. Links expire after an hour and can only be used once.'
            : (reason ?? 'Something went wrong.')}
        </p>
        <Link href="/sign-in" className="mt-4 inline-block text-sm underline">
          Request a new link
        </Link>
      </div>
    </div>
  );
}
