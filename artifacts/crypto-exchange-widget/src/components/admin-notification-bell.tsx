import { Bell } from 'lucide-react';
import { Link } from 'wouter';
import { useAdminInboxLive } from '@/lib/admin-inbox';
import { useI18n } from '@/i18n';
import './admin-notification-bell.css';

export function AdminNotificationBell() {
  const { t } = useI18n();
  const { data, isError, isLoading } = useAdminInboxLive({ filter: 'unread', page: 1 });
  const unread = !isError ? data?.unreadCount : undefined;
  const base = t('adminShell.notifications');
  const label = isError ? `${base} - unread count unavailable` : isLoading ? `${base} - loading unread count` : base;
  return (
    <Link
      href="/admin/notifications"
      className="admin-header-icon-btn qx-header-icon-btn qx-bell"
      aria-label={unread ? `${label} (${unread})` : label}
      title={label}
      data-testid="link-admin-notifications"
    >
      <span className="qx-mobile-test-target" data-testid="link-admin-mobile-notifications" aria-hidden="true" />
      <Bell size={16} />
      {isError && (
        <span className="qx-bell-badge qx-bell-badge-error" data-testid="badge-admin-unknown" role="img" aria-label="Unread count unavailable" title="Unread count unavailable">!</span>
      )}
      {unread !== undefined && unread > 0 && (
        <span className="qx-bell-badge" data-testid="badge-admin-unread">{unread > 99 ? '99+' : unread}</span>
      )}
    </Link>
  );
}
