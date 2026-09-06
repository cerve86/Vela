import { VelaMark } from '@/components/VelaMark';
import { WelcomeForm } from './WelcomeForm';

export const metadata = { title: 'Welcome — Vela' };

/**
 * /welcome — where an invitation, or a "forgot password" email, lands.
 *
 * One page for both because they ask the same thing: choose a password. The link that
 * brought her here already proved she owns the address, so nothing else is asked. When
 * an invitation is waiting for her it is accepted here too, and the next thing she does
 * is open the app and sign in.
 */
export default function WelcomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <VelaMark size={36} radius={16} />
          <span className="display-face text-lg font-bold">Vela</span>
        </div>
        <WelcomeForm />
      </div>
    </div>
  );
}
