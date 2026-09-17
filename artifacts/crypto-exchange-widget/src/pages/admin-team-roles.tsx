import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  MoreHorizontal, Plus, Trash2, Edit2, Shield, Check, Pencil
} from 'lucide-react';
import {
  useListTeamRoles,
  useCreateTeamRole,
  useUpdateTeamRole,
  useDeleteTeamRole,
  getListTeamRolesQueryKey,
  getListTeamMembersQueryKey
} from '@workspace/api-client-react';
import type { TeamRole, AdminAuthorization, PermissionKey } from '@workspace/api-client-react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';

import { cn, ErrorState, LoadingBlock } from '../App';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useForm, Controller } from 'react-hook-form';

export function RolesList({ auth }: { auth: AdminAuthorization }) {
  const { data: roles, isLoading, error } = useListTeamRoles();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<TeamRole | null>(null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(() => new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const queryClient = useQueryClient();
  const deleteRole = useDeleteTeamRole();

  const canCreate = auth.owner;

  useEffect(() => {
    setSelectedRoleIds(new Set());
  }, [page, pageSize]);

  if (isLoading) return <LoadingBlock />;
  if (error || !roles) return <ErrorState message="Could not load roles" />;

  const pageCount = Math.max(1, Math.ceil(roles.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRoles = roles.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedRoles = visibleRoles.filter(role => selectedRoleIds.has(role.id));
  const allVisibleSelected = visibleRoles.length > 0 && selectedRoles.length === visibleRoles.length;
  const someVisibleSelected = selectedRoles.length > 0;
  const selectedRoleInUse = selectedRoles.some(role => role.usageCount > 0);
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

  const handleBulkDelete = async () => {
    if (!selectedRoles.length || selectedRoleInUse) return;
    if (!confirm(`Delete ${selectedRoles.length} selected role${selectedRoles.length === 1 ? '' : 's'}?`)) return;
    let failed = 0;
    for (const role of selectedRoles) {
      try {
        await deleteRole.mutateAsync({ id: role.id });
      } catch {
        failed += 1;
      }
    }
    setSelectedRoleIds(new Set());
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getListTeamRolesQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() }),
    ]);
    if (failed) alert(`${failed} selected role${failed === 1 ? '' : 's'} could not be deleted.`);
  };

  return (
    <div className="panel p-0 flex flex-col">
      <div className="panel-heading px-6 py-4 flex items-center justify-between border-b border-border">
        <h2 className="text-base font-semibold">Permission Roles</h2>
        {canCreate && (
          <Button onClick={() => setCreateOpen(true)} size="sm" className="h-8">
            <Plus size={14} className="mr-1" /> Create Role
          </Button>
        )}
      </div>
      {someVisibleSelected && <div className="bulk-actions-toolbar visible admin-list-bulk-toolbar team-members-bulk-toolbar" data-testid="team-roles-bulk-actions">
        <div className="bulk-actions-inner">
          <span className="bulk-actions-count" data-testid="team-roles-bulk-count"><Check size={14} /> {selectedRoles.length} selected</span>
          <div className="bulk-actions-divider" />
          <button type="button" onClick={() => setEditingRole(selectedRoles[0])} disabled={deleteRole.isPending || selectedRoles.length !== 1}><Pencil size={14} /> Edit</button>
          <div className="bulk-actions-divider" />
          <button type="button" className="bulk-actions-delete" onClick={handleBulkDelete} disabled={deleteRole.isPending || selectedRoleInUse} title={selectedRoleInUse ? 'Roles assigned to members cannot be deleted.' : undefined}><Trash2 size={14} /> Delete</button>
        </div>
      </div>}
      <div className="table-wrap">
        <table className="admin-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-3 py-3 w-10 text-center">
                <input
                  type="checkbox"
                  ref={element => { if (element) element.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                  checked={allVisibleSelected}
                  onChange={() => setSelectedRoleIds(allVisibleSelected ? new Set() : new Set(visibleRoles.map(role => role.id)))}
                  disabled={!auth.owner}
                  aria-label="Select all roles on this page"
                  data-testid="checkbox-select-all-team-roles"
                />
              </th>
              <th className="px-6 py-3 font-medium text-muted-foreground w-1/3">Role Name</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Permissions</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Usage</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRoles.map(role => (
              <RoleRow key={role.id} role={role} auth={auth} selected={selectedRoleIds.has(role.id)} onToggleSelected={() => setSelectedRoleIds(current => {
                const next = new Set(current);
                next.has(role.id) ? next.delete(role.id) : next.add(role.id);
                return next;
              })} />
            ))}
            {visibleRoles.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                  No roles defined.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {roles.length > 0 && <div className="pricing-pagination team-roles-pagination">
        <span className="pricing-pagination-range">{(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, roles.length)} of {roles.length}</span>
        <div className="pricing-pagination-controls">
          <div className="pricing-page-navigation">
            <button type="button" onClick={() => setPage(value => Math.max(1, value - 1))} disabled={currentPage === 1} aria-label="Previous roles page">‹</button>
            {visiblePageItems.map(item => typeof item === 'number'
              ? <button type="button" key={item} className={cn(item === currentPage && 'active')} onClick={() => setPage(item)}>{item}</button>
              : <span key={item} className="pricing-pagination-ellipsis" aria-hidden="true">…</span>)}
            <button type="button" onClick={() => setPage(value => Math.min(pageCount, value + 1))} disabled={currentPage === pageCount} aria-label="Next roles page">›</button>
          </div>
          <label className="pricing-page-size"><span>Per page</span><select value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }} aria-label="Roles per page">{[15, 25, 50, 100].map(value => <option key={value} value={value}>{value} per page</option>)}</select></label>
        </div>
      </div>}
      
      {createOpen && <RoleFormDialog open={createOpen} onOpenChange={setCreateOpen} auth={auth} mode="create" />}
      {editingRole && <RoleFormDialog open={Boolean(editingRole)} onOpenChange={open => { if (!open) setEditingRole(null); }} auth={auth} role={editingRole} mode="edit" />}
    </div>
  );
}

