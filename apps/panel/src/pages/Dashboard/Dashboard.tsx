
import "./Dashboard.css";

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: string;
}

function StatCard({
  title,
  value,
  description,
  icon,
}: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <div className="stat-card-icon">{icon}</div>
        <span className="stat-card-title">{title}</span>
      </div>

      <div className="stat-card-value">{value}</div>

      <div className="stat-card-description">{description}</div>
    </div>
  );
}

function Dashboard() {
  return (
    <div className="dashboard-page">
      <div className="dashboard-intro">
        <div>
          <h2>NexPanel Dashboard</h2>
          <p>Welcome back to NexPanel.</p>
        </div>

      </div>

      <section className="stats-grid">
        <StatCard
          title="Users"
          value="0"
          description="Total registered users"
          icon="👥"
        />

        <StatCard
          title="Backends"
          value="0"
          description="Configured backends"
          icon="🔌"
        />

        <StatCard
          title="Configs"
          value="0"
          description="Generated configurations"
          icon="⚙️"
        />

        <StatCard
          title="Subscriptions"
          value="0"
          description="Active subscriptions"
          icon="🔗"
        />
      </section>

      <section className="system-status-card">
        <div className="system-status-content">
          <div className="system-status-icon">✓</div>

          <div>
            <h3>System Status</h3>
            <p>All NexPanel services are currently operational.</p>
          </div>
        </div>

        <span className="system-status-badge">
          <span className="status-dot" />
          Operational
        </span>
      </section>
    </div>
  );
}

export default Dashboard;
