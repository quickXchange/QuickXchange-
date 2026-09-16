import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  MoreHorizontal, Plus, ShieldCheck, UserRound, Ban, Check, Trash2, Edit2, Play
} from 'lucide-react';
import {
  useListTeamMembers,
  useInviteTeamMember,
  useUpdateTeamMember,
  useSuspendTeamMember,
  useReactivateTeamMember,
  useRemoveTeamMember,
  useListTeamRoles,
  getListTeamMembersQueryKey
} from '@workspace/api-client-react';
import type { TeamMember, AdminAuthorization, TeamRole, PermissionKey } from '@workspace/api-client-react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

import { cn, ErrorState, LoadingBlock, StatusPill, ago } from '../App';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm, Controller } from 'react-hook-form';

export function MembersList({ auth }: { auth: AdminAuthorization }) {
  const { data: members, isLoading, error } = useListTeamMembers();
  const { data: roles } = useListTeamRoles();
  const [inviteOpen, setInviteOpen] = useState(false);

  const canInvite = auth.owner;

  if (isLoading) return <LoadingBlock />;
  if (error || !members) return <ErrorState message="Could not load members" />;

  return (
    <div className="panel p-0 flex flex-col">
      <div className="panel-heading px-6 py-4 flex items-center justify-between border-b border-border">
        <h2 className="text-base font-semibold">Team Members</h2>
        {canInvite && (
          <Button onClick={() => setInviteOpen(true)} size="sm" className="h-8">
            <Plus size={14} className="mr-1" /> Invite Member
          </Button>
        )}
      </div>
      <div className="table-wrap">
        <table className="admin-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-6 py-3 font-medium text-muted-foreground w-1/3">Operator</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Role</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map(member => (
              <MemberRow key={member.id} member={member} auth={auth} roles={roles || []} />
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                  No team members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {inviteOpen && <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roles || []} />}
    </div>
  );
}

function InviteMemberDialog({ open, onOpenChange, roles }: { open: boolean, onOpenChange: (o: boolean) => void, roles: TeamRole[] }) {
  const queryClient = useQueryClient();
  const inviteMember = useInviteTeamMember();
  
  const form = useForm({
    defaultValues: {
      name: '',
      email: '',
      customRoleId: 'none'
    }
  });

  const onSubmit = form.handleSubmit((data) => {
    inviteMember.mutate({
      data: {
        name: data.name,
        email: data.email,
        customRoleId: data.customRoleId === 'none' ? null : data.customRoleId
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });
        onOpenChange(false);
      }
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>Send an invitation to join the operations console.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input {...form.register('name')} placeholder="Alice Operator" required />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input type="email" {...form.register('email')} placeholder="alice@example.com" required />
          </div>
          <div className="space-y-2">
            <Label>Assigned Role</Label>
            <Controller
              control={form.control}
              name="customRoleId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific role (No access)</SelectItem>
                    {roles.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={inviteMember.isPending}>Cancel</Button>
            <Button type="submit" disabled={inviteMember.isPending}>
              {inviteMember.isPending ? 'Sending...' : 'Send Invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MemberRow({ member, auth, roles }: { member: TeamMember; auth: AdminAuthorization; roles: TeamRole[] }) {
  const queryClient = useQueryClient();
  const suspend = useSuspendTeamMember();
  const reactivate = useReactivateTeamMember();
  const remove = useRemoveTeamMember();
  const [editOpen, setEditOpen] = useState(false);

  const isOwnerUser = member.role === 'owner';
  
  const roleName = member.customRoleId 
    ? roles.find(r => r.id === member.customRoleId)?.name || 'Custom Role'
    : isOwnerUser ? 'Owner' : 'Operator';

  const canUpdate = auth.owner;
  const canSuspend = auth.owner;
  const canRemove = auth.owner;
  
  const showActions = !isOwnerUser && (canUpdate || canSuspend || canRemove);

  const handleSuspendToggle = () => {
    if (member.status === 'suspended') {
      reactivate.mutate({ id: member.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() }) });
    } else {
      suspend.mutate({ id: member.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() }) });
    }
  };

  const handleRemove = () => {
    if (confirm(`Remove ${member.name} from the team?`)) {
      remove.mutate({ id: member.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() }) });
    }
  };

  return (
    <>
      <tr className="border-b border-border/50 hover:bg-muted/10 transition-colors">
        <td className="px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-semibold">{member.name} {isOwnerUser && <ShieldCheck size={12} className="inline text-primary ml-1" />}</div>
              <div className="text-xs text-muted-foreground">{member.email}</div>
            </div>
          </div>
        </td>
        <td className="px-6 py-3">
          <StatusPill status={member.status} />
        </td>
        <td className="px-6 py-3">
          <div className="text-sm font-medium">{roleName}</div>
          {(member.permissionAllows.length > 0 || member.permissionDenies.length > 0) && (
            <div className="flex gap-2 text-[10px] mt-0.5">
              {member.permissionAllows.length > 0 && <span className="text-success">+{member.permissionAllows.length} allow</span>}
              {member.permissionDenies.length > 0 && <span className="text-destructive">-{member.permissionDenies.length} deny</span>}
            </div>
          )}
        </td>
        <td className="px-6 py-3 text-right">
          {showActions ? (
            <DropdownMenuPrimitive.Root>
              <DropdownMenuPrimitive.Trigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-full">
                  <MoreHorizontal size={14} />
                </Button>
              </DropdownMenuPrimitive.Trigger>
              <DropdownMenuPrimitive.Portal>
                <DropdownMenuPrimitive.Content className="admin-blog-actions-menu" sideOffset={4} align="end">
                  {canUpdate && (
                    <DropdownMenuPrimitive.Item className="admin-blog-actions-item" onSelect={() => setEditOpen(true)}>
                      <Edit2 size={14} className="mr-2" /> Edit role & permissions
                    </DropdownMenuPrimitive.Item>
                  )}
                  {canSuspend && member.status !== 'invited' && (
                    <>
                      <div className="admin-blog-actions-separator" />
                      <DropdownMenuPrimitive.Item className="admin-blog-actions-item" onSelect={handleSuspendToggle}>
                        {member.status === 'suspended' ? (
                          <><Play size={14} className="mr-2" /> Reactivate access</>
                        ) : (
                          <><Ban size={14} className="mr-2" /> Suspend access</>
                        )}
                      </DropdownMenuPrimitive.Item>
                    </>
                  )}
                  {canRemove && (
                    <>
                      <div className="admin-blog-actions-separator" />
                      <DropdownMenuPrimitive.Item className="admin-blog-actions-item is-delete" onSelect={handleRemove}>
                        <Trash2 size={14} className="mr-2" /> Remove member
                      </DropdownMenuPrimitive.Item>
                    </>
                  )}
                </DropdownMenuPrimitive.Content>
              </DropdownMenuPrimitive.Portal>
            </DropdownMenuPrimitive.Root>
          ) : (
             isOwnerUser && <span className="text-xs text-muted-foreground italic px-2">Protected</span>
          )}
        </td>
      </tr>
      
      {editOpen && <EditMemberDialog member={member} open={editOpen} onOpenChange={setEditOpen} roles={roles} auth={auth} />}
    </>
  );
}

