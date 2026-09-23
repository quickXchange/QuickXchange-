import { expect, test } from '@playwright/test';

const createdAt = '2026-08-20T09:00:00.000Z';

const members = Array.from({ length: 17 }, (_, index) => {
  const number = index + 1;
  const role = number <= 2 ? 'owner' : 'operator';
  const status = number <= 10 ? 'active' : number <= 14 ? 'suspended' : 'invited';
  return {
    id: `member-${number}`,
    name: `Operator ${number}`,
    email: `operator${number}@example.test`,
    role,
    status,
    customRoleId: number === 3 ? 'role-support' : null,
    permissionAllows: number === 3 ? ['team.members.view'] : [],
    permissionDenies: [],
    effectivePermissions: number === 3 ? ['team.members.view'] : [],
    linkedToClerk: status !== 'invited',
    authVersion: 1,
    createdAt,
    updatedAt: createdAt,
  };
});

const roles = [
  {
    id: 'role-support',
    name: 'Support',
    normalizedName: 'support',
    description: 'Customer support access',
    permissionKeys: ['team.members.view'],
    usageCount: 1,
    createdAt,
    updatedAt: createdAt,
  },
  {
    id: 'role-operations',
    name: 'Operations',
    normalizedName: 'operations',
    description: 'Operations desk access',
    permissionKeys: ['team.members.view', 'team.activity.view'],
    usageCount: 0,
    createdAt,
    updatedAt: createdAt,
  },
];

const activity = Array.from({ length: 7 }, (_, index) => ({
  id: `activity-${index + 1}`,
  member: `Operator ${index + 1}`,
  action: index === 0 ? 'staff.member_suspended' : 'staff.invitation_created',
  section: 'team',
  entityKind: 'team_member',
  entityId: `member-${index + 1}`,
  safeLabel: `operator${index + 1}@example.test`,
  occurredAt: `2026-08-${String(29 - index).padStart(2, '0')}T12:00:00.000Z`,
  outcome: 'success',
}));

const authorization = {
  member: members[0],
  owner: true,
  effectivePermissions: ['team.members.view', 'team.roles.view', 'team.activity.view'],
  catalog: [
    { key: 'team.members.view', label: 'View team members', section: 'team', ownerOnly: false },
    { key: 'team.roles.view', label: 'View team roles', section: 'team', ownerOnly: false },
    { key: 'team.activity.view', label: 'View team activity', section: 'team', ownerOnly: false },
  ],
};

test('owners manage the Team & Permissions workspace with derived members, roles, and activity data', async ({ page }) => {
  let invitationPayload: unknown;

  await page.route('**/api/exchange/config', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      assets: [],
      fiatCurrencies: [],
      settlementOptions: [],
      manualSettlementOptions: [],
      instantSettlementOptions: [],
      providers: [],
      capabilities: { instantQuotes: false, instantOrders: false },
    }),
  }));
  await page.route('**/api/admin/authorization', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(authorization),
  }));
  await page.route('**/api/admin/team-members', async route => {
    if (route.request().method() === 'POST') {
      invitationPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ ...members[16], id: 'member-invited', name: 'New Operator', email: 'new-operator@example.test', status: 'invited' }),
      });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(members) });
  });
  await page.route('**/api/admin/team-roles', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(roles),
  }));
  await page.route('**/api/admin/activity**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ items: activity, nextCursor: null }),
  }));

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/admin/team');

  await expect(page).toHaveURL(/\/admin\/team$/);
  await expect(page.getByRole('heading', { name: 'Team & Permissions' })).toBeVisible();
  await expect(page.getByText('Manage operators, access roles, and view operations activity.')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Members' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Roles' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Activity' })).toBeVisible();

  const memberTable = page.locator('table.admin-table').first();
  await expect(memberTable.locator('tbody tr')).toHaveCount(15);
  await expect(memberTable).toContainText('Operator 3');
  await expect(memberTable).toContainText('Support');
  await expect(page.getByText('1–15 of 17')).toBeVisible();
  await page.getByRole('button', { name: '2' }).click();
  await expect(memberTable.locator('tbody tr')).toHaveCount(2);
  await expect(memberTable).toContainText('Operator 17');

  await page.getByRole('button', { name: '1' }).click();
  await page.getByRole('checkbox', { name: 'Select Operator 3' }).check();
  await expect(page.getByTestId('team-members-bulk-actions')).toContainText('1 selected');
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('dialog', { name: 'Assign role' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('Existing permission overrides will be cleared.');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'Invite Member' }).click();
  await expect(page.getByRole('dialog', { name: 'Invite Team Member' })).toBeVisible();
  await page.getByPlaceholder('Alice Operator').fill('New Operator');
  await page.getByPlaceholder('alice@example.com').fill('new-operator@example.test');
  await page.getByRole('button', { name: 'Send Invite' }).click();
  await expect.poll(() => invitationPayload).toEqual({
    name: 'New Operator',
    email: 'new-operator@example.test',
    customRoleId: null,
  });

  await page.getByRole('tab', { name: 'Roles' }).click();
  const rolesTable = page.locator('table.admin-table').first();
  await expect(rolesTable).toContainText('Support');
  await expect(rolesTable).toContainText('1 granted');
  await expect(rolesTable).toContainText('1 member(s)');
  await page.getByRole('button', { name: 'Create Role' }).click();
  await expect(page.getByRole('dialog', { name: 'Create Role' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('View team members');
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('tab', { name: 'Activity' }).click();
  const activityTable = page.locator('table.admin-table').first();
  await expect(activityTable.locator('tbody tr')).toHaveCount(7);
  await expect(activityTable).toContainText('staff.member_suspended');
  await expect(activityTable).toContainText('operator1@example.test');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/admin/team');
  await expect(page.getByRole('heading', { name: 'Team & Permissions' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Members' })).toBeVisible();
  const responsiveMetrics = await page.locator('table.admin-table').first().evaluate(table => {
    const wrapper = table.closest<HTMLElement>('.table-wrap');
    return {
      wrapperWidth: wrapper?.clientWidth ?? 0,
      tableWidth: table.getBoundingClientRect().width,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(responsiveMetrics.wrapperWidth).toBeGreaterThan(0);
  expect(responsiveMetrics.tableWidth).toBeGreaterThanOrEqual(responsiveMetrics.wrapperWidth);
  expect(responsiveMetrics.documentOverflow).toBeLessThanOrEqual(1);
});