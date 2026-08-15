import { EmptyState } from '@/components/ui';

export const metadata = { title: 'Messages — Vela' };

export default function MessagesPage() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="mt-0.5 text-sm ink-2">Direct threads with each client</p>
      </header>
      <EmptyState
        art="welcome"
        title="Messaging — Phase 7"
        body="Realtime 1:1 threads with unread counts, image attachments and push notification delivery. Deliberately late in the build: it is the easiest piece to replace with WhatsApp until the training loop is proven."
      />
    </div>
  );
}
