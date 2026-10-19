import { requireUser } from "@/lib/session";
import { shortDate } from "@/lib/format";
import { markNotificationsRead } from "./actions";

export const metadata = { title: "Notifications | Monifyd" };

export default async function NotificationsPage() {
  const { user, supabase } = await requireUser();
  const { data, error } = await supabase.from("notifications")
    .select("id,type,body,read_at,created_at").eq("merchant_id", user.id)
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`Could not load notifications: ${error.message}`);
  const unread = (data ?? []).some((notification) => !notification.read_at);
  return (
    <>
      <div className="head"><h1>Notifications</h1>
        {unread && <form action={markNotificationsRead}><button className="btn btn-sm">Mark all as read</button></form>}
      </div>
      <section className="card">
        {(data ?? []).length === 0 ? <p className="empty">No notifications yet.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Notification</th><th>Type</th><th>Received</th><th>Read</th></tr></thead><tbody>
            {(data ?? []).map((notification) => (
              <tr key={notification.id}><td>{notification.body}</td><td>{notification.type}</td>
                <td>{shortDate(notification.created_at)}</td><td>{notification.read_at ? "Read" : "Unread"}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </section>
    </>
  );
}
