'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, Building2, CircleCheck, CircleMinus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRowHead,
  TableRow,
} from '@/components/ui/table';
import {
  INVITE_TTL_DAYS,
  ORG_PLANS,
  ORG_PLAN_LABELS,
  ORG_SECTORS,
  ORG_SECTOR_LABELS,
  ORG_VERIFICATION_LABELS,
  inviteStatus,
  type InviteRecord,
  type OrgPlan,
  type OrgProfile,
  type OrgProfileInput,
  type OrgSector,
  type Role,
} from '@/lib/api/types';

import {
  createInviteAction,
  listInvitesAction,
  setMemberRoleAction,
  setMemberStatusAction,
  updateOrgAction,
  updateSeatLimitAction,
} from './actions';

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
 *
 * WHY INVITATIONS ARE PULLED, NOT PASSED IN. Issuing a code has to put that code
 * on screen the moment it exists, and the list has to gain the row without a
 * full page reload. `listInvitesAction` is the read that does it, which is why it
 * is an action rather than another prop from `page.tsx`.
 *
 * WHY AN INVITATION IS A CODE AND NOT A LINK. This product sends no mail. A code
 * an administrator can read out loud, copy, or hand over is a code that works in
 * a corridor, which is how a school actually invites somebody. It is eight
 * characters, single use, and good for fourteen days, and the copy on this screen
 * says so where the code is shown rather than in a footnote nobody opens.
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
  /**
   * The institutional profile as stored. Read only as far as this screen is
   * concerned: the eight fields below are editable, the verification status is
   * not, and there is no control anywhere here that could change it.
   */
  profile: OrgProfile;
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

/** The bounds `organizations` enforces on the grade columns. */
const GRADE_MIN = -2;
const GRADE_MAX = 16;

/**
 * WHY THIS IS NOT THE WHOLE OF ISO 3166-1. Two hundred and forty nine options
 * in a select is a list nobody scrolls past, and a school in a country missing
 * from a short list still has to be recordable. So this is the set of likely
 * answers and the code field beside it accepts any two-letter code, which is
 * what the column's check constraint actually enforces.
 */
const COUNTRY_CODES: readonly (readonly [string, string])[] = [
  ['AE', 'United Arab Emirates'],
  ['AR', 'Argentina'],
  ['AT', 'Austria'],
  ['AU', 'Australia'],
  ['BD', 'Bangladesh'],
  ['BW', 'Botswana'],
  ['BR', 'Brazil'],
  ['CA', 'Canada'],
  ['CH', 'Switzerland'],
  ['CL', 'Chile'],
  ['CN', 'China'],
  ['CO', 'Colombia'],
  ['CR', 'Costa Rica'],
  ['DE', 'Germany'],
  ['DO', 'Dominican Republic'],
  ['EG', 'Egypt'],
  ['ES', 'Spain'],
  ['ET', 'Ethiopia'],
  ['FR', 'France'],
  ['GB', 'United Kingdom'],
  ['GH', 'Ghana'],
  ['ID', 'Indonesia'],
  ['IE', 'Ireland'],
  ['IL', 'Israel'],
  ['IN', 'India'],
  ['IT', 'Italy'],
  ['JM', 'Jamaica'],
  ['JP', 'Japan'],
  ['KE', 'Kenya'],
  ['KR', 'South Korea'],
  ['LK', 'Sri Lanka'],
  ['MA', 'Morocco'],
  ['MX', 'Mexico'],
  ['MY', 'Malaysia'],
  ['NA', 'Namibia'],
  ['NG', 'Nigeria'],
  ['NL', 'Netherlands'],
  ['NO', 'Norway'],
  ['NP', 'Nepal'],
  ['NZ', 'New Zealand'],
  ['PA', 'Panama'],
  ['PE', 'Peru'],
  ['PH', 'Philippines'],
  ['PK', 'Pakistan'],
  ['PL', 'Poland'],
  ['PT', 'Portugal'],
  ['QA', 'Qatar'],
  ['RU', 'Russia'],
  ['SA', 'Saudi Arabia'],
  ['SE', 'Sweden'],
  ['SG', 'Singapore'],
  ['TH', 'Thailand'],
  ['TR', 'Turkey'],
  ['TT', 'Trinidad and Tobago'],
  ['TZ', 'Tanzania'],
  ['UA', 'Ukraine'],
  ['US', 'United States'],
  ['VN', 'Vietnam'],
  ['ZA', 'South Africa'],
  ['ZM', 'Zambia'],
  ['ZW', 'Zimbabwe'],
];

