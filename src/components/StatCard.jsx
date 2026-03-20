export default function StatCard({ title, value, subtitle, icon: Icon, color = '#6366f1' }) {
  return (
    <div className="stat-card">
      <div className="stat-card__icon" style={{ backgroundColor: color + '18', color }}>
        {Icon && <Icon size={22} />}
      </div>
      <div className="stat-card__content">
        <p className="stat-card__title">{title}</p>
        <p className="stat-card__value">{value}</p>
        {subtitle && <p className="stat-card__subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}
