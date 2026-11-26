'use client';
import React from 'react';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/lib/toast';
import { CompareProvider } from './Compare';

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider><ToastProvider><CompareProvider>{children}</CompareProvider></ToastProvider></AuthProvider>;
}
