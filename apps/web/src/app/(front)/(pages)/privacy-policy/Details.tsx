// Next Imports
import Link from 'next/link'

// Third-party Imports
import { cn } from '@repo/ui/lib/utils'
import { Card, CardContent } from '@repo/ui/components/ui/card'

// Util Imports
import { getAppName } from '@/utils/getAppName'

// Styles Imports
import frontCommonStyles from '../styles.module.css'

const Details = async () => {
  // Vars
  const appName = await getAppName()

  return (
    <div className={cn('bs-full plb-10 sm:plb-20', frontCommonStyles.layoutSpacing)}>
      <Card>
        <CardContent className='pbs-4'>
          <div className='flex flex-col gap-y-4'>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>Introduction</h3>
              <p>
                CleVision Technologies Private Limited (&quot;us&quot;, &quot;we&quot;, or &quot;our&quot;) operates{' '}
                <Link href='/' className='text-primary'>{`${appName}`}</Link>, a SaaS solution built on the modern stack
                of Next.js, Typescript, Shadcn, Tailwind CSS, and Supabase. This Privacy Policy explains how we collect,
                use, share and protect information about you when you use our services, including our SaaS products,
                websites and related services.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>Information We Collect</h3>
              <p className='mb-2'>
                We collect various types of information to enhance our services and ensure a seamless user experience.
              </p>
              <h4 className='mb-2 font-semibold'>a. Personal Data:</h4>
              <p className='mb-2'>
                When you interact with our services, we may collect personally identifiable information, including:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>Name</li>
                <li>Email address</li>
                <li>Contact details (phone number)</li>
                <li>Payment information (processed securely via third-party payment processors)</li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 font-semibold'>b. Usage Data</h3>
              <p className='mb-2'>We collect data about how you access and use our services, such as:</p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>IP address</li>
                <li>Browser type</li>
                <li>Pages visited</li>
                <li>Time and date of access</li>
                <li>Time spend on pages</li>
                <li>Unique device identifiers</li>
                <li>Other diagnostic data</li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 font-semibold'>c. Cookies and Tracking Technologies:</h3>
              <p className='mb-2'>
                We use cookies, web beacons, and similar tracking technologies to track activity on our services and
                store certain information. Cookies help us provide a more personalized experience.
              </p>
              <h4 className='font-semibold'>Types of cookies we use:</h4>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>Essential cookies: </span>Necessary for the website to function.
                </li>
                <li>
                  <span className='font-semibold'>Analytics Cookies: </span>To analyze website traffic and usage
                  patterns.
                </li>
                <li>
                  <span className='font-semibold'>Functional Cookies: </span>To remember your preferences and settings.
                </li>
                <li>
                  <span className='font-semibold'>Advertising Cookies: </span>To deliver relevant advertisements.
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>How We Use Your Information</h3>
              <p className='mbe-2'>We use the data we collect for the following purposes:</p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>To provide and maintain our services: </span>Ensuring our products
                  function as intended.
                </li>
                <li>
                  <span className='font-semibold'>To improve our services: </span>Analyzing usage trends to enhance user
                  experience and performance.
                </li>
                <li>
                  <span className='font-semibold'>To communicate with you: </span>Sending updated, notifications, and
                  customer support communications.
                </li>
                <li>
                  <span className='font-semibold'>To precess payments and transactions: </span>Facilitating purchases
                  securely.
                </li>
                <li>
                  <span className='font-semibold'>To send promotional materials: </span>Information you about new
                  features, updates, and offers.
                </li>
                <li>
                  <span className='font-semibold'>To ensure security and prevent fraud: </span>Protecting our services
                  from unauthorized access and misuse.
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>Legal Basis for Processing Personal Data</h3>
              <p className='mbe-2'>
                Our processing of personal data is in compliance with data protection laws and based on the following:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>Consent: </span>When you provide us with explicit consent, such as
                  signing up for our newsletter.
                </li>
                <li>
                  <span className='font-semibold'>Contract: </span>When processing is necessary to fulfill a contract,
                  such as processing a purchase.
                </li>
                <li>
                  <span className='font-semibold'>Legal Obligations:: </span> When we are legally required to process
                  your data.
                </li>
                <li>
                  <span className='font-semibold'>Legitimate Interests: </span>When processing your data is necessary
                  for the operation of our business, such as improving our services.
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>Data Retention</h3>
              <p className='mbe-2'>
                We retain your personal data only as long as necessary to achieve the purposes outlined in this Privacy
                Policy, or as required by law. Specifically:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>Personal Data: </span>Retained until it is no longer necessary for the
                  provision of our services or legally required.
                </li>
                <li>
                  <span className='font-semibold'>Usage Data: </span>Retained for a shorter period unless used for
                  security or operational purposes.
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>Data Sharing</h3>
              <p className='mbe-2'>We may share your data in the following cases:</p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>Service providers: </span>We engage third-party service providers to
                  help operate our business (e.g., payment processors, cloud hosting). These providers have access to
                  your personal data only to perform tasks on our behalf and are contractually bound to maintain
                  confidentiality.
                </li>
                <li>
                  <span className='font-semibold'>Legal authorities: </span>If required by law or to protect our rights,
                  we may disclose your data to governmental bodies or legal authorities.
                </li>
                <li>
                  <span className='font-semibold'>Business Transactions: </span>In the event of a merger, acquisition,
                  or asset sale, your data may be transferred, and you will be notified if this occurs.
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>International Transfer of Data</h3>
              <p className='mbe-2'>
                Your data may be transferred to and processed in countries other than your own. We ensure that such
                transfers are conducted in compliance with applicable data protection laws and that appropriate
                safeguards are in place, such as:
              </p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>
                  Standard Contractual Clauses or other legally recognized mechanisms for cross-border data transfer.
                </li>
              </ul>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>Security of Data</h3>
              <p className='mbe-2'>We implement robust security measures to safeguard your data, including:</p>
              <ul className='list-disc space-y-1 pl-6'>
                <li>Encryption of sensitive information during transmission (e.g., SSL)</li>
                <li>Firewalls and secure access controls to protect our infrastructure</li>
              </ul>
              <p>
                However, no method of data transmission or storage is 100% secure, and while we strive to protect your
                data, we cannot guarantee its absolute security.
              </p>
            </div>
            <div>
              <h3 className='mbe-2 text-lg font-semibold'>Your Rights</h3>
              <p className='mbe-2'>As a user, you have rights regarding your personal data, which include:</p>
              <ul className='mbe-2 list-disc space-y-1 pl-6'>
                <li>
                  <span className='font-semibold'>Right to Access:: </span>You can request copies of your personal data
                  we hold.
                </li>
                <li>
                  <span className='font-semibold'>Right to Correction: </span>You can request corrections to any
                  inaccuracies in your data.
                </li>
                <li>
                  <span className='font-semibold'>Right to Deletion: </span>You can request the deletion of your data
                  when it is no longer necessary for the purposes for which it was collected.
                </li>
                <li>
                  <span className='font-semibold'>Right to Restriction: </span>You can request a restriction on how we
                  process your data under certain conditions.
                </li>
                <li>
                  <span className='font-semibold'>Right to Object: </span>You can object to our processing of your data
                  based on our legitimate interests.
                </li>
                <li>
                  <span className='font-semibold'>Right to Withdraw Consent: </span>You can withdraw your consent at any
                  time where consent was the legal basis for processing.
                </li>
              </ul>
              <p className='mbe-2'>
                To exercise these rights, please contact us at{' '}
                <Link href='https://themeselection.com/contact-us' className='text-primary'>
                  contact page
                </Link>
                .
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>Cookies Policy</h4>
              <p>
                We use cookies to enhance user experience. Cookies help us track your interaction with our services and
                offer a personalized experience.
                <br />
                Managing Cookies: You can control your cookie preferences via your browser settings. However, disabling
                cookies may impact your ability to use certain features.
                <br />
                For more details, please see our{' '}
                <Link href='/terms-of-service' className='text-primary'>
                  Terms of Service
                </Link>
                .
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>Links to Other Sites</h4>
              <p>
                Our services may contain links to third-party websites. We are not responsible for the privacy practices
                of these external sites. We encourage you to review their privacy policies before interacting with them.
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>Children&apos;s Privacy</h4>
              <p>
                Our services are not intended for individuals under the age of 13. We do not knowingly collect personal
                data from children under 13. If we become aware that we have collected such data, we will take immediate
                steps to delete it.{' '}
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>Data Breach Notification</h4>
              <p>
                In the event of a data breach that affects your personal information, we will notify you promptly as
                required by applicable laws. We will provide details about the nature of the breach, the information
                affected, and steps we are taking to address it.
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>Changes to This Privacy Policy</h4>
              <p>
                We may update this Privacy Policy periodically to reflect changes in our practices or for other
                operational, legal, or regulatory reasons. Changes will be posted on this page, and the &quot;effective
                date&quot; will be updated. We recommend reviewing this page regularly.
              </p>
            </div>
            <div>
              <h4 className='mb-2 text-lg font-semibold'>Contact Us</h4>
              <p>
                If you have any questions or concerns about this Privacy Policy, please contact us at{' '}
                <Link href='https://themeselection.com/contact-us' className='text-primary'>
                  contact page
                </Link>
                .
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default Details
