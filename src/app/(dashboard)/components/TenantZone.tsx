'use client';

import * as React from 'react';

import { DEFAULT_TIME_ZONE } from '@/lib/dates';

/**
 * THE INSTITUTION'S ZONE, GIVEN TO THE WHOLE DASHBOARD.
 *
 * A date that is rendered in the browser's own zone is rendered twice, once
 * by the server and once by the browser, and the two disagree whenever the
 * server and the reader are in different zones near midnight. So the zone has
 * to be fixed before either of them renders, and it has to be the same one
 * for every page, or two pages of the same product would answer the question
 * "what day was that" differently.
 *
 * The zone is the institution's, because the day a lesson happened is the
 * school's day. The dashboard shell reads it once and hands it down, so a
 * page added tomorrow cannot forget to.
 *
 * `DEFAULT_TIME_ZONE` is the answer when the institution has not said, and
 * it is the same on the server and in the browser, which is the property
 * that matters.
 */
const TenantZoneContext = React.createContext<string>(DEFAULT_TIME_ZONE);

export function TenantZoneProvider({
  zone,
  children,
}: {
  zone: string;
  children: React.ReactNode;
}) {
  return <TenantZoneContext.Provider value={zone}>{children}</TenantZoneContext.Provider>;
}

/** The zone every date in the dashboard is rendered in. */
export function useTenantZone(): string {
  return React.useContext(TenantZoneContext);
}
