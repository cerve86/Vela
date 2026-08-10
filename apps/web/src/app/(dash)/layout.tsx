import { Sidebar } from '@/components/Sidebar';

/** Dashboard shell. Auth routes sit outside this group so they render without the nav. */
export default function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-x-hidden">{children}</main>
    </div>
  );
}
