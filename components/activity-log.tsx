import { format, formatDistanceToNow } from "date-fns";
import type { ActivityLogWithUser } from "@/types";

type ActivityLogProps = {
  entries: ActivityLogWithUser[];
};

/**
 * Vertical timeline for audit entries — newest first (caller should sort).
 */
export function ActivityLog({ entries }: ActivityLogProps) {
  if (!entries.length) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-pretty">
        Nothing to show yet. As people update tasks and cases, you’ll see a timeline here.
      </p>
    );
  }

  return (
    <ol className="relative border-s border-border/80 ms-2 space-y-6 py-2 pe-1 sm:ms-3">
      {entries.map((log) => {
        const who = log.user?.name ?? log.user?.email ?? "System";
        const at = new Date(log.created_at);
        const when = formatDistanceToNow(at, { addSuffix: true });
        const absolute = format(at, "PPpp");
        return (
          <li key={log.id} className="ms-4 min-w-0 sm:ms-6">
            <span className="absolute -start-1.5 mt-1.5 flex size-3 rounded-full border border-background bg-primary" />
            <div className="flex min-w-0 flex-wrap items-baseline gap-2">
              <span className="break-words text-sm font-medium">{log.action}</span>
              <span className="text-xs text-muted-foreground" title={absolute}>
                {who} · {when}
              </span>
            </div>
            {(log.old_value || log.new_value) && (
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {log.old_value && log.new_value && (
                  <>
                    <span className="line-through opacity-70">{log.old_value}</span>
                    {" → "}
                    <span>{log.new_value}</span>
                  </>
                )}
                {!log.old_value && log.new_value && <span>{log.new_value}</span>}
                {log.old_value && !log.new_value && (
                  <span className="line-through opacity-70">{log.old_value}</span>
                )}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
