import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useI18n } from '../i18n/provider';

export function DashboardCharts({ data }: { data: any[] }) {
  const { t, locale, formatNumber } = useI18n();
  if (!data || data.length === 0) {
    return <div className="panel flex items-center justify-center h-[300px] text-muted-foreground text-sm">{t('adminCharts.noData')}</div>;
  }

  const chartData = data.map(d => ({
    ...d,
    displayDate: new Date(d.date).toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }));

  return (
    <div className="overview-performance-grid grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4 rise-in rise-delay-1">
      <div className="panel overview-chart-panel p-5">
        <div className="panel-heading mb-6">
          <div><span className="section-kicker">{t('adminCharts.orderCount')}</span><h2>{t('adminCharts.ordersOverTime')}</h2></div>
        </div>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#13DDF4" />
                  <stop offset="100%" stopColor="#2448FF" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} minTickGap={30} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} tickFormatter={(value) => formatNumber(value)} />
              <RechartsTooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px', boxShadow: 'var(--shadow-card)' }} itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }} formatter={(value: number) => [formatNumber(value), t('adminCharts.orders')]} />
              <Bar isAnimationActive={false} dataKey="orders" name={t('adminCharts.orders')} fill="url(#colorBar)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="panel overview-chart-panel p-5">
        <div className="panel-heading mb-6">
          <div><span className="section-kicker">{t('adminCharts.currentRateUsd')}</span><h2>{t('adminCharts.exchangeVolume')}</h2></div>
        </div>
        <div className="h-[250px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorUsd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#13DDF4" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#7A2CFF" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorLine" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#13DDF4" />
                  <stop offset="50%" stopColor="#087BFF" />
                  <stop offset="100%" stopColor="#7A2CFF" />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis dataKey="displayDate" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} minTickGap={30} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: val >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(val)} />
              <RechartsTooltip cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px', boxShadow: 'var(--shadow-card)' }} itemStyle={{ color: 'hsl(var(--primary))', fontWeight: 600 }} formatter={(value: number) => [new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(value), t('adminCharts.usdVolume')]} />
              <Area isAnimationActive={false} type="monotone" dataKey="approximateUsdVolume" name={t('adminCharts.usdVolume')} stroke="url(#colorLine)" strokeWidth={3} fillOpacity={1} fill="url(#colorUsd)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export function OrderStatusChart({ summary }: { summary?: any }) {
  const { t, formatNumber } = useI18n();
  const statusData = [
    { name: t('adminCharts.completed'), value: summary?.completedOrders || 0, color: '#10B981' },
    { name: t('adminCharts.openInProgress'), value: summary?.pendingOrders || 0, color: '#13DDF4' },
    { name: t('adminCharts.failedCancelled'), value: summary?.failedCancelledOrders || 0, color: '#EF4444' },
  ].filter(d => d.value > 0);

  const total = summary?.totalOrders || 0;

  return (
    <div className="panel p-5 h-full">
      <div className="panel-heading mb-6">
        <div><span className="section-kicker">{t('adminCharts.liveDistribution')}</span><h2>{t('adminCharts.ordersOverview')}</h2></div>
      </div>
      <div className="order-status-chart-body">
        <div className="order-status-chart-plot">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={72}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <RechartsTooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }} formatter={(value: number, name: string) => [formatNumber(value), name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="order-status-chart-total">
            <strong>{formatNumber(total)}</strong>
            <small>{t('adminCharts.totalOrders')}</small>
          </div>
        </div>
        <div className="order-status-chart-legend">
          {statusData.map(d => (
            <div key={d.name}>
              <span className="order-status-chart-swatch" style={{ backgroundColor: d.color }} />
              <span className="order-status-chart-label">{d.name}</span>
              <strong>{formatNumber(d.value)}</strong>
              <span className="order-status-chart-percent">{formatNumber(total > 0 ? Math.round((d.value / total) * 100) : 0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}