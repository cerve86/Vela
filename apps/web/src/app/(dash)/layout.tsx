import { Sidebar } from '@/components/Sidebar';

/** Dashboard shell. Auth routes sit outside this group so they render without the nav. */
export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
