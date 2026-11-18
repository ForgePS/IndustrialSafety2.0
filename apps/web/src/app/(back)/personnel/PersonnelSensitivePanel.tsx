'use client'

import { useState, useTransition } from 'react'

import { useRouter } from 'next/navigation'
import { TbLock, TbPlus, TbTrash } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@repo/ui/components/ui/card'
import { Input } from '@repo/ui/components/ui/input'
import { Label } from '@repo/ui/components/ui/label'
import { toast } from '@repo/ui/utils/toast'

import { savePersonnelEmergencyContacts, savePersonnelSensitive } from './sensitiveActions'
import type { EmergencyContactValues, PersonnelSensitiveValues } from './sensitiveActions'

const MAX_CONTACTS = 5

const emptyContact = (): EmergencyContactValues => ({
  name: '',
  relationship: '',
  phone: '',
  alternate_phone: '',
  email: ''
})

const PersonnelSensitivePanel = ({
  personnelId,
  initialValues,
  initialContacts,
  sexOptions,
  canEdit
}: {
  personnelId: string
  initialValues: PersonnelSensitiveValues
  initialContacts: EmergencyContactValues[]
  sexOptions: Array<{ key: string; label: string }>
  canEdit: boolean
}) => {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [values, setValues] = useState<PersonnelSensitiveValues>(initialValues)

  const [contacts, setContacts] = useState<EmergencyContactValues[]>(
    initialContacts.length ? initialContacts : [emptyContact()]
  )

  const disabled = !canEdit || pending

  const setValue = (key: keyof PersonnelSensitiveValues, value: string) =>
    setValues(current => ({ ...current, [key]: value }))

  const setContact = (index: number, key: keyof EmergencyContactValues, value: string) =>
    setContacts(current => current.map((contact, i) => (i === index ? { ...contact, [key]: value } : contact)))

  const run = (action: () => Promise<{ error?: string; message?: string }>) => {
    startTransition(async () => {
      const result = await action()

      if (result.error) {
        toast('error', result.error)
        
return
      }

      toast('success', result.message || 'Saved.')
      router.refresh()
    })
  }

  const textField = (key: keyof PersonnelSensitiveValues, label: string, className = 'md:col-span-6', type = 'text') => (
    <div className={className}>
      <Label htmlFor={`sensitive-${key}`}>{label}</Label>
      <Input
        id={`sensitive-${key}`}
        type={type}
        className='mt-2'
        value={values[key]}
        disabled={disabled}
        onChange={event => setValue(key, event.target.value)}
      />
    </div>
  )

  return (
    <div className='flex flex-col gap-6' data-testid='personnel-sensitive-panel'>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'><TbLock />Sensitive Information</CardTitle>
          <CardDescription>
            Used for OSHA Form 301 and workers&apos; compensation. Visible only to people with sensitive personnel access.
          </CardDescription>
        </CardHeader>
        <CardContent className='grid grid-cols-1 gap-5 md:grid-cols-12'>
          {textField('date_of_birth', 'Date of Birth', 'md:col-span-6', 'date')}
          <div className='md:col-span-6'>
            <Label htmlFor='sensitive-sex'>Sex</Label>
            <select
              id='sensitive-sex'
              value={values.sex}
              disabled={disabled}
              onChange={event => setValue('sex', event.target.value)}
              className='border-input bg-card text-textSecondary mt-2 h-[38px] w-full rounded-md border px-3 disabled:opacity-60'
            >
              <option value=''>Select...</option>
              {sexOptions.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </div>
          {textField('address_line1', 'Home Address', 'md:col-span-12')}
          {textField('address_line2', 'Address Line 2', 'md:col-span-12')}
          {textField('city', 'City', 'md:col-span-5')}
          {textField('state_region', 'State', 'md:col-span-3')}
          {textField('postal_code', 'ZIP / Postal Code', 'md:col-span-2')}
          {textField('country_code', 'Country', 'md:col-span-2')}
          {canEdit ? (
            <div className='md:col-span-12'>
              <Button
                disabled={pending}
                onClick={() => run(() => savePersonnelSensitive({ personnelId, values }))}
              >
                {pending ? 'Saving...' : 'Save Sensitive Information'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Emergency Contacts</CardTitle>
          <CardDescription>Listed in priority order. Each contact needs a name and a phone number.</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-6'>
          {contacts.map((contact, index) => (
            <div key={index} className='grid grid-cols-1 gap-4 border-b pb-5 last:border-b-0 md:grid-cols-12'>
              <div className='md:col-span-4'>
                <Label htmlFor={`contact-${index}-name`}>Contact {index + 1} Name</Label>
                <Input id={`contact-${index}-name`} className='mt-2' value={contact.name} disabled={disabled} onChange={event => setContact(index, 'name', event.target.value)} />
              </div>
              <div className='md:col-span-3'>
                <Label htmlFor={`contact-${index}-relationship`}>Relationship</Label>
                <Input id={`contact-${index}-relationship`} className='mt-2' value={contact.relationship} disabled={disabled} onChange={event => setContact(index, 'relationship', event.target.value)} />
              </div>
              <div className='md:col-span-3'>
                <Label htmlFor={`contact-${index}-phone`}>Phone</Label>
                <Input id={`contact-${index}-phone`} type='tel' className='mt-2' value={contact.phone} disabled={disabled} onChange={event => setContact(index, 'phone', event.target.value)} />
              </div>
              <div className='flex items-end md:col-span-2'>
                {canEdit ? (
                  <Button
                    variant='outline'
                    disabled={pending}
                    aria-label={`Remove contact ${index + 1}`}
                    onClick={() => setContacts(current => (current.length > 1 ? current.filter((_, i) => i !== index) : [emptyContact()]))}
                  >
                    <TbTrash />
                  </Button>
                ) : null}
              </div>
              <div className='md:col-span-4'>
                <Label htmlFor={`contact-${index}-alternate`}>Alternate Phone</Label>
                <Input id={`contact-${index}-alternate`} type='tel' className='mt-2' value={contact.alternate_phone} disabled={disabled} onChange={event => setContact(index, 'alternate_phone', event.target.value)} />
              </div>
              <div className='md:col-span-6'>
                <Label htmlFor={`contact-${index}-email`}>Email</Label>
                <Input id={`contact-${index}-email`} type='email' className='mt-2' value={contact.email} disabled={disabled} onChange={event => setContact(index, 'email', event.target.value)} />
              </div>
            </div>
          ))}

          {canEdit ? (
            <div className='flex flex-wrap gap-3'>
              <Button
                variant='tonalDefault'
                disabled={pending || contacts.length >= MAX_CONTACTS}
                onClick={() => setContacts(current => [...current, emptyContact()])}
              >
                <TbPlus />
                Add Contact
              </Button>
              <Button
                disabled={pending}
                onClick={() => run(() => savePersonnelEmergencyContacts({ personnelId, contacts }))}
              >
                {pending ? 'Saving...' : 'Save Emergency Contacts'}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

export default PersonnelSensitivePanel
