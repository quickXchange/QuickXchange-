import { useI18n } from '../i18n/provider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MembersList } from './admin-team-members';
import { RolesList } from './admin-team-roles';
import { ActivityLog } from './admin-team-activity';

import { AdminShell } from '../App';
import { useAdminPermissions } from '../lib/admin-permissions';

export function AdminTeamPage() {
  const { t } = useI18n();
  const { authorization: adminAuth, can } = useAdminPermissions();
  
  if (!adminAuth) return null;
  const canViewMembers = can('team.members.view');
  const canViewRoles = can('team.roles.view');
  const canViewActivity = can('team.activity.view');

  return (
    <AdminShell title="Team & Permissions" eyebrow="ADMINISTRATION / TEAM" requiredPermission={['team.members.view', 'team.roles.view', 'team.activity.view']}>
      <div className="admin-content flex flex-col gap-6 w-full max-w-[1400px] mx-auto pb-16 mt-6">
        <div className="admin-heading mb-2">
          <h1 className="text-2xl font-bold tracking-tight">Team & Permissions</h1>
          <p className="text-muted-foreground mt-1">Manage operators, access roles, and view operations activity.</p>
        </div>

        <Tabs defaultValue={canViewMembers ? "members" : (canViewRoles ? "roles" : "activity")} className="w-full">
          <TabsList className="mb-6 grid w-full grid-cols-3 max-w-[400px]">
            {canViewMembers && <TabsTrigger value="members">Members</TabsTrigger>}
            {canViewRoles && <TabsTrigger value="roles">Roles</TabsTrigger>}
            {canViewActivity && <TabsTrigger value="activity">Activity</TabsTrigger>}
          </TabsList>
          
          {canViewMembers && (
            <TabsContent value="members">
              <MembersList auth={adminAuth} />
            </TabsContent>
          )}
          
          {canViewRoles && (
            <TabsContent value="roles">
              <RolesList auth={adminAuth} />
            </TabsContent>
          )}
          
          {canViewActivity && (
            <TabsContent value="activity">
              <ActivityLog auth={adminAuth} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AdminShell>
  );
}
