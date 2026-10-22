import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

import {
  CANONICAL_PACKAGES,
  CONSUMER_REPOSITORY,
  CONTRACTUAL_TEST_COUNT,
  EXPECTED_PAGE_FILES,
  EXPECTED_ROUTE_HANDLERS,
  VISO_RELATIONS,
  REQUIRED_EVIDENCE_FIELDS,
  SURFACES,
  containsSensitiveData,
  evaluateProfile,
  evaluateSurface,
  evidenceIsStale,
  resolveTargetPackages,
  sha256Identity,
  validateEvidence,
  validateRouteInventoryEntries,
} from './viso-consumer-baseline-gate.mjs';

const positiveSurfaceScenarios = Object.freeze({
  'VISO-SURFACE-001': {
    session: true,
    sso_bridge: true,
    safe_return: true,
    deny_state: true,
    app_access: true,
    permission: true,
    auth_error: false,
  },
  'VISO-SURFACE-002': {
    site_id: 'SITE-001',
    area_scope: true,
    actor_effective: 'EMP-001',
    territory_valid: true,
    override_authorized: true,
    shared_device_checked: true,
    manipulated: false,
  },
  'VISO-SURFACE-003': {
    page_count: 61,
    static_page_count: 48,
    dynamic_page_count: 13,
    protected_page_count: 59,
    public_controlled_count: 2,
    handler_count: 10,
    technical_pattern_count: 71,
    month_route_present: true,
    query_params_are_not_routes: true,
  },
  'VISO-SURFACE-004': {
    handler_count: 10,
    middleware_api_excluded: true,
    own_auth: true,
    own_authorization: true,
    own_context: true,
    input_validation: true,
    privilege_server_only: true,
  },
  'VISO-SURFACE-005': {
    roles_scoped: true,
    permissions_scoped: true,
    site_scoped: true,
    area_scoped: true,
    mutation_authorized: true,
    self_escalation: false,
  },
  'VISO-SURFACE-006': {
    business_scope: true,
    product_scope: true,
    menu_scope: true,
    collection_scope: true,
    order_consistent: true,
    resource_owned: true,
  },
  'VISO-SURFACE-007': {
    cms_scope: true,
    content_scope: true,
    media_type_valid: true,
    media_size_valid: true,
    media_destination_valid: true,
    media_owner_valid: true,
    storage_authorized: true,
  },
  'VISO-SURFACE-008': {
    staff_scope: true,
    vacancy_scope: true,
    document_scope: true,
    attendance_scope: true,
    sensitive_data_scoped: true,
    traceable: true,
  },
  'VISO-SURFACE-009': {
    schedule_week: true,
    schedule_month: true,
    calendar: true,
    dates_valid: true,
    blocks_valid: true,
    limits_valid: true,
    draft_publish_separate: true,
    parity_single_source: true,
  },
  'VISO-SURFACE-010': {
    operation_id: 'OP-001',
    idempotency_key: 'IDEMP-001',
    atomic_or_reconciliable: true,
    retry_safe: true,
    duplicate_effect: false,
    timeout_not_success: true,
    recovery_auditable: true,
  },
  'VISO-SURFACE-011': {
    contract_consumed: true,
    claimed_owner: 'viso_admin',
  },
  'VISO-SURFACE-012': {
    server_render: true,
    client_render: true,
    hydration_mismatch: false,
    interaction_ok: true,
    forms_ok: true,
    tables_ok: true,
    accessibility_ok: true,
    loading_error_feedback_ok: true,
    deny_state_safe: true,
  },
});

const negativeSurfaceScenarios = Object.freeze({
  'VISO-SURFACE-001': {
    session: false,
    sso_bridge: false,
    safe_return: false,
    deny_state: false,
    app_access: false,
    permission: false,
    auth_error: true,
  },
  'VISO-SURFACE-002': {
    site_id: 'SITE-OTHER',
    area_scope: false,
    actor_effective: 'EMP-001',
    territory_valid: false,
    override_authorized: false,
    shared_device_checked: false,
    manipulated: true,
  },
  'VISO-SURFACE-003': {
    page_count: 60,
    static_page_count: 47,
    dynamic_page_count: 13,
    protected_page_count: 58,
    public_controlled_count: 2,
    handler_count: 11,
    technical_pattern_count: 71,
    month_route_present: false,
    query_params_are_not_routes: false,
  },
  'VISO-SURFACE-004': {
    handler_count: 10,
    middleware_api_excluded: true,
    own_auth: false,
    own_authorization: false,
    own_context: false,
    input_validation: false,
    privilege_server_only: false,
  },
  'VISO-SURFACE-005': {
    roles_scoped: false,
    permissions_scoped: false,
    site_scoped: false,
    area_scoped: false,
    mutation_authorized: false,
    self_escalation: true,
  },
  'VISO-SURFACE-006': {
    business_scope: false,
    product_scope: false,
    menu_scope: false,
    collection_scope: false,
    order_consistent: false,
    resource_owned: false,
  },
  'VISO-SURFACE-007': {
    cms_scope: false,
    content_scope: false,
    media_type_valid: false,
    media_size_valid: false,
    media_destination_valid: false,
    media_owner_valid: false,
    storage_authorized: false,
  },
  'VISO-SURFACE-008': {
    staff_scope: false,
    vacancy_scope: false,
    document_scope: false,
    attendance_scope: false,
    sensitive_data_scoped: false,
    traceable: false,
  },
  'VISO-SURFACE-009': {
    schedule_week: false,
    schedule_month: false,
    calendar: false,
    dates_valid: false,
    blocks_valid: false,
    limits_valid: false,
    draft_publish_separate: false,
    parity_single_source: false,
  },
  'VISO-SURFACE-010': {
    operation_id: 'OP-001',
    idempotency_key: '',
    atomic_or_reconciliable: false,
    retry_safe: false,
    duplicate_effect: true,
    timeout_not_success: false,
    recovery_auditable: false,
  },
  'VISO-SURFACE-011': {
    contract_consumed: true,
    claimed_owner: 'inventory',
  },
  'VISO-SURFACE-012': {
    server_render: true,
    client_render: true,
    hydration_mismatch: true,
    interaction_ok: false,
    forms_ok: false,
    tables_ok: false,
    accessibility_ok: false,
    loading_error_feedback_ok: false,
    deny_state_safe: false,
  },
});

const positiveProfiles = Object.freeze({
  '@vento/contracts': {
    types_compile: true,
    payload_shapes_checked: true,
    serialization_checked: true,
    identifier_semantics_preserved: true,
    nullable_semantics_checked: true,
    no_global_cast_bypass: true,
  },
  '@vento/os-context': {
    session_checked: true,
    site_context_checked: true,
    area_context_checked: true,
    actor_context_checked: true,
    app_access_checked: true,
    permission_allow_checked: true,
    permission_deny_checked: true,
    role_override_checked: true,
    shared_device_checked: true,
    client_cannot_elevate_authority: true,
  },
  '@vento/supabase': {
    browser_client_checked: true,
    server_client_checked: true,
    admin_server_only_checked: true,
    permission_rpc_checked: true,
    rls_deny_checked: true,
    storage_checked: true,
    isolated_schema_source: true,
    no_service_role_fixture: true,
    no_service_role_client_exposure: true,
    build_is_non_mutating: true,
  },
  '@vento/ui-web': {
    server_render_checked: true,
    client_render_checked: true,
    hydration_checked: true,
    forms_checked: true,
    tables_checked: true,
    keyboard_focus_checked: true,
    accessibility_checked: true,
    loading_error_checked: true,
    deny_state_checked: true,
  },
});

