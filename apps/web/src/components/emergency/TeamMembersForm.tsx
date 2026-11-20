'use client'

import { useMemo, useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { Button } from '@repo/ui/components/ui/button'
import { toast } from '@repo/ui/utils/toast'

import { saveTeamMembers } from '@/app/(back)/emergency/actions'

type Member = { personnelId: string; role: string }

/** Port slice 14: pick the people on a response team and their role on it. */
const TeamMembersForm = ({ teamId, initial, people }: { teamId: string; initial: Member[]; people: { id: string; name: string }[] }) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [members, setMembers] = useState<Member[]>(initial)
  const [search, setSearch] = useState('')
  const names = useMemo(() => new Map(people.map(person => [person.id, person.name])), [people])
  const chosen = new Set(members.map(member => member.personnelId))
  const matches = search.trim() ? people.filter(person => !chosen.has(person.id) && person.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8) : []

  return (
    <div className='flex flex-col gap-3' data-emergency-team-form>
      <ul className='flex flex-col gap-2'>
        {members.map(member => (
          <li key={member.personnelId} className='flex flex-wrap items-center gap-2 text-sm' data-team-member={names.get(member.personnelId)}>
            <span className='min-w-48 font-medium'>{names.get(member.personnelId) || 'Unknown'}</span>
            <input
              aria-label={'Role for ' + (names.get(member.personnelId) || 'member')}
              placeholder='Role on the team (e.g. Incident commander)'
              maxLength={80}
              value={member.role}
              onChange={event => setMembers(current => current.map(item => (item.personnelId === member.personnelId ? { ...item, role: event.target.value } : item)))}
              className='bg-background w-72 rounded-md border px-2 py-1 text-sm'
            />
            <Button type='button' variant='outline' size='sm' onClick={() => setMembers(current => current.filter(item => item.personnelId !== member.personnelId))}>
              Remove
            </Button>
          </li>
        ))}
        {!members.length ? <li className='text-textSecondary text-sm'>Nobody is on this team yet.</li> : null}
      </ul>
      <div className='relative max-w-sm'>
        <input
          type='search'
          aria-label='Add a person to the team'
          placeholder='Add a person'
          value={search}
          onChange={event => setSearch(event.target.value)}
          className='bg-background w-full rounded-md border px-3 py-2 text-sm'
        />
        {matches.length ? (
          <ul className='bg-card absolute z-10 mt-1 w-full rounded-md border shadow'>
            {matches.map(person => (
              <li key={person.id}>
                <button
                  type='button'
                  className='hover:bg-muted w-full px-3 py-2 text-left text-sm'
                  onClick={() => {
                    setMembers(current => [...current, { personnelId: person.id, role: '' }])
                    setSearch('')
                  }}
                >
                  {person.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div>
        <Button
          type='button'
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await saveTeamMembers(teamId, members)

              if (result.error) return void toast('error', result.error)
              toast('success', result.message || 'Saved.')
              router.refresh()
            })
          }
        >
          {pending ? 'Saving...' : 'Save team'}
        </Button>
      </div>
    </div>
  )
}

export default TeamMembersForm
