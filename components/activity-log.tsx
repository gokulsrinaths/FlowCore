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
      <p className="text-sm text-muted-foreground py-4">
        No activity yet.
      </p>
    );
  }

  return (
    <ol className="relative border-s border-border/80 ms-3 space-y-6 py-2">
      {entries.map((log) => {
        const who = log.user?.name ?? log.user?.email ?? "System";
        const at = new Date(log.created_at);
        const when = formatDistanceToNow(at, { addSuffix: true });
        const absolute = format(at, "PPpp");
        return (
          <li key={log.id} className="ms-6">
            <span className="absolute -start-1.5 mt-1.5 flex size-3 rounded-full border border-background bg-primary" />
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">{log.action}</span>
              <span className="text-xs text-muted-foreground" title={absolute}>
                {who} · {when}
              </span>
            </div>
            {(log.old_value || log.new_value) && (
              <p className="text-sm text-muted-foreground mt-1">
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
