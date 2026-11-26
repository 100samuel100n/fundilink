'use client';
import React, { createContext, useCallback, useContext, useState } from 'react';

type Toast = { id: number; msg: string; tone: 'ok' | 'err' };
const Ctx = createContext<{ ok: (m: string) => void; err: (m: string) => void }>({ ok() {}, err() {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, tone: Toast['tone']) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, msg, tone }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <Ctx.Provider value={{ ok: (m) => push(m, 'ok'), err: (m) => push(m, 'err') }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => <div key={t.id} className={`toast ${t.tone}`}>{t.msg}</div>)}
      </div>
    </Ctx.Provider>
  );
}
