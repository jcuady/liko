'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BuildingsIcon,
  CheckCircleIcon,
  MinusCircleIcon,
  ProhibitIcon,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input, Select } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ORG_PLANS, ORG_PLAN_LABELS, type OrgPlan, type Role } from '@/lib/api/types';

import { setMemberRoleAction, setMemberStatusAction, updateOrgAction } from './actions';

/**
 * The administration console.
 *
 * WHY ONE PAGE AND NOT ONE PAGE PER JOB. An administrator arrives with a single
 * question, usually "who can see what", and the answers to it are a handful of
 * related facts. Splitting people, organisation and access across routes would
 * make them change page to compare a role against the rule that grants it, which
 * is the one comparison they came to make.
 *
 * WHY THE MATRIX IS PASSED IN. `rbac.ts` stays the single source of truth. The
 * server reads the live matrix and hands the rows over, so the table can never
 * drift from the rules the product actually enforces.
 */

interface Member {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: Role;
  status: 'active' | 'suspended';
  joinedAt: string;
}

interface Org {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  seatLimit: number;
  billingEmail: string | null;
  createdAt: string;
}

interface ClassSummary {
  id: string;
  name: string;
  code: string;
  meetsPerWeek: number;
}

interface MatrixRow {
  role: Role;
  label: string;
  grants: { permission: string; label: string; scope: string }[];
}

const ROLE_ORDER: Role[] = ['admin', 'instructor', 'student', 'guardian'];

const SCOPE_COPY: Record<string, string> = {
  yes: 'Allowed',
  no: 'Not allowed',
  own: 'Own records only',
  linked: 'Linked records only',
};

function shortDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-label">{label}</p>
        <p className="mt-2 text-[1.75rem] font-semibold leading-none text-ink">{value}</p>
        <p className="mt-2 text-meta text-ink-muted">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function AdminConsole({
  org,
  members,
  classes,
  viewerId,
  viewerName,
  roleLabels,
  matrix,
}: {
  org: Org;
  members: Member[];
  classes: ClassSummary[];
  viewerId: string;
  viewerName: string;
  roleLabels: Record<Role, string>;
  matrix: MatrixRow[];
}) {
  const router = useRouter();
  const active = members.filter((member) => member.status === 'active');
  const admins = active.filter((member) => member.role === 'admin');

  const [name, setName] = React.useState(org.name);
  const [plan, setPlan] = React.useState<OrgPlan>(org.plan);
  const [seatLimit, setSeatLimit] = React.useState(String(org.seatLimit));
  const [billingEmail, setBillingEmail] = React.useState(org.billingEmail ?? '');

  // Every write here changes server props rather than a query the component
  // observes, so the invalidation alone would leave the screen showing the old
  // value until a manual reload. Same reasoning as `ClassesManager`.
  const refresh = React.useCallback(async () => {
    router.refresh();
  }, [router]);

  const saveOrg = useMutation({
    mutationFn: () =>
      updateOrgAction({
        name,
        plan,
        seatLimit: Number(seatLimit),
        billingEmail,
      }),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await refresh();
    },
  });

  const changeRole = useMutation({
    mutationFn: (input: { memberId: string; role: Role }) => setMemberRoleAction(input),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await refresh();
    },
  });

  const changeStatus = useMutation({
    mutationFn: (input: { memberId: string; status: 'active' | 'suspended' }) =>
      setMemberStatusAction(input),
    onSuccess: async (result) => {
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await refresh();
    },
  });

  const pending = saveOrg.isPending || changeRole.isPending || changeStatus.isPending;

  return (
    <Tabs defaultValue="people">
      <TabsList className="mb-6">
        <TabsTrigger value="people">People</TabsTrigger>
        <TabsTrigger value="classes">Classes</TabsTrigger>
        <TabsTrigger value="organisation">Organisation</TabsTrigger>
        <TabsTrigger value="access">Access</TabsTrigger>
      </TabsList>

      <TabsContent value="people">
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Active members"
              value={String(active.length)}
              hint={`${members.length - active.length} suspended`}
            />
            <Stat label="Administrators" value={String(admins.length)} hint="Can manage people" />
            <Stat
              label="Seats used"
              value={`${active.length} of ${org.seatLimit}`}
              hint={ORG_PLAN_LABELS[org.plan]}
            />
            <Stat label="Classes" value={String(classes.length)} hint="In this workspace" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>People</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-meta text-ink-muted">
                A role decides what someone may do. Suspending someone keeps their history and
                restores it in one click. You are signed in as {viewerName}.
              </p>

              <ul className="mt-4 divide-y divide-border">
                {members.map((member) => {
                  const isViewer = member.userId === viewerId;
                  const suspended = member.status === 'suspended';
                  const onlyAdmin = member.role === 'admin' && admins.length === 1;

                  return (
                    <li
                      key={member.id}
                      className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] text-ink">
                          {member.fullName || member.email}
                          {isViewer ? <Badge tone="accent">You</Badge> : null}
                          {suspended ? <Badge tone="warning">Suspended</Badge> : null}
                        </p>
                        <p className="mt-0.5 truncate text-meta text-ink-muted">
                          {member.email} · joined {shortDate(member.joinedAt)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <label className="sr-only" htmlFor={`role-${member.id}`}>
                          Role for {member.fullName || member.email}
                        </label>
                        <Select
                          id={`role-${member.id}`}
                          value={member.role}
                          disabled={pending}
                          onChange={(event) =>
                            changeRole.mutate({
                              memberId: member.id,
                              role: event.target.value as Role,
                            })
                          }
                          className="w-auto min-w-[8.5rem] rounded-[10px] px-2.5 lg:h-9 lg:text-sm"
                        >
                          {ROLE_ORDER.map((role) => (
                            <option key={role} value={role}>
                              {roleLabels[role]}
                            </option>
                          ))}
                        </Select>

                        <Button
                          type="button"
                          size="sm"
                          variant={suspended ? 'secondary' : 'ghost'}
                          disabled={pending || isViewer || onlyAdmin}
                          title={
                            isViewer
                              ? 'You cannot change your own access.'
                              : onlyAdmin
                                ? 'Promote someone else to administrator first.'
                                : undefined
                          }
                          onClick={() =>
                            changeStatus.mutate({
                              memberId: member.id,
                              status: suspended ? 'active' : 'suspended',
                            })
                          }
                        >
                          {suspended ? 'Restore' : 'Suspend'}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="classes">
        <Card>
          <CardHeader>
            <CardTitle>Classes</CardTitle>
          </CardHeader>
          <CardContent>
            {classes.length === 0 ? (
              <p className="text-meta text-ink-muted">
                No classes yet. They appear here as soon as a teacher creates one.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {classes.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[0.9375rem] text-ink">{item.name}</p>
                      <p className="mt-0.5 text-meta text-ink-muted">{item.code}</p>
                    </div>
                    <p className="shrink-0 text-meta text-ink-muted">
                      {item.meetsPerWeek} {item.meetsPerWeek === 1 ? 'lesson' : 'lessons'} a week
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="organisation">
        <Card className="max-w-[42rem]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2.5">
              <BuildingsIcon size={20} weight="duotone" aria-hidden="true" />
              Organisation
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-meta text-ink-muted">
              How this workspace is sold and who receives the invoice. Renaming does not change
              anyone&apos;s sign-in.
            </p>

            <FormField id="org-name" label="Organisation name" required>
              {(props) => (
                <Input
                  {...props}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </FormField>

            <FormField id="org-plan" label="Plan">
              {(props) => (
                <Select
                  {...props}
                  value={plan}
                  onChange={(event) => setPlan(event.target.value as OrgPlan)}
                >
                  {ORG_PLANS.map((option) => (
                    <option key={option} value={option}>
                      {ORG_PLAN_LABELS[option]}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>

            <FormField
              id="org-seats"
              label="Seats"
              hint="How many active members this plan is sold for."
            >
              {(props) => (
                <Input
                  {...props}
                  inputMode="numeric"
                  value={seatLimit}
                  onChange={(event) => setSeatLimit(event.target.value)}
                />
              )}
            </FormField>

            <FormField
              id="org-billing"
              label="Billing email"
              hint="Where renewals are sent. Leave empty to keep it off the record."
            >
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  value={billingEmail}
                  onChange={(event) => setBillingEmail(event.target.value)}
                  placeholder="office@school.test"
                />
              )}
            </FormField>

            <p className="text-meta text-ink-muted">
              Identifier {org.slug}, created {shortDate(org.createdAt)}.
            </p>

            <div className="flex justify-end">
              <Button type="button" disabled={pending} onClick={() => saveOrg.mutate()}>
                {saveOrg.isPending ? 'Saving' : 'Save organisation'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="access">
        <Card>
          <CardHeader>
            <CardTitle>What each role may do</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-meta text-ink-muted">
              This is the live access model, read from the same rules the product enforces.
              &quot;Own records only&quot; means the person sees their own work and nothing else;
              &quot;linked records only&quot; means only records connected to their account.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left">
                <caption className="sr-only">Permissions granted to each role</caption>
                <thead>
                  <tr>
                    <th scope="col" className="border-b border-border py-2 pr-4 text-label">
                      Role
                    </th>
                    <th scope="col" className="border-b border-border py-2 pr-4 text-label">
                      Can
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {matrix.map((row) => (
                    <tr key={row.role} className="align-top">
                      <th
                        scope="row"
                        className="w-[11rem] border-b border-border py-3 pr-4 text-[0.9375rem] font-medium text-ink"
                      >
                        {row.label}
                      </th>
                      <td className="border-b border-border py-3 pr-4">
                        <ul className="flex flex-col gap-1.5">
                          {row.grants.map((grant) => (
                            <li key={grant.permission} className="flex items-center gap-2 text-meta">
                              {grant.scope === 'no' ? (
                                <ProhibitIcon
                                  size={15}
                                  weight="bold"
                                  className="shrink-0 text-ink-subtle"
                                  aria-hidden="true"
                                />
                              ) : grant.scope === 'yes' ? (
                                <CheckCircleIcon
                                  size={15}
                                  weight="fill"
                                  className="shrink-0 text-accent"
                                  aria-hidden="true"
                                />
                              ) : (
                                <MinusCircleIcon
                                  size={15}
                                  weight="bold"
                                  className="shrink-0 text-warning"
                                  aria-hidden="true"
                                />
                              )}
                              <span className={grant.scope === 'no' ? 'text-ink-subtle' : 'text-ink'}>
                                {grant.label}
                              </span>
                              {grant.scope !== 'yes' && grant.scope !== 'no' ? (
                                <span className="text-ink-subtle">
                                  ({SCOPE_COPY[grant.scope] ?? grant.scope})
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}