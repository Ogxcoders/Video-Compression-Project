import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Video Compression Admin',
  description: 'Admin dashboard for video compression queue management',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
