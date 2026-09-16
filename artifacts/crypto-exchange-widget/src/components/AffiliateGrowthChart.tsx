import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { useI18n } from '../i18n/provider';

interface AffiliateGrowthChartPoint {
  date: string;
  label: string;
  affiliates: number;
}

interface AffiliateGrowthChartProps {
  data: AffiliateGrowthChartPoint[];
}

export default function AffiliateGrowthChart({ data }: AffiliateGrowthChartProps) {
  const { t } = useI18n();

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 14, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="affiliateGrowthFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.42} />
            <stop offset="100%" stopColor="#2563eb" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="affiliateGrowthStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#4f8cff" />
            <stop offset="100%" stopColor="#a855f7" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.45} vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} minTickGap={24} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
        <ChartTooltip
          cursor={{ stroke: '#8b5cf6', strokeOpacity: 0.35 }}
          contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
          labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
        />
        <Area isAnimationActive={false} type="monotone" dataKey="affiliates" name={t('affiliate.newAffiliates')} stroke="#8b5cf6" strokeWidth={2.5} fill="url(#affiliateGrowthFill)" activeDot={{ r: 4, fill: '#a855f7', stroke: 'hsl(var(--background))', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}