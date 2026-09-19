"use client"
import { type ReactNode, useEffect, useState, useCallback, useMemo } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '../primitives/button'
import { IconButton } from '../primitives/icon-button'
import { Skeleton } from '../primitives/skeleton'
import { usePortalInjectedMenuItems } from './hooks/usePortalInjectedMenuItems'
import { usePortalEventBridge } from './hooks/usePortalEventBridge'
import { mergeMenuItems } from '../backend/injection/mergeMenuItems'
import type { MergedMenuItem } from '../backend/injection/mergeMenuItems'
import { PortalNotificationBell } from './components/PortalNotificationBell'
import { usePortalContext } from './PortalContext'
import { apiCall } from '../backend/utils/apiCall'
import type { PortalNavGroup } from './utils/nav'

// Component replacement handle IDs (FROZEN once shipped)
export const PORTAL_SHELL_HANDLE = 'page:portal:layout'
export const PORTAL_HEADER_HANDLE = 'section:portal:header'
export const PORTAL_FOOTER_HANDLE = 'section:portal:footer'
export const PORTAL_SIDEBAR_HANDLE = 'section:portal:sidebar'
export const PORTAL_USER_MENU_HANDLE = 'section:portal:user-menu'

export type ShellLogo = {
  src: string
  alt?: string
}

export type PortalShellProps = {
  children: ReactNode
  /** Override orgSlug (used on public pages without context) */
  orgSlug?: string
  /** Override organization name (used on public pages without context) */
  organizationName?: string
  /** Override the brand logo rendered in the header, footer, and sidebar. */
  logo?: ShellLogo
  /** Whether to show authenticated layout. Auto-detected from context when omitted. */
  authenticated?: boolean
  /** Logout handler. Auto-provided from context when omitted. */
  onLogout?: () => void
  enableEventBridge?: boolean
  /** Override user name. Auto-read from context when omitted. */
  userName?: string
  /** Override user email. Auto-read from context when omitted. */
  userEmail?: string
}

function PortalEventBridgeMount() {
  usePortalEventBridge()
  return null
}

/* ---- Inline SVG icons ---- */

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  )
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  )
}

function LogOutIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
    </svg>
  )
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  )
}

const PORTAL_THEME_STORAGE_KEY = 'om:portal:theme'

/**
 * Portal light/dark toggle. The design system swaps token values via the `dark`
 * class on the document element, so switching themes is a matter of adding /
 * removing that class and persisting the choice per viewer.
 */
function PortalThemeToggle({ t }: { t: (key: string, fallback?: string) => string }) {
  const [isDark, setIsDark] = useState<boolean>(true)

  useEffect(() => {
    let stored: string | null = null
    try {
      stored = window.localStorage.getItem(PORTAL_THEME_STORAGE_KEY)
    } catch {
      stored = null
    }
    const dark = stored ? stored === 'dark' : document.documentElement.classList.contains('dark')
    setIsDark(dark)
    document.documentElement.classList.toggle('dark', dark)
  }, [])

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev
      document.documentElement.classList.toggle('dark', next)
      try {
        window.localStorage.setItem(PORTAL_THEME_STORAGE_KEY, next ? 'dark' : 'light')
      } catch {
        // ignore storage failures (private mode, blocked cookies)
      }
      return next
    })
  }, [])

  return (
    <button
      type="button"
      onClick={toggle}
      className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      aria-pressed={!isDark}
    >
      {isDark ? <SunIcon className="size-4" /> : <MoonIcon className="size-4" />}
      {isDark ? t('portal.nav.themeLight', 'Tryb jasny') : t('portal.nav.themeDark', 'Tryb ciemny')}
    </button>
  )
}

/* ---- Sidebar nav item ---- */

function NavItemIcon({ item }: { item: { icon?: string; href?: string; id?: string } }) {
  const href = item.href ?? ''
  let key = item.icon ?? ''
  if (!key) {
    if (href.includes('/dashboard')) key = 'grid'
    else if (href.includes('/materials')) key = 'upload'
    else if (href.includes('/cases')) key = 'folder'
    else if (href.includes('/tasks')) key = 'check'
    else if (href.includes('/profile')) key = 'user'
    else if (href.includes('/order') || href.includes('/purchases')) key = 'bag'
    else if (/\/portal\/agency\/?$/.test(href)) key = 'sparkles'
  }
  const p = 'size-[18px] shrink-0'
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, viewBox: '0 0 24 24', className: p }
  switch (key) {
    case 'grid': return (<svg {...s}><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>)
    case 'sparkles': return (<svg {...s}><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M18 15l.9 2.3L21 18l-2.1.7L18 21l-.9-2.3L15 18l2.1-.7z"/></svg>)
    case 'upload': return (<svg {...s}><path d="M12 15V4"/><path d="M8 8l4-4 4 4"/><path d="M4 17v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"/></svg>)
    case 'folder': return (<svg {...s}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>)
    case 'check': case 'tasks': case 'check-square': case 'clipboard-check': return (<svg {...s}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>)
    case 'user': case 'profile': return (<svg {...s}><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>)
    case 'bag': case 'orders': case 'shopping-bag': return (<svg {...s}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>)
    case 'clock': return (<svg {...s}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>)
    case 'shield-check': return (<svg {...s}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></svg>)
    default: return (<svg {...s}><circle cx="12" cy="12" r="3.2"/></svg>)
  }
}

