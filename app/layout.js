import './globals.css';
import { getSession } from '@/lib/auth';
import Nav from '@/components/Nav';

export const metadata = { title: 'SpendSense', description: 'Track spending, set budgets, get alerted before you overspend.' };

export default async function RootLayout({ children }) {
  const session = await getSession();
  return (
    <html lang="en">
      <body>
        {session ? (
          <div className="shell">
            <Nav user={session} />
            <main>{children}</main>
          </div>
        ) : (
          children
        )}
      </body>
    </html>
  );
}