function EditMemberDialog({ member, open, onOpenChange, roles, auth }: { member: TeamMember, open: boolean, onOpenChange: (o: boolean) => void, roles: TeamRole[], auth: AdminAuthorization }) {
  const queryClient = useQueryClient();
  const updateMember = useUpdateTeamMember();
  
  const form = useForm({
    defaultValues: {
      customRoleId: member.customRoleId || 'none',
      permissionAllows: member.permissionAllows || [],
      permissionDenies: member.permissionDenies || [],
    }
  });

  const selectedRoleId = form.watch('customRoleId');
  const selectedRole = roles.find(r => r.id === selectedRoleId);
  const basePermissions = selectedRole ? selectedRole.permissionKeys : [];
  
  const allows = form.watch('permissionAllows');
  const denies = form.watch('permissionDenies');

  const toggleOverride = (key: PermissionKey, isAllow: boolean) => {
    let newAllows = [...allows];
    let newDenies = [...denies];
    
    if (isAllow) {
      if (newAllows.includes(key as any)) {
        newAllows = newAllows.filter(k => k !== key);
      } else {
        newAllows.push(key as any);
        newDenies = newDenies.filter(k => k !== key);
      }
    } else {
      if (newDenies.includes(key as any)) {
        newDenies = newDenies.filter(k => k !== key);
      } else {
        newDenies.push(key as any);
        newAllows = newAllows.filter(k => k !== key);
      }
    }
    
    form.setValue('permissionAllows', newAllows);
    form.setValue('permissionDenies', newDenies);
  };

  const onSubmit = form.handleSubmit((data) => {
    updateMember.mutate({
      id: member.id,
      data: {
        customRoleId: data.customRoleId === 'none' ? null : data.customRoleId,
        permissionAllows: data.permissionAllows,
        permissionDenies: data.permissionDenies,
        expectedAuthVersion: member.authVersion,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });
        onOpenChange(false);
      }
    });
  });

  // Group catalog by section
  const sections = auth.catalog.reduce((acc, entry) => {
    if (!acc[entry.section]) acc[entry.section] = [];
    acc[entry.section].push(entry);
    return acc;
  }, {} as Record<string, typeof auth.catalog>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Member Permissions</DialogTitle>
          <DialogDescription>Modify {member.name}'s assigned role and overrides.</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={onSubmit} className="space-y-6 py-2">
          <div className="space-y-2">
            <Label>Assigned Role</Label>
            <Controller
              control={form.control}
              name="customRoleId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(val) => {
                  field.onChange(val);
                  form.setValue('permissionAllows', []);
                  form.setValue('permissionDenies', []);
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No specific role</SelectItem>
                    {roles.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          
          <div className="space-y-4">
            <Label>Permission Overrides</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(sections).map(([sectionName, entries]) => (
                <div key={sectionName} className="border border-border rounded-lg p-3">
                  <h4 className="font-semibold capitalize text-xs text-muted-foreground mb-3 tracking-wider">{sectionName}</h4>
                  <div className="space-y-2">
                    {entries.map(entry => {
                      const isBase = basePermissions.includes(entry.key);
                      const isAllow = allows.includes(entry.key);
                      const isDeny = denies.includes(entry.key);
                      const isOwnerOnly = entry.ownerOnly;
                      
                      let stateLabel = 'Denied';
                      let stateColor = 'text-muted-foreground';
                      
                      if (isOwnerOnly) {
                        stateLabel = 'Owner Only';
                        stateColor = 'text-primary/50';
                      } else if (isAllow) {
                        stateLabel = 'Allowed (Override)';
                        stateColor = 'text-success';
                      } else if (isDeny) {
                        stateLabel = 'Denied (Override)';
                        stateColor = 'text-destructive';
                      } else if (isBase) {
                        stateLabel = 'Inherited';
                        stateColor = 'text-foreground';
                      }
                      
                      return (
                        <div key={entry.key} className="flex items-center justify-between text-sm py-1">
                          <span className={cn(isOwnerOnly && "opacity-50")}>{entry.label}</span>
                          
                          {isOwnerOnly ? (
                             <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Owner Only</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span className={cn("text-[10px] font-medium uppercase tracking-wider mr-2", stateColor)}>
                                {stateLabel}
                              </span>
                              <Button 
                                type="button" 
                                variant={isAllow ? "default" : "outline"} 
                                size="sm" 
                                className={cn("h-6 w-6 p-0 rounded-full", isAllow && "bg-success text-success-foreground")}
                                onClick={() => toggleOverride(entry.key, true)}
                                title="Allow"
                              >
                                <Check size={12} />
                              </Button>
                              <Button 
                                type="button" 
                                variant={isDeny ? "destructive" : "outline"} 
                                size="sm" 
                                className={cn("h-6 w-6 p-0 rounded-full")}
                                onClick={() => toggleOverride(entry.key, false)}
                                title="Deny"
                              >
                                <Ban size={12} />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t border-border mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={updateMember.isPending}>Cancel</Button>
            <Button type="submit" disabled={updateMember.isPending}>
              {updateMember.isPending ? 'Saving...' : 'Save Permissions'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
