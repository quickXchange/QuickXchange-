const fs = require('fs');

let content = fs.readFileSync('artifacts/crypto-exchange-widget/src/App.tsx', 'utf-8');

// Replace /admin/staff with /admin/team
content = content.replace(/'\/admin\/staff': 'ADMINISTRATION \/ STAFF'/g, "'/admin/team': 'ADMINISTRATION / TEAM'");

// Replace AdminStaffRoute with AdminTeamRoute
content = content.replace(/const AdminStaffRoute = \(\) => \([\s\S]*?<\/AdminShell>\n\);/, `const AdminTeamRoute = () => (
  <AdminShell title="Team & Permissions" eyebrow="ADMINISTRATION / TEAM" requiredPermission="team.members.view">
    <AdminTeamPage />
  </AdminShell>
);`);

content = content.replace(/<Route path="\/admin\/staff" component=\{AdminStaffRoute\} \/>/, `<Route path="/admin/team" component={AdminTeamRoute} />
            <Route path="/admin/staff"><Redirect to="/admin/team" /></Route>`);

// Add AdminTeamPage lazy import
content = content.replace(/const StaffPage = lazy[\s\S]*?;/, `const AdminTeamPage = lazy(() => import('./pages/admin-team').then(module => ({ default: module.AdminTeamPage })));`);

fs.writeFileSync('artifacts/crypto-exchange-widget/src/App.tsx', content);
