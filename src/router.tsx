import { createRouter } from '@tanstack/react-router'
import { routerSearch } from '@/lib/router-search'
import { checkupDetailRoute } from '@/routes/checkup-detail'
import { checkupNewRoute } from '@/routes/checkup-new'
import { indexRoute } from '@/routes/index'
import { pairRoute } from '@/routes/pair'
import { personIndexRoute, personRoute } from '@/routes/person'
import { rootRoute } from '@/routes/root'
import { settingsRoute } from '@/routes/settings'

const routeTree = rootRoute.addChildren([
  indexRoute,
  personRoute.addChildren([personIndexRoute, checkupNewRoute, checkupDetailRoute]),
  settingsRoute,
  pairRoute,
])

export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
  trailingSlash: 'never',
  parseSearch: routerSearch.parse,
  stringifySearch: routerSearch.stringify,
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