// GAP-PKG-004: execute the production index guards and PostgREST query builder,
// not a simulated UI filter. No persistent users, permissions or network writes.
test('GAP-PKG-004 /staff enforces SITE/GLOBAL on actual server query boundaries', async () => {
  const source = fs.readFileSync(
    new URL('../../src/app/staff/page.tsx', import.meta.url), 'utf8',
  );
  const begin = source.indexOf('const STAFF_READ_PERMISSION =');
  const end = source.indexOf('\nexport default async function StaffPage(', begin);
  assert.ok(begin !== -1 && end > begin, 'Source authorization/query helpers are required');
  const executable = stripTypeScriptTypes(source.slice(begin, end)) +
    '\n({ requireStaffIndexScope, readScopedStaffIndex })';
  // Render the actual Next.js TSX page as React SSR, not a simulated table.
  // Only imported modules and the database are substituted with deterministic doubles.
  const serverPageJs = ts.transpileModule(source, {
    fileName: 'src/app/staff/page.tsx',
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const nativeTag = (tag) => {
    function QaNativeTag({ children, ...props }) {
      return createElement(tag, props, children);
    }
    QaNativeTag.displayName = 'GAP004_' + tag;
    return QaNativeTag;
  };
  const a = 'a0040000-0000-4000-8000-000000000001';
  const b = 'b0040000-0000-4000-8000-000000000002';
  const workers = [
    { id: 'employee-a', full_name: 'GAP004_SITE_A_SENTINEL', is_active: true, role: 'cajero', sites: [{ id: a, active: true }] },
    { id: 'employee-b', full_name: 'GAP004_SITE_B_FOREIGN_SENTINEL', is_active: true, role: 'cajero', sites: [{ id: b, active: true }] },
    { id: 'employee-multi', full_name: 'GAP004_SHARED_AB_SENTINEL', is_active: true, role: 'cajero', sites: [{ id: a, active: true }, { id: b, active: true }] },
    { id: 'employee-inactive', full_name: 'GAP004_INACTIVE_B_SENTINEL', is_active: true, role: 'cajero', sites: [{ id: b, active: false }] },
  ];
  const cases = [
    { name: 'SITE only RPC(NULL)=TRUE still limited to A', grant: 'none', expected: [a] },
    { name: 'GLOBAL via own employee grant', grant: 'employee', expected: [a, b] },
    { name: 'GLOBAL via actual role', grant: 'role', expected: [a, b] },
    { name: 'GLOBAL with effective B denial', grant: 'employee', denyB: true, expected: [a] },
    { name: 'Missing catalog must not promote access', grant: 'employee', noCatalog: true, expected: [a] },
    { name: 'Shared device is always SITE scoped', grant: 'role', shared: true, expected: [a] },
  ];
  for (const scenario of cases) {
    const queries = [];
    const rpcCalls = [];
    const tables = {
      employees: workers,
      sites: [{ id: a, name: 'QA A' }, { id: b, name: 'QA B' }],
      shared_operational_devices_admin_v1: [{ id: 'device-b' }],
    };
    const admin = {
      async rpc(name) {
        assert.equal(name, 'employee_wallet_eligibility');
        return { data: [], error: null };
      },
      from(table) {
        const filters = {};
        let columns = '';
        const q = {
          select(value) { columns = value; return q; },
          eq(name, value) { filters[name] = value; return q; },
          in(name, value) { filters[name] = [...value]; return q; },
          is(name, value) { filters[name] = value; return q; },
          or(value) { filters.or = value; return q; },
          order() { return q; },
          limit() { return q; },
          async maybeSingle() {
            queries.push({ table, columns, filters: { ...filters }, kind: 'single' });
            if (table === 'employee_sites') {
              assert.equal(filters.employee_id, 'operator', scenario.name);
              assert.equal(filters.site_id, a, scenario.name);
              assert.equal(filters.is_active, true, scenario.name);
              return { data: { employee_id: 'operator' }, error: null };
            }
            if (table === 'apps') return { data: { id: 'viso-app' }, error: null };
            if (table === 'app_permissions') {
              assert.equal(filters.code, 'workforce.employees.view');
              return { data: scenario.noCatalog ? null : { id: 'staff-read-permission' }, error: null };
            }
            if (table === 'employee_permissions') {
              assert.equal(filters.scope_type, 'global');
              assert.equal(filters.is_allowed, true);
              assert.equal(filters.employee_id, 'operator');
              return { data: scenario.grant === 'employee' ? { id: 'own-global' } : null, error: null };
            }
            if (table === 'role_permissions') {
              assert.equal(filters.role, 'cajero');
              assert.equal(filters.or, 'scope_type.eq.global,scope_type.is.null');
              assert.equal(filters.is_allowed, true);
              return { data: scenario.grant === 'role' ? { permission_id: 'staff-read-permission' } : null, error: null };
            }
            assert.fail('Unrecognized admin lookup ' + table);
          },
          then(resolve, reject) {
            queries.push({ table, columns, filters: { ...filters }, kind: 'list' });
            let values = tables[table] ?? [];
            if (table === 'employees') {
              assert.match(columns, /employee_sites!inner\(site_id\)/u);
              assert.equal(filters['employee_sites.is_active'], true, scenario.name);
              assert.ok(Array.isArray(filters['employee_sites.site_id']), scenario.name);
              values = workers.filter((worker) => worker.sites.some((member) =>
                member.active && filters['employee_sites.site_id'].includes(member.id)));
            } else if (table === 'sites' && filters.id) {
              values = tables.sites.filter((site) => filters.id.includes(site.id));
            }
            return Promise.resolve({ data: values, error: null }).then(resolve, reject);
          },
        };
        return q;
      },
    };
    const authClient = {
      async rpc(name, args) {
        assert.equal(name, 'has_permission');
        assert.equal(args.p_permission_code, 'viso.workforce.employees.view');
        assert.equal(args.p_area_id, null);
        rpcCalls.push(args.p_site_id);
        return { data: args.p_site_id !== b || scenario.denyB !== true, error: null };
      },
    };
    const scopeFunctions = runInNewContext(executable, {
      requireAppAccess: async (params) => {
        assert.equal(params.appId, 'viso');
        assert.equal(params.permissionCode, 'workforce.employees.view');
        return {
          user: { id: 'operator' },
          siteId: a,
          supabase: authClient,
          operationalSession: { isSharedDevice: scenario.shared === true, role: 'cajero' },
        };
      },
      createAdminClient: () => admin,
      redirect: (url) => { throw new Error('SYNTHETIC_REDIRECT:' + url); },
    });
    const scope = await scopeFunctions.requireStaffIndexScope();
    assert.deepEqual([...scope.authorizedSiteIds], scenario.expected, scenario.name);
    const canReadAll = scenario.expected.length === 2 && scenario.grant !== 'none';
    assert.equal(scope.canReadAllSites, canReadAll, scenario.name);
    const [{ data: employees }, { data: sites }, { data: devices }] =
      await scopeFunctions.readScopedStaffIndex(
        scope.supabase, scope.authorizedSiteIds, scope.canReadAllSites);
    const expectedIds = canReadAll
      ? ['employee-a', 'employee-b', 'employee-multi']
      : ['employee-a', 'employee-multi'];
    assert.deepEqual([...employees].map((v) => v.id), expectedIds, scenario.name);
    assert.deepEqual([...sites].map((v) => v.id), scenario.expected, scenario.name);
    assert.equal(devices.length, canReadAll ? 1 : 0, scenario.name);
    assert.equal(queries.some((query) => query.table === 'shared_operational_devices_admin_v1'),
      canReadAll, scenario.name);
    if (scenario.shared) assert.equal(rpcCalls.length, 0, scenario.name);
    else assert.ok(rpcCalls.includes(null), 'Null-site RPC must not prove GLOBAL: ' + scenario.name);
    for (const query of queries.filter((item) => item.table === 'employees')) {
      assert.ok(Array.isArray(query.filters['employee_sites.site_id']), scenario.name);
      assert.equal(query.filters['employee_sites.is_active'], true, scenario.name);
    }

    // Execute the REAL server page TSX and inspect its final HTML. A worker
    // belonging exclusively to B must never appear for a SITE-limited reader.
    const pageModule = { exports: {} };
    const pageDependencies = {
      'react/jsx-runtime': jsxRuntime,
      'next/link': { __esModule: true, default: nativeTag('a') },
      'next/navigation': {
        redirect: (url) => { throw new Error('SSR_UNEXPECTED_REDIRECT: ' + url); },
      },
      '@/components/vento/standard/page-header': {
        PageHeader: ({ title, subtitle, actions }) =>
          createElement('header', null, createElement('h1', null, title), subtitle, actions),
      },
      '@/components/vento/standard/table': {
        Table: nativeTag('table'),
        TableHead: nativeTag('thead'),
        TableBody: nativeTag('tbody'),
        TableRow: nativeTag('tr'),
        TableHeaderCell: nativeTag('th'),
        TableCell: nativeTag('td'),
      },
      '@/lib/auth/guard': {
        requireAppAccess: async () => ({
          user: { id: 'operator' },
          siteId: a,
          supabase: authClient,
          operationalSession: { isSharedDevice: scenario.shared === true, role: 'cajero' },
        }),
      },
      '@/lib/supabase/admin': { createAdminClient: () => admin },
    };
    runInNewContext(serverPageJs, {
      module: pageModule,
      exports: pageModule.exports,
      console,
      require: (specifier) => {
        assert.ok(Object.hasOwn(pageDependencies, specifier),
          'Unexpected SSR import: ' + specifier);
        return pageDependencies[specifier];
      },
    }, { timeout: 5000 });
    const renderedHtml = renderToStaticMarkup(await pageModule.exports.default({
      searchParams: Promise.resolve({ status: 'all' }),
    }));
    assert.match(renderedHtml, /GAP004_SITE_A_SENTINEL/u, scenario.name);
    assert.match(renderedHtml, /GAP004_SHARED_AB_SENTINEL/u, scenario.name);
    assert.doesNotMatch(renderedHtml, /GAP004_INACTIVE_B_SENTINEL/u, scenario.name);
    if (canReadAll) {
      assert.match(renderedHtml, /GAP004_SITE_B_FOREIGN_SENTINEL/u, scenario.name);
    } else {
      assert.doesNotMatch(renderedHtml,
        /GAP004_SITE_B_FOREIGN_SENTINEL|href="\/staff\/employee-b"/u, scenario.name);
    }
  }

  // Fail closed before the admin client is created for a forged site.
  let privilegedClients = 0;
  const { requireStaffIndexScope } = runInNewContext(executable, {
    requireAppAccess: async () => ({
      user: { id: 'operator' }, siteId: 'not-a-uuid',
      operationalSession: { isSharedDevice: false, role: 'cajero' },
    }),
    createAdminClient: () => { privilegedClients++; throw Error('ADMIN_CREATED'); },
    redirect: (url) => { throw new Error('SYNTHETIC_REDIRECT:' + url); },
  });
  await assert.rejects(requireStaffIndexScope(),
    /SYNTHETIC_REDIRECT:\/no-access\?returnTo=%2Fstaff&reason=staff_site_scope_denied/u);
  assert.equal(privilegedClients, 0);

  // An inactive operator assignment must deny before any employee list read.
  const inactiveScope = runInNewContext(executable, {
    requireAppAccess: async () => ({
      user: { id: 'operator' },
      siteId: a,
      operationalSession: { isSharedDevice: false, role: 'cajero' },
    }),
    createAdminClient: () => ({
      from(table) {
        assert.equal(table, 'employee_sites');
        return {
          select() { return this; },
          eq() { return this; },
          async maybeSingle() { return { data: null, error: null }; },
        };
      },
    }),
    redirect: (url) => { throw new Error('SYNTHETIC_REDIRECT:' + url); },
  });
  await assert.rejects(inactiveScope.requireStaffIndexScope(),
    /SYNTHETIC_REDIRECT:\/no-access\?returnTo=%2Fstaff&reason=staff_site_scope_denied/u);

  // The secondary reads and navigational tabs must not reintroduce cross-site data.
  assert.doesNotMatch(source, /employee\.site_id === siteFilter/u);
  assert.doesNotMatch(source, /site:sites!employees_site_id_fkey/u);
  assert.match(source, /\.in\("site_id", authorizedSiteIds\)\s*\.eq\("is_active", true\)/u);
  assert.match(source, /\.in\("last_site_id", authorizedSiteIds\)/u);
  assert.match(source, /const eligibilityQuery = canReadAllSites/u);
  assert.match(source, /resolvedSearchParams\.tab === "devices" && canReadAllSites/u);
  assert.match(source, /canReadAllSites \? \[\{ value: "devices"/u);
});

// GAP-PKG-004: execute the real VISO server-side territorial guard with
// deterministic admin-client doubles. No HTTP requests, real identities,
// Storage writes, or modifications to the local Supabase database.
async function verifyStaffDocumentSiteBoundary() {
  const source = fs.readFileSync(
    new URL('../../src/app/staff/[id]/page.tsx', import.meta.url), 'utf8',
  );
  const start = source.indexOf('async function requireStaffEmployeeSiteAccess(');
  const end = source.indexOf('\nfunction asBool(', start);
  const globalStart = source.indexOf('async function requireStaffGlobalPermission(');
  const globalEnd = source.indexOf('\nasync function requireStaffAdministrativeSiteAccess(', globalStart);
  assert.ok(start !== -1 && end > start && globalStart !== -1 && globalEnd > globalStart,
    'VISO must retain both the site guard and explicit global-scope provenance guard');
  // Execute both real guard functions: a mock of global authorization here
  // would conceal a bypass between the territorial and grant checks.
  const executable = stripTypeScriptTypes(
    source.slice(start, end) + '\n' + source.slice(globalStart, globalEnd),
  ) + '\nrequireStaffEmployeeSiteAccess';

  for (const name of ['uploadStaffDocument', 'updateStaffDocument']) {
    const functionStart = source.indexOf(`async function ${name}(`);
    const nextStart = source.indexOf('\nasync function ', functionStart + 1);
    assert.ok(functionStart !== -1 && nextStart > functionStart, name);
    const action = source.slice(functionStart, nextStart);
    assert.match(action, /await requireStaffEmployeeSiteAccess\(\s*employeeId,\s*"staff\.documents\.manage"/u,
      name + ' must authorize before any privileged document mutation');
    if (name === 'uploadStaffDocument') {
      assert.match(action, /site_id:\s*authorizedSiteId/u,
        'New uploads must be explicitly associated with the authorized site');
    }
  }
  assert.match(source, /await requireStaffEmployeeSiteAccess\(id,\s*"workforce\.employees\.view"\)/u,
    'Staff detail page must authorize before administrative reads');
  assert.match(source, /documentSiteFilter:\s*`site_id\.is\.null,site_id\.eq\.\$\{authorizedSiteId\}`/u,
    'Legacy NULL-site documents remain compatible, while explicit site IDs are scoped');
  assert.equal((source.match(/\.or\(documentSiteFilter\)/gu) ?? []).length, 6,
    'Staff upload deduplication, delete, update, and list must enforce site filtering');
  assert.match(source, /data:\s*deletedPreviousDocs[\s\S]*?\.select\("id,storage_path"\)/u,
    'Storage cleanup must derive only from actually deleted previous documents');
  assert.match(source, /if \(deleteError \|\| !deletedDocs\?\.length\)/u,
    'Document delete must not claim success after zero authorized deletions');
  assert.match(source, /if \(error \|\| !updatedDocs\?\.length\)/u,
    'Document update must not claim success after zero authorized updates');

  const siteA = 'a0040000-0000-4000-8000-000000000001';
  const siteB = 'b0040000-0000-4000-8000-000000000002';
  const scenarios = [
    { name: 'authorized local read', permission: 'workforce.employees.view', allow: true },
    { name: 'authorized local document changes', permission: 'staff.documents.manage', allow: true },
    { name: 'foreign employee with site-only grant, even when RPC(NULL) is true',
      targetSite: siteB, scope: 'site', allow: false },
    { name: 'foreign workforce.employees.view site-only rejects cross-site with exact global denial',
      permission: 'workforce.employees.view', targetSite: siteB, scope: 'site', allow: false },
    { name: 'foreign employee with explicit individual GLOBAL grant',
      targetSite: siteB, scope: 'employee', allow: true },
    { name: 'foreign employee with actual-role GLOBAL grant',
      targetSite: siteB, scope: 'role', allow: true },
    { name: 'foreign employee with global grant but ineffective permission',
      targetSite: siteB, scope: 'role', effective: false, allow: false },
    { name: 'foreign employee globally granted but denied at destination site',
      targetSite: siteB, scope: 'employee', targetPermissionAllowed: false, allow: false },
    { name: 'foreign employee with missing permission catalog',
      targetSite: siteB, scope: 'employee', noCatalog: true, allow: false },
    { name: 'foreign employee with inactive target assignment',
      targetSite: siteB, targetActive: false, scope: 'employee', allow: false },
    { name: 'foreign employee with inactive operator assignment',
      targetSite: siteB, operatorActive: false, scope: 'employee', allow: false },
    { name: 'foreign employee from shared device',
      targetSite: siteB, sharedDevice: true, scope: 'role', allow: false },
    { name: 'foreign employee with invalid assignment site UUID',
      targetSite: 'not-a-uuid', scope: 'employee', allow: false },
    { name: 'inactive local target assignment', targetActive: false, allow: false },
    { name: 'inactive local operator assignment', operatorActive: false, allow: false },
    { name: 'permission denied', permissionAllowed: false, allow: false },
    { name: 'missing operational site', siteId: null, allow: false },
    { name: 'invalid operational site', siteId: 'not-a-uuid', allow: false },
    { name: 'database error', databaseError: true, allow: false },
    { name: 'authorized local shared device', sharedDevice: true, operatorActive: false, allow: true },
  ];

  for (const scenario of scenarios) {
    const queries = [];
    let adminClients = 0;
    let globalCalls = 0;
    const actualPermission = scenario.permission ?? 'staff.documents.manage';
    const targetSite = scenario.targetSite ?? siteA;
    const rows = [
      { employee_id: 'target-employee', site_id: targetSite,
        is_active: scenario.targetActive !== false, is_primary: true },
      { employee_id: 'operator-employee', site_id: siteA,
        is_active: scenario.operatorActive !== false, is_primary: true },
    ];
    const admin = {
      from(table) {
        const filters = {};
        let selected = '';
        const ordering = [];
        const query = {
          select(columns) { selected = columns; return query; },
          eq(column, value) { filters[column] = value; return query; },
          is(column, value) { assert.equal(value, null); filters[column] = value; return query; },
          or(value) { filters.or = value; return query; },
          order(column, direction) { ordering.push({ column, direction }); return query; },
          limit(n) { assert.equal(n, 1); return query; },
          async maybeSingle() {
            queries.push({ table, selected, ...filters, ordering });
            const reply = (data) => ({ data, error: null });
            if (scenario.databaseError) {
              return { data: null, error: new Error('synthetic database failure') };
            }
            if (table === 'employee_sites') {
              assert.ok(selected === 'employee_id' || selected === 'site_id');
              assert.equal(filters.is_active, true, scenario.name);
              const match = rows.find((row) =>
                Object.entries(filters).every(([key, value]) => row[key] === value));
              if (selected === 'site_id') {
                assert.deepEqual(ordering.map((entry) => entry.column), ['is_primary', 'site_id']);
              }
              return reply(match ? { [selected]: match[selected] } : null);
            }
            if (table === 'apps') {
              assert.equal(filters.code, 'viso');
              return reply(scenario.noCatalog ? null : { id: 'viso-app' });
            }
            if (table === 'app_permissions') {
              assert.equal(filters.app_id, 'viso-app');
              assert.equal(filters.code, actualPermission);
              return reply({ id: 'required-permission' });
            }
            if (table === 'employee_permissions' || table === 'role_permissions') {
              assert.equal(filters.permission_id, 'required-permission');
              assert.equal(filters.is_allowed, true);
              for (const field of [
                'scope_site_id', 'scope_area_id', 'scope_site_type', 'scope_area_kind',
              ]) assert.equal(filters[field], null, scenario.name);
              if (table === 'employee_permissions') {
                assert.equal(filters.employee_id, 'operator-employee');
                assert.equal(filters.scope_type, 'global');
                return reply(scenario.scope === 'employee' ? { id: 'global-grant' } : null);
              }
              assert.equal(filters.role, 'gerente');
              assert.equal(filters.or, 'scope_type.eq.global,scope_type.is.null');
              return reply(scenario.scope === 'role' ? { permission_id: 'required-permission' } : null);
            }
            assert.fail('Unexpected privileged table: ' + table);
          },
        };
        return query;
      },
    };
    const authClient = {
      async rpc(name, args) {
        assert.equal(name, 'has_permission');
        assert.equal(args.p_permission_code, 'viso.' + actualPermission);
        assert.equal(args.p_area_id, null);
        globalCalls++;
        if (args.p_site_id === null) {
          // A site-only grant may return TRUE for RPC(NULL), by real SQL evidence.
          return { data: scenario.effective !== false, error: null };
        }
        assert.equal(args.p_site_id, targetSite, scenario.name);
        return { data: scenario.targetPermissionAllowed !== false, error: null };
      },
    };
    const guard = runInNewContext(executable, {
      URLSearchParams,
      requireAppAccess: async ({ appId, returnTo, permissionCode }) => {
        assert.equal(appId, 'viso');
        assert.equal(returnTo, '/staff/target-employee');
        assert.equal(permissionCode, actualPermission);
        if (scenario.permissionAllowed === false) throw new Error('SYNTHETIC_PERMISSION_DENIED');
        return {
          user: { id: 'operator-employee' },
          siteId: Object.hasOwn(scenario, 'siteId') ? scenario.siteId : siteA,
          operationalSession: { isSharedDevice: scenario.sharedDevice === true, role: 'gerente' },
          supabase: authClient,
        };
      },
      createAdminClient: () => { adminClients += 1; return admin; },
      redirect: (url) => { throw new Error('SYNTHETIC_REDIRECT:' + url); },
      encodeURIComponent,
    });

    if (scenario.allow) {
      const result = await guard('target-employee', actualPermission);
      const expectedSite = scenario.targetSite ?? siteA;
      assert.equal(result.authorizedSiteId, expectedSite, scenario.name);
      assert.equal(result.documentSiteFilter,
        'site_id.is.null,site_id.eq.' + expectedSite, scenario.name);
      assert.equal(result.supabase, admin, scenario.name);
      const expectedQueries = scenario.sharedDevice ? 1 : scenario.targetSite ? 7 : 2;
      assert.equal(queries.length, expectedQueries, scenario.name);
    } else {
      const denial = scenario.permissionAllowed === false
        ? /SYNTHETIC_PERMISSION_DENIED/u
        : scenario.name === 'foreign workforce.employees.view site-only rejects cross-site with exact global denial'
          ? /SYNTHETIC_REDIRECT:\/no-access\?reason=staff_global_scope_denied&permission=viso\.workforce\.employees\.view/u
          : /SYNTHETIC_REDIRECT:\/no-access\?/u;
      await assert.rejects(() => guard('target-employee', actualPermission),
        denial, scenario.name);
    }

    if ((scenario.allow && scenario.targetSite) || scenario.targetPermissionAllowed === false) {
      assert.equal(globalCalls, 2, 'GLOBAL and target-site permission RPCs: ' + scenario.name);
    }
    assert.equal(adminClients,
      scenario.permissionAllowed === false || Object.hasOwn(scenario, 'siteId') ? 0 : 1, scenario.name);
    if ((targetSite === siteA && scenario.targetActive !== false) ||
      scenario.sharedDevice || scenario.operatorActive === false) {
      assert.equal(globalCalls, 0, scenario.name);
    }
    for (const query of queries.filter((item) => item.table === 'employee_sites')) {
      assert.equal(query.is_active, true, scenario.name);
      if (query.selected === 'employee_id') assert.equal(query.site_id, siteA, scenario.name);
      else assert.equal(query.selected, 'site_id', scenario.name);
    }
  }
}

// Exercise the actual document Server Action with deterministic PostgREST
// doubles. No HTTP calls or persistent Supabase/Storage mutations.
async function verifyStaffDocumentMutations() {
  const source = fs.readFileSync(
    new URL('../../src/app/staff/[id]/page.tsx', import.meta.url), 'utf8',
  );
  const begin = source.indexOf('async function updateStaffDocument(');
  const end = source.indexOf('\nasync function uploadStaffPhoto(', begin);
  assert.ok(begin >= 0 && end > begin);
  const body = '(' + stripTypeScriptTypes(source.slice(begin, end)) + ')';
  const a = 'a0040000-0000-4000-8000-000000000001';
  const b = 'b0040000-0000-4000-8000-000000000002';
  for (const testCase of [
    { kind: 'delete', site: b, ok: false },
    { kind: 'update', site: b, ok: false },
    { kind: 'delete', site: a, ok: true },
    { kind: 'update', site: a, ok: true },
    { kind: 'delete', site: null, ok: true },
    { kind: 'delete', site: a, moved: true, ok: false },
  ]) {
    let site = testCase.site;
    const events = [];
    const returns = [];
    let revalidated = false;
    const admin = {
      from(table) {
        assert.equal(table, 'documents');
        const conditions = {};
        let operation = 'read';
        let scoped = false;
        const visible = () => {
          assert.equal(scoped, true, 'Document query must be site-scoped');
          assert.equal(conditions.id, 'synthetic-document');
          assert.equal(conditions.target_employee_id, 'target-employee');
          return site === null || site === a;
        };
        const query = {
          select(columns) {
            if (operation === 'read') {
              assert.equal(columns, 'id,storage_path');
              return query;
            }
            assert.equal(columns, 'id');
            if (!visible()) return Promise.resolve({ data: [], error: null });
            events.push(operation);
            return Promise.resolve({ data: [{ id: conditions.id }], error: null });
          },
          eq(field, value) { conditions[field] = value; return query; },
          or(value) {
            assert.equal(value, 'site_id.is.null,site_id.eq.' + a);
            scoped = true;
            return query;
          },
          async maybeSingle() {
            if (!visible()) return { data: null, error: null };
            const found = { id: conditions.id, storage_path: 'staff-documents/target-employee/fixture.pdf' };
            if (testCase.moved) site = b;
            return { data: found, error: null };
          },
          delete() { operation = 'delete'; return query; },
          update(changes) {
            assert.equal(changes.title, 'Updated');
            operation = 'update';
            return query;
          },
        };
        return query;
      },
      storage: {
        from(bucket) {
          assert.equal(bucket, 'documents');
          return { async remove(paths) { events.push('storage:' + paths.length); return { error: null }; } };
        },
      },
    };
    const action = runInNewContext(body, {
      FormData,
      asText: (value) => typeof value === 'string' ? value.trim() : '',
      requireStaffEmployeeSiteAccess: async (employee, permission) => {
        assert.equal(employee, 'target-employee');
        assert.equal(permission, 'staff.documents.manage');
        return { supabase: admin, documentSiteFilter: 'site_id.is.null,site_id.eq.' + a };
      },
      redirect: (url) => {
        returns.push(url);
        throw new Error('EXPECTED_REDIRECT:' + url);
      },
      revalidatePath: () => { revalidated = true; },
      isSafeStaffDocumentPath: () => true,
      DOCUMENT_BUCKET: 'documents',
      encodeURIComponent,
    });
    const form = new FormData();
    form.set('document_id', 'synthetic-document');
    form.set('employee_id', 'target-employee');
    form.set('document_action', testCase.kind);
    form.set('title', 'Updated');
    await assert.rejects(() => action(form), /EXPECTED_REDIRECT:/u);
    assert.equal(returns.length, 1);
    assert.equal(events.filter((e) => e === testCase.kind).length, Number(testCase.ok));
    assert.equal(events.filter((e) => e.startsWith('storage:')).length,
      testCase.ok && testCase.kind === 'delete' ? 1 : 0);
    assert.equal(revalidated, testCase.ok);
    assert.match(returns[0], testCase.ok ? /\?ok=document_/u : /\?error=/u);
  }
}


// Execute the real cross-site administration guards using identity/site
// fixtures. Do not touch Supabase data or write to any employee record.
async function verifyStaffAdministrativeTerritory() {
  const source = fs.readFileSync(
    new URL('../../src/app/staff/[id]/page.tsx', import.meta.url), 'utf8',
  );
  const begin = source.indexOf('async function requireStaffGlobalPermission(');
  const end = source.indexOf('\nasync function saveEmployeeAreaPurposeAssignment(', begin);
  assert.ok(begin >= 0 && end > begin, 'Global and site administrative guards must be present');
  const code = stripTypeScriptTypes(source.slice(begin, end));
  const siteA = 'a0040000-0000-4000-8000-000000000001';
  const siteB = 'b0040000-0000-4000-8000-000000000002';
  const scenarios = [
    { name: 'same site needs no global scope', requestedSite: siteA, allow: true },
    // SQL has_permission(NULL) can be TRUE for a site-only grant. The extra
    // provenance check MUST deny even when the RPC says permission is effective.
    { name: 'site-only grant with effective NULL-site RPC', requestedSite: siteB,
      effective: true, scope: 'site', allow: false },
    { name: 'cross-site with explicit employee global', requestedSite: siteB,
      effective: true, scope: 'employee', allow: true },
    { name: 'cross-site with actual-role global', requestedSite: siteB,
      effective: true, scope: 'role', allow: true },
    { name: 'GLOBAL grant must respect effective denial at requested destination',
      requestedSite: siteB, effective: true, scope: 'employee',
      targetEffective: false, allow: false },
    { name: 'GLOBAL grant must reject destination RPC errors',
      requestedSite: siteB, effective: true, scope: 'employee',
      targetError: true, allow: false },
    { name: 'invalid requested destination must fail before querying privileges',
      requestedSite: 'not-a-uuid', effective: true, scope: 'employee', allow: false },
    { name: 'cross-site global permission but target inactive', requestedSite: siteB,
      effective: true, scope: 'employee', targetActive: false, allow: false },
    { name: 'shared device cannot invoke global administrative scope', requestedSite: siteB,
      effective: true, scope: 'role', sharedDevice: true, allow: false },
    { name: 'effective permission denied despite global grant', requestedSite: siteB,
      effective: false, scope: 'employee', allow: false },
    { name: 'permission catalog lookup fails closed', requestedSite: siteB,
      effective: true, scope: 'employee', noCatalog: true, allow: false },
  ];
  for (const scenario of scenarios) {
    let globalCalls = 0;
    let targetCalls = 0;
    let assignmentChecks = 0;
    const access = {
      authorizedSiteId: siteA,
      operatorId: 'operator-employee',
      actualRole: 'gerente',
      isSharedDevice: scenario.sharedDevice === true,
      authClient: {
        async rpc(name, args) {
          assert.equal(name, 'has_permission', scenario.name);
          assert.equal(args.p_permission_code, 'viso.staff.manage', scenario.name);
          assert.equal(args.p_area_id, null, scenario.name);
          if (args.p_site_id === siteB) {
            targetCalls++;
            return {
              data: scenario.targetEffective !== false,
              error: scenario.targetError ? new Error('synthetic destination lookup failure') : null,
            };
          }
          assert.equal(args.p_site_id, null, scenario.name);
          globalCalls++;
          return { data: scenario.effective === true, error: null };
        },
      },
      supabase: {
        from(table) {
          const filters = {};
          const query = {
            select(columns) {
              assert.ok(columns, scenario.name);
              return query;
            },
            eq(field, value) { filters[field] = value; return query; },
            is(field, value) { assert.equal(value, null); filters[field] = value; return query; },
            or(expr) { filters.or = expr; return query; },
            limit(value) { assert.equal(value, 1); return query; },
            async maybeSingle() {
              const response = (data) => ({ data, error: null });
              if (table === 'apps') {
                assert.equal(filters.code, 'viso');
                return response(scenario.noCatalog ? null : { id: 'viso-app' });
              }
              if (table === 'app_permissions') {
                assert.equal(filters.app_id, 'viso-app');
                assert.equal(filters.code, 'staff.manage');
                return response({ id: 'staff-manage-permission' });
              }
              if (table === 'employee_permissions' || table === 'role_permissions') {
                assert.equal(filters.permission_id, 'staff-manage-permission');
                assert.equal(filters.is_allowed, true);
                for (const column of [
                  'scope_site_id', 'scope_area_id', 'scope_site_type', 'scope_area_kind',
                ]) assert.equal(filters[column], null, scenario.name);
                if (table === 'employee_permissions') {
                  assert.equal(filters.employee_id, 'operator-employee');
                  assert.equal(filters.scope_type, 'global');
                  return response(scenario.scope === 'employee' ? { id: 'global-employee-grant' } : null);
                }
                assert.equal(filters.role, 'gerente');
                assert.equal(filters.or, 'scope_type.eq.global,scope_type.is.null');
                return response(scenario.scope === 'role' ? { permission_id: 'staff-manage-permission' } : null);
              }
              if (table === 'employee_sites') {
                assignmentChecks++;
                assert.equal(filters.employee_id, 'target-employee', scenario.name);
                assert.equal(filters.site_id, siteB, scenario.name);
                assert.equal(filters.is_active, true, scenario.name);
                return response(scenario.targetActive === false ? null : { employee_id: 'target-employee' });
              }
              assert.fail('Unexpected privileged table ' + table + ' in ' + scenario.name);
            },
          };
          return query;
        },
      },
    };
    const helpers = runInNewContext(code +
      '\n({ requireStaffGlobalPermission, requireStaffAdministrativeSiteAccess })', {
      requireStaffEmployeeSiteAccess: async (employee, permission) => {
        assert.equal(employee, 'target-employee', scenario.name);
        assert.equal(permission, 'staff.manage', scenario.name);
        return access;
      },
      redirect: (value) => { throw new Error('SYNTHETIC_REDIRECT:' + value); },
      encodeURIComponent,
    });
    if (scenario.allow) {
      const result = await helpers.requireStaffAdministrativeSiteAccess(
        'target-employee', 'staff.manage', scenario.requestedSite,
      );
      assert.equal(result, access, scenario.name);
    } else {
      await assert.rejects(
        () => helpers.requireStaffAdministrativeSiteAccess(
          'target-employee', 'staff.manage', scenario.requestedSite,
        ), /SYNTHETIC_REDIRECT:\/no-access/u, scenario.name,
      );
    }
    const expectGlobalCalls = scenario.requestedSite === siteB && !scenario.sharedDevice ? 1 : 0;
    assert.equal(globalCalls, expectGlobalCalls, scenario.name);
    const hasActualGrant = scenario.scope === 'employee' || scenario.scope === 'role';
    const expectTargetCalls = scenario.requestedSite === siteB && scenario.effective &&
      hasActualGrant && !scenario.sharedDevice && !scenario.noCatalog ? 1 : 0;
    assert.equal(targetCalls, expectTargetCalls, scenario.name);
    const expectAssignment = expectTargetCalls && scenario.targetEffective !== false &&
      !scenario.targetError ? 1 : 0;
    assert.equal(assignmentChecks, expectAssignment, scenario.name);
  }

  for (const name of [
    'saveEmployeeAreaPurposeAssignment', 'saveEmployeeInventoryLocationAssignment',
    'setEmployeeKioskPin', 'updateEmployee', 'deleteEmployee',
    'addEmployeeSite', 'setPrimarySite', 'toggleEmployeeSite', 'removeEmployeeSite',
    'uploadStaffPhoto', 'grantEmployeePermission', 'removeEmployeePermission',
    'createEmployeeShift', 'updateEmployeeShift', 'deleteEmployeeShift',
  ]) {
    const start = source.indexOf('async function ' + name + '(');
    assert.ok(start >= 0, 'Missing employee Server Action: ' + name);
    const next = source.indexOf('\nasync function ', start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    assert.match(body, /requireStaff(EmployeeSiteAccess|AdministrativeSiteAccess)\(/u,
      name + ' must authorize the target employee and operator site');
  }
  for (const name of [
    'setEmployeeKioskPin', 'updateEmployee', 'deleteEmployee',
    'setPrimarySite', 'grantEmployeePermission', 'removeEmployeePermission',
  ]) {
    const start = source.indexOf('async function ' + name + '(');
    const next = source.indexOf('\nasync function ', start + 1);
    const body = source.slice(start, next === -1 ? undefined : next);
    assert.match(body, /requireStaffGlobalPermission\(/u,
      name + ' must guard its enterprise-wide mutations');
  }
  const photoBegin = source.indexOf('async function uploadStaffPhoto(');
  const photoEnd = source.indexOf('\nasync function grantEmployeePermission(', photoBegin);
  const photo = source.slice(photoBegin, photoEnd);
  assert.doesNotMatch(photo, /\.remove\(\[storagePath\]\)/u,
    'The photo action cannot delete a caller-provided Storage path');
  const shiftDeleteBegin = source.indexOf('async function deleteEmployeeShift(');
  const shifts = source.slice(shiftDeleteBegin,
    source.indexOf('\nexport default async function StaffDetailPage', shiftDeleteBegin));
  assert.match(shifts, /\.eq\("site_id", authorizedSiteId\)/u,
    'A shift delete must not affect another site');
}

// GAP-PKG-004: protect GLOBAL grant visibility against territorial overreach.
// Evaluate the real filter builder and read-only scope probe, not a stubbed UI.
async function verifyStaffGlobalGrantVisibility() {
  const source = fs.readFileSync(
    new URL('../../src/app/staff/[id]/page.tsx', import.meta.url), 'utf8',
  );
  const filterStart = source.indexOf('function employeePermissionScopeFilter(');
  const filterEnd = source.indexOf('\nasync function requireStaffAdministrativeSiteAccess(', filterStart);
  assert.ok(filterStart !== -1 && filterEnd > filterStart,
    'Employee permission visibility must have a scope-aware filter');
  const filter = runInNewContext(
    stripTypeScriptTypes(source.slice(filterStart, filterEnd)) + '\nemployeePermissionScopeFilter',
  );
  const siteA = 'a0040000-0000-4000-8000-000000000001';
  const localOnly = 'scope_site_id.eq.' + siteA;
  const globalOnly = 'and(scope_type.eq.global,scope_site_id.is.null,' +
    'scope_area_id.is.null,scope_site_type.is.null,scope_area_kind.is.null)';
  assert.equal(filter(siteA, false), localOnly,
    'Site-only operators must not see global or foreign-site employee grants');
  assert.equal(filter(siteA, true), localOnly + ',' + globalOnly,
    'Proven GLOBAL operators may see global grants, but not other site grants');

  // The page must pass the actual provenance guard, never only an
  // effective has_permission(NULL) result, before widening the query.
  assert.match(source, /canReadGlobalEmployeePermissions = canManagePermissions &&\s*await requireStaffGlobalPermission\(staffAccess, "staff\.permissions\.manage", true\)/u);
  assert.match(source, /\.or\(employeePermissionScopeFilter\(authorizedSiteId, canReadGlobalEmployeePermissions\)\)/u);

  const guardStart = source.indexOf('async function requireStaffGlobalPermission(');
  assert.ok(guardStart !== -1 && guardStart < filterStart);
  const guard = runInNewContext(
    stripTypeScriptTypes(source.slice(guardStart, filterStart)) + '\nrequireStaffGlobalPermission',
    {
      redirect: (url) => { throw new Error('SYNTHETIC_REDIRECT:' + url); },
      encodeURIComponent,
    },
  );
  assert.equal(await guard({ isSharedDevice: true, operatorId: 'operator' },
    'staff.permissions.manage', true), false, 'Shared devices cannot probe GLOBAL grants');
  const denied = {
    isSharedDevice: false,
    operatorId: 'operator',
    authClient: { rpc: async () => ({ data: false, error: null }) },
  };
  assert.equal(await guard(denied, 'staff.permissions.manage', true), false,
    'The visibility probe must fail closed on ineffective global permission');
  await assert.rejects(guard(denied, 'staff.permissions.manage'),
    /SYNTHETIC_REDIRECT:\/no-access/u,
    'Mutation guards must still redirect instead of falling back to local scope');
}

for (const surface of SURFACES) {
  test(`POS ${surface.id} ${surface.name}`, async () => {
    assert.equal(evaluateSurface(surface.id, positiveSurfaceScenarios[surface.id]), true);
    if (surface.id === 'VISO-SURFACE-008') {
      await verifyStaffDocumentSiteBoundary();
      await verifyStaffDocumentMutations();
      await verifyStaffAdministrativeTerritory();
      await verifyStaffGlobalGrantVisibility();
    }
  });
}

for (const surface of SURFACES) {
  test(`NEG ${surface.id} ${surface.name} falla cerrado`, () => {
    assert.equal(evaluateSurface(surface.id, negativeSurfaceScenarios[surface.id]), false);
  });
}

for (const packageName of CANONICAL_PACKAGES) {
  test(`PROFILE POS ${packageName}`, () => {
    assert.equal(evaluateProfile(packageName, positiveProfiles[packageName]), true);
  });
}

for (const packageName of CANONICAL_PACKAGES) {
  test(`PROFILE NEG ${packageName} no acepta cobertura incompleta`, () => {
    const incomplete = { ...positiveProfiles[packageName] };
    const firstKey = Object.keys(incomplete)[0];
    incomplete[firstKey] = false;
    assert.equal(evaluateProfile(packageName, incomplete), false);
  });
}

function validEvidence() {
  const targetPackageSet = [...CANONICAL_PACKAGES];
  const identity = sha256Identity('fixture');
  return {
    consumer_repository: CONSUMER_REPOSITORY,
    consumer_branch: 'main',
    consumer_base_commit: '1'.repeat(40),
    consumer_manifest_identity: identity,
    consumer_lockfile_identity: identity,
    test_contract_identity: identity,
    test_suite_identity: identity,
    fixture_set_identity: identity,
    route_inventory_identity: identity,
    handler_inventory_identity: identity,
    source_contract_identity: identity,
    environment_identity: 'isolated:win32:x64:node:v24.19.0',
    runtime_identity: 'v24.19.0',
    framework_identity: 'node:test+ci011-policy-engine-v1',
    target_package_set: targetPackageSet,
    compatibility_refs: targetPackageSet.map(
      (packageName) => VISO_RELATIONS[packageName].compatibility_ref,
    ),
    viso_profile_set: targetPackageSet.map(
      (packageName) => VISO_RELATIONS[packageName].profile,
    ),
    execution_identity: identity,
    started_at: '2026-08-18T08:42:00-05:00',
    completed_at: '2026-08-18T08:43:00-05:00',
    result: 'PASS',
    invalidation_reason: null,
    certification_scope: 'HARNESS_SELF_CERTIFICATION',
    consumer_conformance_claimed: false,
    safe_build_entrypoint: 'npm run build:ci011',
    implementation_boundaries: {
      package_versions_changed: false,
      supabase_mutation_performed: false,
      production_data_used: false,
      consumer_functional_debt_corrected: false,
    },
    test_summary: {
      executed: CONTRACTUAL_TEST_COUNT,
      passed: CONTRACTUAL_TEST_COUNT,
      failed: 0,
      skipped: 0,
      denied_paths: 16,
    },
  };
}

test('REG-01 evidencia válida tiene todos los campos contractuales', () => {
  const evidence = validEvidence();
  for (const field of REQUIRED_EVIDENCE_FIELDS) assert.ok(field in evidence);
  assert.deepEqual(validateEvidence(evidence), []);
});

test('REG-02 cero tests jamás se normaliza a PASS', () => {
  const evidence = validEvidence();
  evidence.test_summary.executed = 0;
  assert.ok(validateEvidence(evidence).includes('ZERO_REQUIRED_TESTS'));
});

test('REG-03 evidencia de otro consumidor jamás satisface VISO', () => {
  const evidence = validEvidence();
  evidence.consumer_repository = 'devVentoGroup/vento-origo';
  assert.ok(validateEvidence(evidence).includes('WRONG_CONSUMER_REPOSITORY'));
});

test('REG-04 cambiar commit vuelve STALE la evidencia', () => {
  const previous = validEvidence();
  const current = { ...previous, consumer_base_commit: '2'.repeat(40) };
  assert.equal(evidenceIsStale(previous, current), true);
});

test('REG-05 cambiar target package set vuelve STALE la evidencia', () => {
  const previous = validEvidence();
  const current = {
    ...previous,
    target_package_set: ['@vento/contracts'],
    compatibility_refs: ['PKG-COMP-MX-002'],
    viso_profile_set: ['VISO-PROFILE-CONTRACTS'],
  };
  assert.equal(evidenceIsStale(previous, current), true);
});

test('REG-06 entorno productivo queda bloqueado', () => {
  const evidence = validEvidence();
  evidence.environment_identity = 'production:remote';
  assert.ok(validateEvidence(evidence).includes('PRODUCTION_ENVIRONMENT_FORBIDDEN'));
});

test('REG-07 secretos reales o con forma de secreto quedan bloqueados', () => {
  assert.equal(containsSensitiveData({ password: 'synthetic-fixture-password-12345678' }), true);
});

test('REG-08 conjunto multi-package conserva orden canónico y perfiles exactos', () => {
  assert.deepEqual(
    resolveTargetPackages('@vento/ui-web,@vento/contracts,@vento/supabase'),
    ['@vento/contracts', '@vento/supabase', '@vento/ui-web'],
  );
});

test('REG-09 inventario exacto acepta 61 páginas, 48 estáticas, 13 dinámicas, 59 protegidas, 2 públicas, 10 handlers y 71 patrones', () => {
  const result = validateRouteInventoryEntries(EXPECTED_PAGE_FILES, EXPECTED_ROUTE_HANDLERS);
  assert.equal(result.result, 'PASS');
  assert.equal(result.actual_page_count, 61);
  assert.equal(result.actual_static_page_count, 48);
  assert.equal(result.actual_dynamic_page_count, 13);
  assert.equal(result.actual_protected_page_count, 59);
  assert.equal(result.actual_public_controlled_count, 2);
  assert.equal(result.actual_handler_count, 10);
  assert.equal(result.actual_technical_pattern_count, 71);
  assert.equal(result.month_route_present, true);
  assert.equal(result.public_routes_exact, true);
});

test('REG-10 inventario con drift de páginas o handlers queda bloqueado', () => {
  const pages = EXPECTED_PAGE_FILES.filter((entry) => entry !== 'src/app/page.tsx');
  pages.push('src/app/extra/page.tsx');
  const handlers = [...EXPECTED_ROUTE_HANDLERS, 'src/app/api/extra/route.ts'];
  const result = validateRouteInventoryEntries(pages, handlers);
  assert.equal(result.result, 'BLOCKED');
  assert.ok(result.missing_pages.includes('src/app/page.tsx'));
  assert.ok(result.unexpected_pages.includes('src/app/extra/page.tsx'));
  assert.ok(result.unexpected_handlers.includes('src/app/api/extra/route.ts'));
});

// Real Next SSR against the canonical GAP-PKG-004 isolated QA backend.
// Synthetic users, permissions and attendance exist only in that disposable QA.
// The verified backend/database identity is supplied by Shell's governed preflight.
async function verifyStaffNominalHttp({
  appOrigin, origin, anonKey, serviceKey, base, spawnSync, qaDatabaseContainer,
}) {
  assert.match(qaDatabaseContainer,
    /^supabase-VENTO_GAP_PKG_004_QA_ISOLADO-database-[a-f0-9]{12,64}$/u);
  const [{ createClient }, { createServerClient }, { randomUUID }] = await Promise.all([
    import('@supabase/supabase-js'), import('@supabase/ssr'), import('node:crypto'),
  ]);
  const nonce = randomUUID().replace(/-/gu, '');
  const ids = Object.fromEntries([
    'actor','targetA','targetB','siteA','siteB','access','view','manage','sentinel','targetGrant',
    'attendance',
  ].map(name => [name, randomUUID()]));
  const uuid = name => "'" + ids[name] + "'::uuid";
  const users = ['actor','targetA','targetB'];
  const permissionList = ['access','view','manage','sentinel'].map(uuid).join(',');
  const siteList = [uuid('siteA'),uuid('siteB')].join(',');
  const sentinelCode = 'qa.global.' + nonce.slice(0,12);
  const service = createClient(origin, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const created = [];
  const db = sql => {
    const run = spawnSync('docker', [
      'exec','-i',qaDatabaseContainer,'psql',
      '--username','postgres','--dbname','postgres','--no-psqlrc',
      '--tuples-only','--no-align','--quiet','--set','ON_ERROR_STOP=1',
    ], { cwd: base, input: sql, encoding: 'utf8', timeout: 45000, windowsHide: true });
    assert.ifError(run.error);
    assert.equal(run.status, 0, 'ISOLATED QA PostgreSQL: ' + (run.stderr ?? '').slice(-1300));
    return run.stdout.trim();
  };
  const snapshot = () => {
    const userList = users.map(uuid).join(',');
    return JSON.parse(db([
    'SELECT json_build_object(',
    " 'auth',(SELECT count(*) FROM auth.users WHERE id IN (" + userList + ")),",
    " 'users',(SELECT count(*) FROM public.users WHERE id IN (" + userList + ")),",
    " 'employees',(SELECT count(*) FROM public.employees WHERE id IN (" + userList + ")),",
    " 'attendance',(SELECT count(*) FROM public.attendance_logs WHERE employee_id IN (" + userList + ")),",
    " 'assignments',(SELECT count(*) FROM public.employee_sites WHERE employee_id IN (" + userList + ")),",
    " 'settings',(SELECT count(*) FROM public.employee_settings WHERE employee_id IN (" + userList + ")),",
    " 'grants',(SELECT count(*) FROM public.employee_permissions WHERE employee_id IN (" + userList + ")),",
    " 'sites',(SELECT count(*) FROM public.sites WHERE id IN (" + siteList + ")),",
    " 'permissions',(SELECT count(*) FROM public.app_permissions WHERE id IN (" + permissionList + "))",
    ');',
    ].join('\n')));
  };
  const before = snapshot();
  assert.ok(Object.values(before).every(x => x === 0), 'Nominal HTTP fixture identities must not exist');
  const email = name => 'gap004-http-' + nonce + '-' + name + '@example.invalid';
  const password = 'Gap004-Local-' + randomUUID();
  const nameOf = name => name === 'actor' ? 'GAP004_HTTP_OPERATOR' :
    name === 'targetA' ? 'GAP004_HTTP_SITE_A_TARGET' : 'GAP004_HTTP_SITE_B_TARGET';
  let siteSetupAttempted = false;
  try {
    for (const name of users) {
      const { data, error } = await service.auth.admin.createUser({
        email: email(name), password, email_confirm: true,
      });
      assert.equal(error, null, 'Local Auth must create the synthetic ' + name);
      assert.equal(data?.user?.id ? typeof data.user.id : '', 'string');
      ids[name] = data.user.id;
      created.push(data.user.id);
    }
    siteSetupAttempted = true;
    db([
      'BEGIN;',
      "SET LOCAL statement_timeout='15s';",
      'INSERT INTO public.sites(id,code,name,type,site_kind,site_type,is_active,operational_visibility) VALUES',
      '(' + uuid('siteA') + ", 'GAP004_HT_A_" + nonce.slice(0,12) +
        "', 'GAP004 Http Site A','satellite','operational','satellite',true,'operational'),",
      '(' + uuid('siteB') + ", 'GAP004_HT_B_" + nonce.slice(0,12) +
        "', 'GAP004 Http Site B','satellite','operational','satellite',true,'operational');",
      'INSERT INTO public.employees(id,site_id,role,full_name,is_active) VALUES',
      '(' + uuid('actor') + ',' + uuid('siteA') + ",'cajero','" + nameOf('actor') + "',true),",
      '(' + uuid('targetA') + ',' + uuid('siteA') + ",'cajero','" + nameOf('targetA') + "',true),",
      '(' + uuid('targetB') + ',' + uuid('siteB') + ",'cajero','" + nameOf('targetB') + "',true);",
      'INSERT INTO public.employee_sites(employee_id,site_id,is_primary,is_active) VALUES',
      '(' + uuid('actor') + ',' + uuid('siteA') + ',true,true),',
      '(' + uuid('targetA') + ',' + uuid('siteA') + ',true,true),',
      '(' + uuid('targetB') + ',' + uuid('siteB') + ',true,true)',
      'ON CONFLICT(employee_id,site_id) DO UPDATE SET is_active=true;',
      // Only the isolated QA fixture creates this missing app-access catalog entry.
      // It is not a persistent permission or a role-level authorization.
      'INSERT INTO public.app_permissions(id,app_id,code,name)',
      'SELECT ' + uuid('access') + ",a.id,'access','GAP004 QA TEMP ACCESS' FROM public.apps a",
      "WHERE a.code='viso' AND NOT EXISTS (SELECT 1 FROM public.app_permissions p",
      " WHERE p.app_id=a.id AND p.code='access');",
      'INSERT INTO public.app_permissions(id,app_id,code,name)',
      'SELECT ' + uuid('view') + ",a.id,'workforce.employees.view','GAP004 temporary view' FROM public.apps a",
      "WHERE a.code='viso' AND NOT EXISTS (SELECT 1 FROM public.app_permissions p",
      " WHERE p.app_id=a.id AND p.code='workforce.employees.view');",
      'INSERT INTO public.app_permissions(id,app_id,code,name)',
      'SELECT ' + uuid('manage') + ",a.id,'staff.permissions.manage','GAP004 temporary manage' FROM public.apps a",
      "WHERE a.code='viso' AND NOT EXISTS (SELECT 1 FROM public.app_permissions p",
      " WHERE p.app_id=a.id AND p.code='staff.permissions.manage');",
      'INSERT INTO public.app_permissions(id,app_id,code,name)',
      'SELECT ' + uuid('sentinel') + ",a.id,'" + sentinelCode + "','GAP004 GLOBAL ROW SENTINEL' FROM public.apps a",
      "WHERE a.code='viso';",
      'INSERT INTO public.employee_permissions(employee_id,permission_id,is_allowed,scope_type,scope_site_id)',
      "SELECT " + uuid('actor') + ",p.id,true,'site'," + uuid('siteA'),
      'FROM public.app_permissions p JOIN public.apps a ON a.id=p.app_id',
      "WHERE a.code='viso' AND p.code IN ('access','workforce.employees.view','staff.permissions.manage');",
      'INSERT INTO public.employee_permissions(id,employee_id,permission_id,is_allowed,scope_type)',
      'SELECT ' + uuid('targetGrant') + ',' + uuid('targetA') +
        ",p.id,true,'global' FROM public.app_permissions p",
      'WHERE p.id=' + uuid('sentinel') + ';',
      // VISO correctly denies ordinary workers without an ANIMA check-in.
      // A synthetic, active work context is necessary to test SITE/GLOBAL.
      'INSERT INTO public.attendance_logs(id,employee_id,site_id,action,source,device_info) VALUES',
      '(' + uuid('attendance') + ',' + uuid('actor') + ',' + uuid('siteA') +
        ",'check_in','web','{}'::jsonb);",
      'COMMIT;',
    ].join('\n'));
    const jar = new Map();
    const cookieClient = createServerClient(origin, anonKey, {
      cookies: {
        getAll() { return [...jar].map(([name,value]) => ({ name,value })); },
        setAll(next) { for (const item of next) {
          if (item.value) jar.set(item.name,item.value);
          else jar.delete(item.name);
        } },
      },
    });
    const { data: login, error: loginError } = await cookieClient.auth.signInWithPassword({
      email: email('actor'), password,
    });
    assert.equal(loginError, null, 'Synthetic operator must authenticate with real GoTrue');
    assert.ok(login?.session?.access_token);
    const cookieHeader = [...jar].map(([name,value]) =>
      name + '=' + encodeURIComponent(value)).join('; ');
    assert.match(cookieHeader, /sb-[a-z0-9-]+-auth-token/iu,
      'Real Supabase SSR cookies must be emitted');
    async function page(name) {
      const response = await fetch(appOrigin + '/staff/' + ids[name], {
        headers: { cookie: cookieHeader }, redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      });
      return { status: response.status, location: response.headers.get('location') ?? '',
        html: await response.text() };
    }
    const local = await page('targetA');
    const localRedirect = new URL(local.location || '/', appOrigin);
    assert.equal(local.status, 200,
      'Real operator must view its own site worker; HTTP=' + local.status +
      ' redirect=' + localRedirect.pathname +
      ' reason=' + (localRedirect.searchParams.get('reason') ?? 'NONE') +
      ' permission=' + (localRedirect.searchParams.get('permission') ?? 'NONE'));
    assert.match(local.html, /GAP004_HTTP_SITE_A_TARGET/u);
    assert.equal(local.html.includes(ids.targetGrant), false,
      'SITE-only manager must not receive a global grant row identity');
    const foreignDenied = await page('targetB');
    assert.ok(foreignDenied.status < 500, 'Foreign-site denial must not be a server error');
    assert.doesNotMatch(foreignDenied.html, /GAP004_HTTP_SITE_B_TARGET/u);
    assert.ok(
      foreignDenied.location.includes('/no-access') ||
      /NEXT_REDIRECT[\s\S]{0,600}no-access|no-access[\s\S]{0,600}NEXT_REDIRECT/iu
        .test(foreignDenied.html),
      'SITE-only worker must be explicitly denied on the other site',
    );
    db([
      'INSERT INTO public.employee_permissions(employee_id,permission_id,is_allowed,scope_type)',
      'SELECT ' + uuid('actor') + ",p.id,true,'global' FROM public.app_permissions p",
      'JOIN public.apps a ON a.id=p.app_id',
      "WHERE a.code='viso' AND p.code IN ('workforce.employees.view','staff.permissions.manage');",
    ].join('\n'));
    const effectiveGlobal = await cookieClient.rpc('has_permission', {
      p_permission_code: 'viso.staff.permissions.manage', p_site_id: null, p_area_id: null,
    });
    const directGlobal = await service.from('employee_permissions')
      .select('id,scope_type')
      .eq('employee_id', ids.targetA)
      .or('scope_site_id.eq.' + ids.siteA +
        ',and(scope_type.eq.global,scope_site_id.is.null,scope_area_id.is.null,' +
        'scope_site_type.is.null,scope_area_kind.is.null)');
    assert.equal(effectiveGlobal.error, null);
    assert.equal(effectiveGlobal.data, true, 'Operator must have effective GLOBAL scope');
    assert.equal(directGlobal.error, null);
    assert.deepEqual(directGlobal.data?.map(row => row.id), [ids.targetGrant]);
    const localGlobal = await page('targetA');
    assert.equal(localGlobal.status, 200);
    assert.match(localGlobal.html, /GAP004_HTTP_SITE_A_TARGET/u);
    assert.equal(localGlobal.html.includes(ids.targetGrant), true,
      'Proven GLOBAL manager must receive the exact target grant identity in Next response');
    const foreignAllowed = await page('targetB');
    assert.equal(foreignAllowed.status, 200, 'Explicit GLOBAL grant should allow assigned remote worker');
    assert.match(foreignAllowed.html, /GAP004_HTTP_SITE_B_TARGET/u);
    console.log('GAP004_VISO_REAL_HTTP_NOMINAL_SITE_GLOBAL_PASS');
  } finally {
    // Attempt every cleanup stage even if a previous stage fails. Never
    // orphan a synthetic Auth account because an SQL cleanup failed.
    const cleanupErrors = [];
    const liveUsers = users.map(uuid).join(',');
    if (siteSetupAttempted) {
      try {
        db([
          'BEGIN;',
          "SET LOCAL statement_timeout='15s';",
          'SET LOCAL session_replication_role=replica;',
          'DELETE FROM public.attendance_logs WHERE employee_id IN (' + liveUsers + ');',
          'DELETE FROM public.employee_permissions WHERE employee_id IN (' + liveUsers + ');',
          'DELETE FROM public.employee_sites WHERE employee_id IN (' + liveUsers + ');',
          'DELETE FROM public.employee_settings WHERE employee_id IN (' + liveUsers + ');',
          'DELETE FROM public.employees WHERE id IN (' + liveUsers + ');',
          'DELETE FROM public.app_permissions WHERE id IN (' + permissionList + ');',
          'DELETE FROM public.users WHERE id IN (' + liveUsers + ');',
          'DELETE FROM public.sites WHERE id IN (' + siteList + ');',
          'COMMIT;',
        ].join('\n'));
      } catch { cleanupErrors.push('postgres'); }
    }
    for (const userId of created) {
      try {
        const { error } = await service.auth.admin.deleteUser(userId);
        if (error) cleanupErrors.push('auth');
      } catch { cleanupErrors.push('auth'); }
    }
    try { assert.deepEqual(snapshot(), before); }
    catch { cleanupErrors.push('residuals'); }
    assert.deepEqual(cleanupErrors, [], 'Every LOCAL HTTP fixture must be fully removed');
  }
}

// Real loopback Next.js HTTP QA: anonymous and forged sessions, then a real
// LOCAL Auth employee with temporary site/global permission fixtures.
// No hosted credentials, external navigation, or persistent fixtures.
test('GAP-PKG-004 VISO Next SSR anonymously rejects a real staff detail HTTP request',
  { timeout: 150000 }, async (t) => {
    const [{ spawn, spawnSync }, { createServer }, { fileURLToPath, pathToFileURL }, path] =
      await Promise.all([
        import('node:child_process'), import('node:net'),
        import('node:url'), import('node:path'),
      ]);
    // Fail closed: never fall back to Supabase LOCAL, STAGING or production.
    // Reuse the canonical Shell preflight: project ID, exact loopback ports,
    // database Docker labels, migration history and zero owned QA residues.
    const base = fileURLToPath(new URL('../../', import.meta.url));
    const shellRoot = path.resolve(base, '..', 'vento-shell');
    const preflightPath = path.join(shellRoot, 'scripts/quality/supabase-db-harness.mjs');
    if (!fs.existsSync(preflightPath)) {
      t.skip('GAP004_ISOLATED_QA_SHELL_WORKSPACE_NOT_AVAILABLE');
      return;
    }
    const { runIsolatedQaPreflight } = await import(pathToFileURL(preflightPath).href);
    const qa = await runIsolatedQaPreflight({
      root: shellRoot,
      afterVerified: async ({ api, anonKey, serviceKey, profile, roleCajero, visoAccess }) => {
        assert.equal(api, 'http://127.0.0.1:23151');
        assert.equal(roleCajero, true);
        assert.equal(visoAccess, false);
        assert.ok(typeof anonKey === 'string' && anonKey.length > 100);
        assert.ok(typeof serviceKey === 'string' && serviceKey.length > 100);
        return { origin: api, publicKey: anonKey, serviceKey,
          qaDatabaseContainer: profile.databaseContainer };
      },
    });
    const { origin, publicKey, serviceKey, qaDatabaseContainer } = qa;
    const next = path.join(base, 'node_modules', 'next', 'dist', 'bin', 'next');
    assert.equal(fs.existsSync(next), true, 'The installed Next runtime is required');
    const listener = createServer();
    await new Promise((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', resolve);
    });
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    const env = {};
    for (const key of [
      'PATH', 'Path', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'USERPROFILE',
      'APPDATA', 'LOCALAPPDATA', 'HOME', 'HOMEDRIVE', 'HOMEPATH',
      'ComSpec', 'COMSPEC', 'ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432',
    ]) if (typeof process.env[key] === 'string') env[key] = process.env[key];
    Object.assign(env, {
      NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
      HOSTNAME: '127.0.0.1',
      NEXT_PUBLIC_SUPABASE_URL: origin, SUPABASE_URL: origin,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
      SUPABASE_ANON_KEY: publicKey, SUPABASE_SERVICE_ROLE_KEY: serviceKey ?? '',
      SUPABASE_SECRET_KEY: '', NEXT_PUBLIC_COOKIE_DOMAIN: '',
      COOKIE_DOMAIN: '', NEXT_PUBLIC_SHELL_LOGIN_URL: 'http://127.0.0.1:' + port + '/login',
    });
    const child = spawn(process.execPath, [
      next, 'dev', '--hostname', '127.0.0.1', '--port', String(port),
    ], {
      cwd: base, env, windowsHide: true, shell: false,
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    });
    const diagnostics = new Set();
    for (const stream of [child.stdout, child.stderr]) {
      stream.on('data', (bytes) => {
        const output = String(bytes);
        for (const code of [
          'EADDRINUSE', 'EACCES', 'MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND',
          'QA_NETWORK_OUTBOUND_FORBIDDEN', 'LOCK', 'ERROR', 'Error:',
        ]) if (output.includes(code)) diagnostics.add(code);
      });
    }
    let exited = false;
    child.on('exit', () => { exited = true; });
    child.on('error', (error) => {
      diagnostics.add(['ENOENT', 'EACCES'].includes(error.code)
        ? error.code : 'CHILD_SPAWN_FAILED');
      exited = true;
    });
    try {
      const appOrigin = 'http://127.0.0.1:' + port;
      let ready = false;
      const started = Date.now();
      while (Date.now() - started < 105000 && !ready && !exited) {
        try {
          const response = await fetch(appOrigin + '/login', {
            redirect: 'manual', signal: AbortSignal.timeout(2500),
          });
          ready = response.status >= 200 && response.status < 500;
          await response.body?.cancel();
        } catch { /* Server is still starting. */ }
        if (!ready) await new Promise((resolve) => setTimeout(resolve, 650));
      }
      assert.equal(ready, true,
        'LOCAL_NEXT_SSR_START_FAILED diagnostics=' + [...diagnostics].join(','));
      const target = 'b0040000-0000-4000-8000-000000000099';
      const response = await fetch(appOrigin + '/staff/' + target, {
        method: 'GET', redirect: 'manual',
        signal: AbortSignal.timeout(30000),
      });
      const location = response.headers.get('location') ?? '';
      const body = (await response.text()).slice(0, 4000);
      const redirectedToLogin = response.status >= 300 && response.status < 400 &&
        /^\/login(?:\?|\/|$)/u.test(location);
      const streamedRedirect = response.status === 200 &&
        /\/login(?:\?|&#63;|%3F)/iu.test(body) &&
        /NEXT_REDIRECT|http-equiv=["']refresh/iu.test(body);
      assert.equal(redirectedToLogin || streamedRedirect, true,
        'Anonymous staff page must deny access; HTTP ' + response.status +
        '; redirect_class=' + (location.startsWith('/login') ? 'LOGIN' : 'OTHER'));
      console.log('GAP004_VISO_REAL_HTTP_ANONYMOUS_DENIAL_PASS');

      // A fabricated JWT cannot authorize a user even if it claims a
      // privileged role and another site. There is no real Auth user here.
      const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
      const forgedJwt = [
        encoded({ alg: 'HS256', typ: 'JWT' }),
        encoded({
          iss: origin + '/auth/v1', sub: target, aud: 'authenticated',
          role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 900,
          app_metadata: { role: 'admin', site_id: target },
          user_metadata: { role: 'admin', site_id: target },
        }),
        'not-a-valid-signature',
      ].join('.');
      const forgedCookie = 'sb-127-auth-token=base64-' + Buffer.from(JSON.stringify({
        access_token: forgedJwt, token_type: 'bearer', expires_in: 900,
        expires_at: Math.floor(Date.now() / 1000) + 900,
        refresh_token: 'invalid-synthetic-token',
      })).toString('base64url');
      for (const attempt of [
        { key: 'forged_session', url: appOrigin + '/staff/' + target,
          headers: { Cookie: forgedCookie } },
        { key: 'manipulated_site', url: appOrigin + '/staff/' + target +
            '?site_id=b0040000-0000-4000-8000-000000000098',
          headers: { Cookie: forgedCookie } },
      ]) {
        const denied = await fetch(attempt.url, {
          method: 'GET', redirect: 'manual', headers: attempt.headers,
          signal: AbortSignal.timeout(30000),
        });
        const where = denied.headers.get('location') ?? '';
        const html = (await denied.text()).slice(0, 4000);
        const loginRedirect = denied.status >= 300 && denied.status < 400 &&
          /^\/login(?:\?|\/|$)/u.test(where);
        const streamRedirect = denied.status === 200 &&
          /\/login(?:\?|&#63;|%3F)/iu.test(html) &&
          /NEXT_REDIRECT|http-equiv=["']refresh/iu.test(html);
        assert.equal(loginRedirect || streamRedirect, true,
          'Forged credentials cannot authorize staff access: ' + attempt.key +
          '; HTTP ' + denied.status);
      }
      console.log('GAP004_VISO_REAL_HTTP_FORGED_SESSION_DENIAL_PASS');
      await t.test('GAP-PKG-004 isolated GoTrue HTTP nominal SITE and GLOBAL', async () => {
        await verifyStaffNominalHttp({
          appOrigin, origin, anonKey: publicKey, serviceKey, base, spawnSync,
          qaDatabaseContainer,
        });
      });
    } finally {
      if (child.pid && process.platform === 'win32') {
        spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'],
          { windowsHide: true, timeout: 10000, stdio: 'ignore' });
      } else if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch {
          try { child.kill('SIGKILL'); } catch { /* already stopped */ }
        }
      }
    }
  });

test('GAP-PKG-004 VISO administrative review requires actor-site grant and delegates to ANIMA', async () => {
  const source = fs.readFileSync(
    new URL('../../src/app/staff/[id]/page.tsx', import.meta.url), 'utf8',
  );
  const start = source.indexOf('async function decideAttendanceCheckoutReview(');
  const end = source.indexOf('\nexport default async function StaffDetailPage(', start);
  assert.ok(start >= 0 && end > start, 'Review action must exist on staff detail');
  const action = source.slice(start, end);
  assert.match(action, /await requireStaffEmployeeSiteAccess\(employeeId, "workforce\.employees\.view"\)/u);
  assert.match(action, /access\.isSharedDevice \|\| access\.operatorId === employeeId/u);
  assert.match(action, /"anima\.attendance\.checkout_review\.decide"/u);
  assert.match(action, /access\.authClient\.rpc\("decide_attendance_checkout_review_v1"/u);
  assert.match(action, /ticket\.target_employee_id \?\? ticket\.created_by/u);
  assert.match(action, /ticket\.title !== "Revisión de salida sin ubicación"/u);
  assert.match(source, /\.eq\("title", "Revisión de salida sin ubicación"\)/u);
  assert.match(action, /access\.authorizedSiteId/u);
  assert.match(action, /checkoutAt = instant\.toISOString\(\)/u);
  assert.doesNotMatch(action, /from\("attendance_logs"\)\.(?:insert|update|delete)|supabaseServiceRoleKey/iu);
  assert.match(source, /type="datetime-local"/u);
  assert.match(source, /Rechazar sin marcar salida/u);

  const worker = 'b0040000-0000-4000-8000-000000000001';
  const manager = 'b0040000-0000-4000-8000-000000000002';
  const site = 'b0040000-0000-4000-8000-000000000003';
  const ticket = 'b0040000-0000-4000-8000-000000000004';
  const entry = 'b0040000-0000-4000-8000-000000000005';
  const values = new Map([
    ['employee_id', worker], ['ticket_id', ticket], ['check_in_log_id', entry],
    ['decision', 'reject'], ['reason', 'No hay evidencia comprobable de salida.'],
  ]);
  const form = { get: (key) => values.get(key) ?? null };
  const calls = [];
  let allowed = false;
  let ticketTitle = 'Revisión de salida sin ubicación';
  const authClient = { rpc: async (name, args) => {
    calls.push({ name, args });
    if (name === 'has_permission') return { data: allowed, error: null };
    if (name === 'decide_attendance_checkout_review_v1') {
      return { data: [{ result: 'applied' }], error: null };
    }
    throw new Error('Unexpected RPC');
  } };
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() {
      return { data: { id: ticket, site_id: site, category: 'attendance',
        title: ticketTitle, created_by: worker,
        target_employee_id: null, status: 'open' }, error: null };
    },
  };
  const sandbox = {
    asText: (x) => typeof x === 'string' ? x.trim() : '',
    requireStaffEmployeeSiteAccess: async () => ({
      authClient, supabase: { from: () => query },
      isSharedDevice: false, operatorId: manager, authorizedSiteId: site,
    }),
    redirect: (url) => { throw new Error('REDIRECT:' + url); },
    revalidatePath: () => {},
    Date,
    encodeURIComponent,
  };
  const executable = stripTypeScriptTypes(action) + '\ndecideAttendanceCheckoutReview';
  const decide = runInNewContext(executable, sandbox);
  await assert.rejects(decide(form), /Falta%20autorizaci%C3%B3n/u);
  assert.deepEqual(calls.map((x) => x.name), ['has_permission'],
    'No owner mutation RPC without effective actor-site permission');
  allowed = true;
  ticketTitle = 'Conversación general';
  calls.length = 0;
  await assert.rejects(decide(form), /La%20solicitud/u);
  assert.deepEqual(calls.map((x) => x.name), ['has_permission'],
    'A generic support ticket cannot invoke ANIMA attendance');
  ticketTitle = 'Revisión de salida sin ubicación';
  calls.length = 0;
  await assert.rejects(decide(form), /attendance_review_rejected/u);
  assert.deepEqual(calls.map((x) => x.name),
    ['has_permission', 'decide_attendance_checkout_review_v1']);
  assert.equal(calls[1].args.p_ticket_id, ticket);
  assert.equal(calls[1].args.p_check_in_log_id, entry);
  assert.equal(calls[1].args.p_decision, 'reject');
  assert.equal(calls[1].args.p_checkout_at, null);
});

