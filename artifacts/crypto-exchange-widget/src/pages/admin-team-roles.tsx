import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  MoreHorizontal, Plus, Trash2, Edit2, Shield
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

  const canCreate = auth.owner;

  if (isLoading) return <LoadingBlock />;
  if (error || !roles) return <ErrorState message="Could not load roles" />;

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
      <div className="table-wrap">
        <table className="admin-table w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="px-6 py-3 font-medium text-muted-foreground w-1/3">Role Name</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Permissions</th>
              <th className="px-6 py-3 font-medium text-muted-foreground">Usage</th>
              <th className="px-6 py-3 font-medium text-muted-foreground text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(role => (
              <RoleRow key={role.id} role={role} auth={auth} />
            ))}
            {roles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground">
                  No roles defined.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {createOpen && <RoleFormDialog open={createOpen} onOpenChange={setCreateOpen} auth={auth} mode="create" />}
    </div>
  );
}

function RoleRow({ role, auth }: { role: TeamRole; auth: AdminAuthorization }) {
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
      <tr className="border-b border-border/50 hover:bg-muted/10 transition-colors">
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
