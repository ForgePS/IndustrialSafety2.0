import type { Metadata } from 'next'
import { Badge } from '@repo/ui/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { requireForgePlatformRole } from '@/lib/forgeCreatorAuth'
import {
  getWorkflowStates,
  getWorkflowTransitions,
  listWorkflowDefinitions
} from '@/lib/forgeWorkflow'

export const metadata: Metadata = { title: 'Workflows' }

const CreatorWorkflowsPage = async () => {
  await requireForgePlatformRole(['forge_owner', 'forge_creator', 'forge_read_only'])

  const definitions = await listWorkflowDefinitions()

  const enriched = await Promise.all(
    definitions.map(async definition => {
      const [states, transitions] = await Promise.all([
        getWorkflowStates(definition.id),
        getWorkflowTransitions(definition.id)
      ])
      return { definition, states, transitions }
    })
  )

  return (
    <div className='flex flex-col gap-6'>
      <div>
        <p className='text-primary text-sm font-semibold uppercase tracking-wide'>
          Forge Creator 2.0
        </p>
        <h1 className='text-textPrimary mt-1 text-3xl font-bold'>Workflows</h1>
        <p className='text-textSecondary mt-2 max-w-3xl'>
          Diagnostic view of core and tenant workflow definitions, states, and transitions.
        </p>
      </div>

      {enriched.length ? (
        enriched.map(({ definition, states, transitions }) => (
          <Card key={definition.id} data-testid='workflow-definition'>
            <CardHeader>
              <div className='flex flex-wrap items-center gap-2'>
                <CardTitle>{definition.name}</CardTitle>
                <Badge size='sm' variant={definition.is_core ? 'secondary' : 'outline'}>
                  {definition.is_core ? 'Core' : 'Tenant'}
                </Badge>
                <Badge size='sm' variant={definition.is_active ? 'tonalSuccess' : 'destructive'}>
                  {definition.is_active ? 'Active' : 'Inactive'}
                </Badge>
                <Badge size='sm' variant='outline'>
                  v{definition.version}
                </Badge>
              </div>
              <CardDescription>
                <span className='font-mono'>{definition.workflow_key}</span>
                {' · '}
                {definition.resource_type}
                {definition.organization_id
                  ? ' · org ' + definition.organization_id
                  : ' · platform'}
              </CardDescription>
            </CardHeader>
            <CardContent className='grid gap-6 lg:grid-cols-2'>
              <div className='flex flex-col gap-2'>
                <div className='text-textSecondary text-xs font-semibold uppercase tracking-wide'>
                  States ({states.length})
                </div>
                {states.length ? (
                  states.map((state: any) => (
                    <div
                      key={state.id || state.state_key}
                      className='flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3'
                    >
                      <div>
                        <div className='font-medium'>{state.name || state.state_key}</div>
                        <div className='text-textSecondary font-mono text-xs'>{state.state_key}</div>
                      </div>
                      <div className='flex flex-wrap gap-1'>
                        {state.is_initial ? (
                          <Badge size='sm' variant='outline'>
                            Initial
                          </Badge>
                        ) : null}
                        {state.is_terminal ? (
                          <Badge size='sm' variant='secondary'>
                            Terminal
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className='text-textSecondary text-sm'>No states.</div>
                )}
              </div>

              <div className='flex flex-col gap-2'>
                <div className='text-textSecondary text-xs font-semibold uppercase tracking-wide'>
                  Transitions ({transitions.length})
                </div>
                {transitions.length ? (
                  transitions.map(transition => (
                    <div key={transition.id} className='rounded-lg border p-3'>
                      <div className='font-medium'>{transition.name}</div>
                      <div className='text-textSecondary mt-1 font-mono text-xs'>
                        {transition.transition_key}
                      </div>
                      <div className='text-textSecondary mt-1 text-sm capitalize'>
                        {transition.from_state_key.replaceAll('_', ' ')} →{' '}
                        {transition.to_state_key.replaceAll('_', ' ')}
                      </div>
                      <div className='mt-2 flex flex-wrap gap-1'>
                        {transition.required_permission ? (
                          <Badge size='sm' variant='outline'>
                            {transition.required_permission}
                          </Badge>
                        ) : null}
                        {transition.requires_comment ? (
                          <Badge size='sm' variant='outline'>
                            Comment
                          </Badge>
                        ) : null}
                        {transition.requires_approval ? (
                          <Badge size='sm' variant='secondary'>
                            Approval
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className='text-textSecondary text-sm'>No transitions.</div>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>No workflow definitions</CardTitle>
            <CardDescription>
              Seed forge_workflow_definitions to populate this diagnostic view.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  )
}

export default CreatorWorkflowsPage