function SidebarNavItem({
  item,
  active,
  t,
  onClick,
}: {
  item: MergedMenuItem
  active: boolean
  t: (key: string, fallback?: string) => string
  onClick?: () => void
}) {
  const label = item.labelKey ? t(item.labelKey, item.label) : item.label
  if (!label) return null

  const cls = [
    'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    active
      ? 'bg-foreground text-background'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
  ].join(' ')

  if (item.href) {
    return (
      <Link href={item.href} className={cls} data-menu-item-id={item.id} onClick={onClick}>
        <NavItemIcon item={item as { icon?: string; href?: string; id?: string }} />
        <span className="truncate">{label}</span>
      </Link>
    )
  }
  if (item.onClick) {
    return (
      <button type="button" className={cls} data-menu-item-id={item.id} onClick={() => { item.onClick?.(); onClick?.() }}>
        <NavItemIcon item={item as { icon?: string; href?: string; id?: string }} />
        <span className="truncate">{label}</span>
      </button>
    )
  }
  return null
}

function SidebarNavSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-3 py-1" data-testid="portal-nav-loading">
      <Skeleton className="h-9 w-full rounded-lg" />
      <Skeleton className="h-9 w-11/12 rounded-lg" />
      <Skeleton className="h-9 w-5/6 rounded-lg" />
      <Skeleton className="h-9 w-10/12 rounded-lg" />
    </div>
  )
}

/* ---- User initials avatar ---- */

function UserAvatar({ name, className }: { name?: string; className?: string }) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?'
  return (
    <div className={`flex items-center justify-center rounded-full bg-foreground text-overline font-semibold text-background ${className ?? 'size-8'}`}>
      {initials}
    </div>
  )
}

/* ---- Try reading from PortalContext ---- */

function useOptionalPortalContext() {
  try {
    return usePortalContext()
  } catch {
    return null
  }
}

/* ================================================================== */
/*  PortalShell                                                       */
/* ================================================================== */

/**
 * Portal layout shell.
 *
 * When a `PortalProvider` is mounted in a parent layout, PortalShell reads
 * auth/tenant state from context — no re-fetching on navigation. Props are
 * used as overrides or for public pages that don't have a context.
 */
