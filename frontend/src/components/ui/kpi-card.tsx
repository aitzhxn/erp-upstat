import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from './card';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  trend?: number; // percentage
  subtitle?: string;
  className?: string;
}

export function KPICard({ title, value, trend, subtitle, className }: KPICardProps) {
  const isPositive = trend !== undefined && trend >= 0;

  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="text-sm text-textSecondary mb-1">{title}</div>
        <div className="text-2xl font-bold text-textPrimary mb-1">{value}</div>
        {subtitle && (
          <div className="text-xs text-textSecondary">{subtitle}</div>
        )}
        {trend !== undefined && (
          <div className={cn(
            "flex items-center gap-1 mt-2 text-sm",
            isPositive ? "text-success" : "text-error"
          )}>
            {isPositive ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
