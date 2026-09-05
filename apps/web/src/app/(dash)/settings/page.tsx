import { Card } from '@/components/ui';
import { loadApiKeys } from './actions';
import { ApiKeys } from './ApiKeys';

export const metadata = { title: 'Settings — Vela' };

export default async function SettingsPage() {
  const keys = await loadApiKeys();

  return (
    <div className="mx-auto max-w-4xl p-8">
      <header className="mb-6">
        <h1 className="text-[30px] font-extrabold">Settings</h1>
        <p className="mt-0.5 text-sm ink-2">Tools that act as you, and the keys that let them.</p>
      </header>

      <Card title="API keys">
        <p className="mb-4 text-sm ink-2">
          A key lets a tool — Claude with the Vela extension, a script, a spreadsheet pipeline —
          read your library and create programmes in your account. It can do what you can do in
          Programmes and nothing else: a programme it creates is not assigned to anyone until you
          assign it. Revoke a key the moment you stop using it.
        </p>
        <ApiKeys keys={keys} />
      </Card>
    </div>
  );
}
