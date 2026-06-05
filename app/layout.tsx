import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'Kumon Brookswood — Parent Portal',
  description: 'Book and manage your child\'s Kumon sessions at Kumon Brookswood Learning Centre.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
      </body>
    </html>
  )
}
