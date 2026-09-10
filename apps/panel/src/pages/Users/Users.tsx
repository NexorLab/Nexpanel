import "./Users.css";

interface User {
  username: string;
  status: "Active" | "Disabled";
  backend: string;
  created: string;
}

const users: User[] = [
  {
    username: "admin",
    status: "Active",
    backend: "Primary",
    created: "Today",
  },
  {
    username: "demo",
    status: "Active",
    backend: "Secondary",
    created: "Today",
  },
  {
    username: "test-user",
    status: "Disabled",
    backend: "—",
    created: "Yesterday",
  },
];

export default function Users() {
  return (
    <section className="users-page">
      <div className="users-header">
        <div>
          <h2>Users</h2>
          <p>Manage NexPanel users.</p>
        </div>

        <button type="button" className="add-user-button">
          + Add User
        </button>
      </div>

      <div className="users-table-card">
        <div className="users-toolbar">
          <input
            type="search"
            placeholder="Search users..."
            aria-label="Search users"
          />
        </div>

        <div className="users-table-wrapper">
          <table className="users-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Status</th>
                <th>Backend</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {users.map((user) => (
                <tr key={user.username}>
                  <td>{user.username}</td>
                  <td>
                    <span
                      className={`user-status user-status-${user.status.toLowerCase()}`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td>{user.backend}</td>
                  <td>{user.created}</td>
                  <td>
                    <button type="button" className="action-button">
                      Manage
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}