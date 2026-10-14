type Task = Record<string, any>;
type User = {id:string; name:string; username?:string};
const normalized = (value:unknown) => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function canUseBoatTask(task:Task,user:User,role:string):boolean {
  if(role==='lector') return true;
  if(task.assignedRole && task.assignedRole!==role) return false;
  return !task.assignee || [user.id,user.name,user.username,role].some(value=>normalized(value)===normalized(task.assignee));
}
// A crew submission only contains its visible tasks. Preserve all hidden tasks,
// and allow progress updates, never reassignment, deletion or new tasks.
export function mergeCrewTasks(before:Task[],incoming:Task[],user:User,role:string):Task[] {
  const updates = new Map(incoming.map(t=>[t.id,t]));
  const visible = before.filter(t=>canUseBoatTask(t,user,role));
  if(updates.size!==visible.length || visible.some(t=>!updates.has(t.id))) throw new Error('Solo administración puede crear, eliminar o reasignar tareas.');
  const progress = new Set(['done','lastCompleted','nextDate','nextHours']);
  return before.map(task=>{
    if(!canUseBoatTask(task,user,role)) return task;
    const update=updates.get(task.id)!;
    for(const key of Array.from(new Set([...Object.keys(task),...Object.keys(update)]))) {
      if(!progress.has(key) && JSON.stringify(task[key])!==JSON.stringify(update[key])) throw new Error('Solo administración puede modificar la asignación o las instrucciones de una tarea.');
    }
    return {...task,...update};
  });
}
