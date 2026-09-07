import '../styles.css';
import './portal.css';
export const metadata = { title: 'Water Control and Management', description: 'Weekly water checks and temperature inspection records' };
export default function RootLayout({ children }) {
  // Browser extensions can inject inline styles on html before hydration.
  // Limit suppression to this element; child mismatches still surface.
  return <html lang="en-GB" suppressHydrationWarning><body><div className="topline" />{children}</body></html>;
}