/**
 * The same trade as the country list, on a column the database leaves as free
 * text: enough zones to cover where the product is used, and a field beside it
 * for the ones that are not. `UTC` is here because every profile row defaults
 * to it, so an institution that never chose a zone already has one.
 */
const TIMEZONE_ZONES: readonly string[] = [
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Africa/Lagos',
  'Africa/Nairobi',
  'America/Bogota',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Mexico_City',
  'America/New_York',
  'America/Sao_Paulo',
  'America/Toronto',
  'Asia/Bangkok',
  'Asia/Dubai',
  'Asia/Hong_Kong',
  'Asia/Jakarta',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Kuala_Lumpur',
  'Asia/Manila',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Atlantic/Reykjavik',
  'Australia/Melbourne',
  'Australia/Perth',
  'Australia/Sydney',
  'Europe/Amsterdam',
  'Europe/Berlin',
  'Europe/Dublin',
  'Europe/Istanbul',
  'Europe/Lisbon',
  'Europe/London',
  'Europe/Madrid',
  'Europe/Paris',
  'Europe/Stockholm',
  'Europe/Warsaw',
  'Pacific/Auckland',
  'Pacific/Honolulu',
  'UTC',
];

/**
 * WHY A FIELD WE CANNOT READ IS SAVED AS UNANSWERED. Every number on this form
 * is an optional answer about someone else's institution, so a value we cannot
 * make sense of is recorded as absent rather than coerced to zero or guessed
 * from the digits that were there. A wrong enrolment figure is worse than none.
 * Values that parse but fall outside the database's bounds are not touched
 * here: the server refuses those, which is what tells the admin which field.
 */
function readNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

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
  initialInvites,
  viewerId,
  viewerName,
  roleLabels,
  matrix,
}: {
  org: Org;
  members: Member[];
  classes: ClassSummary[];
  /** Read on the server, so the panel has its rows on first paint. */
  initialInvites: InviteRecord[];
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

  const [country, setCountry] = React.useState(org.profile.countryCode ?? '');
  const [sector, setSector] = React.useState<OrgSector | ''>(org.profile.sector ?? '');
  const [gradeMin, setGradeMin] = React.useState(
    org.profile.gradeMin === null ? '' : String(org.profile.gradeMin),
  );
  const [gradeMax, setGradeMax] = React.useState(
    org.profile.gradeMax === null ? '' : String(org.profile.gradeMax),
  );
  const [enrolment, setEnrolment] = React.useState(
    org.profile.enrolment === null ? '' : String(org.profile.enrolment),
  );
  const [timezone, setTimezone] = React.useState(org.profile.timezone ?? '');
  const [contactName, setContactName] = React.useState(org.profile.contactName ?? '');
  const [contactRole, setContactRole] = React.useState(org.profile.contactRole ?? '');

  const [invites, setInvites] = React.useState<InviteRecord[]>(initialInvites);
  const [inviteEmail, setInviteEmail] = React.useState('');
  const [inviteRole, setInviteRole] = React.useState<Role>('instructor');
  const [issued, setIssued] = React.useState<{ code: string; email: string; expiresAt: string } | null>(
    null,
  );

  /*
   * Issued invitations are held here and read on mount.
   *
   * The alternative was a prop from `page.tsx`, and that would leave this tab
   * showing whatever the server rendered an hour ago, with no row for the code
   * that was just minted. One read action covers both the first paint and the
   * refresh after issuing.
   */
  /*
   * Refreshing the list after issuing a code is a user action, not a mount.
   *
   * The first version of this fetched the invites in an effect on mount, which
   * painted an empty panel and then filled it in, and which the lint gate rightly
   * refuses: calling a setState function synchronously from an effect body is
   * the cascading-render pattern. The list now arrives with the page, the way
   * every other list in this console arrives, and this is only the refresh after
   * the admin has done something.
   */
  const loadInvites = React.useCallback(async () => {
    try {
      const result = await listInvitesAction();
      if (result.ok) {
        setInvites(result.invites);
        return;
      }
    } catch {
      // requirePermission throws rather than redirecting, so a session that
      // expired between renders rejects here. This list is supplementary, and
      // an unhandled rejection would put an administrator who is mid-invite
      // into the error boundary over a panel they were not using.
    }
    // Not a toast: a failed background read should not land on top of somebody
    // who is halfway through issuing a code.
    setInvites([]);
  }, []);

  /*
   * WHY THE PATCH IS BUILT DURING RENDER. `updateOrg` merges rather than
   * replaces, so what matters is that the key set is exactly the fields this
   * form owns. Deriving it here keeps the state and the patch one value instead
   * of two that can disagree, and it is the reason an institution whose stored
   * zone is not on the short list still saves that zone rather than blanking it.
   */
  const profileInput: OrgProfileInput = {
    countryCode: country.trim().toUpperCase() || null,
    sector: sector === '' ? null : sector,
    gradeMin: readNumber(gradeMin),
    gradeMax: readNumber(gradeMax),
    enrolment: readNumber(enrolment),
    timezone: timezone.trim() || null,
    contactName: contactName.trim() || null,
    contactRole: contactRole.trim() || null,
  };

  // A stored value outside the short list still needs an option of its own, or
  // the select would render blank over an answer that is in the database.
  const countryListed = COUNTRY_CODES.some(([code]) => code === country.trim().toUpperCase());
  const zoneListed = TIMEZONE_ZONES.includes(timezone.trim());

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
        profile: profileInput,
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

  const saveSeats = useMutation({
    mutationFn: () => updateSeatLimitAction({ seatLimit: Number(seatLimit) }),
    onSuccess: async (result) => {
      // A refusal to lower the limit below the current headcount arrives here as
      // a message, not an exception. The administrator is deciding to cut a
      // subscription, so the thing they need is the count they are cutting into,
      // not a red stack trace.
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      await refresh();
    },
  });

  const invite = useMutation({
    mutationFn: () => createInviteAction({ email: inviteEmail, role: inviteRole }),
    onSuccess: async (result) => {
      if (!result.ok || !result.code) {
        toast.error(result.message);
        return;
      }
      // Shown once, on screen. Nothing emails it, so this panel is the only
      // place the code exists once the administrator has read it.
      setIssued({
        code: result.code,
        email: inviteEmail.trim().toLowerCase(),
        expiresAt: result.expiresAt ?? '',
      });
      setInviteEmail('');
      toast.success(result.message);
      await loadInvites();
    },
  });

  const pending = saveOrg.isPending || changeRole.isPending || changeStatus.isPending;
  const seatsLeft = Math.max(org.seatLimit - active.length, 0);

  return (
    <Tabs defaultValue="people">
      <TabsList className="mb-6">
        <TabsTrigger value="people">People</TabsTrigger>
        <TabsTrigger value="invites">Invites</TabsTrigger>
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
                          value={member.role}
                          disabled={pending}
                          onValueChange={(next) =>
                            changeRole.mutate({
                              memberId: member.id,
                              role: next as Role,
                            })
                          }
                        >
                          <SelectTrigger
                            id={`role-${member.id}`}
                            className="w-auto min-w-[8.5rem] rounded-[10px] px-2.5 lg:h-9 lg:text-sm"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLE_ORDER.map((role) => (
                              <SelectItem key={role} value={role}>
                                {roleLabels[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
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

      <TabsContent value="invites">
        <div className="flex flex-col gap-6">
          <Card className="max-w-[42rem]">
            <CardHeader>
              {/*
               * An h2 rather than a CardTitle. The page heading is an h1 and
               * every other panel on this screen is an h3, so an h2 here is the
               * one level that is actually correct.
               */}
              <h2 className="text-h3">Invite a colleague</h2>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-meta text-ink-muted">
                An invitation is one code, good for one person. Share it however you already talk
                to them. The seat is only spent when it is used, so a code you never send costs
                nothing.
              </p>

              <FormField id="invite-email" label="Email address" required>
                {(props) => (
                  <Input
                    {...props}
                    type="email"
                    autoComplete="off"
                    value={inviteEmail}
                    placeholder="colleague@school.test"
                    onChange={(event) => setInviteEmail(event.target.value)}
                  />
                )}
              </FormField>

              <FormField
                id="invite-role"
                label="Role"
                hint="What this person will be able to do once they join."
              >
                {(props) => (
                  <Select value={inviteRole} onValueChange={(next) => setInviteRole(next as Role)}>
                  <SelectTrigger {...props}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_ORDER.map((role) => (
                      <SelectItem key={role} value={role}>
                        {roleLabels[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </FormField>

              <div className="flex justify-end">
                <Button
                  type="button"
                  disabled={invite.isPending}
                  onClick={() => invite.mutate()}
                >
                  {invite.isPending ? 'Creating' : 'Create invitation'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {issued ? (
            <Card className="max-w-[42rem] border-border-strong">
              <CardContent className="pt-5">
                <p className="text-label">Invitation code for {issued.email}</p>
                <p className="tabular mt-2 break-all text-[1.75rem] font-semibold leading-none tracking-[0.18em] text-ink">
                  {issued.code}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      void navigator.clipboard?.writeText(issued.code);
                      toast.success('Code copied.');
                    }}
                  >
                    Copy code
                  </Button>
                  <p className="text-meta text-ink-muted">
                    Send them to the join page and enter this code. It works once, it is for{' '}
                    {issued.email}, and it expires in {INVITE_TTL_DAYS} days
                    {issued.expiresAt ? `, on ${shortDate(issued.expiresAt)}` : ''}. Issuing another
                    one does not replace this one.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card className="max-w-[42rem]">
            <CardHeader>
              <h2 className="text-h3">Invitations</h2>
            </CardHeader>
            <CardContent>
              {invites.length === 0 ? (
                <p className="text-meta text-ink-muted">
                  No invitations yet. One appears here the moment you create it, whether it has
                  been used or not.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {invites.map((row) => {
                    const status = inviteStatus(row);

                    return (
                      <li
                        key={row.id}
                        className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] text-ink">
                            {row.email}
                            {status === 'open' ? (
                              <Badge tone="accent">Open</Badge>
                            ) : status === 'accepted' ? (
                              <Badge tone="success">Accepted</Badge>
                            ) : (
                              <Badge>Expired</Badge>
                            )}
                          </p>
                          <p className="tabular mt-0.5 truncate text-meta text-ink-muted">
                            {row.code} · {roleLabels[row.role]}
                          </p>
                        </div>

                        <p className="shrink-0 text-meta text-ink-muted">
                          {status === 'accepted'
                            ? `Joined ${shortDate(row.acceptedAt ?? row.createdAt)}`
                            : `Expires ${shortDate(row.expiresAt)}`}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
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
        <div className="flex flex-col gap-6">
          <Card className="max-w-[42rem]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2.5">
                <Building2 size={20} aria-hidden="true" />
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
                  <Select value={plan} onValueChange={(next) => setPlan(next as OrgPlan)}>
                  <SelectTrigger {...props}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_PLANS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {ORG_PLAN_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
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

              {/*
               * THE READOUT THAT MAKES THE BLOCK PREDICTABLE.
               *
               * `seat_limit` is enforced at redemption, so an administrator finds
               * out it has been reached when a colleague's invitation is refused,
               * which is the worst possible moment to learn it. The count sits
               * beside the field that sets it, so the limit is something an admin
               * watches approach rather than something the product discovers for
               * them.
               */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-surface-sunken p-3">
                <p className="tabular text-meta text-ink-muted">
                  {active.length} of {org.seatLimit} seats used. {seatsLeft} left. Invitations are
                  refused once this reaches {org.seatLimit}.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={saveSeats.isPending}
                  onClick={() => saveSeats.mutate()}
                >
                  {saveSeats.isPending ? 'Updating' : 'Update seats'}
                </Button>
              </div>

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

          <Card className="max-w-[42rem]">
            <CardHeader>
              <CardTitle>About the school</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-meta text-ink-muted">
                What kind of institution this is. Every answer here is optional. A solo teacher has
                no principal, no grade span and no pupil count, and this form is finished without
                any of them.
              </p>

              <FormField
                id="org-country"
                label="Country"
                hint="A starting point rather than the whole list of country codes."
              >
                {(props) => (
                  <Select value={country} onValueChange={setCountry}>
                  <SelectTrigger {...props}>
                    {/* Radix reserves the empty string, so the "Not set" option
                        becomes the placeholder and the stored value is unchanged. */}
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {/*
                     * Rendered rather than filtered out. An institution in a
                     * country this list does not carry is already recorded, and
                     * the select has to be able to say which one it is.
                     */}
                    {!countryListed && country.length > 0 ? (
                      <SelectItem value={country}>Other ({country})</SelectItem>
                    ) : null}
                    {COUNTRY_CODES.map(([code, name]) => (
                      <SelectItem key={code} value={code}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </FormField>

              <FormField
                id="org-country-code"
                label="Country code"
                hint="If your country is not listed above, type its two-letter code here."
              >
                {(props) => (
                  <Input
                    {...props}
                    value={country}
                    onChange={(event) => setCountry(event.target.value)}
                    placeholder="PH"
                    autoComplete="off"
                  />
                )}
              </FormField>

              <FormField
                id="org-sector"
                label="Sector"
                hint="Leave it unset if none of these fit."
              >
                {(props) => (
                  <Select value={sector} onValueChange={(next) => setSector(next as OrgSector | '')}>
                  <SelectTrigger {...props}>
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_SECTORS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {ORG_SECTOR_LABELS[option]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="org-grade-min" label="Lowest grade">
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      inputMode="numeric"
                      min={GRADE_MIN}
                      max={GRADE_MAX}
                      step={1}
                      value={gradeMin}
                      onChange={(event) => setGradeMin(event.target.value)}
                    />
                  )}
                </FormField>

                <FormField id="org-grade-max" label="Highest grade">
                  {(props) => (
                    <Input
                      {...props}
                      type="number"
                      inputMode="numeric"
                      min={GRADE_MIN}
                      max={GRADE_MAX}
                      step={1}
                      value={gradeMax}
                      onChange={(event) => setGradeMax(event.target.value)}
                    />
                  )}
                </FormField>
              </div>

              <p className="text-meta text-ink-muted">
                Grades run from {GRADE_MIN} to {GRADE_MAX}. Zero is kindergarten, and -1 and -2 are
                the pre-K years, so a negative number means children younger than kindergarten.
                Leave either end empty if the school teaches only part of that span.
              </p>

              <FormField
                id="org-enrolment"
                label="Pupils or students"
                hint="An estimate is fine. Leave it empty if you would rather not say."
              >
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={enrolment}
                    onChange={(event) => setEnrolment(event.target.value)}
                  />
                )}
              </FormField>

              <FormField
                id="org-timezone"
                label="Timezone"
                hint="A starting point rather than the whole list of zones."
              >
                {(props) => (
                  <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger {...props}>
                    <SelectValue placeholder="Not set" />
                  </SelectTrigger>
                  <SelectContent>
                    {/*
                     * The same escape hatch as the country, and for the same
                     * reason: a stored zone this list omits still has to be
                     * visible in the control that owns it.
                     */}
                    {!zoneListed && timezone.length > 0 ? (
                      <SelectItem value={timezone}>Other ({timezone})</SelectItem>
                    ) : null}
                    {TIMEZONE_ZONES.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zone}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
              </FormField>

              <FormField
                id="org-timezone-name"
                label="Timezone name"
                hint="If your zone is not listed above, type the IANA name here."
              >
                {(props) => (
                  <Input
                    {...props}
                    value={timezone}
                    onChange={(event) => setTimezone(event.target.value)}
                    placeholder="Asia/Manila"
                    autoComplete="off"
                  />
                )}
              </FormField>

              <FormField
                id="org-contact-name"
                label="Contact name"
                hint="Who a question about this organisation would go to. Leave empty if there is no one to name."
              >
                {(props) => (
                  <Input
                    {...props}
                    value={contactName}
                    onChange={(event) => setContactName(event.target.value)}
                    placeholder="Ada Lim"
                  />
                )}
              </FormField>

              <FormField
                id="org-contact-role"
                label="Contact role"
                hint="For example, principal or head of department."
              >
                {(props) => (
                  <Input
                    {...props}
                    value={contactRole}
                    onChange={(event) => setContactRole(event.target.value)}
                    placeholder="Head of department"
                  />
                )}
              </FormField>

              <div className="rounded-[12px] border border-border bg-surface-sunken p-4">
                <p className="text-label">Verification status</p>
                {/*
                 * Neutral at every value, deliberately. A colour here would be
                 * the product's opinion of the institution, and the only thing
                 * this block is allowed to report is what is on the record.
                 */}
                <p className="mt-2">
                  <Badge tone="neutral" size="md">
                    {ORG_VERIFICATION_LABELS[org.profile.verificationStatus]}
                  </Badge>
                </p>
                <p className="mt-2 text-meta text-ink-muted">
                  LIKO does not check institutions. Most organisations stay at this status, and
                  nothing in the app can change it: an organisation is only marked as checked by a
                  review carried out outside the product.
                </p>
              </div>

              <div className="flex justify-end">
                <Button type="button" disabled={pending} onClick={() => saveOrg.mutate()}>
                  {saveOrg.isPending ? 'Saving' : 'Save about the school'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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
              <Table className="min-w-[40rem]">
                <TableCaption className="sr-only">Permissions granted to each role</TableCaption>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Role</TableHead>
                    <TableHead scope="col">Can</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {matrix.map((row) => (
                    <TableRow key={row.role} className="align-top">
                      <TableRowHead scope="row" className="w-[11rem] whitespace-normal align-top">
                        {row.label}
                      </TableRowHead>
                      <TableCell className="align-top">
                        <ul className="flex flex-col gap-1.5">
                          {row.grants.map((grant) => (
                            <li key={grant.permission} className="flex items-center gap-2 text-meta">
                              {grant.scope === 'no' ? (
                                <Ban
                                  size={15}
                                  className="shrink-0 text-ink-subtle"
                                  aria-hidden="true"
                                />
                              ) : grant.scope === 'yes' ? (
                                <CircleCheck
                                  size={15}
                                  className="shrink-0 text-accent"
                                  aria-hidden="true"
                                />
                              ) : (
                                <CircleMinus
                                  size={15}
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}