function RoleRow({ role, auth, selected, onToggleSelected }: { role: TeamRole; auth: AdminAuthorization; selected: boolean; onToggleSelected: () => void }) {
  const queryClient = useQueryClient();
  const deleteRole = useDeleteTeamRole();
  const [editOpen, setEditOpen] = useState(false);

  const canUpdate = auth.owner;
  const canDelete = auth.owner;
  
  const showActions = canUpdate || canDelete;

  const handleDelete = () => {
    if (role.usageCount > 0) {
      alert(`Cannot delete ${role.name} because it is assigned to ${role.usageCount} member(s).`);
      return;
    }
    if (confirm(`Delete the role "${role.name}"?`)) {
      deleteRole.mutate({ id: role.id }, { 
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTeamRolesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });
        }
      });
    }
  };

  return (
    <>
      <tr className={cn("border-b border-border/50 hover:bg-muted/10 transition-colors", selected && "bg-primary/5 hover:bg-primary/10")}>
        <td className="px-3 py-3 text-center">
          <input type="checkbox" checked={selected} onChange={onToggleSelected} disabled={!auth.owner} aria-label={`Select ${role.name}`} />
        </td>
        <td className="px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Shield size={16} />
            </div>
            <div>
              <div className="font-semibold">{role.name}</div>
              <div className="text-xs text-muted-foreground">{role.description}</div>
            </div>
          </div>
        </td>
        <td className="px-6 py-3 text-muted-foreground">
          {role.permissionKeys.length} granted
        </td>
        <td className="px-6 py-3 text-muted-foreground">
          {role.usageCount} member(s)
        </td>
        <td className="px-6 py-3 text-right">
          {showActions && (
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
                      <Edit2 size={14} className="mr-2" /> Edit role
                    </DropdownMenuPrimitive.Item>
                  )}
                  {canDelete && (
                    <>
                      <div className="admin-blog-actions-separator" />
                      <DropdownMenuPrimitive.Item className="admin-blog-actions-item is-delete" onSelect={handleDelete} disabled={role.usageCount > 0}>
                        <Trash2 size={14} className="mr-2" /> Delete role
                      </DropdownMenuPrimitive.Item>
                    </>
                  )}
                </DropdownMenuPrimitive.Content>
              </DropdownMenuPrimitive.Portal>
            </DropdownMenuPrimitive.Root>
          )}
        </td>
      </tr>
      
      {editOpen && <RoleFormDialog open={editOpen} onOpenChange={setEditOpen} auth={auth} role={role} mode="edit" />}
    </>
  );
}

