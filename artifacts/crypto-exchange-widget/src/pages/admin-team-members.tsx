import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  MoreHorizontal, Plus, ShieldCheck, UserRound, Ban, Check, Trash2, Edit2, Play, Power, Pencil
} from 'lucide-react';
import {
  useListTeamMembers,
  useInviteTeamMember,
  useUpdateTeamMember,
  useApproveOperator,
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
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [bulkRoleOpen, setBulkRoleOpen] = useState(false);
  const [bulkRoleId, setBulkRoleId] = useState('none');
  const [bulkPending, setBulkPending] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const queryClient = useQueryClient();
  const reactivate = useReactivateTeamMember();
  const approve = useApproveOperator();
  const suspend = useSuspendTeamMember();
  const remove = useRemoveTeamMember();
  const update = useUpdateTeamMember();

  const canInvite = auth.owner;

  useEffect(() => {
    setSelectedMemberIds(new Set());
  }, [page, pageSize]);

  if (isLoading) return <LoadingBlock />;
  if (error || !members) return <ErrorState message="Could not load members" />;

  const selectableMembers = members.filter(member => member.role !== 'owner' && member.id !== auth.member.id && member.status !== 'removed');
  const pageCount = Math.max(1, Math.ceil(members.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleMembers = members.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectableVisibleMembers = visibleMembers.filter(member => selectableMembers.some(candidate => candidate.id === member.id));
  const selectedMembers = selectableVisibleMembers.filter(member => selectedMemberIds.has(member.id));
  const allVisibleSelected = selectableVisibleMembers.length > 0 && selectedMembers.length === selectableVisibleMembers.length;
  const someVisibleSelected = selectedMembers.length > 0;
  const visiblePageItems = (() => {
    if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
    const pages = new Set([1, pageCount, currentPage - 1, currentPage, currentPage + 1]);
    const ordered = Array.from(pages).filter(value => value >= 1 && value <= pageCount).sort((a, b) => a - b);
    const items: Array<number | string> = [];
    ordered.forEach((value, index) => {
      if (index > 0 && value - ordered[index - 1] > 1) items.push(`ellipsis-${value}`);
      items.push(value);
    });
    return items;
  })();

  const refreshMembers = async () => {
    await queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });
    setSelectedMemberIds(new Set());
  };

  const runBulkAction = async (action: 'enable' | 'disable' | 'delete') => {
    const targets = selectedMembers.filter(member =>
      action === 'enable' ? member.status === 'suspended' || member.status === 'invited'
        : action === 'disable' ? member.status === 'active'
          : true,
    );
    if (!targets.length || bulkPending) return;
    if (action === 'delete' && !confirm(`Remove ${targets.length} selected team member${targets.length === 1 ? '' : 's'}?`)) return;
    setBulkPending(true);
    setBulkNotice(null);
    let succeeded = 0;
    let failed = 0;
    for (const member of targets) {
      try {
        if (action === 'enable') {
          if (member.status === 'invited') await approve.mutateAsync({ id: member.id });
          else await reactivate.mutateAsync({ id: member.id });
        } else if (action === 'disable') {
          await suspend.mutateAsync({ id: member.id });
        } else {
          await remove.mutateAsync({ id: member.id });
        }
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    await refreshMembers();
    setBulkNotice(failed
      ? { kind: 'error', text: `${succeeded} updated; ${failed} could not be updated.` }
      : { kind: 'success', text: `${succeeded} team member${succeeded === 1 ? '' : 's'} updated.` });
    setBulkPending(false);
  };

  const applyBulkRole = async () => {
    if (!selectedMembers.length || bulkPending) return;
    setBulkPending(true);
    setBulkNotice(null);
    let succeeded = 0;
    let failed = 0;
    for (const member of selectedMembers) {
      try {
        await update.mutateAsync({
          id: member.id,
          data: {
            customRoleId: bulkRoleId === 'none' ? null : bulkRoleId,
            permissionAllows: [],
            permissionDenies: [],
            expectedAuthVersion: member.authVersion,
          },
        });
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    await refreshMembers();
    setBulkRoleOpen(false);
    setBulkNotice(failed
      ? { kind: 'error', text: `${succeeded} roles assigned; ${failed} could not be updated.` }
      : { kind: 'success', text: `Role assigned to ${succeeded} team member${succeeded === 1 ? '' : 's'}.` });
    setBulkPending(false);
  };

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
      {someVisibleSelected && (
        <div className="bulk-actions-toolbar visible admin-list-bulk-toolbar team-members-bulk-toolbar" data-testid="team-members-bulk-actions">
          <div className="bulk-actions-inner">
            <span className="bulk-actions-count" data-testid="team-members-bulk-count"><Check size={14} /> {selectedMembers.length} selected</span>
            <div className="bulk-actions-divider" />
            <button type="button" onClick={() => runBulkAction('enable')} disabled={bulkPending || !selectedMembers.some(member => member.status === 'suspended' || member.status === 'invited')}><Power size={14} /> Enable</button>
            <div className="bulk-actions-divider" />
            <button type="button" onClick={() => runBulkAction('disable')} disabled={bulkPending || !selectedMembers.some(member => member.status === 'active')}><Power size={14} /> Disable</button>
            <div className="bulk-actions-divider" />
            <button type="button" onClick={() => { setBulkRoleId('none'); setBulkRoleOpen(true); }} disabled={bulkPending}><Pencil size={14} /> Edit</button>
            <div className="bulk-actions-divider" />
            <button type="button" className="bulk-actions-delete" onClick={() => runBulkAction('delete')} disabled={bulkPending}><Trash2 size={14} /> Delete</button>
          </div>
        </div>
      )}
      {bulkNotice && <div className={`bulk-actions-notice mt-3 ${bulkNotice.kind === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>{bulkNotice.text}</div>}
      <div className="table-wrap">
        <table className="admin-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-3 py-3 w-10 text-center">
                <input
                  type="checkbox"
                  ref={element => { if (element) element.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                  checked={allVisibleSelected}
                  onChange={() => setSelectedMemberIds(allVisibleSelected ? new Set() : new Set(selectableVisibleMembers.map(member => member.id)))}
                  aria-label="Select all team members on this page"
                  data-testid="checkbox-select-all-team-members"
                />
              </th>
              <th className="px-6 py-3 font-medium text-muted-foreground w-1/3">Operator</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Status</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Role</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleMembers.map(member => (
              <MemberRow key={member.id} member={member} auth={auth} roles={roles || []} selected={selectedMemberIds.has(member.id)} onToggleSelected={() => setSelectedMemberIds(current => {
                const next = new Set(current);
                next.has(member.id) ? next.delete(member.id) : next.add(member.id);
                return next;
              })} />
            ))}
            {visibleMembers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  No team members found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {members.length > 0 && <div className="pricing-pagination team-members-pagination" data-testid="team-members-pagination">
        <span className="pricing-pagination-range">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, members.length)} of {members.length}</span>
        <div className="pricing-pagination-controls">
          <div className="pricing-page-navigation">
            <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Previous team members page">‹</button>
            {visiblePageItems.map(item => typeof item === 'number'
              ? <button type="button" key={item} className={cn(item === currentPage && 'active')} onClick={() => setPage(item)}>{item}</button>
              : <span key={item} className="pricing-pagination-ellipsis" aria-hidden="true">…</span>)}
            <button type="button" onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="Next team members page">›</button>
          </div>
          <label className="pricing-page-size team-members-page-size">
            <span>Per page</span>
            <select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Team members per page" data-testid="select-team-members-page-size">
              {[15, 25, 50, 100].map(value => <option key={value} value={value}>{value} per page</option>)}
            </select>
          </label>
        </div>
      </div>}
      
      {inviteOpen && <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} roles={roles || []} />}
      <Dialog open={bulkRoleOpen} onOpenChange={setBulkRoleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign role</DialogTitle>
            <DialogDescription>Assign one role to {selectedMembers.length} selected team member{selectedMembers.length === 1 ? '' : 's'}. Existing permission overrides will be cleared.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Assigned Role</Label>
            <Select value={bulkRoleId} onValueChange={setBulkRoleId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No specific role</SelectItem>
                {(roles || []).map(role => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBulkRoleOpen(false)} disabled={bulkPending}>Cancel</Button>
            <Button type="button" onClick={applyBulkRole} disabled={bulkPending}>{bulkPending ? 'Assigning...' : 'Assign role'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function MemberRow({ member, auth, roles, selected, onToggleSelected }: { member: TeamMember; auth: AdminAuthorization; roles: TeamRole[]; selected: boolean; onToggleSelected: () => void }) {
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
        <td className="px-3 py-3 text-center">
          <input type="checkbox" checked={selected} onChange={onToggleSelected} disabled={isOwnerUser || member.id === auth.member.id || member.status === 'removed'} aria-label={`Select ${member.name}`} />
        </td>
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
      <DialogContent className="flex max-h-[calc(100dvh-32px)] max-w-2xl flex-col gap-0 overflow-hidden sm:max-h-[calc(100dvh-48px)]">
        <DialogHeader className="shrink-0 pb-4 pr-6">
          <DialogTitle>Edit Member Permissions</DialogTitle>
          <DialogDescription>Modify {member.name}'s assigned role and overrides.</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="shrink-0 space-y-2 pb-4">
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
                  <SelectContent className="team-member-role-select-content">
                    <SelectItem value="none">No specific role</SelectItem>
                    {roles.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            <Label>Permission Overrides</Label>
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto overscroll-contain pr-1 md:grid-cols-2">
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
          
          <DialogFooter className="mt-4 shrink-0 border-t border-border bg-card pt-4">
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
