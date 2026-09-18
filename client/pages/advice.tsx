import type { ReactNode } from 'react';

/** One advisory list (strengths / improvements / recommendations), shared by
 *  the submission reviewer and the career coach sections. */
export function AdviceList({ title, items }: { title: string; items: ReactNode[] | string[] }) {
  return (
    <div className="advice-block">
      <h4>{title}</h4>
      <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul>
    </div>
  );
}