function RoleFormDialog({ open, onOpenChange, auth, role, mode }: { open: boolean, onOpenChange: (o: boolean) => void, auth: AdminAuthorization, role?: TeamRole, mode: 'create' | 'edit' }) {
  const queryClient = useQueryClient();
  const createRole = useCreateTeamRole();
  const updateRole = useUpdateTeamRole();
  
  const form = useForm({
    defaultValues: {
      name: role?.name || '',
      description: role?.description || '',
      permissionKeys: role?.permissionKeys || [],
    }
  });

  const permissions = form.watch('permissionKeys');

  const togglePermission = (key: PermissionKey) => {
    const current = [...permissions];
    if (current.includes(key as any)) {
      form.setValue('permissionKeys', current.filter(k => k !== key));
    } else {
      current.push(key as any);
      form.setValue('permissionKeys', current);
    }
  };

  const onSubmit = form.handleSubmit((data) => {
    const isPending = mode === 'create' ? createRole.isPending : updateRole.isPending;
    if (isPending) return;

    if (mode === 'create') {
      createRole.mutate({ data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTeamRolesQueryKey() });
          onOpenChange(false);
        }
      });
    } else if (role) {
      updateRole.mutate({ id: role.id, data }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTeamRolesQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListTeamMembersQueryKey() });
          onOpenChange(false);
        }
      });
    }
  });

  const sections = auth.catalog.reduce((acc, entry) => {
    if (!acc[entry.section]) acc[entry.section] = [];
    acc[entry.section].push(entry);
    return acc;
  }, {} as Record<string, typeof auth.catalog>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Create Role' : 'Edit Role'}</DialogTitle>
          <DialogDescription>Define a reusable set of permissions for operators.</DialogDescription>
        </DialogHeader>
        
        <form onSubmit={onSubmit} className="space-y-6 py-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Role Name</Label>
              <Input {...form.register('name')} placeholder="e.g. Support Agent" required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input {...form.register('description')} placeholder="Brief description of this role" />
            </div>
          </div>
          
          <div className="space-y-4">
            <Label>Permissions</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(sections).map(([sectionName, entries]) => (
                <div key={sectionName} className="border border-border rounded-lg p-3">
                  <h4 className="font-semibold capitalize text-xs text-muted-foreground mb-3 tracking-wider">{sectionName}</h4>
                  <div className="space-y-2">
                    {entries.map(entry => {
                      const isGranted = permissions.includes(entry.key);
                      const isOwnerOnly = entry.ownerOnly;
                      
                      return (
                        <label key={entry.key} className={cn("flex items-center justify-between text-sm py-1 cursor-pointer", isOwnerOnly && "opacity-50 cursor-not-allowed")}>
                          <span>{entry.label}</span>
                          
                          {isOwnerOnly ? (
                             <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Owner Only</span>
                          ) : (
                            <input 
                              type="checkbox" 
                              className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                              checked={isGranted}
                              onChange={() => togglePermission(entry.key)}
                            />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <DialogFooter className="sticky bottom-0 bg-background pt-4 border-t border-border mt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">
              {mode === 'create' ? (createRole.isPending ? 'Creating...' : 'Create Role') : (updateRole.isPending ? 'Saving...' : 'Save Role')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