export function PortalShell({
  children,
  orgSlug: orgSlugProp,
  organizationName: orgNameProp,
  logo,
  authenticated: authenticatedProp,
  onLogout: onLogoutProp,
  enableEventBridge = false,
  userName: userNameProp,
  userEmail: userEmailProp,
}: PortalShellProps) {
  const t = useT()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Read from context when available (persists across navigations)
  const portalCtx = useOptionalPortalContext()

  // Resolve values: context takes priority, props are fallback/override
  const orgSlug = portalCtx?.orgSlug ?? orgSlugProp
  const orgName = portalCtx?.tenant.organizationName ?? orgNameProp
  const user = portalCtx?.auth.user ?? null
  const authenticated = authenticatedProp ?? !!user
  const onLogout = onLogoutProp ?? portalCtx?.auth.logout
  const userName = userNameProp ?? user?.displayName
  const userEmail = userEmailProp ?? user?.email

  const { items: injectedMainItems } = usePortalInjectedMenuItems('menu:portal:sidebar:main')
  const { items: injectedAccountItems } = usePortalInjectedMenuItems('menu:portal:sidebar:account')

  const portalHome = orgSlug ? `/${orgSlug}/portal` : '/portal'
  const loginHref = orgSlug ? `/${orgSlug}/portal/login` : '/portal/login'
  const signupHref = orgSlug ? `/${orgSlug}/portal/signup` : '/portal/signup'
  // Always use the resolved organization name from the database.
  // Fall back to the generic portal title — never display the raw slug.
  const headerTitle = orgName || t('portal.title', 'Customer Portal')

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  const [autoNavGroups, setAutoNavGroups] = useState<PortalNavGroup[]>([])
  const [isNavLoading, setIsNavLoading] = useState(authenticated)
  useEffect(() => {
    if (!authenticated) {
      setAutoNavGroups([])
      setIsNavLoading(false)
      return
    }
    let cancelled = false
    setIsNavLoading(true)
    const load = async () => {
      try {
        const { ok, result } = await apiCall<{ ok: boolean; groups?: PortalNavGroup[] }>(
          '/api/customer_accounts/portal/nav',
        )
        if (cancelled || !ok || !result?.ok) return
        setAutoNavGroups(Array.isArray(result.groups) ? result.groups : [])
      } catch {
        if (!cancelled) setAutoNavGroups([])
      } finally {
        if (!cancelled) setIsNavLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [authenticated])

  const mergedNavItems = useMemo(() => {
    if (!authenticated) return []
    const discovered = autoNavGroups.find((g) => g.id === 'main')?.items ?? []
    const builtIn = discovered.map((item) => ({
      id: item.id,
      labelKey: item.labelKey,
      label: item.label,
      href: item.href,
      icon: item.icon,
    }))
    return mergeMenuItems(builtIn, injectedMainItems)
  }, [authenticated, autoNavGroups, injectedMainItems])

  const mergedAccountItems = useMemo(() => {
    if (!authenticated) return []
    const discovered = autoNavGroups.find((g) => g.id === 'account')?.items ?? []
    const builtIn = discovered.map((item) => ({
      id: item.id,
      labelKey: item.labelKey,
      label: item.label,
      href: item.href,
      icon: item.icon,
    }))
    return mergeMenuItems(builtIn, injectedAccountItems)
  }, [authenticated, autoNavGroups, injectedAccountItems])

  const shouldRenderMainNav = isNavLoading || mergedNavItems.length > 0
  const shouldRenderAccountNav = mergedAccountItems.length > 0

  // Highlight only the most-specific matching nav item. A plain `startsWith`
  // marks a parent active on its children (e.g. `/portal/agency` stays active
  // on `/portal/agency/materials`), so pick the longest href that matches the
  // current path — on a boundary — across both nav lists.
  const activeNavHref = useMemo(() => {
    const hrefs = [...mergedNavItems, ...mergedAccountItems]
      .map((item) => item.href)
      .filter((href): href is string => !!href)
    const matches = hrefs.filter(
      (href) => pathname === href || pathname.startsWith(href.endsWith('/') ? href : `${href}/`),
    )
    if (matches.length === 0) return null
    return matches.reduce((longest, href) => (href.length > longest.length ? href : longest))
  }, [mergedNavItems, mergedAccountItems, pathname])
  const shouldRenderNav = shouldRenderMainNav || shouldRenderAccountNav

  /* ---- PUBLIC LAYOUT ---- */
  if (!authenticated) {
    return (
      <div className="flex min-h-svh flex-col bg-background" data-portal-handle={PORTAL_SHELL_HANDLE}>
        <header className="sticky top-0 z-sticky border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80" data-portal-handle={PORTAL_HEADER_HANDLE}>
          <div className="mx-auto flex h-16 w-full max-w-screen-lg items-center justify-between px-6">
            <Link href={portalHome} className="flex items-center gap-2.5 text-foreground transition hover:opacity-80" aria-label={headerTitle}>
              <Image src={logo?.src ?? "/open-mercato.svg"} alt={logo?.alt ?? ""} width={28} height={28} className="" priority />
              <span className="text-base font-semibold tracking-tight">{headerTitle}</span>
            </Link>
            <nav aria-label="Primary" className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm" className="text-sm">
                <Link href={loginHref}>{t('portal.nav.login', 'Log In')}</Link>
              </Button>
              <Button asChild size="sm" className="rounded-lg text-sm">
                <Link href={signupHref}>{t('portal.nav.signup', 'Sign Up')}</Link>
              </Button>
            </nav>
          </div>
        </header>

        <main className="flex-1">
          <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-8 px-6 py-12 sm:py-20">
            {children}
          </div>
        </main>

        <footer className="border-t" data-portal-handle={PORTAL_FOOTER_HANDLE}>
          <div className="mx-auto flex w-full max-w-screen-lg items-center justify-between px-6 py-6">
            <Link href={portalHome} className="flex items-center gap-2 text-muted-foreground transition hover:text-foreground">
              <Image src={logo?.src ?? "/open-mercato.svg"} alt={logo?.alt ?? ""} width={20} height={20} className="" />
              <span className="text-sm font-medium text-foreground">{headerTitle}</span>
            </Link>
            <p className="text-xs text-muted-foreground/60">
              {t('portal.footer.copyright', '\u00A9 {year} All rights reserved.', { year: new Date().getFullYear() })}
            </p>
          </div>
        </footer>
      </div>
    )
  }

  /* ---- AUTHENTICATED LAYOUT ---- */

  const sidebarContent = (
    <div className="flex h-full flex-col" data-portal-handle={PORTAL_SIDEBAR_HANDLE}>
      <div className="flex h-16 items-center gap-2.5 border-b px-5">
        <Link href={portalHome} className="flex items-center gap-2.5 text-foreground transition hover:opacity-80" aria-label={headerTitle}>
          <Image src={logo?.src ?? "/open-mercato.svg"} alt={logo?.alt ?? ""} width={22} height={22} className="" />
          <span className="text-sm font-semibold tracking-tight truncate">{headerTitle}</span>
        </Link>
      </div>

      <div
        className="hidden"
        data-testid="portal-nav-ready"
        data-ready={isNavLoading ? 'false' : 'true'}
        aria-hidden="true"
      />

      {shouldRenderNav ? (
        <nav aria-label="Portal navigation" className="flex-1 overflow-y-auto px-3 py-5">
          {shouldRenderMainNav ? (
            <>
              <p className="mb-2 px-3 text-overline font-semibold uppercase tracking-widest text-muted-foreground/50">
                {t('portal.nav.home', 'Portal')}
              </p>
              {isNavLoading ? (
                <SidebarNavSkeleton />
              ) : (
                <div className="flex flex-col gap-0.5">
                  {mergedNavItems.map((item) => (
                    <SidebarNavItem
                      key={item.id}
                      item={item}
                      active={!!item.href && item.href === activeNavHref}
                      t={t}
                      onClick={closeMobile}
                    />
                  ))}
                </div>
              )}
            </>
          ) : null}

          {shouldRenderAccountNav ? (
            <div className={shouldRenderMainNav ? 'mt-8' : ''}>
              <p className="mb-2 px-3 text-overline font-semibold uppercase tracking-widest text-muted-foreground/50">
                {t('portal.nav.account', 'Account')}
              </p>
              <div className="flex flex-col gap-0.5">
                {mergedAccountItems.map((item) => (
                  <SidebarNavItem
                    key={item.id}
                    item={item}
                    active={!!item.href && item.href === activeNavHref}
                    t={t}
                    onClick={closeMobile}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </nav>
      ) : null}

      <div className="border-t px-3 py-3">
        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
          <UserAvatar name={userName} className="size-8" />
          <div className="min-w-0 flex-1">
            {userName ? (
              <p className="truncate text-sm font-medium leading-tight">{userName}</p>
            ) : (
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            )}
            {userEmail ? (
              <p className="truncate text-overline text-muted-foreground">{userEmail}</p>
            ) : (
              <div className="mt-1 h-3 w-32 animate-pulse rounded bg-muted" />
            )}
          </div>
        </div>
        <PortalThemeToggle t={t} />
        <button
          type="button"
          onClick={onLogout}
          className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          data-portal-handle={PORTAL_USER_MENU_HANDLE}
          data-menu-item-id="portal-logout"
        >
          <LogOutIcon className="size-4" />
          {t('portal.nav.logout', 'Log Out')}
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex min-h-svh bg-background" data-portal-handle={PORTAL_SHELL_HANDLE}>
      {enableEventBridge ? <PortalEventBridgeMount /> : null}

      <aside className="hidden w-[240px] shrink-0 border-r lg:block">
        {sidebarContent}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-modal lg:hidden">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={closeMobile} />
          <aside className="relative z-10 h-full w-[280px] bg-background shadow-2xl">
            <div className="absolute right-3 top-4 z-20">
              <IconButton variant="ghost" size="sm" type="button" onClick={closeMobile} aria-label="Close menu">
                <XIcon className="size-4" />
              </IconButton>
            </div>
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b px-4 lg:px-8" data-portal-handle={PORTAL_HEADER_HANDLE}>
          <div className="flex items-center gap-3">
            <IconButton variant="ghost" size="sm" type="button" onClick={() => setMobileOpen(true)} className="lg:hidden" aria-label="Open menu">
              <MenuIcon className="size-5" />
            </IconButton>
          </div>
          <div className="flex items-center gap-3">
            <PortalNotificationBell t={t} />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="w-full px-4 py-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>

        <footer className="border-t px-4 py-4 lg:px-8" data-portal-handle={PORTAL_FOOTER_HANDLE}>
          <p className="text-overline text-muted-foreground/50">
            {t('portal.footer.copyright', '\u00A9 {year} All rights reserved.', { year: new Date().getFullYear() })}
          </p>
        </footer>
      </div>
    </div>
  )
}

export default PortalShell
