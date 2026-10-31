import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: todos } = await supabase.from('todos').select();

  return (
    <div className="p-8 font-sans max-w-xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">Supabase Cloud SSR Verification</h1>
      <p className="text-xs text-neutral-500">Connected to https://tnhrkjtujdfgvwhsuuxb.supabase.co</p>
      <ul className="space-y-2">
        {todos && todos.length > 0 ? (
          todos.map((todo: any) => (
            <li key={todo.id} className="p-3 border rounded-xl bg-card">
              {todo.name || todo.title || JSON.stringify(todo)}
            </li>
          ))
        ) : (
          <li className="text-xs text-neutral-400">
            No items found in 'todos' table yet. Connection established successfully.
          </li>
        )}
      </ul>
    </div>
  );
}
