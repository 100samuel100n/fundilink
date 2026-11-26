'use client';
import React from 'react';
import { useAsync } from '@/lib/hooks';
import { Async, PageTitle } from '@/components/ui';
import { Col, DataTable } from '@/components/DataTable';

/** Generic "title + loader + table" screen used by most admin sections. `render` lets a page add forms above the table. */
export function ListPage<R extends { id?: string | number }>({ title, sub, load, cols, empty, header }: {
  title: string; sub?: string; load: () => Promise<R[]>; cols: (reload: () => void) => Col<R>[]; empty?: string;
  header?: (reload: () => void) => React.ReactNode;
}) {
  const s = useAsync(load);
  return (
    <><PageTitle title={title} sub={sub} />
      {header?.(s.reload)}
      <Async state={s}>{(rows) => <DataTable rows={rows} empty={empty} cols={cols(s.reload)} />}</Async></>
  );
}
