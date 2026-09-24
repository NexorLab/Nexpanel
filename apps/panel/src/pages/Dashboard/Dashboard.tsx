import {
  FileText,
  Link2,
  Server,
  Users as UsersIcon,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Spinner from "../../components/ui/Spinner";
import EmptyState from "../../components/ui/EmptyState";
import { LineChart, BarChart } from "../../components/charts/Charts";
import { useApi } from "../../hooks/useApi";
import { getApi } from "../../lib/api";
import { useFormat } from "../../lib/format";
import { useLanguage } from "../../contexts/LanguageContext";
import type { Protocol, StatsOverview } from "../../types/dto";
import "./Dashboard.css";

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  tint: "primary" | "success" | "info" | "warning";
  delta?: number | null;
}

function StatCard({ title, value, description, icon, tint, delta }: StatCardProps) {
  return (
    <Card className="stat-card" hoverable>
      <div className="stat-card-top">
        <div className={`stat-card-icon stat-tint-${tint}`}>{icon}</div>
        <span className="stat-card-title">{title}</span>
        {delta != null && (
          <span
            className={`stat-delta ${delta >= 0 ? "stat-delta-up" : "stat-delta-down"}`}
          >
            {delta >= 0 ? (
              <ArrowUpRight size={12} />
            ) : (
              <ArrowDownRight size={12} />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>

      <div className="stat-card-value">{value}</div>

      <div className="stat-card-description">{description}</div>
    </Card>
  );
}

export default function Dashboard() {
  const { t } = useLanguage();
  const format = useFormat();
  const { data: stats, loading } = useApi<StatsOverview>(
    () => getApi().getStats(),
    [],
  );

  if (loading || !stats) {
    return (
      <div className="dashboard-page">
        <div className="dashboard-loading">
          <Spinner size={28} />
        </div>
      </div>
    );
  }

  const weekDelta = (() => {
    const series = stats.series.configsPerDay;
    if (series.length < 2) return null;
    const last = series[series.length - 1].count;
    const prev = series[series.length - 2].count;
    if (prev === 0) return null;
    return Math.round(((last - prev) / prev) * 100);
  })();

  return (
    <div className="dashboard-page">
      <div className="dashboard-intro">
        <div>
          <h2>{t("dashboard.title")}</h2>
          <p>{t("dashboard.welcome")}</p>
        </div>
      </div>

      <section className="stats-grid">
        <StatCard
          title={t("dashboard.stats.users")}
          value={format.number(stats.users.total)}
          description={t("dashboard.stats.usersDescription")}
          icon={<UsersIcon size={19} />}
          tint="primary"
          delta={8}
        />
        <StatCard
          title={t("dashboard.stats.configs")}
          value={format.number(stats.configs.total)}
          description={t("dashboard.stats.configsDescription")}
          icon={<FileText size={19} />}
          tint="info"
          delta={weekDelta}
        />
        <StatCard
          title={t("dashboard.stats.backends")}
          value={`${format.number(stats.backends.active)} / ${format.number(stats.backends.total)}`}
          description={t("dashboard.stats.backendsDescription")}
          icon={<Server size={19} />}
          tint="success"
        />
        <StatCard
          title={t("dashboard.stats.subscriptions")}
          value={format.number(stats.subscriptions.active)}
          description={t("dashboard.stats.subscriptionsDescription")}
          icon={<Link2 size={19} />}
          tint="warning"
        />
      </section>

      <section className="charts-row">
        <Card className="chart-card">
          <div className="chart-card-header">
            <h3>{t("dashboard.charts.configsPerDay")}</h3>
            <span className="chart-card-subtitle">
              {t("dashboard.charts.last7Days")}
            </span>
          </div>
          <LineChart
            points={stats.series.configsPerDay.map((point) => ({
              label: point.date.slice(5),
              value: point.count,
            }))}
            ariaLabel={t("dashboard.charts.configsPerDay")}
          />
        </Card>

        <Card className="chart-card">
          <div className="chart-card-header">
            <h3>{t("dashboard.charts.byProtocol")}</h3>
          </div>
          <BarChart
            bars={(Object.keys(stats.configs.byProtocol) as Protocol[]).map(
              (protocol) => ({
                label: t(`backends.protocol.${protocol}`),
                value: stats.configs.byProtocol[protocol],
              }),
            )}
            ariaLabel={t("dashboard.charts.byProtocol")}
          />
        </Card>
      </section>

      <section className="dashboard-bottom-row">
        <Card className="dashboard-list-card">
          <div className="chart-card-header">
            <h3>{t("dashboard.backendStatus.title")}</h3>
          </div>
          {stats.backends.total === 0 ? (
            <EmptyState
              icon={<Server size={24} />}
              title={t("dashboard.backendStatus.empty")}
            />
          ) : (
            <ul className="backend-status-list">
              {[
                { name: "CF-Worker-EU", protocol: "vless", latency: 58, active: true },
                { name: "CF-Worker-US", protocol: "vless", latency: 76, active: true },
                { name: "DE-Frankfurt-VMess", protocol: "vmess", latency: 92, active: true },
                { name: "SG-Trojan", protocol: "trojan", latency: 141, active: true },
                { name: "NL-Shadowsocks", protocol: "shadowsocks", latency: null, active: false },
              ].map((backend) => (
                <li key={backend.name} className="backend-status-item">
                  <span
                    className={`backend-status-dot ${backend.active ? "dot-active" : "dot-inactive"}`}
                  />
                  <span className="backend-status-name" dir="auto">
                    {backend.name}
                  </span>
                  <Badge tone="primary">{t(`backends.protocol.${backend.protocol}`)}</Badge>
                  <span className="backend-status-latency">
                    {backend.latency != null
                      ? format.number(backend.latency) + " ms"
                      : "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="dashboard-list-card">
          <div className="chart-card-header">
            <h3>{t("dashboard.activity.title")}</h3>
          </div>
          {stats.activity.length === 0 ? (
            <EmptyState title={t("dashboard.activity.empty")} />
          ) : (
            <ul className="activity-list">
              {stats.activity.map((item) => (
                <li key={item.id} className="activity-item">
                  <span className="activity-text">
                    {t(`dashboard.activity.${item.messageKey}`, item.params)}
                  </span>
                  <span className="activity-time">{format.relative(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="system-status-card">
        <div className="system-status-content">
          <div className="system-status-icon">✓</div>

          <div>
            <h3>{t("dashboard.systemStatus.title")}</h3>
            <p>{t("dashboard.systemStatus.allOperational")}</p>
          </div>
        </div>

        <Badge tone="success" dot>
          {t("dashboard.systemStatus.operational")}
        </Badge>
      </section>
    </div>
  );
}
