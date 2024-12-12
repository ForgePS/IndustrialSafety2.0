// Third-party Imports
import { makeRouteHandler } from '@keystatic/next/route-handler'

// Config Imports
import keystaticConfig from '@repo/keystatic/configs/keystaticConfig'

const handlers = makeRouteHandler({
  config: keystaticConfig
})

const productionRouteHandler = (routeHandler: (req: Request) => Promise<Response>) => {
  if (process.env.NODE_ENV === 'production') {
    return () => new Response(null, { status: 404 })
  }

  return (req: Request) => routeHandler(req)
}

export const keystaticRouteHandlers = {
  POST: productionRouteHandler(handlers.POST),
  GET: productionRouteHandler(handlers.GET)
}
